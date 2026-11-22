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
- Last status: 01 · 2026-11-22 23:44 UTC · Phase 2

## Latest pictures

Newest first. Each line names the pictures of one status in `out/stills/status/`, with the time and the caption, so this page shows where the film is.

- 2026-11-22 23:44 UTC · status 01 · Phase 2 · `status-1.jpg`: The scaffold at sixteen moments of the film, with a flat stand-in sky and no plant yet. The light is not tuned: this shows the plumbing, not the look; `status-2.jpg`: The nine new reference pictures the build aims at

## Clock

Copied from the output of `npm run clock` at every status. Working time only.

| Phase | Planned box | Time used |
| --- | --- | --- |
| 0 | 1.50 h | 0.62 h |
| 1 | 0.50 h | 0.77 h |
| 2 | 3.50 h | 0.40 h |
| 3 | 9.00 h | 0.00 h |
| 4 | 8.50 h | 0.00 h |
| 5 | 3.00 h | 0.00 h |
| 6 | 4.00 h | 0.00 h |
| Whole build | 30.00 h | 1.78 h |

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
| Sky | `src/sky/` (trials in `src/sky-a`, `src/sky-b`, `src/sky-c`) | three competing agents | not started |
| Place | `src/place/` | agent | not started |
| Ground | `src/ground/` | agent | not started |
| Rain | `src/weather/rain/`, `src/ground/puddles/`, `src/plant/surface/wet/` | agent | not started |
| Frost | `src/weather/frost/`, `src/weather/fog/`, `src/weather/mist/`, `src/plant/surface/frost/` | agent | not started |
| Plant | `src/plant/` | agent | not started |
| Field | `src/field/` | agent | not started |
| Post | `src/post/` | agent | not started |
| Player | `src/director/{live,autopilot,modes,menu}.ts`, `src/main.ts`, `src/capture/` | agent | not started |
| Checks | `tools/` | agent | not started |

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

## Notes from Brandon

`kit/v2/NOTES-FROM-BRANDON.md`, word for word.

## Open items

- The camera of the scaffold is version 1's path on the plant's clock: it stands still in the two holds. The film time path comes with the blockout.
- The stand-in sky (`src/sky-0/`) has no clouds and no stars.
- The plant's sway still runs on the plant's clock and so stops in a hold.
- Version 1's rain, frost and night stages are no longer drawn. Their folders stay until the new parts replace them.

## Running jobs

None.

## Running agents

| Agent | Folder | Branch | Family | Started | Limit | State |
| --- | --- | --- | --- | --- | --- | --- |
| `sky_a_builder` | `src/sky-a/` | `agent/sky-a`, looks `agent/sky-a-looks` | Claude | 23:41 UTC 22 Nov | heartbeat 30 min, report at 150 min | running |
| `sky_b_builder` | `src/sky-b/` | `agent/sky-b`, looks `agent/sky-b-looks` | GPT | 23:41 UTC 22 Nov | heartbeat 30 min, report at 150 min | running, bench proven in its sandbox |
| `sky_c_builder` | `src/sky-c/` | `agent/sky-c`, looks `agent/sky-c-looks` | Gemini | 23:41 UTC 22 Nov | heartbeat 30 min, report at 150 min | running |

## Rounds

None yet.

## Push log

## Session log

- 2026-11-22 22:00 to 22:46 UTC. Message 6. Branch `v2`. Nine reference picks made, judged and committed (`268c4b4`).
- 2026-11-22 22:46 to 23:23 UTC. Foundation: config, film clock, sun, dials, the instant, timeline swap, tests (`00f5b62`).
- 2026-11-22 23:23 to 23:45 UTC. Scaffold: one draw path, the look from the sky's light, the stand-in sky, the counter, the bench.
- Status 01, 2026-11-22 23:44 UTC, Phase 2. The new draw path works end to end: one sky, one place, no cuts, every frame made from the film second. Three agents have started building the real sky from one brief, each alone. Next: tune the light with the stand-in sky, write the briefs for the place, the ground, the plant, rain, frost, the field, the lens and the player, and start those agents. Time used: 1.7 h of 30 h.
  Pictures: The scaffold at sixteen moments of the film, with a flat stand-in sky and no plant yet. The light is not tuned: this shows the plumbing, not the look; The nine new reference pictures the build aims at.

