package xyz.seainvaders.reefsfx

import android.media.AudioAttributes
import android.media.SoundPool
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap

/**
 * How many one-shots may sound at the same instant. A busy moment on the reef - Octopi firing into
 * a wall of crabs while a boss cracks and a boost drops - stacks a handful, never a dozen; past
 * this the pool drops the quietest, oldest stream, which is exactly what the ear would forgive.
 */
private const val MAX_STREAMS = 12

/** `SoundPool` reports a successful decode as status 0; anything else is a failure. */
private const val LOAD_SUCCESS = 0

/** Every one-shot is played once, start to finish: no looping. */
private const val NO_LOOP = 0

/** One priority for every one-shot: when the pool is full, age decides which stream gives way. */
private const val PRIORITY = 1

internal class SoundNotLoadedException(name: String, path: String) :
  CodedException("Could not load the sound \"$name\" from $path")

/**
 * A thin wrapper over Android's `SoundPool` for the reef's one-shot sounds.
 *
 * Every sound is decoded into memory once at start-up, so a play is a single native call that
 * hands an already-decoded buffer to the mixer - no file work, no player state to change, and
 * nothing posted to the main thread. That is the whole point of it: the run asks for dozens of
 * sounds a second and none of them may cost the frame anything.
 *
 * Loops (the reef ambience, music) are not this module's business - they stay with `expo-audio`,
 * which is built for streaming long files.
 */
class ReefSfxModule : Module() {
  /** A sound handed to `SoundPool.load`, waiting for the decode to finish. */
  private data class Loading(val name: String, val path: String, val promise: Promise)

  private val lock = Any()
  private var pool: SoundPool? = null

  /** Keyed by the sample id `SoundPool.load` returned, so the load callback can find its caller. */
  private val loading = ConcurrentHashMap<Int, Loading>()

  /**
   * The pool, built on first use. `USAGE_GAME` with `CONTENT_TYPE_SONIFICATION` puts these sounds
   * on the media stream and tells the system they are short game feedback, so they mix with
   * whatever else is playing rather than asking anyone to duck or stop.
   */
  private fun requirePool(): SoundPool = synchronized(lock) {
    pool ?: SoundPool.Builder()
      .setMaxStreams(MAX_STREAMS)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_GAME)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      .build()
      .also { built ->
        built.setOnLoadCompleteListener { _, sampleId, status ->
          val waiting = loading.remove(sampleId) ?: return@setOnLoadCompleteListener
          if (status == LOAD_SUCCESS) {
            waiting.promise.resolve(sampleId)
          } else {
            built.unload(sampleId)
            waiting.promise.reject(SoundNotLoadedException(waiting.name, waiting.path))
          }
        }
        pool = built
      }
  }

  /** Releases the pool and fails anything still waiting to decode. */
  private fun release() {
    val released = synchronized(lock) {
      val current = pool
      pool = null
      current
    } ?: return
    released.setOnLoadCompleteListener(null)
    released.release()
    val pending = loading.values.toList()
    loading.clear()
    for (waiting in pending) {
      waiting.promise.reject(SoundNotLoadedException(waiting.name, waiting.path))
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ReefSfx")

    /**
     * Decodes the sound at `path` (a plain file path, no `file://` scheme) into the pool and
     * resolves with the id to play it by. It resolves only once the decode is done, so a sound
     * cannot be asked for before it can actually make a noise.
     */
    AsyncFunction("load") { name: String, path: String, promise: Promise ->
      val sampleId = requirePool().load(path, PRIORITY)
      if (sampleId == 0) {
        promise.reject(SoundNotLoadedException(name, path))
      } else {
        loading[sampleId] = Loading(name, path, promise)
      }
    }

    /**
     * Sounds `soundId` at `volume` (0..1) and `rate` (0.5..2, where a rate off 1 shifts the pitch
     * with the speed). Synchronous and cheap by design: this is what a frame may call.
     */
    Function("play") { soundId: Int, volume: Double, rate: Double ->
      val current = synchronized(lock) { pool }
      if (current != null) {
        val level = volume.toFloat()
        // The stream id it hands back is of no use here: a one-shot is never touched again once
        // it starts, so nothing is returned to the caller either.
        current.play(soundId, level, level, PRIORITY, NO_LOOP, rate.toFloat())
      }
    }

    /** Silences everything sounding right now, leaving the decoded sounds in place. */
    Function("stopAll") {
      val current = synchronized(lock) { pool }
      if (current != null) {
        current.autoPause()
      }
    }

    /** Drops every decoded sound and the pool with it; the next `load` builds a fresh one. */
    Function("unloadAll") {
      release()
    }

    OnDestroy {
      release()
    }
  }
}
