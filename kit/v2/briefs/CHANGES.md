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

## 23 Nov, 03:10 UTC: the storm stands at a younger plant, and the lens is closer

Why: beside `references/v2/keys/storm.png` and beside version 1's rain shot the storm was the weakest picture of the film. At 90 cm the plant was a thin pole with small leaves seen from 2.45 m, and none of what is good about it close (blades, hairs, water) could be seen. The keys show a young plant with broad leaves that fills the frame.

- `config.growth.stormHold` is 23 (was 28.3): the plant stands 61 cm tall in the storm (was 90 cm). The climb now runs from 17.5 cm to 61 cm, the ascent from 61 cm to 1.71 m, both at nearly the same speed of the plant's clock (1.4 a bar; before 2.0 and 1.05). Nothing moved on the music: every bar line, hold, night, hit and dial is where it was.
- The storm camera (bars 33 to 41): 1.66 m back creeping to 1.48 m (was 2.45 to 2.10), 0.27 to 0.30 m above the soil, 38 mm, f/5.6, heading 193 to 194, nearly level (pitch 0.2 to 0.8 degrees, was about 4). In the frame: plant top at 0.12 to 0.13 from the top, its foot at 0.81 to 0.91, the horizon at 0.506 to 0.525 (was 0.615 to 0.632, so there is more ground and less sky than before, and the frame is 1.57 m wide at the plant, creeping to 1.40 m; it was 2.32 to 1.99 m).
- The lightning sits lower so it stays in the frame: bar 33 at azimuth 205, 10.5 degrees up (in the frame at 0.27 of the width, 0.15 from the top); bar 37 at azimuth 180, 10.5 degrees up (0.75, 0.16). Read `now.flashAt` as before.
- At the break (bar 41) the sun stands at 0.38 of the width and 0.14 from the top.
- The table of moments in `COMMON.md` carries the new plant clock for bars 26 to 42.5.
- For whoever tuned to the old frame: the puddle (it must not grow past about a third of the frame's width: the key has a stream of water running to the lower left), drops and marks near the lens, the relief disc of the soil, the neighbours and the companion in the hold (the companion stands at the left edge now), the rain's far veil.

## 23 Nov, 04:00 UTC: the page's own time is the film's frame rate

On `v2` now: the sky `b7f7517`, the night sky `806c873` (not wired in yet), the lens `0e6bd9b`, the plant `3b3bc70`, the ground `4480f36`, rain `27c822c`, frost `5fcf1f2`, the field `25cc992`, the player `6700678`, the checks `b59de7d`. Merge it before your next sheet. 168 tests pass.

### 1. The processor (the most important line of this round)

He asked for one thing besides the look: no drop of the frame rate. Nothing is made after loading any more, but the page's own script time in a frame is far over the frame's 33 ms wherever something grows. MEASURED by `/root` on `v2` (preview, draft, frames in a row, this machine, software drawing left out of the number):

| Where | Script a frame | Largest shares |
|---|---|---|
| Frost hold, frames 1001 to 1003 | 19 to 40 ms | scene 8 to 16, field 3 to 9 |
| Time lapse, 1401 to 1404 | 70 to 147 ms | field 30 to 52, plant 26 to 46 |
| Storm hold, 1901 to 1903 | 39 to 66 ms | puddles 28 to 43, field 4 to 13 |
| After the break, 2102 to 2104 | 133 to 145 ms | plant 41, field 35, companion 20, puddles 18, scene 13 to 18 |
| Ascent, 2601 to 2603 | 163 to 226 ms | plant 77 to 128, companion 32 to 38, field 28 to 37 |
| Bloom, 3051 to 3053 | 172 to 212 ms | plant 76 to 83, companion 30 to 38, field 28 to 48, scene 31 to 40 |
| Crane, 3501 to 3503 | 167 to 175 ms | plant 72 to 74, companion 30 to 33, field 30 to 33, scene 26 to 32 |

His machine is faster than this one by a factor nobody has measured, so the budget is set on this machine and is hard:

- The whole script time of a frame: at most 16 ms in the mean and 25 ms in the worst frame, anywhere in the film, with frames drawn in a row.
- Shares: plant and companion together 5 ms, field 3 ms, rain and puddles together 2 ms, every other part 1 ms, the scene's own draw (`scene`, which also carries the buffer uploads) 6 ms.
- Measure it yourself: `npm run bench -- --only all --cost --frames 2100-2104,3050-3053 --name mine`. It prints one line a frame with the shares by part (`plant`, `companion`, `field`, each part by its folder name, `sky`, `shadow`, `samples`, `skydraw`, `scene`, `post`) and writes `out/work/bench/sky/cost-mine.json`. The first frame after a jump is dearer and does not count. `window.showcase.cost()` gives the same table in the page.

How the plant gets there (owner: the plant; the field's neighbours are the same class and follow):

- Key shapes. The plant's shape is a pure function of the frame. Fill it only at key frames, at most 8 frames apart, and let the vertex shader draw every frame as a mix of the two keys round it. Three slots of position and normal for each part (`position`, `positionB`, `positionC`, and the same for the normal) and one weight vector as a uniform: two slots carry the keys of the stretch being played, the third is filled with the next key while they play, one part a frame, so no frame carries more than one large fill. Nothing is bound again and nothing is made: only the weights change at a key.
- A key frame stands on every frame where a hold starts or ends (849, 1259, 1672, 2082) and on the film's first and last frame, so a hold stays exact and growth starts on its frame. Between them keys are at most 8 frames apart.
- A key is filled for still air. Wind, gusts, the rain's weight and the lean with the tip are added in the vertex shader in every frame, growing or not, the way they already are while the plant's clock stands (`uOwnAir`, `uOwnTip`).
- The shutter needs no second fill: the shader mixes at the frame's time plus its share of the shutter.
- The frame comes from `shared.uFrame`. What the plant feels at a key frame comes from `momentAt` of that frame (`src/v2/now.ts`) and `plantInputsOf`. A frame never depends on the frame drawn before it: when the two keys round a frame are not in the slots (a jump, an export from the middle), both are filled at once, and the picture is the same to the bit as when they were filled ahead.
- Whoever places things on the plant (hairs, beads, crystals, dew) follows the same slots or sits in the shader on top of them. Agree it with the plant's owner before you write it.

The rain's share is the drop lookup of the puddles and marks (`src/weather/rain/drops.ts` called for every cell and slot each frame, 18 to 43 ms): it belongs in a shader or in a table made at load. The field's share is the refill of the neighbours' shapes (the keys above) and the lists of who stands in the frame (`fill()` in `src/field/index.ts`): the lists may be refilled when the lens has moved by more than a set angle or distance, not in every frame, as long as no plant pops at the frame's edge.

The checks get a `script` check with these limits and it goes into the proof.

### 2. What changed in the film

- The deck stays over the break. `overcastAtBar` is 0.74 at bar 41, 0.58 at 42.3 and gone by 42.92, so the night takes the deck away and the sun shines through a tear in a dark deck from bar 41 to the sunset of 42.45. Under a deck the sun's key and `air.sun` are scaled by `1 - 0.6 * overcast` (`UNDER_DECK` in `src/v2/look.ts`). The sky must be looked at again from bar 41.5 to 42.5.
- Lightning lights the ground less: `FLASH` key 2.4 and fill 1.2 (were 5 and 1.6).
- The frost hold has a lower sun: 0 degrees at bar 17, 1.6 at 17.2, 2.4 at 18, 3.6 at 21, 6.5 at 25 (were 3, 5.5 and 9 at 17.35, 21 and 25). In the frame it stands at 0.415 of the height at bar 17.2, 0.338 at 21 and 0.223 at 25, at 0.76 to 0.79 of the width.
- The crane is smaller: the last frame is 6.0 m back and 3.4 m up (`CRANE` in `src/v2/rig.ts`: riseM 0.3, backM 0.2, aimM 0.6). The plant stands between 0.59 and 0.92 of the frame's height at the end, the horizon at 0.28.
- The film ends with the sun 2.9 degrees under the horizon (was 5), so the field can still be read in the last frame. At bar 74 it is at -1.4.
- Frost grade: contrast 1.24, saturation 1.0, a little cooler. Shade takes less of the dome's blue (`FILL_COLOUR` 0.45, was 0.65). Rain thickens the air half as much (0.006, was 0.012).
- Rows turn. A row is now a line that runs away from the lens: `rowSpacingM` 0.75 is the distance between rows across the view, `plantSpacingM` 0.45 the distance between plants along a row, `plantAheadOfRowM` 1.5 the distance from the plant to the row ends. A lane, not a row, lies on the plant's axis. The field and the ground's ridges turn together and are merged together.
- The neighbours may stand at up to 50 percent of the plant in the storm (was 45).
- `Film.load` gives the page a turn after every part, so the loading screen can paint its steps.

### 3. The first whole watch

Read by `/root` at full size beside the nine keys and the eight approved pictures (`python3 out/work/tmp/beside.py` on the root's machine; the pairs are sent with the notes). What holds: the bloom at bar 61 and its opening at 58.5 are close to their references, the field at bar 69 is good, the middays of the ascent are good, the storm hold is in its key's family, the break now has a tear, beams and a dark deck. What does not, in the order it costs the film:

1. Low sun in the first half is murky brown and beige (bars 1.5, 9.2, 13, 29.1): away from the sun the sky is warm grey where the keys are blue grey, clouds are lit dark orange and shaded brown.
2. Midday soil is pale tan, close to straw (bar 29.7: mean 135, 110, 75 of 255 where dark earth belongs).
3. The opening is too bright and too pink (bar 0.48: sky top 116, 142, 194 against the key's 29, 90, 127), the soil wears pale pink caps, a pale green arch already stands out of it beside a black hard edged hole.
4. The frost hold is still one flat picture for 13.7 s: its soil is grey green where the key's is dark with white rime on the crests.
5. The end is too magenta (bar 73: sky top right 107, 81, 115 against the key's 24, 69, 101).
6. The night's stars are blurred to discs (bar 46.82).
7. The lightning of bar 37 is a small squiggle; the plant's leaves hang like sheets in the storm.

## 23 Nov, 04:40 UTC: `v2` at `12f8c44`, round 4 of every part merged

### 1. What moved under you

- Noon is lower. The sun stands 40 degrees high at noon (`NOON_DEG` in `src/v2/clock.ts`, was 62) and `LOW_DAY` is 0.5425 (was 0.35), so the sun crosses the horizon at the speed it had. Every mark that is set by sun height is where it was. Reason: at 62 degrees the day was flat, the earth read as terracotta and the leaves as teal; at 40 the clods throw shadows and the plant keeps its back light. About 20 s of the film is high sun (the germination days of 4 bars, the later days of 2).
- The day is exposed darker: `LEVEL.day` 0.38 (was 0.5); the sun's key is `[25, 3.9], [45, 3.7], [90, 3.5]`; `FILL_HIGH` has the knots `[25, 0.17], [60, 0.15]`; `FILL_COLOUR` is now a curve by sun height, `[[8, 0.45], [30, 0.2]]` (`src/v2/look.ts`).
- The moon stands at azimuth 177.5, elevation 12.5 (`src/v2/sun.ts`). In 390 night frames it is never near an edge of the frame.
- `Made` counts vertex arrays (`createVertexArray`) and `nothingMade` fails on one made after loading (`src/v2/counter.ts`).
- Loading waits for a painted frame after each step: `paint()` in `src/core/yield.ts`, used by `Film.load` and `Film.warm`.
- The field has a hook into the plant's shader for its kinds: `place?: { glsl, uniforms }`, `struct Place { vec4 place; vec4 vary; }`, `fieldPlace()`.

### 2. Key shapes, as decided

- A low layer `key(slot, tau)` gives a shape for any clock, with the blend as one uniform. The plant's own schedule on film frames sits on top of it. The field drives the low layer for its kinds; its limit is 0.5 percent of a neighbour's height or one pixel at 1920 wide, and at most one kind is keyed in a frame.
- The plant's keys play only in the two holds until the pop at frame 2472 is gone (`KEYS_WHILE_GROWING` off in `src/plant/index.ts`).
- Whoever places things on the plant follows the slots through `place()` (frost) or `...wetUniforms` (rain).

### 3. Limits of the script check

`tools/checks/limits.json`: the sum 16 ms in the mean and 25 in the worst frame; plant and companion 5; field 3; rain and puddles 2; the scene's draw 6; the shadow pass 3 (new); every other part 1. Wet plant frames: the mean may rise by at most 1.5 of 255 a frame, the 90th percentile by at most 2. A round of every frame and `script --all` are run once, on the locked film.

### 4. The second watch (pairs at `12f8c44`)

What holds now: the frost hold reads as frost (rime on the edges of the blades, frosted clods, low fog, the hill), the storm, the flash, the rain and the break, the night with the moon inside the frame, the bloom at 58.5 and 61, the crop at the end as heads with the companion's face. What does not, in the order it costs the film:

1. Script time while the plant grows (the checks: 83.8 ms in the mean against 16, 12 of 13 windows fail). With the plant, the field and the Builder (shadow pass, first warmed moment).
2. Full day (bars 27 to 31, 43 to 52): the leaves read teal and matte, the back light through the blade is weak, the clouds are grainy at the draft tier. With the plant after the processor work; the sky looks at its day cumulus.
3. Frost: the blade itself is bare green inside its fringe where the key has a dusting over the whole leaf. With frost.
4. The end (bars 69 to 75): a pale straight band under the ridge; the pair's leaves too bright and yellow green beside the dark crop. The place paints its near strips in the field's far colour; the heights of the pair wait (see below).
5. The opening: the foreground is close to black.

### 5. Decided at 04:40

- The companion's height stays (`heightRatio` 1.131) until the lists and keys of the field are in the shader. The shorter companion (0.667) is the better ending and is taken up after that, with its leaf holds set again so both bloom frames keep the leaf at the upper left.
- The crop's tops take the full low sun late in the bloom: one line in `plantSun` under `PLANT_FIELD` (`src/plant/part.ts`), written by the field, put in by the plant.
- The far end: the place paints its near sunflower strips, from the end of the field's wedge outward, in the field's far colour, from bar 57 to the end. The wedge stays where it is.
- The ridge may stand between 0.8 and 1.65 degrees beside the hill (the place measured 0.81 to 1.63); it is not held tighter.


## 23 Nov, 04:55 UTC

### 1. The break opens on the boom's frame, in the picture too

The dial was right (`burstAtBar` is 0 at frame 2082, 0.33 at 2083, 0.99 at 2088) but the picture showed nothing of the sun before frame 2085 and the whole tear at 2086. The sky makes the sun come through in frame 2083 and rise without a threshold to the open tear at 2088; the lens follows the picture with its beams. Nothing after frame 2088 changes.

### 2. Wet air after the storm

The night of bars 42 to 43 failed its window (a tile went 38 of 255 the wrong way into frame 2179). The sky lays a diffuse veil over the cloud edges while the ground is wet and the sun is low, taken from wetness and sun elevation and from no cue. Merged at `2300d67`.

### 3. Grain stays

The lens measured about 1.2 levels of fine noise on the storm deck. It is the grain of version 1 and stays.

### 4. The first watch in motion is drawn in parts on the builders' machines

One frame costs about 10 s on a builder's machine and here, so the whole film at the draft tier is about ten machine hours. Builders whose work is in draw a part of 318 frames each (`npm run part -- --from F --to T --jobs 1`, preview size, draft tier) and send the clip and its record. The parts are joined here with `npm run join -- --name blockout --mixed`. A blockout may be joined from parts of different commits; the proof may not.

### 5. Sizes

`npm run part` and `npm run join` take `--size WxH`. A smaller picture is no faster on these machines (11.7 s at 640 by 360 against 10 s at 960 by 540), so the blockout stays at the preview size.

### 6. One merge commit without the trailer

`866a003` on `agent/post` (a merge of `v2` into the branch) has no trailer. History is not rewritten for it; the merge of that branch into `v2` (`676e690`) carries the trailer. Later merges carry it.


## 23 Nov, 05:25 UTC

### 1. Round 5 is in

Eight parts merged between 04:55 and 05:07 (`bc51ddc`): the sky's break on the boom's frame, the place, the field's hook, the plant (the companion in the Storm hold is the same frame whatever was drawn before), rain, ground, frost. The lens followed at `167a815`: its beams come up with the tear over six frames, never ahead of the dial. Seen in my own frames 2081 to 2090: closed at 2082, the tear at 2083, beams from 2085, the whole fan by 2087.

### 2. The crop runs to the ridge for the whole film

No hedges and no patchwork between the field and the ridge: the land from the end of the field's carpet to the ridge's foot reads as the same crop. The field showed with a magenta trial that its carpet past 100 m is three pixels high at 960 by 540 and that the pale band under the ridge at bars 69 to 73 is the place's land from 290 m outward. Dropping `last` from `farAir` changed no pixel. The band is the place's to mend.

### 3. The frost fringe stays at 1.8

`THROUGH` in the frost's fringe stays 1.8.

### 4. Parts write what they cost

`npm run part` writes `part-FFFFF-TTTTT.cost.json` beside the clip: script time by part, megabytes written and anything made, for every frame. `npm run costs` reads all of them and names the stretches, the hitches (over 25 ms and over three times the median of the sixteen frames round it) and the frames where something was made. The rule for a hitch stays as it is: a frame after a hold that is slow because growing is slow is a stretch, not a hitch.

### 5. The count names the frame

Three owners got the same FAIL from `--count`: one vertex array made after loading somewhere in 200 frames. `--count` now prints the frame for every counter that moves and writes the list to `count.json`. The rain owner is the one finder.

### 6. The plant's order of work for the processor

Agreed as the plant proposed: per slot normals, skin numbers and uniforms; the low layer `key(slot, tau, inputs)` and `blend()` for the field's kinds; hairs off the key; spread by part and leaf; keys 16 apart. `KEYS_WHILE_GROWING` stays off on `v2` until the spread is in. Added: the wet dial is rounded to sixteenths, so plant, companion and field lay again on 32 frames in and after the Storm hold (found by the rain owner by reading, 5.4 MB written at frame 1689 measured by the checks). No frame inside a hold may lay anything and a step of the dial may not be seen.

### 7. A new owner: the look of the plant's skin

At bar 29.7 the grown leaves read dark teal with white ribs against the key `climb-fair.png`. The plant owner has the processor work, so the fragment side goes to a new owner, `leaf_look_builder`, brief `leaf-look.md`: folders `src/plant/look/` (made by the plant owner in a move that changes no pixel) and the top level of `src/plant/surface/`. The evening of the leaves is to go by the light and not by the plant's clock. Sky C stands by so that no more than twelve agents are at work.

### 8. The moon may not blink

Rule for every quick night: between the first and the last frame at which the moon's disc is at half its peak, its level may not fall and come back by more than 12 of 255 inside any five frames. Frame 2179 broke it (153, 46, 123, 77 over frames 2178 to 2181).

### 9. The lens follows the drawn sun

At bar 71 the glow of the lens sat 8 pixels (of 960) under the sun's disc. The sky lifts the drawn disc for the bending of light in low air; the lens used the sun where it stands without the lift. `Sky` in `src/v2/api.ts` has a new optional `face(now, later, out)`: where the middle of the disc is drawn at the middle of the shutter. `src/director/film.ts` passes it to the lens when the sky has it. The light of the scene does not move. Limit for the sky's proof: the two centres within 1 pixel at 960 wide.

### 10. The far land is judged by the picture

The limit of 6 of 255 between the carpet's last rows and the land behind is dropped. The place's table of 20 knots stays; the measure is the picture at film size at bars 67 to 74.5: no line, the plain under the ridge never paler than the carpet's last rows. The place refits once after the field's carpet has no rim line.

### 11. The field's count by frame

The field puts each list once, at load, in the order the film's own lens first sees its plants, and sets only an instance count per frame from a table. A lens that is not the film's own draws the lists whole. 2 to 7 percent of what is sent is outside the frame at the three measured bars (stated by the field), against 19 to 54 before.

### 12. Frost: the fringe breaks up as it thaws

At bars 23 and 24 the whole bright fringe on green leaves reads as a drawn outline. The light through the needles is held at its bar 21 level, and from bar 23 the needles go in patches, the sun's side and the tips first; about half of the margin's length carries needles at bar 24 and none at bar 25.

### 13. Two frames of more than a second in the shadow pass

The checks found frames 2617 and 2621 at 1.8 and 1.5 seconds of script, all of it in the shadow pass (neighbours 2.5 ms), and frame 1689 at 36.7 ms in the Storm hold. Being found; the film may not ship with them.


### 14. Four cuts in the frost hold, three close shots

Brandon, 23 November: "I think it would look really good if we got some zoomed in shots of our sunflowers showing the crystallization on various parts of it ... make sure that the camera angles on frost are really good and show the best parts of the flower. You want to see like frost glistening in the sunlight and just the high detail on it." He left the choice between a move and hard cuts to us and leaned to cuts on the music.

The film now cuts four times, and only there: on frames 952, 1055, 1157 and 1260, the frames that hold the downbeats of bars 19, 21, 23 and 25. Bars 17 to 25 of the track have no drums; bar 21 has the one low hit of the hold. Between the cuts stand three close shots of two bars each (3.43 s), all at about 100 mm and f/8, 17 to 23 cm from the seedling, all looking toward the sun as the wide shot does. They are in `src/v2/cuts.ts` (`closeShots`, `cutFrames`, `closeAt`), and the film asks `fixedAt(seconds)` for them:

| Shot | Bars | Frames | What it shows |
|---|---|---|---|
| `margin` | 19 to 21 | 952 to 1054 | Changed, see item 17: leaf 3 from above, its tip to the left, the frozen ground soft behind it, no sun in the frame. The ice is still growing |
| `tip` | 21 to 23 | 1055 to 1156 | The growing tip and the furred stem, a leaf on each side, the sun coming through at the upper left, the frozen field below as a dark band of soft discs |
| `thaw` | 23 to 25 | 1157 to 1259 | Leaf 0 in profile sloping down to its tip at the right, the ice going to water: beads, and one drop at the tip that falls |

The wide shot stands before and after, unchanged. Each close shot's lens drifts at one speed, about a centimetre in all. One frame from the middle of each is in the film's warming, so a cut may make nothing and may not cost a long frame.

### 15. The dials of the hold follow the cuts

`frost` now grows through the wide shot and on into the first close shot (0.47 at bar 17.94, 0.70 at bar 19, 0.95 at bar 20, 1 from bar 20.5), stands whole to bar 22.7, and melts to 0.15 at bar 25 (0.82 at 23.4, 0.42 at 24.3). `fog` is 0.8 to the cut of bar 21, steps to 0.62 on that cut and thins from there (0.50 at bar 22, 0.42 at 23, 0.35 at 25), so `sunThrough` steps from 0.20 to 0.44 on the cut and reaches 0.89 at bar 23. `dew` rises from bar 22.7 (0.50 at 23.5, 1 from 24.3). Two new dials, `drop` and `dropFall`: how full the one drop at the tip of leaf 0 hangs (0 before bar 23.3, 1 as it lets go), and how far the drop that let go has fallen, in metres (0 while it hangs; it lets go on the frame of beat 3 of bar 24, frame 1235, and falls slower than a real drop, 0.8 m/s²). After it a smaller drop gathers (0.25 to 0.5).

### 16. The camera goes in for the bloom

Brandon: "on the scene before the last one, when the bloom happens, it would be awesome if the camera zooms in on the actual sunflower, showing the bloom happen, and then it will start backing out for the final shot, revealing the whole field". One unbroken move at 35 mm, in `src/v2/rig.ts` (`BLOOM`): from bar 55 the lens closes from 0.77 m to 0.50 m off the stem at bar 57, holds the head at about a third of the frame's width while it opens (bars 57 to 60), and is back at 0.80 m by bar 65, where the crane begins as before. The sun stays in the frame on the left. Aperture f/5.6 from bar 57 to 65. Reference pictures `references/v2/keys/bloom-close-opening.png` and `bloom-close.png`.

### 17. The first close shot looks down on a leaf

The first angle of `margin` saw the leaf edge on, with the sun hidden behind another leaf and half the frame empty. Twenty two angles were drawn and judged at bar 20. The shot is now this (metres, in `src/v2/cuts.ts`):

| | Frame 952 | Frame 1054 |
|---|---|---|
| Lens at | (-0.0972, 0.1951, 0.2256) | (-0.0759, 0.1753, 0.2159) |
| Looks at | (-0.058, 0.103, 0.041) | (-0.064, 0.103, 0.046) |

100 mm at f/16. In the frame: the upper face of leaf 3 from three quarters above, its tip to the left at about a third of the width, the midrib and the side veins, the whole fringe of the near edge; the stem at the right edge on the first frames, a seed leaf soft at the bottom right, the frozen ground 20 to 40 cm behind as soft discs. No sun and no sky in the frame: the sun stands in front of the lens above the frame, so the fringe is lit from behind and the face is in cold sky light. The sun comes into the close shots on the cut of bar 21.

The frames to judge are 952, 1003 and 1054. The shot is the film's one look at the ice on a leaf's face: `frost` goes from 0.70 to 1 while it stands, so the coat on the face and the needles along the edge are seen growing. The target for the ice itself is still `references/v2/keys/frost-margin.png` (the cold blue grey face with fine crystals all over it and feathers standing along the edge), not its framing.

The three close lenses are stopped down: `margin` f/16, `tip` f/32, `thaw` f/32, not f/8 as item 14 says.

### 18. One lens for each held shot

`src/v2/held.ts`. While the plant's clock stands, every frame belongs to one of five held lenses: the film's own camera in the frost hold (frames 849 to 951 and frame 1260), `margin` (952 to 1054), `tip` (1055 to 1156), `thaw` (1157 to 1259), and the storm hold (1672 to 2083). `heldLensAt(frame)` gives the number, -1 where the plant grows; `heldFrames[i]` lists the frames of each.

Before anything is drawn the film sets `held`: `lens` (the number, or -1), `eye` and `forward` (world), `perTan` (pixels for a tangent of one), `focusM`, `cocScale` (the same units as `shared.uCocScale`). They are the pose of that shot which shows the plant largest (greatest focal length over focus distance among its frames), and are the same on every frame of the shot. What is thinned or chosen by the lens while the plant stands is thinned once for each held lens from these numbers, kept, and switched on the cut: a cut frame writes nothing. On the bench, with a camera of its own, the numbers are that camera's: choose again when they differ from the ones a set was made for.

### 19. The bloom lens and a head owner

The bloom's push in is shot at 35 mm and f/2.8 from bar 57 to bar 65 (it was f/5.6) and closes to f/5.6 by bar 67, so the field behind the head is soft while the head opens. The head turns to face the lens (a facing offset of 12 degrees in the plant's inputs; it moves nothing before about frame 2690). The flower head has an owner of its own: `src/plant/head/` and `src/plant/look/{bud,disc,ray}.ts`, branch `agent/head`, brief `kit/v2/briefs/head.md`.

### 20. A stem and hairs owner

`src/plant/hairs/` and `src/plant/stem/` have an owner of their own, branch `agent/hairs`, brief `kit/v2/briefs/hairs.md`. The plant owner keeps the rest of `src/plant/` outside `look/`, `head/`, `hairs/` and `stem/`.

### 21. The deck, the nights, and one test tolerance

The storm's cloud deck is gone by bar 42.6 (`DECK_GOES` in `src/v2/clock.ts`), so the first night after the storm shows stars. The nights clear by a table (`NIGHT_CLEAR`: 0.5 as a rule, night 1 0.6, night 3 0.65, night 10 0.6). The sky hides its stars by the overcast. `tests/plant.test.ts` line 55 allows `7e-3`.

### 22. One rule for the blur circle, and a focus range

Nobody writes a formula for the blur circle any more. In a shader call `cocOf(viewDepth)`: it is in the common chunk now, so vertex shaders have it too. In script call `blurPx(cocScale, focusM, focusNearM, depthM)` from `src/core/lens.ts`.

A pose may carry `focusNearM` (`CameraPose`): everything from that depth to `focusM` is sharp and the blur grows from those two ends, as in a macro picture put together from several focus distances. The shaders get it as the shared uniform `uFocusNear` beside `uFocusM`; `held` has `focusNearM` beside `focusM`. Where it is not set the two are equal and every result is what it was, bit for bit. `focusM` is the far end, so anything written for far things (the sun's far circle, far rows, rain in the air) is unchanged.

The three frost close shots use it (`sharp` in `src/v2/cuts.ts`, metres before and behind the point the lens looks at): `margin` f/11, sharp from 26 mm before to 57 mm behind; `tip` f/22, 46 mm before to 40 mm behind; `thaw` f/22, 35 mm before to 40 mm behind. The whole leaf in frame is sharp at 1920 and the ground behind is blurred about as before. This replaces the stops of item 17.

Tier rule: such a shot cannot be made by moving the eye over the lens opening, so every sample is drawn through the middle of the lens (pixel jitter and shutter stay) and the lens pass is told one sample, at every tier. In these shots the review and final tiers get their blur the way live play does.

Judge the close shots at 1920 and 100 percent (`npm run bench -- --only all --frames 1003,1106,1208 --format master --tier draft`), not in the reduced frame.

Also new: the shared uniform `uWorldExposure`, the exposure of the grade at this moment (`def.grade.exposure`), set in `applyWorld`, for glints that must be capped in times white.


### 23. The stem's rest length is a smooth curve

The plant owner's stem no longer takes its length from the height curve frame by frame: the rest length follows a soft highest point, so the head rises without corners. The top may leave the height curve by up to 5 mm (measured: 4.3 mm at frame 1429) and stands exactly still in both holds. Measured over the whole film: frames on which the tip turns by more than 0.25 mm fell from 33 to 1. `heightAt` and `plantReach` are unchanged, so nothing that reads them moves.

### 24. A look of its own for each frost close shot

A close shot may carry `look` (`src/v2/cuts.ts`): factors on the sky's level, the key, the fill, contrast, saturation, bloom, vignette, and a gain for each colour. `lookAt` applies them on every frame of that shot and on no other. The picture cuts hard to these shots, so the look changes on the cut frame and nowhere else; the film's own camera before bar 19 and from bar 25 is untouched.

What it means for owners: the light on your surfaces in a close shot is not the light of the wide frost shot beside it. Judge frost, beads, hairs and the ground's glints in the close shots on frames drawn after this item, and do not cancel the look in your own shader. The level and the exposure still reach you the same way (`uWorldExposure`, the world's light).

The looks as they stand: `margin` key 1.3, fill 1.35, contrast 1.06, bloom 1.6, vignette 1.2, gain (0.97, 1, 1.05); `tip` level 0.8, key 1.2, fill 0.62, contrast 1.08, saturation 0.92, bloom 1.5, vignette 1.4, gain (0.92, 1, 1.13); `thaw` key 1.1, fill 0.75, contrast 1.08, bloom 1.3, vignette 1.25, gain (1.03, 1, 0.97).

### 25. The first close shot is reframed, and the drop falls as a real one

`margin`: eye and aim moved together across the picture (8 mm right and 7.5 mm up at the cut in, 18 mm right and 7.5 mm up at the cut out), so the whole leaf sits in the middle and no longer leaves by the right edge. The angle, the push in (210 to 185 mm) and the focus range are as they were. New values in `src/v2/cuts.ts`.

`thaw`: `DROP_PULL` is 9.81 (`src/v2/clock.ts`). The hold runs in real time, so the drop that lets go on frame 1235 is a streak for two frames and gone; the rain owner draws its path over the open shutter.

### 26. The look tells the skin how clear the key stands

New shared uniform `uKeyClear` (`src/core/shading.ts`, set in `applyWorld` from `def.sun.clear`, written by `lookAt`). It is the number the plant's skin used to work out for itself from the colour of the key: 0 when the key is nothing or flat, 1 when it stands clear. A world that does not set it sends -1 and the skin falls back to its own formula, so version 1 and every test world are as they were.

Why: in the time lapse the sun hands over to the moon between 5 and 9 degrees under the horizon and the key is nothing for those frames. The skin read that as an overcast sky and let its sky fill jump from 25 to 100 percent for three frames at every dusk and dawn (frames 209 to 211, and so on through every night). The look now bridges that handover in fast time lapse only: frames 206 to 213 read 1, 1, 1, 0.914, 0.866, 0.866, 0.930, 1 where they read 1, 1, 1, 0.338, 0, 0, 0.511, 1. 137 frames of the film change, all of them twilight in fast time lapse; every other frame is the same number as before (`tests/key-clear.test.ts`).

What it means for owners: the leaf look owner keeps the one line in `tissueClearSun()` of `src/plant/surface/index.ts` (`uKeyClear >= 0.0 ? uKeyClear : <the old formula>`) when merging. Anyone who needs to know whether the key is clear reads `uKeyClear` and treats a negative value as unknown; nobody works it out from the key's colour again.



## 23 Nov, 11:55 UTC: `v2` at `699f0d2`, and the cost of live play

### 27. What is in

Merged and drawn since `f0dd054`: frost `9a23a4f` (a white closed coat, crystals in groups of three sizes, fans of ice on the rim, thin sleeves on the bristles), leaf look `7c861f3` (cold dark tissue under the ice), hairs `e41a947`, sky A `6319d39` (the starlight holds while the camera's exposure climbs; `starHoldAt` has a test), head `418b46f` (rays of unequal length), post `7e8c28c` (every small spark gets a glow of its own in the frost and last light grades), rain `c1728ae` (one puddle in the furrow), player `7187cb0`. 199 tests pass.

Two lines of the surface shader are shared and stay when anyone merges: the spark that mirrors the sky takes the frost's tint (`frostSpark`), and the sky lies on a rimed face where the frost says so (`frostSky`).

### 28. Live play: where the time goes, and who cuts it

Measured in software rendering at 1920, script alone, a frame of the film being 33.3 ms: a held frame costs 3.5 to 7 ms and writes nothing; a growing frame costs 41 ms at 1255 to 1275, 78 ms at 2078 to 2095, 140 to 152 ms from 3000 to 3330, and writes 7.5 to 17.8 MB. The plant is two thirds of it, the companion a fifth. Targets on every growing frame: hero and companion together at most 10 ms mean and 16 worst, 2 MB mean and 4 worst.

- One laying a frame (plant): each frame lays the plant once, as it stands when its shutter opens, and is drawn toward the next frame's laying.
- Keys apart in the time lapse (plant): the twitch of the time lapse is drawn by the shader. It may be another throw of the dice than today's if it has the same size and character, is a pure function of the frame, and no leaf jumps where the lapse hands over to the film's own air.
- Roots laid once (stem and hairs, head, plant): a hair's seat on its part is written once at load; a laying writes only a small texture of frames for that part and the pose; the shader places the hair. One call for every hair set (`createHairFrames`, `HairSet.bindFrames`, `HairSet.sealSeats`). The rime, dew and drop lists on hairs become fixed lists made at load.
- The cut by size on screen (stem and hairs): a hair set is neither gathered nor drawn when its typical hair is shorter than 0.6 pixel on screen; its width fades in between 0.6 and 1.2 pixel. One rule for every set.
- Crystals (frost): `uCrystals` is not written again on the frames beside the hold.
- The measure of record for script time is the player's stepping run (`npx tsx src/player/steps.ts`), because hair gathering runs inside the renderer's pass, where the film's own lap table does not see it; the checks owner's `owners` line names who wrote what.

### 29. Sparks

The lens holds a lone bright pixel to twice its brightest neighbour, so the smallest spark anyone draws covers two pixels. A flash rises and falls over at least three frames, and a flashing face is brightest at its mirror point and falls toward its edge.

### 30. The leaf under the moon

When the key is cold the light through a leaf turns to the key's teal and comes down to about half; the sheen and the edge light stay. Judged against the night key.

### 31. A value from the vertex shader may leave its range on an edge pixel

At the `high` level a frame of one sample is drawn at four places in each pixel. On a pixel that a surface covers only in part, the fragment shader still runs once, at the pixel's middle, even where the surface does not reach the middle: every value handed down from the vertex shader is then carried on past the surface's edge, and can fall below nothing, rise over one, or turn a normal away. MEASURED by the checks owner on `ce7e0b5`: a blade's thinness under nothing went through a power and left values 600 to 40,000 times what stood round them at frames 1452 and 1479, which the lens drew as bright discs; the same frames drawn at one place a pixel were clean.

So in every fragment shader: a value from the vertex shader is held to its honest range before it goes into `pow`, `sqrt`, `log`, `inversesqrt`, `normalize`, a division, or the edge of a `smoothstep`. No `centroid` on a value whose derivative is used. Each owner reads through its own fragment shaders once for this and proves it with `npm run checks -- numbers --frames a,b,c` on three frames of its own at the default quality: no pixel without a number, none over the limit, no spark, and the worst ratio it printed.

The lens takes a channel that is not a number or is infinite as nothing, so on any card the worst such fault is one black pixel. It has no ceiling: a wild value that is still a number is caught by the `numbers` check and by reading the drawn film, not hidden.
