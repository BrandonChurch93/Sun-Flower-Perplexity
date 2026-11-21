# Leaf maps

One map is generated. Everything else the leaves read is computed when the film loads, from the same functions that shape the blade.

## blade-detail.jpg

- Output: `public/assets/plant/leaves/full/blade-detail.jpg` (2048 x 2048, JPEG quality 93, 4:4:4) and `public/assets/plant/leaves/web/blade-detail.jpg` (1024 x 1024, same settings).
- What it is: the fine net of veinlets and cells of the upper face of a sunflower leaf, about 4 cm of leaf across the tile. It repeats. It carries no large vein, no outline and no light. The shader divides it by its own mean, so it gives variation only and the hue comes from the shader.
- Tool and model: the image generation tool, model `seedream_5`, aspect 1:1.
- Input files: `leaf-top-01.jpg` from the brief's leaf reference photographs (the macro of the upper face), given as image 1 for the structure of the vein net only. It is a study reference and is not in the repo. No approved image was given to the kept take, because this map is lit by the scene and must carry no light of its own.
- Prompt, exactly:

  > Extreme macro photograph of the upper face of one sunflower (Helianthus annuus) leaf, used as a flat surface texture. The leaf tissue fills the whole square frame from edge to edge: no leaf outline, no background, no large vein and no midrib anywhere in the frame. Only the fine net of small pale yellow green veinlets enclosing small irregular four to six sided cells of mid green tissue, at one even scale across the frame, about 4 centimeters of leaf across the image. The surface is dull and matte like fine sandpaper, with tiny short pale hairs lying on it. Perfectly flat, even, shadowless diffuse light as on a flatbed scanner: no highlight, no gloss, no cast shadow, no glow, no vignette, no blur, everything sharp from corner to corner, the same brightness in every corner. Blade colour mid grey green near #5e8f4e, veinlets pale yellow green near #c5d6a0. No text, no watermark, no border, no logo, no insect, no water drop, no stray object. Image 1 is the reference for the structure of the vein net and its cells; do not copy its large veins or its dark lighting.

- Takes: 2 of the 6 allowed.
  - Take 1, kept: an even net at one scale, no large vein, no shading from corner to corner.
  - Take 2, rejected: the same prompt with this sentence added at the end, and `references/approved/bloom-hero.png` given as image 2: "Image 2 is the film frame this leaf belongs to: take from it only the hue of the leaf greens, not its light, its sun or its composition." It came back with large veins across the frame and a harsher contrast.
- After the tool: made to repeat by cross fading the picture with a copy of itself shifted by half its size, over a band of 240 px along the borders, then saved as above. The half size copy is a plain downscale of the full one.
- Checks it passed: no text or mark; no large vein; no highlight or cast shadow; the four quarters have mean brightness 124.2, 125.0, 123.8 and 123.6 of 255; across the wrap the mean step from the last column to the first is 15.1 against 14.8 between two neighbors inside the picture, and 15.2 against 11.7 for the rows, so it repeats without a seam; mean in linear light (0.163, 0.269, 0.111), which is the constant the shader divides by; 1.9 MB, under the 20 MB limit; the view `--diag texels` at frame 1515 shows two or more texels per pixel on the plant's leaves.

## Computed at load, not files

- Vein atlas (`src/plant/leaves/maps.ts`): three vein sets side by side, 768 x 1024 each at full size and 384 x 512 on the web. Red is the main veins, green the height of the skin (grooves at the veins, pillows between), blue the small cross veins. It is drawn from `veinsOf` in `src/plant/leaves/shape.ts`, the same function that quilts the blade, so the relief in the mesh and the veins in the color agree.
- Marks tile (`src/plant/leaves/maps.ts`): 256 x 256, repeating. Red is the blobs that become holes and nibbled edges, green is slow patches for yellowing and tone, blue is specks.
- Both are seeded from the config seed through `streamSeed`.

Texture memory at full size: the detail map 2048 x 2048 with mips, the vein atlas 2304 x 1024, the marks tile 256 x 256, about 32 MB together.
