# Recipe · world golden

## sky.jpg

- Output files: `public/assets/worlds/golden/full/sky.jpg` (8192 x 2048, JPEG quality 93, no chroma subsampling) and `public/assets/worlds/golden/web/sky.jpg` (4096 x 1024, JPEG quality 92, no chroma subsampling).
- What it is: the whole dome of the golden hour sky, used by both the bloom and the field segments. Across, it runs once round the horizon with the sun at the middle and screen right to the right. Down, the row is the square root of the elevation over 90 degrees, so most rows lie near the horizon where the film looks. It holds no sun disc, no land and no haze glow: the shader in `src/worlds/golden/sky.ts` multiplies the picture by a smooth gain that climbs toward the sun and the horizon and adds the aureole and the disc at true brightness.
- Tool: the workspace's image generation tool, model `seedream_5`, aspect ratio 16:9. Every take came back at 2816 x 1584. The tool wrote JPEG data into files named `.png`.
- Takes are kept under `out/work/sky/` and are not committed.

### Sunward picture

- Input files: `references/approved/field.png` (image 1) and `references/approved/bloom-hero.png` (image 2).
- Prompt, word for word: "A wide photograph of only the sky at golden hour, shot on a cinema camera with a wide lens aimed level at the horizon across a flat plain. Wide 16:9 frame. Use the two reference images only for the look of the sky: image 1 for the lit streaks of cloud low over the horizon and the color of the light, image 2 for the heavy slate blue cloud overhead. The bottom edge of the picture is exactly the level horizon: no land, no hills, no trees, no field, no plants, no water, nothing but sky anywhere in the picture. The sun is very low, sitting on the horizon at the bottom edge, one quarter of the way in from the left edge; it is veiled by haze, a soft pale gold glow, not a white disc and not blown out. Lower third of the picture: a clear band of warm gold sky along the horizon, brightest near the sun, crossed by thin long streaks of cloud lit gold and orange from below, sparser toward the horizon. Upper two thirds: a heavy layer of slate blue stratocumulus cloud with a broken ragged underside whose edges are lit warm from below, darkest at the top of the picture. Faint crepuscular rays fan upward from the sun through gaps in the cloud. Moody, low key, natural color, documentary realism, fine cloud detail everywhere. Even exposure with detail in every part: no clipped highlights, no lens flare, no vignette, no birds, no aircraft, no text, no watermark, no border."
- Takes: 3. Kept take 1 (`out/work/sky/sunward-1.png`): the plainest rays, a broken underside lit from below and thin streaks in the gold band; the sun sits at 0.286 of the width, on row 1486, with the horizon on row 1528. Take 2 thrown out: little shape in the rays. Take 3 thrown out: the cloud base stands too high, so the heavy cloud would leave the frame at the bloom keys.

### Away picture

- Input file: `references/approved/bloom-hero.png`.
- Prompt, word for word: "A wide photograph of only the sky at dusk, shot on a cinema camera with a wide lens aimed level at the horizon across a flat plain, looking directly away from the sunset. Wide 16:9 frame. Use the reference image only for the look of the heavy slate blue cloud. The bottom edge of the picture is exactly the level horizon: no land, no hills, no trees, no field, no plants, no water, nothing but sky anywhere. No sun and no bright spot anywhere. A heavy even layer of dark slate blue stratocumulus cloud with a broken underside, faintly tinted dull rose and grey from below, darkest at the top of the picture; along the horizon at the bottom a dim narrow band of grey mauve sky with a few thin dull streaks of cloud. The left and right edges of the picture look alike in tone. Moody, low key, natural color, documentary realism. No lens flare, no vignette, no birds, no aircraft, no text, no watermark, no border."
- Takes: 1. Kept take 1 (`out/work/sky/away-1.png`). The film never looks this way; it closes the dome so that nothing is missing behind the camera.

### Laying the dome out

- `node assets-src/worlds/golden/compose-sky.mjs`, run from the repo root, reads the two kept takes and writes both output files.
- The sunward picture covers 100 degrees of azimuth, from 28.6 degrees left of the sun to 71.4 degrees right of it. The film sees from about 14 degrees left of the sun to 61 degrees right of it, so every sky pixel of the film comes from this one picture.
- Its height is laid over 13 degrees of elevation, with the sun's row at the sun's elevation of 2.18 degrees. The take was shot level with a wide lens, so cloud near the horizon is seen edge on and its rows stand for far less sky than its columns do. Below the sun's row the picture is turned over, since the take has the sun on its bottom edge and the film has it 2.18 degrees up.
- Above 9.5 to 13 degrees the dome fades into a strong blur of the top rows of the take, dimmed by up to 30 percent overhead. The film sees up to about 16 degrees.
- The away picture is laid twice, the second time mirrored, over the other 260 degrees. It is pulled toward the tone of the sunward picture where they meet, less with every degree from the seam, and the two are cross-faded over 12 degrees.
- Where a row of the dome covers more than one row of a take, the take is averaged over that span.

### Checks passed

- Both takes were looked at in native-size crops of their four corners: no text, no watermark, no border, no bird, no aircraft, no land.
- The dome was looked at as a whole and in a crop round the sun: no seam in the part the film sees, no land, no sun disc.
- Sizes: 8192 x 2048 and 4096 x 1024. Files: 1.1 MB and 0.3 MB, both far under 20 MB. In memory with its smaller copies the full map takes 89 MB, under the 420 MB the world may use.
- The stills of frames 1350, 1515 and 1755 were set beside `references/approved/bloom-opening.png`, `bloom-hero.png` and `field.png`: the heavy slate cloud overhead, the lit underside, the pale gold band along the horizon and the place of the sun agree in all three with this one map.

## Not maps

- The hills, the tree lines, the far land, the haze veils and the specks in the air are drawn by code in `src/worlds/golden/layers.ts` and `src/worlds/golden/air.ts` and use no file.
- The stand-in `backdrop.jpg` of this world is gone from the repo; `tools/standin-backdrops.ts` still lists it and would write it again if run.
