# Sound effects — placeholders

Every `.wav` file in this folder is a **generated placeholder**, synthesised only so the audio
wiring (`mobile/src/audio/`) could be built and tested on a device before the real recordings
exist. None of them are the final sound.

Each file name is the sound's id, used verbatim by `mobile/src/audio/sfx.ts` (and, for
`ambience_reef.wav` only, by `mobile/src/audio/music.ts`). Replacing a placeholder is a drop-in:
put the real recording under the same file name in this folder — no code changes needed.
