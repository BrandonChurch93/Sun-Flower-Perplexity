// Measures what the key shapes cost in truth: for frames of the film, the largest distance of any vertex between the mix of the two keys round the frame and the shape laid for that frame itself, in still air.
// Run with: npx tsx src/plant/keyerror.ts [frames between keys] [measure every] [from] [to]
import * as THREE from 'three'
import { config, frameCount } from '../config.ts'
import { shared } from '../core/shading.ts'
import { plantInputsOf } from '../v2/inputs.ts'
import { blankMoment, momentAt } from '../v2/now.ts'
import { KEY_EVERY, Plant, keyFrames } from './index.ts'
import { stateUniforms } from './part.ts'
import { tipAt } from './standin.ts'

const FPS = config.film.fps
const spacing = Number(process.argv[2] ?? KEY_EVERY)
const every = Number(process.argv[3] ?? 3)
const from = Number(process.argv[4] ?? 0)
const to = Number(process.argv[5] ?? frameCount - 1)
const PARTS = ['stem', 'leaves', 'seedling', 'bud', 'disc', 'petals']
const keys = keyFrames(spacing)

const plants = [new Plant(), new Plant(), new Plant()]
const partsOf = (p: Plant) => (p as unknown as { parts: { meshes: THREE.Mesh[] }[] }).parts
const names = ['stand-in', ...partsOf(plants[0]).flatMap((part, i) => part.meshes.map((_, k) => `${PARTS[i]} ${k}`))]
const worst = names.map(() => ({ mm: 0, frame: -1, share: 0 }))
const byBars = new Map<number, number>()
const m = blankMoment()
const tip = new THREE.Vector3()
const laid = [-1, -1, -1]
let height = 0

// Lays one plant for one frame of the film in still air, the way a key is laid.
function lay(n: number, frame: number): void {
  if (laid[n] === frame) return
  laid[n] = frame
  momentAt(frame / FPS, m)
  const felt = plantInputsOf(m)
  const still = { ...felt, wind: 0, calm: 0, gust: 0, rain: 0, lapse: 0, held: 1 }
  shared.uFrame.value = -1
  shared.uReal.value = felt.stood ?? m.t
  stateUniforms.uPlantWet.value = m.dials.wet
  stateUniforms.uPlantFrost.value = m.dials.frost
  stateUniforms.uPlantDew.value = m.dials.dew
  plants[n].prepare(m.tau, m.tau, still, still)
  if (n === 2) height = Math.max(tipAt(m.tau, still, tip).y, 0)
}

const points = (mesh: THREE.Mesh): Float32Array | null => {
  const a = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  return a && mesh.geometry.getAttribute('positionB') ? (a.array as Float32Array) : null
}

let frames = 0
let over = 0
for (let k = 0; k + 1 < keys.length; k++) {
  for (let frame = keys[k] + 1; frame < keys[k + 1]; frame++) {
    if (frame < from || frame > to || frame % every !== 0 || keys[k + 1] - keys[k] > 64) continue
    lay(0, keys[k])
    lay(1, keys[k + 1])
    lay(2, frame)
    const w = (frame - keys[k]) / (keys[k + 1] - keys[k])
    const limit = Math.max(1.5, 1.5 * height)
    let share = 0
    for (let i = 0; i < names.length; i++) {
      const a = points(plants[0].meshes[i])
      const b = points(plants[1].meshes[i])
      const t = points(plants[2].meshes[i])
      if (!a || !b || !t || !plants[2].meshes[i].visible || !plants[0].meshes[i].visible || !plants[1].meshes[i].visible) continue
      let far = 0
      for (let v = 0; v < a.length; v += 3) {
        const x = a[v] + (b[v] - a[v]) * w - t[v]
        const y = a[v + 1] + (b[v + 1] - a[v + 1]) * w - t[v + 1]
        const z = a[v + 2] + (b[v + 2] - a[v + 2]) * w - t[v + 2]
        far = Math.max(far, x * x + y * y + z * z)
      }
      const mm = Math.sqrt(far) * 1000
      if (mm / limit > worst[i].share) worst[i] = { mm, frame, share: mm / limit }
      share = Math.max(share, mm / limit)
    }
    frames++
    if (share > 1) over++
    const bars = Math.floor(m.bar / 4) * 4
    byBars.set(bars, Math.max(byBars.get(bars) ?? 0, share))
  }
}

console.log(`keys ${spacing} frames apart: ${frames} frames measured, ${over} over the limit (1.5 mm or 0.15 percent of the height, whichever is larger)`)
for (let i = 0; i < names.length; i++) if (worst[i].frame >= 0) console.log(`${names[i].padEnd(11)} worst ${worst[i].mm.toFixed(2)} mm at frame ${worst[i].frame}, ${worst[i].share.toFixed(2)} of the limit`)
console.log('worst share of the limit from each fourth bar on:')
console.log([...byBars.entries()].map(([bar, share]) => `${bar}: ${share.toFixed(2)}`).join('  '))
