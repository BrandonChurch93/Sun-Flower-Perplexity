# Recipe · world night

## glow.jpg

- Output files: `public/assets/worlds/night/full/glow.jpg` (2048 x 1152, JPEG quality 93, no chroma subsampling) and `public/assets/worlds/night/web/glow.jpg` (1024 x 576, JPEG quality 92, no chroma subsampling).
- What it is: the soft light of the night sky only: the glowing clouds of the Milky Way with their dark lanes, the deep blue black above and the pale teal glow low on the left. It holds no stars, no land, no plant and no moon. The stars are points drawn by code in `src/worlds/night/sky.ts`.
- Where it lies: on the plane of the camera of the key `night` (bearing -166.80 degrees, 7.31 degrees up, 47.4 degrees wide), reaching 1.3 times as far as that frame in every direction. It is fixed to the stars and turns with them about the pole.
- Tool: the workspace's image generation tool, model `seedream_5`, used as an image edit, then `node assets-src/worlds/night/compose-glow.mjs`, run from the repo root.
- Steps:
  1. The take. Input: `references/approved/night.png`, as the only input image. Aspect ratio 16:9. Prompt, word for word: "Edit this photograph. Remove the tall sunflower plant in the foreground completely: its stem, all of its leaves and its closed bud. Fill the place where it stood with what would be seen behind it: the night sky full of stars with the Milky Way, the dark hills and the dark field below them. Keep everything else exactly as it is and exactly where it is: the framing, the horizon line, the sun and its position, the sky, the colors, the light, the depth of field blur and the film grain. Do not add anything: no plant in the foreground, no sprout, no flower, no leaves, no people, no animals, no insects, no objects, no text, no watermark, no border." The take came back at 2816 x 1584. It is read from `out/work/sky-night/take-plant-out.jpg`, which is not committed.
  2. `compose-glow.mjs` halves the take to 1408 x 792 and takes the stars out of it: a median over 7 pixels, a median over 5 pixels and a blur of 1.6 pixels, never brighter than the take itself. What is left is the light that is wider than a star.
  3. It finds the top of the land in every column (the steepest fall of brightness between 0.655 and 0.81 of the height), and from 7 pixels above it downward it lays the tone of the sky just above the land, eased over 48 columns either way, so the sky goes on behind the hills that the code draws.
  4. It adds a border of 0.15 of the frame on every side by repeating the edge, blurred by 22 pixels from 40 pixels outside the frame on, and writes both files.
  5. It writes `src/worlds/night/density.ts`: the brightness of the map on a grid of 96 x 54, which the star catalogue uses so that the stars stand denser along the Milky Way and thin out in its dark lanes.
- Take kept: take 1 of 2 of the stand-in (see below). Take thrown out for this map: a second edit that asked the model to remove the land and every star itself (`out/work/sky-night/glow-1.png`, same model): it kept many stars in the core, darkened the corners and moved the low glow from the left edge to the middle.
- Checks passed: the composed map was looked at whole: no star left as a point or a blob over the part the film sees, no land, no plant, no seam where the sky goes on below the hill line, no text, no watermark. Sizes: 2048 x 1152 and 1024 x 576. Files: 0.15 MB and under 0.1 MB. In memory with its smaller copies the full map takes 12.6 MB.

## Not maps

- The stars (a seeded catalogue), the hills, the tree lines and the far land are drawn by code in `src/worlds/night/sky.ts` and `src/worlds/night/layers.ts` and use no file.

## backdrop.jpg (stand-in)

- Output files: `public/assets/worlds/night/full/backdrop.jpg` (2816 x 1584) and `public/assets/worlds/night/web/backdrop.jpg` (2048 x 1152).
- What it is: the approved image `references/approved/night.png` with the plant painted out. The sky shader places it where the camera of the key `night` sees it.
- Tool: the workspace's image generation tool, model `seedream_5`, used as an image edit.
- Steps:
  1. Input: `references/approved/night.png`, as the only input image. Aspect ratio 16:9. Prompt, word for word: "Edit this photograph. Remove the tall sunflower plant in the foreground completely: its stem, all of its leaves and its closed bud. Fill the place where it stood with what would be seen behind it: the night sky full of stars with the Milky Way, the dark hills and the dark field below them. Keep everything else exactly as it is and exactly where it is: the framing, the horizon line, the sun and its position, the sky, the colors, the light, the depth of field blur and the film grain. Do not add anything: no plant in the foreground, no sprout, no flower, no leaves, no people, no animals, no insects, no objects, no text, no watermark, no border."
- Then `npx tsx tools/standin-backdrops.ts` stretches the kept take to 2816 x 1584 (JPEG, quality 92, no chroma subsampling) and makes the web size from that file (quality 88). The take is read from `out/work/backdrops/night-s1.png`, which is not committed.
- Take kept: take 1 of 2. The plant is gone, the Milky Way, the hills and the mist are unchanged.
- Takes thrown out: the other take (model nano_banana_pro) also removed the plant, but at the left edge and the top it sat a few pixels off the approved image where this one sits exactly on it.
- Checks passed: the take was scaled to the size of the approved image and compared with it region by region (left, right and top strips, the best shift searched within 20 px): best shift 0 px in the left, right and top strips. It was looked at in native-size crops of its four corners and of the place where the plant stood: no text, no watermark, no object that was not there before, no leftover of the plant.
- Status: a stand-in. It is replaced by this world's real sky and far background when the world is built.
