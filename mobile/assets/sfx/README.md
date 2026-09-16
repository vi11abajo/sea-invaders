# Sound effects — real recordings and placeholders

Most `.wav` files in this folder are still **generated placeholders**, synthesised only so the
audio wiring (`mobile/src/audio/`) could be built and tested on a device before the real
recordings existed. None of those are the final sound.

The files below are the owner's own recordings, taken from an earlier version of the game
(see `mobile/assets/music/CREDITS.md`) — these are final:

- `boost_auto_target.m4a`, `boost_coin_shower.m4a`, `boost_gravity_well.m4a`, `boost_health_boost.m4a`,
  `boost_ice_freeze.wav`, `boost_invincibility.m4a`, `boost_multi_shot.m4a`, `boost_pickup.m4a`,
  `boost_piercing_bullets.m4a`, `boost_points_freeze.m4a`, `boost_rapid_fire.m4a`,
  `boost_score_multiplier.m4a`, `boost_shield_barrier.m4a`, `boost_speed_tamer.m4a`, `boost_wave_blast.m4a`
  (every boost's own pickup stinger, `GameScreen.tsx`'s `BOOST_STINGER`)
- `boss_hit.m4a`, `boss_shot.m4a`
- `crab_hit.m4a`
- `octopi_shot.m4a`, `octopi_multishot.m4a`
- `player_hit_1.m4a`, `player_hit_2.m4a`, `player_hit_3.m4a`, `player_hit_4.m4a` (`sfx.ts`'s `VARIANTS`
  picks one at random per play, behind the public id `player_hit`)

Every other file here (`crab_shot`, `boss_dead`, `wave_start`, the interface sounds, and so on) is
still a generated placeholder, to be swapped for a real recording later. Each file name is the
sound's id, used verbatim by `mobile/src/audio/sfx.ts` (the four `player_hit_*` files and `player_hit`
itself are the one exception — see `VARIANTS` there). Replacing a placeholder is a drop-in: put the
real recording under the same file name in this folder — no code changes needed. The sheet sound
(`ui_sheet`) has no placeholder either: it ships silent until a real recording is dropped in here and
enabled in `mobile/src/audio/sfx.ts`.
