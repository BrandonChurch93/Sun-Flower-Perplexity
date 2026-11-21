# Ground maps

Two maps are cut from one scanned material. One more is drawn when the film loads.

## The material

- Name: Brown Mud Dry, by Rob Tuytel, on Poly Haven.
- Page: https://polyhaven.com/a/brown_mud_dry
- License: CC0 1.0 (public domain), as stated on the page and at https://polyhaven.com/license. No credit is required.
- What it is: a scan of dry brown soil with coarse crumbs and small stones, 1.3 m across, tiling. No baked light.
- Fetched on 2026-11-21 at the 4k size, into `out/work/src-soil/` (never committed):
  - https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/brown_mud_dry/brown_mud_dry_diff_4k.jpg
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/4k/brown_mud_dry/brown_mud_dry_nor_gl_4k.png
  - https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/brown_mud_dry/brown_mud_dry_rough_4k.jpg
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/4k/brown_mud_dry/brown_mud_dry_disp_4k.png

## soil-color.jpg

- Output: `public/assets/ground/full/soil-color.jpg` (4096 x 4096, JPEG quality 92, 4:4:4) and `public/assets/ground/web/soil-color.jpg` (2048 x 2048, same settings).
- Input: `brown_mud_dry_diff_4k.jpg`.
- Steps: the color is taken to linear light and divided by its own slow variation (the mean of 32 px blocks, blurred with a wrapping gaussian of 5 blocks), then multiplied by the mean of the whole map, so no large light or dark patch is left to show the repeat. Saved at the sizes above; the web copy is a lanczos downscale.
- Its mean linear color is 0.2000, 0.1261, 0.0603 and its mean linear luminance (0.3, 0.6, 0.1) is 0.1413. `src/ground/soil.ts` holds that number as `soilMeanLuma`.

## soil-data.png

- Output: `public/assets/ground/full/soil-data.png` (2048 x 2048, PNG, four channels) and `public/assets/ground/web/soil-data.png` (1024 x 1024).
- Inputs: `brown_mud_dry_nor_gl_4k.png`, `brown_mud_dry_rough_4k.jpg`, `brown_mud_dry_disp_4k.png`.
- Channels: red and green are the x and y of the normal (OpenGL convention, 128 is flat), blue is the roughness, alpha is the height. The height is stretched between the values that 0.2 percent of the pixels lie under and over, and stored from 8 to 255 so that no pixel has an alpha of 0.
- The loader reads it with `premultiplyAlpha: 'none'` and no color conversion, so the four channels arrive as stored.

## The script

Run from the repo root with `node out/work/ground-maps.mjs` after the four downloads. `sharp` is already a dependency of the repo's tools.

```js
import sharp from 'sharp'
const src = 'out/work/src-soil/brown_mud_dry_'
const widths = { full: 4096, web: 2048 }
const S = 4096
const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
const enc = (c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)))

const diff = await sharp(src + 'diff_4k.jpg').removeAlpha().raw().toBuffer()
const low = 128
const cell = S / low
const linT = Float32Array.from({ length: 256 }, (_, v) => lin(v))
let grid = new Float32Array(low * low * 3)
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) for (let c = 0; c < 3; c++) grid[(Math.floor(y / cell) * low + Math.floor(x / cell)) * 3 + c] += linT[diff[(y * S + x) * 3 + c]] / (cell * cell)
const sigma = 5
const taps = []
for (let k = -15; k <= 15; k++) taps.push(Math.exp(-(k * k) / (2 * sigma * sigma)))
const tapSum = taps.reduce((a, b) => a + b, 0)
for (const [dx, dy] of [[1, 0], [0, 1]]) {
  const out = new Float32Array(grid.length)
  for (let y = 0; y < low; y++) for (let x = 0; x < low; x++) for (let c = 0; c < 3; c++) {
    let v = 0
    for (let k = -15; k <= 15; k++) v += taps[k + 15] * grid[((((y + k * dy) % low + low) % low) * low + ((x + k * dx) % low + low) % low) * 3 + c]
    out[(y * low + x) * 3 + c] = v / tapSum
  }
  grid = out
}
const mean = [0, 0, 0]
for (let i = 0; i < grid.length; i++) mean[i % 3] += grid[i] / (low * low)
const flat = Buffer.alloc(diff.length)
let luma = 0
for (let y = 0; y < S; y++) {
  const gy = (y + 0.5) / cell - 0.5
  const y0 = Math.floor(gy)
  const ty = gy - y0
  const ya = ((y0 % low) + low) % low
  const yb = (ya + 1) % low
  for (let x = 0; x < S; x++) {
    const gx = (x + 0.5) / cell - 0.5
    const x0 = Math.floor(gx)
    const tx = gx - x0
    const xa = ((x0 % low) + low) % low
    const xb = (xa + 1) % low
    for (let c = 0; c < 3; c++) {
      const l = (grid[(ya * low + xa) * 3 + c] * (1 - tx) + grid[(ya * low + xb) * 3 + c] * tx) * (1 - ty) + (grid[(yb * low + xa) * 3 + c] * (1 - tx) + grid[(yb * low + xb) * 3 + c] * tx) * ty
      const i = (y * S + x) * 3 + c
      const v = linT[diff[i]] * (mean[c] / Math.max(1e-4, l))
      flat[i] = enc(v)
      luma += v * [0.3, 0.6, 0.1][c]
    }
  }
}
console.log('mean linear rgb', mean.map((m) => m.toFixed(4)).join(' '), 'mean luma', (luma / (S * S)).toFixed(4))

const nor = await sharp(src + 'nor_gl_4k.png').removeAlpha().toColourspace('srgb').raw({ depth: 'uchar' }).toBuffer()
const rough = await sharp(src + 'rough_4k.jpg').greyscale().raw({ depth: 'uchar' }).toBuffer()
const disp = await sharp(src + 'disp_4k.png').greyscale().raw({ depth: 'ushort' }).toBuffer()
const d16 = new Uint16Array(disp.buffer, disp.byteOffset, S * S)
let lo = 65535, hi = 0
const hist = new Uint32Array(65536)
for (let i = 0; i < d16.length; i++) hist[d16[i]]++
let acc = 0
for (let v = 0; v < 65536; v++) { acc += hist[v]; if (acc > d16.length * 0.002) { lo = v; break } }
acc = 0
for (let v = 65535; v >= 0; v--) { acc += hist[v]; if (acc > d16.length * 0.002) { hi = v; break } }
console.log('height range kept', lo, hi)
const data = Buffer.alloc(S * S * 4)
for (let i = 0; i < S * S; i++) {
  data[i * 4] = nor[i * 3]
  data[i * 4 + 1] = nor[i * 3 + 1]
  data[i * 4 + 2] = rough[i]
  data[i * 4 + 3] = 8 + Math.round(247 * Math.min(1, Math.max(0, (d16[i] - lo) / (hi - lo))))
}
for (const [set, w] of Object.entries(widths)) {
  await sharp(flat, { raw: { width: S, height: S, channels: 3 } }).resize(w, w, { kernel: 'lanczos3' }).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(`public/assets/ground/${set}/soil-color.jpg`)
  await sharp(data, { raw: { width: S, height: S, channels: 4 } }).resize(w / 2, w / 2, { kernel: 'cubic', premultiplied: true }).png({ compressionLevel: 9 }).toFile(`public/assets/ground/${set}/soil-data.png`)
}
```

## Checks they passed

- No text, mark, border or stray object at native size.
- No baked light: the scan is delit, and the slow variation that was left is divided out.
- Largest file 15.3 MB. Texture memory of the ground in the full set: color 85.3 MB, data 21.3 MB, litter 5.3 MB, stand-in 5.3 MB with their mip chains, 117 MB in all.

## Computed at load, not files

- Litter tile (`src/ground/litter.ts`): 1024 x 1024 in the full set, 512 x 512 on the web, repeating every 2.9 m. Dry leaf bits and pale stubble straws on clear ground: color, with how much they cover in alpha. Seeded from the config seed through `streamSeed('ground litter')`.
- Stand-in soil (`src/ground/standin.ts`): the blockout's noise tile, still used by the meter round the plant and the camera's side until they are built.
