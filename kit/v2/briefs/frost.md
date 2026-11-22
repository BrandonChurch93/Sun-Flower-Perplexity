# Brief: the frost, the mist and the dew

Your folders are `src/weather/frost/`, `src/weather/fog/`, `src/weather/mist/`, `src/plant/surface/frost/` and `src/plant/surface/dew/`. Your branch is `agent/frost`, your looks name is `frost`.

Brandon's words: "we get to just take in the flower ... with the frost on it and then that will go away". The frost hold is eight bars, 13.7 seconds of real time (bars 17 to 25, 28.3 to 42 s). The plant is a seedling 19 cm tall with three pairs of leaves, standing still. The camera sits 7.5 cm above the soil, 58 cm away, level, at about 48 mm, and drifts a little. The sun comes up behind the plant into mist: it is at the horizon at bar 17, 5.5 degrees up at bar 21, and clears the mist from bar 23. The targets are `references/v2/keys/frost.png` and `references/approved/frost.png`.

## What exists

`src/weather/frost/index.ts` (frost as a look), `src/weather/fog/index.ts` (fog banks), `src/weather/mist/index.ts` (sheets of ground mist), `src/plant/surface/frost/` and `src/plant/surface/dew/` (frost and dew on the plant's skin, plugged into `src/plant/surface/index.ts` by `frostGlsl` and `dewGlsl` and driven by `stateUniforms.uPlantFrost` and `uPlantDew`: keep those names). `src/worlds/frost/index.ts`, `src/worlds/dawn/index.ts` and `src/worlds/night/index.ts` show how version 1 put fog and mist on stage for one scene each; those files are dead. In version 2 the frost and dew on the plant and on the soil already answer their dials (look at shot 07 on the bench: the plant is evenly white, which is not frost), and no mist or fog is on stage yet: you put them there with `onstage.ts` files (`src/weather/fog/onstage.ts` is the part "fog", `src/weather/mist/onstage.ts` the part "mist"), each exporting `make(): Part[]`. The even fog of the whole scene (`uFogColor`, `uFogDensity`, `uFogFalloff`) is the Builder's, in `src/v2/look.ts`; yours is everything with a shape.

Version 1's critic: "the thick white frost rim and the frost crystals that cover the leaves ... are almost gone; the leaves read as plain dark green with only a faint pale edge".

## What to build

1. Frost on the plant. Hoar frost grows where air meets an edge: a thick white fringe of needles along every leaf margin and vein ridge, on the hairs of the stem (each hair a white spike), a fine sugar of crystals over the leaf face with the green showing through it, thinner in the middle of the blade. Backlit by the low sun the fringe glows and single crystals flash as the camera drifts. It has to be shape and sparkle, never a white tint. The soil's frost belongs to the ground agent; the two must look like one frost, so look at its pictures on the branch `agent/ground-looks` and at the references.
2. The dials. `cold` and `frost` rise through the night before the hold (bars 15.5 to 17) while the time lapse is still running: frost must grow in, from the edges inward, and be all there at bar 17. From bar 23 `frost` falls to 0.6 at bar 25 and to 0 soon after, as `dew` and `wet` rise: the thaw. Frost melts first where the sun hits, the fringe drawing back into beads of water that hang, run together and drop; leaves go from white to dark wet green.
3. Dew. At frame 0 (`dew` 1, blue hour, `references/v2/keys/open.png`, `references/approved/dawn-sprout.png`) and after the thaw: round beads standing on hairs and leaf edges, each one a lens with the sky in it and a bright point from the sun, a few big ones, many fine ones, none floating free of what carries it. Version 1's critics found beads floating beside the grass.
4. The mist. In the hold `dials.fog` is 0.8 and falls to 0.57 at bar 23 and 0.35 at bar 25. What the references show: a white bank lying in the low ground beyond the seedlings, the far land as pale grey layers above it, the sun a soft disc with a wide glow, and thin veils close to the soil that drift (on `uReal`, slowly, toward azimuth 42) and catch the light when they pass in front of the sun. As the sun clears the mist the veils lift and thin and shafts of light stand in them for a moment. Mist also lies in the hollows in the first minutes of the film (frame 0) and may return thinly on cool mornings of the time lapse if the dials say so (`fog` above 0). In the time lapse it must not flicker: it forms and burns off smoothly over each dawn.
5. Breath of cold. The air in the hold should feel still and freezing: tiny ice crystals adrift in the light near the lens, a few, slow, soft. Not snow.

## What is judged

1. `npm run bench -- --sky sky-0 --only all --view film --format 16x9 --tier review --shots 01,07` and the same at film seconds 38.6 and 41.5 (the bench takes `--clip`, or ask `/root` for a shot), beside the references.
2. Clips with `--only all --view film`: `--clip 26.5,30.5` (the frost grows in and the hold begins), `--clip 34,37` (the hold: sparkle, drifting veils), `--clip 38,43` (the thaw).
3. `--count` prints PASS. Your report says what mist and fog cost at `view.quality` `film`, `high` and `low` (draw calls, layers, passes), and that they cost nothing when `fog` is 0.
4. The line of `COMMON.md` prints nothing for your folders.

A first heartbeat with pictures within 30 minutes. Your report goes to `/root` 150 minutes after you start, or sooner if you are done.
