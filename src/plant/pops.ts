// Finds pops in the laid shape: frames where a part's farthest moving vertex goes much farther than in the frames round it.
// Run with: npx tsx src/plant/pops.ts [from] [to] [air]   (with "air" the plant feels the film's wind and rain, without it still air)
import * as THREE from 'three'
import { config, frameCount } from '../config.ts'
import { shared } from '../core/shading.ts'
import { plantInputsOf } from '../v2/inputs.ts'
import { blankMoment, momentAt } from '../v2/now.ts'
import { Plant } from './index.ts'
import { stateUniforms } from './part.ts'

const FPS = config.film.fps
const from = Number(process.argv[2] ?? 0)
const to = Number(process.argv[3] ?? frameCount - 1)
const air = process.argv[4] === 'air'
const PARTS = ['stem', 'leaves', 'seedling', 'bud', 'disc', 'petals']
const FLOOR_MM = 2
const TIMES = 4
const ROUND = 4

const plants = [new Plant(), new Plant()]
const partsOf = (p: Plant) => (p as unknown as { parts: { meshes: THREE.Mesh[] }[] }).parts
const names = ['stand-in', ...partsOf(plants[0]).flatMap((part, i) => part.meshes.map((_, k) => `${PARTS[i]} ${k}`))]
const m = blankMoment()
const steps = names.map(() => new Float32Array(to - from + 1))
const where = names.map(() => new Int32Array(to - from + 1))
const many = names.map(() => new Int32Array(to - from + 1))
const taus = new Float32Array(to - from + 1)

const points = (mesh: THREE.Mesh): Float32Array | null => {
  const a = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  return a && a.usage === THREE.DynamicDrawUsage ? (a.array as Float32Array) : null
}

for (let frame = from; frame <= to; frame++) {
  momentAt(frame / FPS, m)
  const felt = plantInputsOf(m)
  const inputs = air ? { ...felt, held: 0 } : { ...felt, wind: 0, calm: 0, gust: 0, rain: 0, lapse: 0, held: 1 }
  shared.uFrame.value = -1
  shared.uReal.value = felt.stood ?? m.t
  stateUniforms.uPlantWet.value = m.dials.wet
  stateUniforms.uPlantFrost.value = m.dials.frost
  stateUniforms.uPlantDew.value = m.dials.dew
  const now = plants[frame & 1]
  const before = plants[(frame + 1) & 1]
  now.prepare(m.tau, m.tau, inputs, inputs)
  taus[frame - from] = m.tau
  if (frame === from) continue
  for (let i = 0; i < names.length; i++) {
    const a = points(now.meshes[i])
    const b = points(before.meshes[i])
    if (!a || !b) continue
    let far = 0
    let at = 0
    let moved = 0
    for (let v = 0; v < a.length; v += 3) {
      const x = a[v] - b[v]
      const y = a[v + 1] - b[v + 1]
      const z = a[v + 2] - b[v + 2]
      const d = x * x + y * y + z * z
      if (d > far) {
        far = d
        at = v / 3
      }
      if (d > 4e-6) moved++
    }
    steps[i][frame - from] = Math.sqrt(far) * 1000
    where[i][frame - from] = at
    many[i][frame - from] = moved
  }
}

let found = 0
for (let i = 0; i < names.length; i++) {
  const s = steps[i]
  for (let k = 1; k < s.length; k++) {
    if (s[k] < FLOOR_MM) continue
    const near: number[] = []
    for (let j = Math.max(1, k - ROUND); j <= Math.min(s.length - 1, k + ROUND); j++) if (j !== k) near.push(s[j])
    near.sort((x, y) => x - y)
    const usual = near[near.length >> 1] ?? 0
    if (s[k] <= TIMES * usual) continue
    found++
    console.log(`${names[i].padEnd(11)} frame ${from + k} (plant clock ${taus[k].toFixed(3)}): ${s[k].toFixed(2)} mm in one frame, ${usual.toFixed(2)} mm in the frames round it, vertex ${where[i][k]}, ${many[i][k]} vertices over 2 mm`)
  }
}
console.log(`${found} pops in frames ${from} to ${to}, ${air ? 'in the film\'s air' : 'in still air'}`)
