# What changed on `v2` since your brief

Newest first. Merge with `git fetch origin v2 && git merge FETCH_HEAD` (never rebase), then read the entries since your last merge. Where an entry and your brief disagree, the entry is right; the briefs are corrected too.

## 23 Nov, 01:20 UTC

1. Everything is on `v2` in one picture now: the place, the ground, the field, the plant, the rain, the frost and the lens as they stood at about 01:00 UTC, with the three sky candidates in `src/sky-a/`, `src/sky-b/`, `src/sky-c/`. Bench with `--sky sky-b --only all --view film` from now on, not with `sky-0`: the stand-in sky has other levels than a real one, and parts tuned against it came out washed when they met. The sky is not chosen yet (a blind jury does that), but whichever wins, the light you get is levelled by the look as below.
2. Two kinds of light. This is the one change that asks something of you.
   - What lands on a surface (soil, leaf, stem, petal, crystal, a drop lying on a leaf): `uSunColor`, `uSunDir`, `uSkyZenith`, `uSkyHorizon`, `uGroundBounce`, `skyAmbient()`. The look (`src/v2/look.ts`) now sets how bright these land on screen, and they are no longer the sky's own numbers. On screen and before the curve: the key is 1.5 at sunrise, 3.1 at 1 degree, 4.2 from 2.5 to 10 degrees, 3.4 at 25, 2.9 at 45, and 1.3 under the moon; the fill is 0.42 at the horizon and 0.14 overhead at sunrise, 0.55 and 0.2 by day, 0.8 and 0.24 in the storm, 0.3 and 0.22 in frost, 0.08 and 0.045 at night. Under the closed deck of the storm there is still a soft key of about 0.9 from the bright gap (softness 20 degrees). The lightning is in the key: for its frames `uSunColor` goes to about 7 on screen, blue white, and `uSunDir` swings to the strike (`now.flashAt`), so everything solid is lit from the strike without any code of yours.
   - What floats in the air or shows the sky itself (falling rain, the rain's veil, mist, haze over water, a mirror image of the sky or the sun in standing water, the glass of the lens): `uAirSun`, `uAirZenith`, `uAirHorizon` and `uSkyHorizonSun`, new in `shared` and in `glslCommon`; in TypeScript `def.air.sun`, `def.air.zenith`, `def.air.horizon`. These are the sky's own light exactly as it draws itself, so whatever is made from them sits in the sky's picture. `uAirSun` is zero while cloud or land hides the sun (the whole storm until the break) and during the lightning.
   - Why: with the key and fill raised for the plant, rain and mist that read `uSunColor` and `uSkyHorizon` glowed brighter than the sky behind them, and the lens drew a glare for a sun five times brighter than the one in the sky. Seen at bars 21, 35, 37.02, 41.25, 57 and 61.
   - Who: rain (`air.ts`, `veil.ts`, `puddles/haze.ts`, `puddles/mirror.ts`, and the sky seen in beads if you like), frost (`mist/index.ts`, `mist/veil.ts`, and `frost/onstage.ts` if those crystals hang in the air), post (`looks.ts`: the sun at the lens is `def.air.sun`, not `def.sun.color`), ground (the mirror image of sky and sun in pooled water). Surfaces stay as they are.
   - If the lightning should light your air (rain in the flash), take it from `now.dials.flash` and `now.flashAt` yourself, at a level that leaves the frame readable: the frame at bar 37.02 must still show the plant, the deck and the strike, not a white card.
3. The holds end on the frame that holds their bar line, as they begin: the last still frames are 1259 and 2082, and frames 1260 and 2083 open at rest and have moved by the time their shutter closes (found by the checks). Nothing to do unless you start something of your own at bar 25 or 41: then use `hitBar(25)` and `hitBar(41)` from `src/v2/clock.ts`.
4. The frame's quality now reaches the ground (`setQuality`), the field (fourth argument of `look`) and the lens (`setQuality`) on every frame.
5. The cue sheet is `config/music/cues.json` (table in `kit/v2/CUES.md`) and the film in words is `kit/v2/FILM.md`. If your part has a moment of its own (a strike, the first drop, the thaw, the first petal), it is in there with its bar and beat.

## 23 Nov, 00:55 UTC (commit 95374db and after)

1. The film camera is in: `src/v2/rig.ts`, and `--view film` on the bench is now the real camera of the film at that moment. `npm run bench -- --sky sky-0 --only all --bars 33,37,41.25 --name mine --cols 3` draws the film camera at any bars onto one sheet.
   - Frost hold (bars 17 to 25): 7.5 cm above the soil, level, 48 mm, creeping in from 59 cm to 54 cm and turning 2.4 degrees round the plant. Plant top at 0.07 of the frame height, its foot at 0.76 to 0.83, horizon at 0.48 to 0.50, the sun at 0.77 of the width.
   - Storm hold (bars 33 to 41): 2.45 m back creeping to 2.10 m, 0.27 to 0.30 m above the soil, tilted up about 4 degrees, 38 mm, f/5.6, heading 193. Plant top at 0.14 to 0.10, its foot at 0.83 to 0.90, horizon at 0.615 to 0.632. The lower edge of the frame meets the soil about 1.3 m in front of the lens, so the soil between there and the plant is in frame at a grazing angle. The hidden sun stands at 0.37 of the width and 0.08 to 0.25 of the height; at the break (bar 41.25) at 0.38, 0.25.
   - Ascent (bars 43 to 55): the camera closes to 0.75 m and rises with the plant, 0.44 m up at bar 43, 1.1 m at bar 47, 1.56 m at bar 55, horizon at 0.69 falling to 0.49. Every sunrise stands at 0.72 to 0.82 of the width.
   - Bloom (bars 57 to 65): heading 206, the sun in the left third at 0.19, 0.18, 0.16 of the width and 0.23, 0.29, 0.33 of the height at bars 57, 61, 65.
   - Crane (bars 69 to 75): ends 7.1 m back and 4.0 m up, heading 204, horizon at 0.30, the plant between 0.65 and 0.93 of the height, the sunset at 0.22 of the width.
   - The fixed bench views follow it: `wide` is the storm frame, `west` the bloom, `crane` the end of the crane. `puddle` is new and is not a camera of the film (close, looking down at the wet soil).
2. The nights. Every night of the film now lasts 0.83 to 0.97 s. In the fast time lapse (bars 25 to 33 and 41 to 57) the sun sets on beat 3 of every second bar (26.5, 28.5, 30.5, 42.5, 44.5 to 54.5) and rises on the next bar line. The sun goes 14 degrees under the horizon and no deeper (`MIDNIGHT_DEG`, was 18). Reason: the checks drew sunset, night and sunrise inside half a second and it read as a flicker. Dusk and dawn must be a smooth dimming and brightening over about 8 frames each, with a glow left on the horizon all night. Shots `08-lapse` and `13-evening` moved to bars 29.29 and 44.34. A strip to judge a night by: `--bars 50.34,50.42,50.50,50.57,50.65,50.73,50.81,50.88,50.96,51.04,51.12 --name night --cols 6`.
3. The holds begin on the frame that holds their bar line (frames 849 and 1672 still grew: fixed).
4. The dials. `frost` is 1 to bar 22.5, melts to 0.15 at bar 25 and is gone at 25.4. `rain` rises smoothly from the lightning at bar 33 to 1 at bar 34, is 1 to bar 39.5, 0.85 at 40, 0.74 at 40.25, 0.45 at the break (41), 0.18 at 41.4, 0 at 41.8. The plant does not grow while `frost` or `rain` is 0.2 or more.
5. Lightning. `now.flashAt` is azimuth 202.5, 14.5 degrees up at bar 33 (left of the plant, at 0.32 of the width and 0.13 of the height in the film frame) and azimuth 178.5, 14 degrees up at bar 37 (right of it, at 0.78, 0.14).
6. A world at rest, for proofs: `FilmOptions.still`, `window.showcase.setStill(true)`, `--still` on the bench. No weather, no wind, one fixed sun, clouds that do not move; the frame, the film second and the plant's clock run on.
7. One wind for everything that bends: `src/v2/wind.ts` gives `windWay` (toward azimuth 42, the way the clouds go), `gustAt(x, z, seconds)` (0 to about 1, a front that strikes, holds and lets go about every 3.6 s) and `gustGlsl` for shaders, all on the film second. How hard it blows is `dials.wind`. Whatever you bend, take the direction and the front from there, so the plant, its companion, the field, the grass and the rain answer the same gust.
8. The companion (at x -0.651, z 0.322) stays smaller than the plant through the storm: `companionRatio(tau)` in `src/director/companion.ts` is 0.7 of the plant's height until tau 29 and rises to 1.131 by tau 42. In the storm frame it stands at about 0.28 of the width with its top at about a third of the height, as in `references/v2/keys/storm.png`.
9. The plant is merged (to f05ace8): `PlantInputs` has new optional fields (`real`, `liftLow`, `lapse`, `cold`, `rain`, `gust`, `steady`, `calm`), filled by `src/v2/inputs.ts`.
10. Found by the checks: after warming, a frame writes about 400 buffers that already exist, about 30 MB in all. Do not rewrite a buffer whose content did not change (in a hold nothing grows), and say in your report how many buffers and megabytes a frame of yours writes in a hold and in the time lapse.

## 23 Nov, 01:45 UTC: `v2` at the commit named in the Builder's mail

- Rain at `6e7e32e`, the lens at `64a7963`, sky B at `7164c7f`, the ground at `237f485`, the plant at `d6677a8`, the field at `56988c5`, the place at `95c908e` and the frost at `6517c3b` are all on `v2`. Merge it before your next sheet.
- A part whose `objects` is empty adds nothing to the scene (`src/director/film.ts`).
- Tests may take up to a minute each (`testTimeout` in `vite.config.ts`), so a machine that is drawing beside them does not fail them.
- MEASURED on the merged film: bar 61 drawn after fifteen other bars, alone, and after bar 29.29 gives the same picture to the last pixel.
- A quad whose `position` has two components must set `mesh.frustumCulled = false` (three.js cannot make its bounding sphere and prints an error on every load).

## 23 Nov, 02:05 UTC: dusk and dawn without a step

Found by the checks and by the place: at every sunset of the fast time lapse the picture fell 28 of 255 in one frame (frame 1339), because the sun ran three times faster under the horizon than above it and the key went out inside one frame. MEASURED after the change, frames 1334 to 1346 and 1356 to 1368 with everything on: the largest step from one frame to the next is 9.6 of 255.

1. The sun crosses the horizon at one speed (`sunElevationOfPhase` in `src/v2/clock.ts`). In a night of the time lapse it now stands at about -0.8, -1.8, -3.2, -4.7, -6.3, -7.8, -9.4 degrees on the frames after sunset (was -2.1, -4.0, -5.7, -7.3), and the same going up before sunrise. Sunset and sunrise stay on their beats, and the sun still goes no deeper than 14 degrees.
2. `now.lightKind` is `'sun'` until the sun stands 5 degrees under the horizon and `'moon'` from there. `'none'` is gone. Under the horizon the key is the glow the sun leaves in the sky: it comes from the sun's azimuth, 0.6 to 5 degrees up, it is soft (up to 20 degrees wide), it has the colour of the sky toward the sun, and it falls from 1.7 at the horizon to 0.5 at -2.5 degrees and to nothing at -5, where the moon's key starts from nothing.
3. So nothing may jump with `lightKind`. Use it to choose a direction or a colour that is multiplied by the key (`uSunColor`, zero at the change), never as a switch for a strength of your own. These lines still jump at the change and belong to their owners:
   - `src/place/onstage.ts`: `uThrough = now.lightKind === 'sun' ? 1 : 0.12`
   - `src/field/index.ts`: `uMoon = now.lightKind === 'sun' ? 0 : now.night` (0.37 at the change)
   - `src/field/far.ts`: `uThrough = now.lightKind === 'sun' ? 1 - now.night : 0`
   - `src/sky-a/index.ts`: `halo`; `src/sky-c/atmosphere.ts` line 368
   Make each a smooth function of `now.sunElevationDeg` (for instance `smoothstep(-5, -1, el)` for what belongs to the sun and `smoothstep(5, 9, -el)` for what belongs to the moon).
4. Frames 1372 and 1373 (the sun gone for two frames after a sunrise) are not a fault: the rising sun passes behind the top leaf of the plant. MEASURED on a crop of frames 1370 to 1375.
5. `npm run bench -- --frames 1334-1346,1400 --name dusk --cols 7` draws the film's own camera at frames by number.
6. `npm run part` and `npm run join` draw a range of frames with several pages and join the parts to one film (used for the blockout; the music goes only into a private copy).

## 23 Nov, 02:35 UTC: `v2` at `a86df3b`, every part merged again

- On `v2` now: sky A `7242e56`, sky B `c465921`, sky C `a1f5343`, the plant `3f90c74`, the place `f1fa53c`, rain `847f914`, frost `254b12b`, the field `24bc322`, the lens `502c966`, the ground `f08c2d4`, the player `f8997f7`, the checks `a152556`. Merge it before your next sheet. 162 tests pass.
- The break of bar 41 no longer steps in one frame. `dials.burst` and `now.sunThrough` come up over frames 2082 to 2086 with the middle on the hit (burst 0.16, 0.50, 0.84, 1.00; through 0.10, 0.32, 0.58, 0.80, 0.90). Anything that rode the old step should be looked at once more at frames 2080 to 2090.
- The counter (`src/v2/counter.ts`) now adds only the part of an array that is written, and `Made` has four more numbers: `bufferUpdates`, `bufferUpdateBytes`, `textureUpdates`, `textureUpdateBytes`. Bytes reported before today 02:30 UTC for a texture written in rows were too high by far.
- `Film.setStill` now reaches the lens, so the grain holds still under the still switch.
- A gust ends where it starts (`gustAt` and `gustGlsl` in `src/v2/wind.ts`): the front lets go to zero before the next one strikes.
- The fill takes a third less of the dome's colour (`FILL_COLOUR` 0.65 in `src/v2/look.ts`).
- The place's own rules run with the tests (`tests/place.test.ts`).
- The sky is being judged blind today. Until the result, draw with `--sky sky-b`.

## 23 Nov, 03:00 UTC: the sky is chosen

- The film's sky is `src/sky/`. It was candidate B: three blind critics, each given the same twenty frames of every candidate and the twelve reference pictures, all ranked it first by a clear gap. `src/sky-b/` is gone (moved, its owner stays its owner). Leave `--sky` out from now on, or write `--sky sky`. Sky A and sky C stay in the tree for reading until the cleanup and are not drawn.
- On `v2` now as well: the plant `647fc55`, the player `419905c`, the checks `87ce628`. 168 tests pass.
- The moon. On screen and before the curve the moon's key is 0.55 (was 1.3) and cold, and the fill at midnight is 0.17 at the horizon and 0.095 overhead (was 0.08 and 0.045). Found by the checks: with the moon behind the plant the leaves glowed yellow green at midnight, brighter than at dusk, and blinked dark on the frame where the sun's light hands over to the moon's. Measured on the night of bar 28.5 after the change: the plant dims from 29.6 of 255 at the handover to 23.2 at midnight, no part of the frame moves more than 5.4 the wrong way in a frame (was 18.9), the frame's mean steps 13.1 at the most.
- `createFilmClock` in `tools/beat/sync-mark.js` takes `blips` (default true).
