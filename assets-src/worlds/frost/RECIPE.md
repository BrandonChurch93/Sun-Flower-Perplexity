# Recipe · world frost

## backdrop.jpg (stand-in)

- Output files: `public/assets/worlds/frost/web/backdrop.jpg` (512 x 288) and `public/assets/worlds/frost/full/backdrop.jpg` (1024 x 576).
- Tool: `tools/standin-backdrops.ts`, run with `npx tsx tools/standin-backdrops.ts`. It uses the image library `sharp`. No model is involved.
- Input file: `references/approved/frost.png`.
- Prompt: none. The script resizes the input to the output size with a cover fit, blurs it with a Gaussian of sigma equal to the width divided by 14, and saves a JPEG at quality 88 with no chroma subsampling.
- Take kept: the only take. The script is deterministic.
- Checks passed: the file loads, and at this blur no outline of the plant is left, only the light and the color of the place.
- Status: a stand-in. It is replaced by this world's real sky and far background when the world is built.
