# Recipe · world rain

## sky.jpg

- Output files: `public/assets/worlds/rain/full/sky.jpg` (5632 x 1560) and `public/assets/worlds/rain/web/sky.jpg` (2816 x 780).
- What it is: the painted storm sky, with no rain, no plant and no ground in it. One take covers 60 degrees of the horizon; the file holds it twice, the second time mirrored, so it closes round the dome without a seam. Its lowest 23 percent is the pale band under the cloud. `src/worlds/rain/sky.ts` lays it round the horizon.
- Tool: the workspace's image generation tool, model `seedream_5`.
- Steps:
  1. Input: `references/approved/rain.png`, as the only input image. Aspect ratio 16:9. Prompt, word for word: "A wide photograph of only the sky during a heavy rainstorm in daylight, shot on a cinema camera with a long lens aimed level at the horizon across a flat plain. Wide 16:9 frame. Use the reference image only for the look, color and texture of its sky: the low dark slate blue storm cloud and the pale band of brightness under it. The bottom edge of the picture is exactly the level horizon: no land, no hills, no trees, no field, no plants, no water, nothing but sky anywhere in the picture. Lower quarter of the picture: a pale, bright, cool white grey band of light along the whole horizon, brightest in the middle of the band, soft and hazy, with a few thin darker wisps of low cloud crossing it. Upper three quarters: a low, heavy, dark slate blue storm cloud layer with strong texture, rolling folds, darker bellies and slightly lighter blue grey breaks between them, its ragged underside hanging in soft torn fringes into the pale band. The cloud is darkest at the top of the picture. No falling rain, no rain streaks, no rain shafts, no lightning, no sun, no sun disc, no bright spot. Even tone from the left edge to the right edge. Moody, low key, natural desaturated cold color, documentary realism, fine detail in the cloud. No lens flare, no vignette, no birds, no aircraft, no text, no watermark, no border."
  2. `node assets-src/worlds/rain/compose-sky.mjs` reads the kept take from `out/work/rain/sky-1.png` (2816 x 1584, not committed), cuts its bottom 24 rows, opens the shade of the cloud and draws it toward slate (the take paints the cloud near black and deep teal; the numbers are at the top of the script), lays the take beside its mirror image and writes both sizes (JPEG, quality 93 and 92, no chroma subsampling).
- Take kept: take 1 of 1.
- Checks passed: looked at in full and in native-size crops of its four corners: only sky, no land, no rain streaks, no sun disc, no bright spot, no text, no watermark. Row means of the written file from top to bottom: 24,49,65 at 5 percent, 41,78,97 at 60 percent, 173,182,184 at 80 percent, 135,147,149 at 99 percent.

## Not maps

- The stand-in `backdrop.jpg` (the approved image with the plant painted out) is gone: the world is built and no code reads it.
- The far tree rows, the ridges, the far land and the sheets of spray are drawn by code in `src/worlds/rain/layers.ts`, the rain in `src/weather/rain/`; they use no file.
