# Reference pictures for version 2

Made 22 November 2026, 22:23 to 22:45 UTC, after Brandon's go-ahead ("If you think new image generations are needed, you can go ahead and generate them now as references ... once you've approved the quality, you can go ahead and start building start to finish").

## Why new pictures were needed

The eight pictures Brandon approved for version 1 stay the first authority for taste: the soil, the plant, the light, the grade. They do not show seven states that version 2 has and version 1 did not:

| New state | Why no approved picture covers it |
| --- | --- |
| The opening, blue hour before the first sunrise | The approved dawn pictures have the sun up and the hook already out |
| Frost on the 18 cm seedling | The approved frost picture is the bud at 1.4 m in a grown field |
| A time-lapse day over the young plant | No approved picture has a daytime sky. Version 1 never showed one |
| The storm on the 90 cm plant | The approved rain picture is a 30 cm plant under an even grey sky |
| Lightning inside the cloud | New |
| The sun breaking through the storm | New |
| Dusk with the closed bud, and the last light over the field | The approved bloom and field pictures have the sun well up |

## How they were made

- Tool `generate_image`, model `seedream_5`, 16:9, 2816 x 1584, one call per take. All ten first takes ran side by side (156 to 206 s each), then four second takes (156 to 230 s).
- Image 1 of every call is `references/approved/bloom-hero.png`, the style anchor of version 1. Then the approved pictures that hold the place and the plant, then photographs from `references/cache/` for the real thing (hoarfrost, a young plant, heavy rain), and last a frame from our own engine at the planned camera, described to the model as a rough previsualization sketch that fixes the framing only. So the place, the camera and the layout of each picture are ours.
- The layout frames are in `layouts/`. They were drawn by the version 1 engine at the plant size and camera of each moment (`layouts/layout.ts`, run from the version 1 engine with `npx tsx`).
- The exact prompt of every take is in `prompts/`. `recipes.json` lists the inputs of every take and where its output is.
- The Builder approved them by eye at 1,400 px, as Brandon asked. No jury was run.

## The picks

In `keys/`. The contact sheet is `contact-sheet.jpg`.

| Key | Take | What it is for | Faults that stay in it |
| --- | --- | --- | --- |
| `open` | 2 of 2 | Frame 0: blue hour, the soil heaved over the seed, a rose band where the sun will rise, mist under the hills | The heave is two flat plates, a little too tidy. No stars to speak of |
| `frost` | 2 of 2 | The frost hold: the seedling lit from behind through mist, white needles on every leaf edge and stem hair, frozen clods with a glitter path | The seedling has more leaves than ours at 18 cm. The sun is a soft disc at the horizon, where the plan has it clearing the mist by bar 21 |
| `climb` | 2 of 2 | A time-lapse day: deep blue above, heavy cumulus with lit rims, the sun behind a cloud edge with rays, the young field in rows | The clouds are sharp, not streaked: the streaking is the film's own. The plant copies the layout sketch |
| `climb-fair` | 1 of 2 | The same day in fair weather, for the quieter days | As above |
| `storm` | 2 of 2 | The storm hold: a dark modelled cloud deck with a pale band over the hills, rain in depth, the furrow full of water with rings and a crown, matte toothed leaves that drip | The plant reads about 70 cm, the plan says 90. The rain is still a little even in brightness |
| `storm-flash` | 1 of 1 | Lightning: the glow is inside the cloud at upper left, the plant goes to a hard rim | The leaves are glossy and smooth. Use it for the cloud and the light only |
| `break` | 1 of 2 | Bar 41: the sun behind a torn cloud edge at upper left, shafts, every wet surface glittering, the puddle a mirror, a rain curtain leaving at right | The plant is smaller in frame than the layout |
| `late` | 1 of 1 | Bar 56: dusk, the closed bud against a banded sky, rim light on the stem hairs, the field of buds behind | Darker than the bloom that follows it one bar later. Take the sky and the rim, not the exposure |
| `last` | 1 of 2 | The last frame: the sun on the horizon, the whole field with every head lit from behind, the two plants in front with long shadows toward the camera | A heavy dark vignette. The grass strip in front is wider than our field's edge |

| `frost-margin` | 1 of 1 | Close shot 1 of the frost hold (bars 19 to 21): one leaf, a dense fringe of feathered ice blades along its edge, sugar on its face thickest on the veins, the dim sun as a soft disc in the mist behind it. Cold | The leaf is longer and narrower than ours. Take the ice, the light and the depth of field |
| `frost-sun` | 1 of 1 | Close shot 2 (bars 21 to 23): the growing tip and the furred stem as the sun comes through: every edge and hair burning white gold, glints as points in focus and soft discs out of it, the frozen field behind as a dark band of warm discs | Two young leaves stand as a pair; ours has one tall and one tiny at the tip, with the pair below rising beside them |
| `frost-thaw` | 1 of 1 | Close shot 3 (bars 23 to 25): the thaw on one leaf: ice still standing near the stalk, clear beads on veins and teeth toward the tip, one full drop at the tip with the sun in it and one in the air below | The sun's rays through the leaf are a photographic flare; ours need not copy them |
| `bloom-close-opening` | 1 of 1 | The bloom seen close (bars 57 to 59): the rays free on the lit side, still folded under the bracts on the other, the disc a tight green gold spiral | Made on our own frame as the layout, so the framing is the film's |
| `bloom-close` | 1 of 1 | The open flower close (bars 61 to 65): the head at 85 percent of the frame height, the outer rings of the disc open with a gold fringe of pollen, the middle still green and closed, every ray veined and none flat | The sun sits on the horizon; in the film it is still 5 degrees up on bar 61 |

## The other takes

In `takes/`, as JPEG.

- `open` take 1: the soil mound is one smooth round clod with a crack. Take 2 asked for a low heave of broken plates and got it.
- `frost` take 1: the light and the mist are right, the frost on the leaves is thin. Take 2 asked for a dense white fringe and white dust on the leaf faces.
- `storm` take 1: the plant reads 40 to 50 cm. Take 2 asked for a waist high plant and matte leaves.
- `break` take 2: the sun is out of frame and one strong shaft crosses the picture. Kept as the alternative if the sun reads better just outside the frame at bar 41.
- `last` take 2: asked for every head turned away from the camera and a lighter vignette. It came back almost the same as take 1. The heads facing the camera with the sun behind them is what the approved `field` picture shows too, and it is what the real plant does (a mature head faces east), so take 1 stands.

## What these pictures are, and are not

- They are targets for light, air, weather and grade in the new states, and for the layout of each hold.
- They are not approved by Brandon one by one. Where one of them disagrees with one of his eight, his picture wins.
- The plant in them is the model's plant. Ours keeps its own leaf count and form at each height.
