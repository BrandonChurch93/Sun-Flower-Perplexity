# QA item 20, pass 2: the reading of every hit

The searches are in `search-config-values.txt` beside this file, run on `main` at commit `d8f4d04` (the merge of the item 20 fix, engine `96146165ee8a578d`), 2026-11-22 10:46 UTC. Twelve searches, 183 hit lines. Each hit is read below. A hit fails the item if it is a copy of a value that lives in `config/showcase.json`: the frame rate, the duration, a format size, a tier's sample count, a segment edge, a key time, a threshold or a name shown to a viewer.

Result: no hit is such a copy.

## 1. Format sizes (4 hits)

- `worlds/rain/layers.ts` 27, 52, 94, 131: `540.0` wraps an angle in degrees (360 plus 180) in the shader that places the rain's cloud bank round the sun's bearing. Not a picture size.

## 2. Frame count and segment ends (1 hit)

- `weather/skyline.ts` 39: `segments: 1800` is the number of mesh segments of the far tree ring, one every 0.2 degrees. Not the frame count.

## 3. Cut frames (11 hits)

- `capture/export.module.css` 26, 34, 70, 233, 263 and `director/menu.module.css` 71: `font-weight: 600`, a type weight of the interface.
- `worlds/golden/layers.ts` 208: `radiusM: 240`, the radius of a cloud layer in metres.
- `worlds/rain/layers.ts` 164: `radiusM: 600`, the radius of a cloud layer in metres.
- `weather/rain/drops.ts` 64: `-1200 * radius`, the constant of the fall speed law of a raindrop.
- `plant/head/bud/index.ts` 195 and `plant/leaves/index.ts` 177: `900` is the index of a hash stream.

## 4. Frame rate and duration written as numbers (6 hits)

- `plant/index.ts` 81, `plant/leaves/shaders.ts` 258, `plant/head/bud/shaders.ts` 46, 90, 148: `* 30.0` is a noise frequency in a shader.
- `capture/export.ts` 467: `frameRate: fps`; `fps` is `config.film.fps` (line 51 of the file).

## 5. Tier sample counts and tier names (9 hits)

- `ground/puddles/index.ts` 68: `samples = 1` is the default of an argument, one pass when the caller names none; the caller passes the tier's count from config.
- `worlds/golden/index.ts` 26: `let samples = 1` is a state variable that the frame loop sets from the tier's count.
- `capture/export.ts` 386, 387: the tier id `'review'` names the tier used to time one sample for the estimate; the count comes from `samplesOf('review')`, which reads config.
- `director/film.ts` 53, `director/live.ts` 48, 346, 347, `director/modes.ts` 82: tier ids of the type `TierId`, which is `keyof Config['tiers']`; a tier id that config does not hold fails the type check. No sample count is written.

## 6. World, segment and key names (73 hits)

Every hit is an id used as a reference. None is a copy of a value.

- Read of a segment's start or end from config by its id (`segmentStart`, `segmentEnd`, `segmentById`, `config.segments.find`): `field/layout.ts` 11, 12, 13; `field/far.ts` 381; `ground/index.ts` 41, 47, 48, 90, 121; `ground/puddles/index.ts` 23; `ground/soil.ts` 91, 258; `plant/growth.ts` 52, 53, 54, 137; `worlds/golden/layers.ts` 196; `plant/surface/index.ts` 25; `worlds/golden/air.ts` 13; `worlds/golden/sky.ts` 125, 134; `worlds/rain/layers.ts` 177, 178; `plant/seedling/index.ts` 31; `plant/leaves/index.ts` 31, 33, 34, 35, 118, 560, 561, 562; `plant/head/petals/index.ts` 57; `weather/fog/index.ts` 170, 178, 184; `plant/stem/index.ts` 27, 28, 29; `weather/skyline.ts` 164; `plant/hairs/index.ts` 25; `post/looks.ts` 75; `units/bloom/index.ts` 7 (which also reads the key `bloom-opening`).
- Read of a key's time from config by its id (`keyTime`, `config.keys.find`): `field/layout.ts` 15, 16, 79; `plant/growth.ts` 55, 56, 254, 255; `plant/seedling/index.ts` 35; `plant/leaves/index.ts` 36, 37, 119; `worlds/night/sky.ts` 17; `worlds/dawn/layers.ts` 73; `worlds/dawn/sky.ts` 74, 75; `plant/stem/shape.ts` 163; `director/rig.ts` 7, 8, 28.
- The key whose approved image a world shows as its backdrop, named by id in the world's own definition: `worlds/dawn/index.ts` 13, `worlds/rain/index.ts` 14, `worlds/night/index.ts` 13, `worlds/frost/index.ts` 11, `worlds/golden/index.ts` 10.
- A world's id compared, to give that world its own air or look: `director/inputs.ts` 31 (`'rain'`), `post/looks.ts` 83 (`'golden'`).
- The key whose frame the export page renders as its check frame: `capture/export.ts` 48 (`'bloom-hero'`). Config holds no setting for it.
- A label that is not a config name: `field/layout.ts` 8 (`streamSeed('field')`, the name of the random stream of the folder `src/field`; the seed is `config.seed`); `worlds/night/index.ts` 57 and `worlds/dawn/index.ts` 93 (`makeMist('night', ...)`, `makeMist('dawn', ...)`, the label of a mist object).

`segmentStart`, `segmentEnd` and `keyTime` stop with an error at load when config holds no such id, so a renamed segment or key cannot go by unseen.

## 7. Thresholds of the quality bar (10 hits)

- `config.ts` 53, 57, 58, 62, 101, 102, 103, 106: the type of the config file and the list of its keys.
- `director/pose.ts` 57 and `director/film.ts` 87: `config.detail.focusCocPx`, read through config.

## 8. Segment edges and key times on a line that speaks of time (40 hits)

None is a segment edge or a key time on the film's time axis.

- An offset from a time that is read from config (`seed0`, `leaves0`, `bloom0` come from `config.plant.stages`; `RAIN_FROM_S`, `SHOWN_FROM`, `from`, `since` are read or computed, not written): `plant/growth.ts` 108, 109, 315; `plant/seedling/index.ts` 371, 450, 586; `plant/head/bud/index.ts` 525; `weather/frost/index.ts` 88; `plant/stem/index.ts` 486, 515; `plant/head/disc/shaders.ts` 79; `plant/leaves/index.ts` 723.
- A leaf's age in seconds, not film time: `plant/growth.ts` 336, 425, 492, 493, 507; `plant/leaves/index.ts` 609, 673, 846.
- A builder's own event time or duration that config does not hold: `plant/growth.ts` 71 (`CROWD_SECONDS = 1.5`, a duration), 308 (4.5 to 8 s, the time a ray takes to lie flat), 423 (a duration), 431 (leaf starts between 13 and 14.5 s and between 16 and 21 s, a duration of 8 s); `plant/leaves/index.ts` 202 and 754 (17 to 22 s, and a leaf age of 1.5 to 6 s).
- The index of a hash stream: `plant/growth.ts` 228, 246, 308 (`rnd(30`, `rnd(40`, `rnd(45`); `plant/seedling/index.ts` 135; `plant/leaves/shape.ts` 26.
- An exponent, an array offset, a count, a threshold between kinds or a noise frequency: `plant/growth.ts` 103 (`Math.pow(u, 1.5)`); `field/far.ts` 259 (`at + 8`); `plant/head/bud/index.ts` 553 (`/ 8`); `plant/head/bud/shaders.ts` 175 (`kind > 1.5`); `worlds/night/sky.ts` 105 (`* 14.0`).
- Words in a comment: `plant/leaves/index.ts` 717 ("about 45 degrees"); `worlds/golden/sky.ts` 8 and `worlds/dawn/sky.ts` 8 ("8 bit"); `weather/frost/index.ts` 8 (the draw order 20).
- `capture/export.ts` 111: `seconds < 5400` chooses the wording of the time remaining.

## 9. Named constants set to a segment edge or a key time (18 hits)

- Metres, degrees, pixels, counts and factors: `ground/index.ts` 20 (`WIDE = 8.3`); `plant/surface/wet/index.ts` 259 (`CARRY = 1.5`); `ground/grass.ts` 11, 12; `ground/puddles/index.ts` 21; `worlds/night/index.ts` 28; `worlds/night/layers.ts` 127; `worlds/dawn/layers.ts` 72 (`EARLY_AIR = 8`, a factor); `weather/skyline.ts` 49; `plant/head/bud/index.ts` 65 (`HOOK = 1.5`); `plant/hairs/index.ts` 10 (`HAIR_ORDER = 20`, a draw order), 30 (`CROWD_CELL_PX = 8`); `plant/standin.ts` 126 (`STEM_RINGS = 40`); `plant/part.ts` 39 (`PLACE = 8`, the numbers held for each neighbor).
- Durations: `plant/growth.ts` 71 (`CROWD_SECONDS = 1.5`); `plant/head/bud/index.ts` 54 (`BACK_LAG`, lags of 1.5 to 1.7 s).
- A builder's own event times, which config does not hold: `worlds/golden/air.ts` 14 (`OPEN_TO_S = 52.6`; the start of that window is `segmentStart('field')`); `plant/head/bud/index.ts` 175 (`WRAP_IN_S = [20.5, 24.2]`).

## 10. Segment edges and key times written as seconds (2 hits)

- `field/layout.ts` 141: a comment, periods of 3.2 to 6.8 s.
- `field/layout.ts` 168: `time <= 52.1`, the builder's own event time 0.1 s after the field segment starts. It is not the segment's edge (52 s), which the file reads from config in line 13.

## 11. The film's name, the worlds' names and the export file names (5 hits)

- `ground/soil.ts` 54, `plant/index.ts` 50, `plant/leaves/shape.ts` 1, `weather/skyline.ts` 144, `worlds/night/layers.ts` 136: the words "sunflower" and "golden hour" in comments that describe the plant and the land. No name shown to a viewer is written in `src/`; the interface takes the film's name and the worlds' names from config.

## 12. Judged frames, the picture's shape and the plants in view (4 hits)

- `ground/litter.ts` 50: `straws = 420`, a count of straws.
- `ground/soil.ts` 95 and 219: `r * 420`, the frequency of the cracks round the stem, in the program and in its shader.
- `director/live.ts` 17: `IDLE_MS = 3000`, the time after which the interface of `live` hides; config holds no such setting.
