# Recipe · world frost

## backdrop.jpg (stand-in)

- Output files: `public/assets/worlds/frost/full/backdrop.jpg` (2816 x 1584) and `public/assets/worlds/frost/web/backdrop.jpg` (2048 x 1152).
- What it is: the approved image `references/approved/frost.png` with the plant painted out. The sky shader places it where the camera of the key `frost` sees it.
- Tool: the workspace's image generation tool, model `nano_banana_pro`, used as an image edit.
- Steps:
  1. Input: `references/approved/frost.png`, as the only input image. Aspect ratio 16:9. Prompt, word for word: "Edit this photograph. Remove the large sunflower plant in the foreground completely: its thick stem, its big frosted leaves and its large closed bud at the top. Fill the place where it stood with what would be seen behind it: the cold fog, the pale glow of the low sun, and the rows of small frosted sunflower buds of the field in the distance. Keep the far field of small buds as it is. Keep everything else exactly as it is and exactly where it is: the framing, the horizon line, the sun and its position, the sky, the colors, the light, the depth of field blur and the film grain. Do not add anything: no plant in the foreground, no sprout, no flower, no leaves, no people, no animals, no insects, no objects, no text, no watermark, no border."
- Then `npx tsx tools/standin-backdrops.ts` stretches the kept take to 2816 x 1584, moves it up by 4 px (JPEG, quality 92, no chroma subsampling) and makes the web size from that file (quality 88). The take is read from `out/work/backdrops/frost-n1.png`, which is not committed.
- Take kept: take 1 of 2. The plant is gone, the pale sun, the fog and the far buds are unchanged. The model returns 2752 x 1536; stretched back to 2816 x 1584 it lay 4 px low, so the script moves it up by 4 px.
- Takes thrown out: the other take (model seedream_5) recolored the fog and added a new plant.
- Checks passed: the take was scaled to the size of the approved image and compared with it region by region (left, right and top strips, the best shift searched within 20 px): best shift 4 px down in the left and right strips before the script moved it up by 4 px. It was looked at in native-size crops of its four corners and of the place where the plant stood: no text, no watermark, no object that was not there before, no leftover of the plant.
- Status: no longer drawn. The world's settings name no backdrop file (`backdrop.file` is `null` in `src/worlds/frost/index.ts`), so the two files above are loaded by nothing. They stay on disk until the Builder removes them from the asset list.

## The sky (no file)

- Decision: the frost sky is not a painting. It is fog and nothing else, a smooth grey with a wide glow round the sun, and an 8 bit picture of so smooth a field bands when the grade stretches it. The golden recipe (paint the approved sky with the plant out) is right for a sky with clouds in it and wrong for this one.
- What draws it: `src/worlds/frost/sky.ts`, a full screen pass that reads `fogLight(direction)` from `src/weather/fog/index.ts`: the fog's color at eye level (`fog.color`), its color overhead (`FOG_HIGH` in `src/worlds/frost/index.ts`), the sun's light through it (`fog.sunTint`) and the glow round the sun (`sky.glow`), plus the white disc (`sky.disc`) and slow high banks of 3.5 percent either way.
- How the numbers were found: a least squares fit of those four colors to the approved image `references/approved/frost.png`, scaled to 1920 x 1080 and taken back through the grade to scene values, over the sky above y 560 with the plant masked out. The far shapes, the banks and the neighbors fade toward the same `fogLight`, so a thing that is gone in the fog is exactly the sky behind it.
- Checks: the tones of named boxes of the sky beside the approved at 1920 x 1080 are in the reports of `agent/frost-world`.

## Decisions (no file)

- Air: the air of the frost is the fog and its six drifting banks (`src/weather/fog/`), at 4, 7, 11, 16, 24 and 42 m. Ice specks in the air were tried and dropped: at the size the lens gives them they read as dust on the glass.
- Ground: no frame of the unit shows the ground. Draft stills of frames 900 to 1170 every 30 frames and 1199, and the `depth` view of frame 900, show the neighbors' leaves over every pixel under the horizon. So no crystals are placed on the grass and `src/ground/frost/` holds nothing. The pale crust on the soil and the grass is the ground's own frost state (`ground.frost: 1`). Open: if a later camera or a thinner field shows the ground in this unit, crystals from `src/weather/frost/` go on the grass blades.
- Far shapes: the nine layers of the shared skyline, drawn from `skylineRing` so they follow the film's one easing. Their feet fade into the low fog (`FOOT` in `src/worlds/frost/layers.ts`); their top edge is the shared one, so nothing steps at the cut to the golden hour.
- `standIn` is `false` from this point: the sky, the far layers, the air, the state of the ground and the weather are all drawn by the parts above.
