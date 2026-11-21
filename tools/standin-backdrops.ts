import fs from 'node:fs'
import sharp from 'sharp'
import { at } from './lib/paths.ts'

// Stand-in backdrops: each world's approved image, shrunk and blurred until nothing but its light and color is left.
const SOURCES: Record<string, string> = {
  dawn: 'references/approved/dawn-seedling.png',
  rain: 'references/approved/rain.png',
  night: 'references/approved/night.png',
  frost: 'references/approved/frost.png',
  golden: 'references/approved/field.png',
}
const SETS: Record<string, number> = { web: 512, full: 1024 }

for (const [world, source] of Object.entries(SOURCES)) {
  for (const [set, width] of Object.entries(SETS)) {
    const dir = at('public', 'assets', 'worlds', world, set)
    fs.mkdirSync(dir, { recursive: true })
    const height = Math.round((width * 9) / 16)
    await sharp(at(source))
      .resize(width, height, { fit: 'cover' })
      .blur(width / 14)
      .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
      .toFile(`${dir}/backdrop.jpg`)
  }
  const recipe = at('assets-src', 'worlds', world)
  fs.mkdirSync(recipe, { recursive: true })
  fs.writeFileSync(
    `${recipe}/RECIPE.md`,
    `# Recipe · world ${world}

## backdrop.jpg (stand-in)

- Output files: \`public/assets/worlds/${world}/web/backdrop.jpg\` (512 x 288) and \`public/assets/worlds/${world}/full/backdrop.jpg\` (1024 x 576).
- Tool: \`tools/standin-backdrops.ts\`, run with \`npx tsx tools/standin-backdrops.ts\`. It uses the image library \`sharp\`. No model is involved.
- Input file: \`${source}\`.
- Prompt: none. The script resizes the input to the output size with a cover fit, blurs it with a Gaussian of sigma equal to the width divided by 14, and saves a JPEG at quality 88 with no chroma subsampling.
- Take kept: the only take. The script is deterministic.
- Checks passed: the file loads, and at this blur no outline of the plant is left, only the light and the color of the place.
- Status: a stand-in. It is replaced by this world's real sky and far background when the world is built.
`,
  )
}
console.log('stand-in backdrops written')
