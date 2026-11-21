# Recipe · world dawn

## backdrop.jpg (stand-in)

- Output files: `public/assets/worlds/dawn/full/backdrop.jpg` (2816 x 1584) and `public/assets/worlds/dawn/web/backdrop.jpg` (2048 x 1152).
- What it is: the approved image `references/approved/dawn-seedling.png` with the plant painted out. The sky shader places it where the camera of the key `dawn-seedling` sees it.
- Tool: the workspace's image generation tool, model `seedream_5`, used as an image edit.
- Steps:
  1. Input: `references/approved/dawn-seedling.png`, as the only input image. Aspect ratio 16:9. Prompt, word for word: "Edit this photograph. Remove the small sunflower seedling in the foreground completely: its stem, its two green seed leaves and the tiny leaves between them, and also the striped seed husk lying on the soil beside it. Fill the places where they were with what would be seen behind them: the same dark crumbly soil with dew, the misty field and the soft dawn sky. Keep everything else exactly as it is and exactly where it is: the framing, the horizon line, the sun and its position, the sky, the colors, the light, the depth of field blur and the film grain. Do not add anything: no plant in the foreground, no sprout, no flower, no leaves, no people, no animals, no insects, no objects, no text, no watermark, no border."
- Then `npx tsx tools/standin-backdrops.ts` stretches the kept take to 2816 x 1584 (JPEG, quality 92, no chroma subsampling) and makes the web size from that file (quality 88). The take is read from `out/work/backdrops/dawn-s1.png`, which is not committed.
- Take kept: take 1 of 2. The seedling and the husk are gone, the sun, the mist and the horizon sit where they were.
- Takes thrown out: the other take (model nano_banana_pro) grew new grass sprouts where the seedling had been.
- Checks passed: the take was scaled to the size of the approved image and compared with it region by region (left, right and top strips, the best shift searched within 20 px): best shift 0 px in the left and right strips. It was looked at in native-size crops of its four corners and of the place where the plant stood: no text, no watermark, no object that was not there before, no leftover of the plant.
- Status: a stand-in. It is replaced by this world's real sky and far background when the world is built.
