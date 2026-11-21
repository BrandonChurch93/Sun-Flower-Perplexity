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
- Status: a stand-in. It is replaced by this world's real sky and far background when the world is built.
