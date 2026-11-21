import fs from 'node:fs'
import sharp from 'sharp'
import { at } from './lib/paths.ts'

// Stand-in backdrops: each world's approved image with the plant painted out by an image model.
// The takes live under out/work/backdrops/ and are not committed. The recipes say how each was made.
// A world leaves this list when its real sky is built: the golden hour, dawn and night worlds have.
interface Source { key: string; take: string; model: string; steps: string[]; why: string; thrown: string; up: number; fit: string }

const TAIL =
  'Keep everything else exactly as it is and exactly where it is: the framing, the horizon line, the sun and its position, the sky, the colors, the light, the depth of field blur and the film grain. Do not add anything: no plant in the foreground, no sprout, no flower, no leaves, no people, no animals, no insects, no objects, no text, no watermark, no border.'

const SOURCES: Record<string, Source> = {
  rain: {
    key: 'rain',
    take: 'rain-s1.png',
    model: 'seedream_5',
    steps: [
      `Edit this photograph. Remove the young sunflower plant in the foreground completely: its stem and every one of its leaves. Fill the place where it stood with what would be seen behind it: the wet dark soil with puddles, the bright band of light at the horizon, the far tree line and the grey rain sky. Keep the falling rain. ${TAIL}`,
    ],
    why: 'take 1 of 2. The plant is gone and the bright band at the horizon, the tree line and the puddles are unchanged. The painted rain streaks stay in this stand-in; the finished world draws its own rain.',
    thrown: 'the other take (model nano_banana_pro) also removed the plant, but at the left and right edges it sat a few pixels off the approved image where this one sits exactly on it.',
    up: 0,
    fit: 'best shift 0 px in the left, right and top strips',
  },
  frost: {
    key: 'frost',
    take: 'frost-n1.png',
    model: 'nano_banana_pro',
    steps: [
      `Edit this photograph. Remove the large sunflower plant in the foreground completely: its thick stem, its big frosted leaves and its large closed bud at the top. Fill the place where it stood with what would be seen behind it: the cold fog, the pale glow of the low sun, and the rows of small frosted sunflower buds of the field in the distance. Keep the far field of small buds as it is. ${TAIL}`,
    ],
    why: 'take 1 of 2. The plant is gone, the pale sun, the fog and the far buds are unchanged. The model returns 2752 x 1536; stretched back to 2816 x 1584 it lay 4 px low, so the script moves it up by 4 px.',
    thrown: 'the other take (model seedream_5) recolored the fog and added a new plant.',
    up: 4,
    fit: 'best shift 4 px down in the left and right strips before the script moved it up by 4 px',
  },
}
const FULL = { width: 2816, height: 1584 }
const WEB = { width: 2048, height: 1152 }

for (const [world, source] of Object.entries(SOURCES)) {
  const take = at('out', 'work', 'backdrops', source.take)
  if (!fs.existsSync(take)) {
    console.log(`world ${world}: the take ${source.take} is not on this machine, the committed backdrop is kept`)
    continue
  }
  const full = at('public', 'assets', 'worlds', world, 'full')
  const web = at('public', 'assets', 'worlds', world, 'web')
  fs.mkdirSync(full, { recursive: true })
  fs.mkdirSync(web, { recursive: true })
  const stretched = await sharp(take).resize(FULL.width, FULL.height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer()
  const taller = source.up > 0 ? await sharp(stretched).extend({ bottom: source.up, extendWith: 'mirror' }).png().toBuffer() : stretched
  const moved = source.up > 0 ? await sharp(taller).extract({ left: 0, top: source.up, width: FULL.width, height: FULL.height }).png().toBuffer() : stretched
  await sharp(moved).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(`${full}/backdrop.jpg`)
  await sharp(`${full}/backdrop.jpg`).resize(WEB.width, WEB.height, { fit: 'fill', kernel: 'lanczos3' }).jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toFile(`${web}/backdrop.jpg`)
  const recipe = at('assets-src', 'worlds', world)
  fs.mkdirSync(recipe, { recursive: true })
  const steps = source.steps
    .map((prompt, i) => `  ${i + 1}. Input: ${i === 0 ? `\`references/approved/${source.key}.png\`` : 'the picture step 1 returned'}, as the only input image. Aspect ratio 16:9. Prompt, word for word: "${prompt}"`)
    .join('\n')
  fs.writeFileSync(
    `${recipe}/RECIPE.md`,
    `# Recipe · world ${world}

## backdrop.jpg (stand-in)

- Output files: \`public/assets/worlds/${world}/full/backdrop.jpg\` (${FULL.width} x ${FULL.height}) and \`public/assets/worlds/${world}/web/backdrop.jpg\` (${WEB.width} x ${WEB.height}).
- What it is: the approved image \`references/approved/${source.key}.png\` with the plant painted out. The sky shader places it where the camera of the key \`${source.key}\` sees it.
- Tool: the workspace's image generation tool, model \`${source.model}\`, used as an image edit.
- Steps:
${steps}
- Then \`npx tsx tools/standin-backdrops.ts\` stretches the kept take to ${FULL.width} x ${FULL.height}${source.up > 0 ? `, moves it up by ${source.up} px` : ''} (JPEG, quality 92, no chroma subsampling) and makes the web size from that file (quality 88). The take is read from \`out/work/backdrops/${source.take}\`, which is not committed.
- Take kept: ${source.why}
- Takes thrown out: ${source.thrown}
- Checks passed: the take was scaled to the size of the approved image and compared with it region by region (left, right and top strips, the best shift searched within 20 px): ${source.fit}. It was looked at in native-size crops of its four corners and of the place where the plant stood: no text, no watermark, no object that was not there before, no leftover of the plant.
- Status: a stand-in. It is replaced by this world's real sky and far background when the world is built.
`,
  )
}
console.log('stand-in backdrops written')
