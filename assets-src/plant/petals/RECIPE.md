# Petal maps

Two maps, both cut from one generated picture of ray tissue. One map serves all 34 rays: each ray reads its own window of it (its own height in the map, its own side up, its own start along the length), so no two rays show the same veins.

## The source take

- Tool: the image tool of the `media` skill, `generate_image`
- Model: `seedream_5`
- Aspect: 16:9, returned at 2816 x 1584
- Input file: `references/approved/bloom-hero.png` (the approved image of the nearest key, used for the hue of the yellow only)
- Takes made: 2 of the 6 allowed, both with the same prompt. A first call named the input file wrongly, failed before the model ran and made no picture.
- Prompt, exactly:

```
Extreme macro flatbed scan of the surface of one sunflower ray petal, the petal tissue fills the entire frame edge to edge with no background, no outline and no petal edge visible. About twelve fine parallel veins run perfectly horizontally from the left edge to the right edge, evenly spaced, slightly darker and more orange than the tissue between them, with faint soft lengthwise ridges and very fine cellular grain between the veins. Deep golden yellow, a little more orange and greener toward the left edge, cleaner yellow toward the right. Perfectly flat, even, shadowless diffuse illumination like a document scanner: no highlight, no cast shadow, no glow, no vignette, no depth of field, everything in focus. No text, no watermark, no border, no logo, no insect, no water drops, no other object. Wide 16:9 image. Image 1 is a reference only for the hue of the yellow petals; do not copy its composition or lighting.
```

- Take 1, kept: `out/work/maps/ray-tissue-take1.png`. Even light from edge to edge, veins that run level across the whole width, no edge of a petal, nothing else in frame.
- Take 2, rejected: `out/work/maps/ray-tissue-take2.png`. The ridges carry painted light and shade, which would fight the light of the scene.

Both takes stay under `out/work/` and are not in the repository.

## `public/assets/plant/petals/full/ray-color.jpg`

- What it is: the color of the tissue, 2048 x 1024, JPEG quality 93 with full color sampling, sRGB. The length of the ray runs left to right.
- Half size copy, same name: `public/assets/plant/petals/web/ray-color.jpg`, 1024 x 512.
- Input: `out/work/maps/ray-tissue-take1.png`
- Made with `sharp` in a script kept at `out/work/make-ray-maps.mjs`:
  1. Cut the region left 0, top 88, 2816 x 1408 and resize it to 2048 x 1024 (lanczos3).
  2. Take out what is left of any light: divide each texel by a copy of the picture blurred with sigma 90 and multiply by the mean of that copy (mean sRGB about 221, 169, 18).
- How it is used: the shader divides the map by its own mean, so the map only says how a place differs from the color the code gives the ray.
- Checks passed: no text, mark, border or object; no light or shade left after step 2 (the blurred copy of the result is one flat tone); veins level and unbroken across the width; 933 KB.

## `public/assets/plant/petals/full/ray-data.png`

- What it is: three measures of the same tissue, 2048 x 1024, PNG, read as plain numbers. Red is height, green is how much light comes through, blue marks the veins.
- Half size copy, same name: `public/assets/plant/petals/web/ray-data.png`, 1024 x 512.
- Input: the flattened color from the steps above (so the same take 1).
- Made in the same script:
  1. vein: how much redder than green a texel is than the mean of the map, gain 2.2 about 0.5; blurred with sigma 1.6; the map mean taken off, times 3.2, kept between 0 and 1.
  2. ridge: the same measure blurred with sigma 7, the map mean taken off.
  3. grain: brightness (0.3 R + 0.6 G + 0.1 B) blurred with sigma 1.2, less the same blurred with sigma 14.
  4. Red = 0.55 - 0.55 vein - 0.9 ridge + 1.6 grain. Green = 0.8 - 0.5 vein + 1.2 grain. Blue = vein.
- Checks passed: veins read as fine dark grooves in red and as thin bright lines in blue; no seam of light across the map; in the `backlight` view the veins show as darker lines in the glow; 3.1 MB.

## Memory

The two full size maps with their smaller copies for distance take about 22 MB of texture memory, far under the 120 MB allowed. Only the plant and its companion load them; the neighbors in the field use no map.
