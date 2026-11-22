# Brief: the rain

Your folders are `src/weather/rain/`, `src/ground/puddles/` and `src/plant/surface/wet/`. Your branch is `agent/rain`, your looks name is `rain`.

Brandon's words: "we get to just take in the flower with the rain hitting it". The storm hold is eight bars, 13.7 seconds of real time (bars 33 to 41, 55.7 to 69.5 s), with the plant standing still at 90 cm and the camera 2.4 m back, 0.42 m high, at 38 mm, pushing slowly in to 2.0 m. For those seconds the rain is the subject. The targets are `references/v2/keys/storm.png`, `storm-flash.png` and `break.png`, and `references/approved/rain.png`.

## What exists

`src/weather/rain/streaks.ts` and `drops.ts` (falling rain), `src/ground/puddles/` (the basin, the water, ripples, crowns, landings), `src/plant/surface/wet/` (water on the plant's skin, plugged into `src/plant/surface/index.ts` by `wetGlsl` and driven by `stateUniforms.uPlantWet`: keep those names). `src/worlds/rain/index.ts` shows how version 1 put them on stage for one scene; that file is dead. Nothing of yours is on stage in version 2 yet: you put it there with `onstage.ts` files (`src/weather/rain/onstage.ts` is the part "rain", `src/ground/puddles/onstage.ts` the part "puddles"), each exporting `make(): Part[]`.

Version 1's critics on it: "rain streaks are sparse, uniform parallel lines tilted around 20 degrees instead of 10 degrees, with no depth layering, atmospheric mist, or airborne ground spray"; "the rain is one uniform layer of bright, equally sharp, equally long streaks at one angle; streaks in front of the stem and over the blurred background have the same sharpness"; "the puddle is a narrow ribbon with smooth sine-wave ripples, soft matte edges, and almost no raindrop splashes"; "the leaves have blotchy bumpy noise and plastic sheen instead of crisp venation and beaded water".

## What to build

1. Rain in depth. Real rain filmed at 1/60 s is streaks of very different size and sharpness: a few huge soft ones close to the lens, far out of focus; sharp fine ones at the plant's distance; and beyond it no streaks at all but a grey veil that thickens with distance and swallows the far land, with darker shafts of heavier rain drifting across it. Every drop is lit by the sky behind and round it (a drop is a lens: bright against dark, dark against bright), so against the dark deck they glint and against the bright gap at the horizon they nearly vanish. Gusts change the slant in waves (`dials.wind`). Each streak is the drop's path over the shutter: at 8 samples it is drawn as the moving drop, at 1 sample as the smeared streak, and the two must look alike.
2. The dials. `rain` is 0 until bar 33.6, 1 from bar 34 to 39.5, 0.77 at bar 40, 0 at bar 41. It must arrive as rain arrives: first big drops far apart, each one seen landing, then the curtain. And leave the same way. `wet` and `puddle` follow by their own dials (wet 1 and puddle 0.93 by bar 36) and stay after the rain, drying over the next days: the wet look and the standing water must hold up in the time lapse that follows, with the sun crossing the water in seconds.
3. Landing. Every drop that reaches something does something: a crown and a ring on the water, a dark dot and a tiny spray on the soil, a burst into mist on a leaf, which the plant agent answers with a nod of that leaf (tell `/root` where and when your drops land on leaves, as a pure function of time, so the nods can be made to agree). A haze of spray stands a hand high over the soil in the heavy rain.
4. Water on the plant. Beads that gather, run down the midrib, hang at the tip and fall; a film that darkens the leaf and gives it a sharp sheen; hairs on the stem holding drops. It has to read from 2.4 m as a wet plant and hold up at 2.0 m.
5. The puddle. A real one: an irregular outline that follows the furrow (the ground agent gives the basin through `Ground.glsl` and `rippleBox`, as now), a meniscus, clods standing out of it, the sky and the plant mirrored in it and broken by rings, mud showing through at the shallow edge. It fills by `puddle`.
6. The flash. `dials.flash` (bars 33 and 37, two swells within ten frames, from the direction `now.flashAt`): every drop in the air freezes bright for those frames, the puddle mirrors the lit cloud. The light on the soil and the plant is the Builder's (`src/v2/look.ts`); you light your own drops and water.
7. The break. At bar 41 the sun comes through the torn deck straight ahead (azimuth 201, 11 degrees up; `burst` 1, `sunThrough` 0.5) while the last rain still falls: backlit drops turn to sparks of gold, the puddle blazes. This is the moment the music lifts. Make it the best frame of the storm.

## What is judged

1. `npm run bench -- --sky sky-0 --only all --view film --format 16x9 --tier review --shots 10,11,12` beside the four references. The stand-in sky is flat grey in the storm: judge your rain against it and against a darker one, since the real sky will be a dark deck with a bright gap at the horizon.
2. Clips with `--only all --view film`: `--clip 55.5,59.5` (the first drops, the curtain), `--clip 62,65` (a flash), `--clip 67.5,71.5` (the break). Look at them at 1 sample and at 8.
3. `--count` prints PASS. Your report says what the rain costs when `rain` is 1 (draw calls, instances, passes) at `view.quality` `film`, `high` and `low`, and that it costs nothing when `rain`, `wet` and `puddle` are 0.
4. The line of `COMMON.md` prints nothing for your folders.

A first heartbeat with pictures within 30 minutes. Your report goes to `/root` 150 minutes after you start, or sooner if you are done.
