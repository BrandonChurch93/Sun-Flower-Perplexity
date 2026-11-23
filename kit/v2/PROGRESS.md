# Progress, version 2

The Builder's memory for version 2. Read this first in every task, then `kit/v2/PLAN.md` and `kit/v2/NOTES-FROM-BRANDON.md`. Update it before every commit. Version 1's memory is `kit/PROGRESS.md` and stays as the record of that build.

## Status

- Build: in progress
- Current phase: 2 · Sky and blockout
- Current unit: none (the whole film)
- Blocked: no
- Budget: running
- Continuations: 0
- Extensions: 0
- App URL: not published (version 1 stays at https://sunflower-film.pplx.app until Brandon approves a swap)
- Last push: none yet
- Last status: 03 · 2026-11-23 00:51 UTC · Phase 2

## Latest pictures

Newest first. Each line names the pictures of one status in `out/stills/status/`, with the time and the caption, so this page shows where the film is.

- 2026-11-23 00:51 UTC · status 03 · Phase 2 · `status-1.jpg`: The new two beat night with the stand-in sky, bars 50.3 to 51.1 (frame by frame, about 0.9 s): sunset, a short blue night, sunrise; `status-2.jpg`: The film camera through the ascent, bars 44 to 54, stand-in sky: the sun stays on the horizon in frame. The neighbours are still too tall and the leaf highlights too green (both sent back); `status-3.jpg`: Sky candidate A, first sheet (unverified): good colour at dawn and dusk, but the clouds are dark unlit masses and the storm is flat. Sent back with six points; `status-4.jpg`: Sky candidate C, first sheet (unverified): clean gradients, but clouds are sparse and the storm has no structure
- 2026-11-23 00:35 UTC · status 02 · Phase 2 · `status-1.jpg`: Film camera, bars 30.5 to 43: the storm hold with the stand-in sky (no rain or wet ground merged yet); `status-2.jpg`: Film camera, bars 13 to 28: the frost hold with the stand-in sky; `status-3.jpg`: Sky candidate B, its own 16 judged moments (unverified, judged blind later against A and C); `status-4.jpg`: Found by the checks: sunset to night to sunrise inside half a second reads as a flicker
- 2026-11-22 23:44 UTC · status 01 · Phase 2 · `status-1.jpg`: The scaffold at sixteen moments of the film, with a flat stand-in sky and no plant yet. The light is not tuned: this shows the plumbing, not the look; `status-2.jpg`: The nine new reference pictures the build aims at

## Clock

Copied from the output of `npm run clock` at every status. Working time only.

| Phase | Planned box | Time used |
| --- | --- | --- |
| 0 | 1.50 h | 0.62 h |
| 1 | 0.50 h | 0.77 h |
| 2 | 3.50 h | 1.69 h |
| 3 | 9.00 h | 0.00 h |
| 4 | 8.50 h | 0.00 h |
| 5 | 3.00 h | 0.00 h |
| 6 | 4.00 h | 0.00 h |
| Whole build | 30.00 h | 3.07 h |

Continuations and extensions are listed under this table with their own hours.

## Phases

| Phase | State | Gate evidence | Commit |
| --- | --- | --- | --- |
| 0 · Foundation | done | film clock on the track, sun, dials, sections and looks in the config; 144 of 144 tests | `00f5b62` |
| 1 · References | done | nine picks for the seven new states under `references/v2/keys/`, approved by the Builder as Brandon's message 6 allows | `268c4b4` |
| 2 · Sky and blockout | in progress | | |
| 3 · Look lock | not started | | |
| 4 · Full build | not started | | |
| 5 · Whole film | not started | | |
| 6 · Proof and deliver | not started | | |

## Units

Version 2 has no cuts and no units. The film is one take in eight sections of the track (`config/showcase.json`, `sections`): germination (bars 1 to 17), freeze (17 to 25), climb (25 to 33), storm (33 to 41), ascent (41 to 57), flower (57 to 65), crane (65 to 73), dusk (73 to 75). Thirteen looks are judged (`looks`).

## Modules and owners

One owner per folder. An agent works in its own clone and pushes `agent/<folder>` and `agent/<folder>-looks`.

| Module | Folder | Owner | State |
| --- | --- | --- | --- |
| Film clock, look, camera, integration | `src/v2/`, `src/core/`, `src/director/film.ts` | Builder | scaffold drawn |
| Sky | `src/sky/` (trials in `src/sky-a`, `src/sky-b`, `src/sky-c`) | three competing agents | first passes pushed |
| Place | `src/place/` | `place_builder` | started |
| Ground | `src/ground/` without `puddles/` | `soil_v2_builder` | started |
| Rain | `src/weather/rain/`, `src/ground/puddles/`, `src/plant/surface/wet/` | `rain_builder` | started |
| Frost | `src/weather/{frost,fog,mist}/`, `src/plant/surface/{frost,dew}/` | `frost_builder` | started |
| Plant | `src/plant/` without `surface/{wet,frost,dew}/`, `src/v2/inputs.ts` | `plant_builder` | started |
| Field | `src/field/` | `rows_v2_builder` | started |
| Post | `src/post/` | `optics_v2_builder` | started |
| Player | `src/director/{live,autopilot,modes,menu}.ts`, `src/main.ts`, `index.html`, `src/capture/` | `player_builder` | started |
| Checks | `tools/checks/` | `checks_builder` | started |

## Render budget

Not measured yet.

## Judged frames

The thirteen looks of `config/showcase.json` and the frame each is judged at are listed by `npm run filmclock`.

## Decisions made by the Builder

- 2026-11-22 22:00 UTC. No review stops in version 2. Brandon's message 6 says to build start to finish once the references are approved by the Builder.
- 2026-11-22 22:00 UTC. "The timing looks great" settles the 140 BPM grid of the plan: bar 1 at 0.883143 s, a bar every 1.714286 s, the film 2:07.0, frost first and then the storm.
- 2026-11-22 22:10 UTC. New reference pictures were needed: the eight approved pictures show none of the seven new states (the plant in frost at 17.5 cm, the storm at 90 cm, the flash, the break, the time lapse sky, the late bud, the last light). Nine picks are in `references/v2/keys/`.
- 2026-11-22 22:50 UTC. The sun stands 8, 5 and 3 degrees up at bars 57, 61 and 65 (the plan said 14, 10 and 6) and sets at bar 73, so that the bloom keeps the low gold light of the approved pictures.
- 2026-11-22 22:50 UTC. The day takes 0.86 of each turn of the world, so that no night lasts longer than 0.8 s.
- 2026-11-22 22:50 UTC. The storm's sun stands low (16 down to 11.5 degrees at azimuth 200) so that the break at bar 41 happens inside the frame.
- 2026-11-22 22:50 UTC. The first sunrise is slow, and the time lapse brakes just after the sunrise on bar 17, so that the frost hold opens on a low sun in mist.
- 2026-11-22 22:50 UTC. The bud's timing follows version 1's plant model: 43.5 on the plant's clock at bar 57, open at 51 on bar 61.
- 2026-11-22 23:30 UTC. One draw path. `src/director/film.ts` draws every frame from the instant (`src/v2/now.ts`), asks the sky what light it gives and makes the frame's settings from that (`src/v2/look.ts`): the look owns the light on the plant and takes its colours from the sky. Nothing is switched on or off by a cut any more: the sky and every part are always in the scene and follow the dials.
- 2026-11-22 23:30 UTC. Two clocks in every shader: `uTime` is the plant's clock and stands still in a hold; `uReal` is the film second and everything that moves by itself (wind, rain, ripples, glints) runs on it.
- 2026-11-22 23:30 UTC. Shafts of light belong to the lens and grade (`src/post/`), and the sky only tears the gap they come through.
- 2026-11-22 23:30 UTC. The sky is built three times by three agents of different model families from one brief, and judged on the same bench (`npm run bench`); the winner moves to `src/sky/`.
- 2026-11-22 23:30 UTC. The frame rate drops of version 1 came from programs built and textures sent to the graphics card at the first frame of each scene. Version 2 has a loading step that draws the film's own moments once (`Film.warm`) and a counter (`src/v2/counter.ts`) that fails the build if anything is made after loading.
- 2026-11-22 23:45 UTC. Version 2 reuses the 30 hour box of the kit with the same phase boxes. Its clock started at 22:00 UTC on 22 November, when message 6 arrived.
- 2026-11-22 23:55 UTC. The moon stands 13 degrees up at azimuth 168 so that it is inside the film's frame in the nights. When the light is not the sun the lens gets no sun to blur, so stars stay sharp.
- 2026-11-22 23:57 UTC. Nine more agents started, one per folder, from the briefs in `kit/v2/briefs/`: the far land, the ground, the plant, the rain, the frost, the field, the lens, the player and the checks. With the three skies that is twelve at once, the limit of `AGENTS.md`. Three of them carry new task names (`soil_v2_builder`, `rows_v2_builder`, `optics_v2_builder`) because version 1's agents still hold the old ones.
- 2026-11-22 23:57 UTC. The lightning's light on the soil and the plant is the Builder's, in `src/v2/look.ts`; the even fog is the Builder's and the shaped mist is the frost agent's; the companion plant stays; the numbers of the seedling's emergence stay in `src/ground/soil.ts`.
- 2026-11-23 00:05 UTC. The film camera is one function of the film second (`src/v2/rig.ts`): it creeps in 5 cm through the frost hold, stands 2.45 to 2.10 m back and 0.27 to 0.30 m up for the storm so that both lightning strikes and the break are in frame, keeps headroom over the growing plant, and cranes from bar 69 to 75. The fixed bench views follow it.
- 2026-11-23 00:10 UTC. A hold begins on the frame that holds its bar line. The checks found frames 849 and 1672 still growing; fixed in the clock.
- 2026-11-23 00:12 UTC. The frost melts inside its hold (full to bar 22.5, 0.15 at bar 25, gone at 25.4) so that the thaw is seen in close up and the time lapse restarts on a bare plant. The rain ends with a tail after the break (0.45 at bar 41, gone at 41.8) so that the last rain falls through the sunlight.
- 2026-11-23 00:15 UTC. A world at rest for proofs (`setStill`): no weather, no wind, one sun, clouds that stand; the frame, the film second and the plant's clock run on.
- 2026-11-23 00:30 UTC. The quick nights are longer than the plan said. The plan gave the later nights about half a second; the checks drew sunset, night and sunrise inside that half second and it read as a flicker. Now every night of the film lasts 0.83 to 0.97 s: in the fast time lapse the sun sets on beat 3 of every second bar and rises on the next bar line, and it goes 14 degrees under and no deeper, so a glow stays on the horizon. The sun is more than 6 degrees down for 9.2 s of the film in all and never for longer than 0.70 s at a time, so the plant is never seen growing through a long night.
- 2026-11-23 00:38 UTC. The plant is merged into `v2` (`6067371`): it runs on its own clock and takes the day, the air and the cold as inputs.
- 2026-11-23 00:42 UTC. One wind for everything that bends (`src/v2/wind.ts`, taken word for word from the field agent's work): toward azimuth 42, the way the clouds travel, with one gust front on the film second.
- 2026-11-23 00:46 UTC. The companion is 0.7 of the plant's height until 29 on the plant's clock (it was 0.86), rising to 1.131 by 42: the storm references show a hero that towers over its neighbour.
- 2026-11-23 00:46 UTC. The neighbours of the field are to stay at 35 to 45 percent of the hero through the climb and the storm and below the camera's eye level through the ascent, so that the far land and every sunrise are seen over them; full size at the bloom.
- 2026-11-23 00:46 UTC. `kit/v2/briefs/CHANGES.md` is the one place where agents read what changed on `v2` after their brief. The ground agent pushes to `agent/ground-v2` (the name `agent/ground` is version 1's). The player agent also owns `src/player/`, `tests/modes.test.ts` and `tests/player*.test.ts`. The field agent's change to `tests/field.test.ts` is accepted.
- 2026-11-23 00:50 UTC. Sky candidate A reported (`agent/sky-a` at `b03c5f0`): the atmosphere, disc, stars and moon are there, the clouds are dark unlit masses and the storm is flat. Sent back with six points. Candidate B reported complete at `337380f` and is sent a second round for the new nights and its smooth storm. Candidate C has not reported.
- 2026-11-23 00:53 UTC. The three sky candidates are merged into their own folders on `v2` (`src/sky-a/`, `src/sky-b/`, `src/sky-c/`) so that one bench draws all three in the film's own frames. The two that lose are removed at cleanup.
- 2026-11-23 00:56 UTC. The cue sheet is written in bars and beats (`config/music/cues.json`, table in `kit/v2/CUES.md`): 43 cues, none off the map. The film is written down in words in `kit/v2/FILM.md`. The slow sunsets of the first sixteen bars fall up to a tenth of a second before a beat and carry no cue.
- 2026-11-23 01:03 UTC. The look sets how bright the light lands on the plant and the sky gives its colour (`src/v2/look.ts`). With the sky's own levels a low sun was a weak lamp beside its sky and the storm had no key at all: the plant stood as a cut-out. Now the key has a level on screen by the sun's height, a closed deck still gives a soft key from its bright gap, lightning swings the key to the strike, and the fill follows the sun's height.
- 2026-11-23 01:08 UTC. The place, the ground, the field, the plant, the rain, the frost and the lens are merged into `v2` as they stand after their first round of notes, so that every part is judged in one picture from now on. The frame's quality is passed to the ground, the field and the lens.

## Notes from Brandon

`kit/v2/NOTES-FROM-BRANDON.md`, word for word.

## Open items

- The sky is not chosen: three candidates, judged blind once all three have reported.
- The storm foreground, the neighbours' height and the leaf highlights are being reworked by their owners.
- Version 1's folders that nothing draws any more stay until the cleanup.

## Running jobs

None.

## Running agents

| Agent | Folder | Branch | Family | Started | Limit | State |
| --- | --- | --- | --- | --- | --- | --- |
| `sky_a_builder` | `src/sky-a/` | `agent/sky-a`, looks `agent/sky-a-looks` | Claude | 23:41 UTC 22 Nov | heartbeat 30 min, report at 150 min | reported at `b03c5f0`, sent back with six points 00:52 UTC |
| `sky_b_builder` | `src/sky-b/` | `agent/sky-b`, looks `agent/sky-b-looks` | GPT | 23:41 UTC 22 Nov | heartbeat 30 min, report at 150 min | reported at `337380f`, second round sent 00:52 UTC |
| `sky_c_builder` | `src/sky-c/` | `agent/sky-c`, looks `agent/sky-c-looks` | Gemini | 23:41 UTC 22 Nov | heartbeat 30 min, report at 150 min | running |
| `place_builder` | `src/place/` | `agent/place`, looks `agent/place-looks` | default | 23:57 UTC 22 Nov | heartbeat 30 min, report at 120 min | running |
| `soil_v2_builder` | `src/ground/` without `puddles/` | `agent/ground-v2`, looks `agent/ground-looks` | default | 23:57 UTC 22 Nov | heartbeat 30 min, report at 150 min | running |
| `plant_builder` | `src/plant/` without `surface/{wet,frost,dew}/`, and `src/v2/inputs.ts` | `agent/plant`, looks `agent/plant-looks` | default | 23:57 UTC 22 Nov | heartbeat 30 min, report at 150 min | merged at `f05ace8`, second round sent 00:52 UTC |
| `rain_builder` | `src/weather/rain/`, `src/ground/puddles/`, `src/plant/surface/wet/` | `agent/rain`, looks `agent/rain-looks` | default | 23:57 UTC 22 Nov | heartbeat 30 min, report at 150 min | running |
| `frost_builder` | `src/weather/{frost,fog,mist}/`, `src/plant/surface/{frost,dew}/` | `agent/frost`, looks `agent/frost-looks` | default | 23:57 UTC 22 Nov | heartbeat 30 min, report at 150 min | running |
| `rows_v2_builder` | `src/field/` | `agent/field`, looks `agent/field-looks` | default | 23:57 UTC 22 Nov | heartbeat 30 min, report at 150 min | running |
| `optics_v2_builder` | `src/post/` | `agent/post`, looks `agent/post-looks` | default | 23:57 UTC 22 Nov | heartbeat 30 min, report at 150 min | running |
| `player_builder` | `src/main.ts`, `index.html`, `src/director/{live,autopilot,modes,menu}.ts`, `src/capture/` | `agent/player`, looks `agent/player-looks` | default | 23:57 UTC 22 Nov | heartbeat 30 min, report at 150 min | running |
| `checks_builder` | `tools/checks/` | `agent/checks`, looks `agent/checks-looks` | default | 23:57 UTC 22 Nov | heartbeat 30 min, report at 120 min | running |

## Rounds

None yet.

## Push log

## Session log

- 2026-11-22 22:00 to 22:46 UTC. Message 6. Branch `v2`. Nine reference picks made, judged and committed (`268c4b4`).
- 2026-11-22 22:46 to 23:23 UTC. Foundation: config, film clock, sun, dials, the instant, timeline swap, tests (`00f5b62`).
- 2026-11-22 23:23 to 23:45 UTC. Scaffold: one draw path, the look from the sky's light, the stand-in sky, the counter, the bench.
- Status 01, 2026-11-22 23:44 UTC, Phase 2. The new draw path works end to end: one sky, one place, no cuts, every frame made from the film second. Three agents have started building the real sky from one brief, each alone. Next: tune the light with the stand-in sky, write the briefs for the place, the ground, the plant, rain, frost, the field, the lens and the player, and start those agents. Time used: 1.7 h of 30 h.
  Pictures: The scaffold at sixteen moments of the film, with a flat stand-in sky and no plant yet. The light is not tuned: this shows the plumbing, not the look; The nine new reference pictures the build aims at.
- Status 02, 2026-11-23 00:35 UTC, Phase 2. The film camera now runs on the new clock: it creeps in during the frost hold and stands back and low for the storm. Rain and frost only show while the plant stands still. The first sky candidate reports complete (not yet judged). The checks found the quick nights flicker, which I am fixing next. Next: Lengthen the quick nights to two beats with a smooth dusk, merge the plant's frost fix, send the new camera to all twelve agents, then judge the three skies blind. Time used: 2.6 h of 30 h.
  Pictures: Film camera, bars 30.5 to 43: the storm hold with the stand-in sky (no rain or wet ground merged yet); Film camera, bars 13 to 28: the frost hold with the stand-in sky; Sky candidate B, its own 16 judged moments (unverified, judged blind later against A and C); Found by the checks: sunset to night to sunrise inside half a second reads as a flicker.
- Status 03, 2026-11-23 00:51 UTC, Phase 2. All twelve builders got their first round of notes. Every quick night is now two beats long and never fully dark, so the day to night changes read as a pulse instead of a flicker. Two more sky candidates sent first sheets: A has a full atmosphere but unlit clouds, C has thin sparse clouds; B (shown last time) leads so far. The plant is merged; one shared wind now drives everything that bends. Next: Bring the three sky candidates onto one bench and compare them in the film's own frames, tune the light against the leading sky, then merge the ground, rain, frost and field as they report. Time used: 2.9 h of 30 h.
  Pictures: The new two beat night with the stand-in sky, bars 50.3 to 51.1 (frame by frame, about 0.9 s): sunset, a short blue night, sunrise; The film camera through the ascent, bars 44 to 54, stand-in sky: the sun stays on the horizon in frame. The neighbours are still too tall and the leaf highlights too green (both sent back); Sky candidate A, first sheet (unverified): good colour at dawn and dusk, but the clouds are dark unlit masses and the storm is flat. Sent back with six points; Sky candidate C, first sheet (unverified): clean gradients, but clouds are sparse and the storm has no structure.

