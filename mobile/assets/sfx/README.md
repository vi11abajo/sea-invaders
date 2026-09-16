# Sound effects — placeholders

Every `.wav` file in this folder is a **generated placeholder**, synthesised only so the audio
wiring (`mobile/src/audio/`) could be built and tested on a device before the real recordings
exist. None of them are the final sound.

Each file name is the sound's id, used verbatim by `mobile/src/audio/sfx.ts`. Replacing a
placeholder is a drop-in: put the real recording under the same file name in this folder — no
code changes needed. The reef ambience loop (`ambience_reef`) has no placeholder: it ships silent
until a real loop is dropped into `mobile/assets/music/` and enabled in `mobile/src/audio/music.ts`.
The sheet sound (`ui_sheet`) has no placeholder either: it ships silent until a real recording is
dropped in here and enabled in `mobile/src/audio/sfx.ts`.
