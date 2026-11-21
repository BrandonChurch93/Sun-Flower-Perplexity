# Recipe · world dawn

## sky.jpg

- Output files: `public/assets/worlds/dawn/full/sky.jpg` (4096 x 1024, JPEG quality 93, no chroma subsampling) and `public/assets/worlds/dawn/web/sky.jpg` (2048 x 512, JPEG quality 92, no chroma subsampling).
- What it is: the whole dome of the sky a few minutes after sunrise. Across, it runs once round the horizon with the sun at the middle and screen right to the right. Down, the row is the square root of the elevation over 90 degrees, so most rows lie near the horizon where the film looks. It holds no sun disc, no land, no plant and no stars: the shader in `src/worlds/dawn/sky.ts` multiplies the picture by a gain that climbs toward the sun and adds the haze, the aureole and the disc at true brightness.
- Why it is half the size of the golden dome: the dawn camera is a long lens focused a hand's width away, so the sky is never nearer to focus than a blur circle of about 120 px, and it shows only the lowest 7.5 degrees of the sky over 34.5 degrees of bearing.
- Tool: the workspace's image generation tool, model `seedream_5`, aspect ratio 16:9. The take came back at 2816 x 1584. The tool wrote JPEG data into a file named `.png`.
- Takes are kept under `out/work/dawnsky/` and are not committed.

### Sunward picture

- Input files: `references/approved/dawn-seedling.png` (image 1) and `references/approved/dawn-sprout.png` (image 2).
- Prompt, word for word: "A wide photograph of only the sky a few minutes after sunrise, shot on a cinema camera aimed level at the horizon across a flat open plain on a clear, still, misty morning. Wide 16:9 frame. Use the two reference images only for the colors and the softness of the sky: image 1 and image 2 show the same morning. The bottom edge of the picture is exactly the level horizon: no land, no hills, no trees, no field, no soil, no plants, no grass, no water, nothing but sky anywhere in the picture. The sun itself is not in the picture: it sits just under the bottom edge, three quarters of the way in from the left edge, and all that shows of it is the brightest part of a wide soft pale gold glow on the bottom edge there, with no disc, no rays and no white hot spot. Along the whole bottom edge: a band of pale gold and soft peach haze, warmest and brightest near the glow, cooler and dimmer toward the left edge. Above it the sky rises through a pale milky haze of faint rose and cream into a soft, muted grey blue that fills the upper half, a little darker toward the top left corner. A few thin, faint, long streaks of high cloud and soft veils of cirrus lie level across the sky, lit pale cream and peach on their undersides, very low in contrast. Calm, quiet, natural color, documentary realism, fine soft detail everywhere. Even exposure with detail in every part: no clipped highlights, no sun disc, no lens flare, no sunbeams, no vignette, no birds, no aircraft, no stars, no text, no watermark, no border."
- Takes: 1. Kept take 1 (`out/work/dawnsky/sunward-1.png`): pale gold and peach along the bottom edge, a milky rose and cream haze above it, muted grey blue in the upper half, darker toward the top left, thin level streaks of cirrus. The glow sits at 0.6335 of the width on the bottom edge, not at three quarters as asked; the layout below places it by that number. Rows 1560 to 1583 hold a thin dark strip (a far shore the tool added against the prompt); the layout reads no row under 1540, so none of it is in the dome.

### Laying the dome out

- `node assets-src/worlds/dawn/compose-sky.mjs`, run from the repo root, reads the kept take and writes both output files.
- The take covers 60 degrees of bearing, from 38 degrees left of the sun to 22 degrees right of it. The film sees from about 29 degrees left of the sun to 5.5 degrees right of it, so every sky pixel of the film comes from this one picture.
- The take's rows 1540 (the horizon) to 40 are laid over the lowest 9 degrees of elevation. That is steeper than the take was shot: the approved frames show the whole rise from the peach band to the grey blue within the 7.5 degrees their long lens sees.
- From 7 to 9 degrees the dome fades into a strong blur of the take's top rows, dimmed by up to 35 percent overhead. The film never looks there.
- Round the rest of the horizon the dome is a strong blur of the take's left three tenths, away from the glow, laid back and forth, and cross-faded into the take over 8 degrees at both ends. The film never looks there either; it closes the dome so that nothing is missing behind the camera.

### Checks passed

- The kept take was looked at whole: no text, no watermark, no border, no bird, no aircraft, no sun disc, no rays. The strip of land on its bottom rows is left out as said above.
- Sizes: 4096 x 1024 and 2048 x 512. Files: under 0.3 MB and under 0.1 MB.

## Not maps

- The hills, the tree lines and the rows of trees are the shared skyline (`src/weather/skyline.ts`), drawn in this world's colors by `src/worlds/dawn/layers.ts`. The mist is `src/weather/mist/`. Neither uses a file.
