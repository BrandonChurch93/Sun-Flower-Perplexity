import { blankMoment, momentAt } from '../v2/now.ts'
import { LAND_FROM_M, LAND_TO_M, cellAt, fromFields, landAt, plantedAt, toFields } from './land.ts'
import { terrainGeometry, woodMapMegabytes } from './terrain.ts'
import { atlasMegabytes, makeTrees } from './trees.ts'

// Run with: npx tsx src/place/check.ts
// The rules of the land that can be checked without drawing it.
const RAD = Math.PI / 180
const at = { height: 0, wood: 0, hill: 0 }
let failed = 0
const rule = (name: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${name} · ${detail}`)
  if (!ok) failed++
}

function skylineDeg(azDeg: number): number {
  let best = -90
  for (let r = LAND_FROM_M + 6; r < LAND_TO_M; r *= 1.015) {
    landAt(Math.sin(azDeg * RAD) * r, Math.cos(azDeg * RAD) * r, at)
    best = Math.max(best, Math.atan2(at.height, r) / RAD)
  }
  return best
}

// The sun meets the land low in its saddles, morning and last evening.
const moment = blankMoment()
let morning = 0
let evening = 0
let flanks = 90
for (let s = 0; s <= 127; s += 0.25) {
  momentAt(s, moment)
  if (moment.sunElevationDeg < -1 || moment.sunElevationDeg > 2.5) continue
  const az = (Math.atan2(moment.sun.x, moment.sun.z) / RAD + 360) % 360
  if (az < 190) morning = Math.max(morning, skylineDeg(az))
  if (az > 220) evening = Math.max(evening, skylineDeg(az))
}
for (const az of [150, 160, 240, 250, 260]) flanks = Math.min(flanks, skylineDeg(az))
rule('saddle of the mornings', morning < 0.95, `the land under the rising sun stands ${morning.toFixed(2)} degrees at most`)
rule('saddle of the last evening', evening < 0.95, `the land under the last setting sun stands ${evening.toFixed(2)} degrees at most`)
rule('hills beside the saddles', flanks > 1.5, `the lowest of the flanks stands ${flanks.toFixed(2)} degrees`)

// Where the land takes over from the soil: under the soil plane at its first ring, above it from 82 m to where it takes its own depth, except under the planted field.
let low = 9
let high = -9
let lowOn = 9
let under = -9
for (let az = 0; az < 360; az += 0.5) {
  const sx = Math.sin(az * RAD)
  const sz = Math.cos(az * RAD)
  const h0 = landAt(sx * LAND_FROM_M, sz * LAND_FROM_M, at).height
  low = Math.min(low, h0)
  high = Math.max(high, h0)
  for (let r = 82; r <= 400; r += 2) {
    const h = landAt(sx * r, sz * r, at).height
    const planted = plantedAt(sx * r, sz * r)
    if (planted === 0) lowOn = Math.min(lowOn, h)
    if (planted === 1) under = Math.max(under, h)
  }
}
rule('the seam with the soil', high < -0.2 && lowOn > 0.2, `first ring ${low.toFixed(2)} to ${high.toFixed(2)} m, from 82 m to 400 m no lower than ${lowOn.toFixed(2)} m outside the planted field`)
rule('under the planted field', under < -0.3, `the land lies ${(-under).toFixed(2)} m or more under the soil wherever the field stands`)

// The same land every time it is asked.
let same = true
for (let i = 0; i < 2000; i++) {
  const x = Math.sin(i * 1.7) * (100 + i * 2.5)
  const z = Math.cos(i * 2.3) * (100 + i * 2.5)
  const a = landAt(x, z, at).height
  const b = landAt(x, z, at).height
  if (a !== b) same = false
}
rule('one land', same, '2000 points asked twice give the same heights')

// The frame of the fields goes there and back.
let worst = 0
for (let i = 0; i < 500; i++) {
  const u = Math.sin(i * 0.37) * 2400
  const v = Math.cos(i * 0.91) * 2400
  const p = fromFields(u, v)
  const q = toFields(p.x, p.z)
  worst = Math.max(worst, Math.hypot(q.u - u, q.v - v))
}
const here = cellAt(toFields(0, 0).u, toFields(0, 0).v)
rule('the frame of the fields', worst < 0.01, `there and back is off by ${worst.toExponential(1)} m at most, the plant stands in strip ${here.i}, field ${here.j}`)

const geometry = terrainGeometry()
const trees = makeTrees()
console.log(`cost · land ${geometry.getAttribute('position').count} vertices, ${geometry.getIndex()!.count / 3} triangles, one draw call · trees and hedges ${trees.count} cards, one draw call · textures ${(atlasMegabytes + woodMapMegabytes).toFixed(1)} MB · no pass of its own`)
if (failed > 0) process.exitCode = 1
