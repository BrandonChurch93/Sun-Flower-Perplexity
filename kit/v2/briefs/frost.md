# Brief: the frost, the mist and the dew

Your folders are `src/weather/frost/`, `src/weather/fog/`, `src/weather/mist/`, `src/plant/surface/frost/` and `src/plant/surface/dew/`. Your branch is `agent/frost`, your looks name is `frost`.

Brandon's words: "we get to just take in the flower ... with the frost on it and then that will go away". The frost hold is eight bars, 13.7 seconds of real time (bars 17 to 25, 28.3 to 42 s). The plant is a seedling 19 cm tall with three pairs of leaves, standing still. The camera sits 7.5 cm above the soil, level, at about 48 mm, and creeps in from 59 cm to 54 cm over the hold while turning 2.4 degrees round the plant. The sun comes up behind the plant into mist: it is at the horizon at bar 17, 5.5 degrees up at bar 21, and clears the mist from bar 23. The targets are `references/v2/keys/frost.png` and `references/approved/frost.png`.

## What exists

`src/weather/frost/index.ts` (frost as a look), `src/weather/fog/index.ts` (fog banks), `src/weather/mist/index.ts` (sheets of ground mist), `src/plant/surface/frost/` and `src/plant/surface/dew/` (frost and dew on the plant's skin, plugged into `src/plant/surface/index.ts` by `frostGlsl` and `dewGlsl` and driven by `stateUniforms.uPlantFrost` and `uPlantDew`: keep those names). `src/worlds/frost/index.ts`, `src/worlds/dawn/index.ts` and `src/worlds/night/index.ts` show how version 1 put fog and mist on stage for one scene each; those files are dead. In version 2 the frost and dew on the plant and on the soil already answer their dials (look at shot 07 on the bench: the plant is evenly white, which is not frost), and no mist or fog is on stage yet: you put them there with `onstage.ts` files (`src/weather/fog/onstage.ts` is the part "fog", `src/weather/mist/onstage.ts` the part "mist"), each exporting `make(): Part[]`. The even fog of the whole scene (`uFogColor`, `uFogDensity`, `uFogFalloff`) is the Builder's, in `src/v2/look.ts`; yours is everything with a shape.

Version 1's critic: "the thick white frost rim and the frost crystals that cover the leaves ... are almost gone; the leaves read as plain dark green with only a faint pale edge".

## What to build

1. Frost on the plant. Hoar frost grows where air meets an edge: a thick white fringe of needles along every leaf margin and vein ridge, on the hairs of the stem (each hair a white spike), a fine sugar of crystals over the leaf face with the green showing through it, thinner in the middle of the blade. Backlit by the low sun the fringe glows and single crystals flash as the camera drifts. It has to be shape and sparkle, never a white tint. The soil's frost belongs to the ground agent; the two must look like one frost, so look at its pictures on the branch `agent/ground-looks` and at the references.
2. The dials. `cold` and `frost` rise through the night before the hold (bars 16.4 to 17), when the plant has all but stopped growing: frost must grow in, from the edges inward, and be all there at bar 17. `frost` is 1 to bar 22.5, then melts inside the hold to 0.15 at bar 25 and is gone at bar 25.4, as `dew` and `wet` rise: the thaw. The plant does not grow while more than a trace of frost is on it. Frost melts first where the sun hits, the fringe drawing back into beads of water that hang, run together and drop; leaves go from white to dark wet green.
3. Dew. At frame 0 (`dew` 1, blue hour, `references/v2/keys/open.png`, `references/approved/dawn-sprout.png`) and after the thaw: round beads standing on hairs and leaf edges, each one a lens with the sky in it and a bright point from the sun, a few big ones, many fine ones, none floating free of what carries it. Version 1's critics found beads floating beside the grass.
4. The mist. In the hold `dials.fog` is 0.8 and falls to 0.57 at bar 23 and 0.35 at bar 25. What the references show: a white bank lying in the low ground beyond the seedlings, the far land as pale grey layers above it, the sun a soft disc with a wide glow, and thin veils close to the soil that drift (on `uReal`, slowly, toward azimuth 42) and catch the light when they pass in front of the sun. As the sun clears the mist the veils lift and thin and shafts of light stand in them for a moment. Mist also lies in the hollows in the first minutes of the film (frame 0) and may return thinly on cool mornings of the time lapse if the dials say so (`fog` above 0). In the time lapse it must not flicker: it forms and burns off smoothly over each dawn.
5. Breath of cold. The air in the hold should feel still and freezing: tiny ice crystals adrift in the light near the lens, a few, slow, soft. Not snow.

## What is judged

1. `npm run bench -- --sky sky-0 --only all --view film --format 16x9 --tier review --shots 01,07` and the same at film seconds 38.6 and 41.5 (the bench takes `--clip`, or ask `/root` for a shot), beside the references.
2. Clips with `--only all --view film`: `--clip 26.5,30.5` (the frost grows in and the hold begins), `--clip 34,37` (the hold: sparkle, drifting veils), `--clip 38,43` (the thaw).
3. `--count` prints PASS. Your report says what mist and fog cost at `view.quality` `film`, `high` and `low` (draw calls, layers, passes), and that they cost nothing when `fog` is 0.
4. The line of `COMMON.md` prints nothing for your folders.

A first heartbeat with pictures within 30 minutes. Your report goes to `/root` 150 minutes after you start, or sooner if you are done.

## The close shots (23 November)

Brandon: "I think it would look really good if we got some zoomed in shots of our sunflowers showing the crystallization on various parts of it ... make sure that the camera angles on frost are really good and show the best parts of the flower. You want to see like frost glistening in the sunlight and just the high detail on it."

The hold now cuts to three close shots (see `CHANGES.md` 14 and 15, and `src/v2/cuts.ts`). At 100 mm and 17 to 23 cm the frame is 6 to 8 cm wide: one needle of ice is 20 to 60 pixels long at film size. What was made for the wide shot does not hold there. Your own findings, which I share: the needles are flat blades of one tone, the fringe is separate tufts 3 to 6 mm apart with bare margin between, the vein ridges carry chips, the leaf face is dust, the cotyledons carry dots, and out of focus the tufts are flat white blobs.

The three reference pictures are `references/v2/keys/frost-margin.png`, `frost-sun.png` and `frost-thaw.png`. They are the bar. The plant in them is not ours; take the ice, the light and the depth of field.

### What to build

1. Crystals with form. Hoar grows as feathers and plates: a spine with side blades at 60 degrees, thin, clear at the root and white at the edges. In focus a crystal must show facets: some faces bright, some grey, one or two throwing the sun back as a hard point, and light passing through the thin ones. No crystal may read as a flat white paper spike.
2. A closed fringe. Along a margin the crystals stand shoulder to shoulder, largest on the teeth and at the tip, and between the large ones stand small ones and grains, so that no bare margin shows at full frost. The same on the vein ridges of the upper face, lower and denser, and on the stalks.
3. Sugar on the blade. The face of a leaf carries a crust of fine grains with relief: it follows the veins, lies thickest beside them and at the margin, thins toward the middle of each field between veins where the green shows through. In the close shots single grains must be seen and must glint.
4. Rime on the hairs. Every hair of the stem and the stalks wears a sleeve of ice two to three times its own width, rough, white, with a bright edge against the sun. A hair must not turn into a smooth white line.
5. Glints. Points that flash as the lens drifts: chosen by a hash of the crystal and the angle between the lens, the facet and the sun, never by time. In focus a glint is a hard point with a little star; out of focus it must open into a soft round disc of the lens's blur size (ask the post owner how to hand it the brightness; it is building that for these shots now). The frozen field behind shot `tip` should be a dark band full of such discs.
6. Growth, in shot `margin`. The dial runs 0.70 to 1 there (bars 19 to 20.5). What the wide shot can see must all be there at 0.70: the white fringe, the sugar, the frozen clods. From 0.70 to 1 the crystals gain what only the close shot sees: each feather lengthens by about half, its side blades come out one after another from the root to the tip, and new small crystals appear between the large. Nothing may pop: a crystal grows from nothing by scale along its spine.
7. The sun in the mist. In shot `margin` the sun must be seen as a pale soft disc in the mist at the upper left, about one and a third times as bright as the mist round it, with a wide glow; at fog 0.8 there is only an even pale sky there now. On the cut of bar 21 the mist steps thinner and the sun comes through: the disc brightens and warms through shot `tip`, and the glints with it. The disc is the sky owner's; the mist in front of it is yours. Tell `/root` what you need from the sky.
8. The thaw, in shot `thaw` (bars 23 to 25). From bar 22.7 the dial falls. A crystal does not fade: it rounds off, goes glassy and clear from the tip down, slumps, and is a bead of water where it stood. The sugar on the blade goes dark and wet in patches that spread from the lit side. At bar 24 about half of the margin still carries ice, near the stalk; toward the tip it is beads. The beads themselves, and the one drop at the tip of leaf 0 that hangs and falls (dials `drop`, `dropFall`), are the rain owner's bead set in `src/plant/surface/wet/`: agree with it where ice ends and water begins, so that one never stands inside the other.
9. Cost. Everything is made at loading. The close shots are in the film's warming (`closeFrames`); a cut may make nothing and may not cost a long frame. Say what the crystals cost in triangles and draw calls at the three close shots and in the wide shot, and keep the wide shot's frame time where it is.

### What is judged

- The film's own frames, at draft and at review tier: 952, 975, 1003, 1054 (shot `margin`), 1055, 1106, 1156 (`tip`), 1157, 1190, 1208, 1240, 1259 (`thaw`), and the wide shot at 940 and 1262. `npm run bench -- --only all --frames 952,975,1003,1054 --name margin --cols 4`.
- Each close shot beside its reference picture, at film size. Send the pairs.
- Clips of each close shot (`--clip` with the film's seconds: 31.73 to 35.13, 35.17 to 38.53, 38.57 to 41.97): growth without a pop, glints that come and go as the lens drifts, the thaw.
- `--count` prints PASS on frames 940 to 1270, and the cost line above.

Order: 1, 2 and 5 first (they carry shots `margin` and `tip`), a heartbeat with pairs after each. Then 3, 4, 6, 7. Then 8.
