import * as THREE from 'three'
import { eyeOf } from '../director/pose.ts'
import { blankMoment, momentAt } from '../v2/now.ts'
import { rigAtFilm } from '../v2/rig.ts'
import { LAND_FROM_M, LAND_TO_M, cellAt, fromFields, landAt, plantedAt, toFields } from './land.ts'
import { terrainGeometry, woodMapMegabytes } from './terrain.ts'
import { atlasMegabytes, makeTrees, plantList } from './trees.ts'
import { pathToFileURL } from 'node:url'

// Run with: npx tsx src/place/check.ts, or call checkPlace() from a test and expect every rule to be ok.
// The rules of the land that can be checked without drawing it.
export interface Rule { name: string; ok: boolean; detail: string }
const RAD = Math.PI / 180
const at = { height: 0, wood: 0, hill: 0 }

function skylineDeg(azDeg: number): number {
  let best = -90
  for (let r = LAND_FROM_M + 6; r < LAND_TO_M; r *= 1.015) {
    landAt(Math.sin(azDeg * RAD) * r, Math.cos(azDeg * RAD) * r, at)
    const e = Math.atan2(at.height, r) / RAD
    if (e > best) best = e
  }
  return best
}

// The land's top and the tallest tree's top on one bearing, in degrees over the level, as the film's lens sees them on one bar.
const lens = new THREE.Vector3()
function fromLens(bar: number, azDeg: number, trees: ReturnType<typeof plantList>): { land: number; wood: number; card: number } {
  eyeOf(rigAtFilm(((bar - 0.48) * 12) / 7), lens)
  const dx = Math.sin(azDeg * RAD)
  const dz = Math.cos(azDeg * RAD)
  const seen = { land: -90, wood: 0, card: -90 }
  for (let r = 80; r < LAND_TO_M - 20; r += 8) {
    const x = lens.x + dx * r
    const z = lens.z + dz * r
    if (Math.hypot(x, z) < LAND_FROM_M + 6) continue
    landAt(x, z, at)
    const e = Math.atan2(at.height - lens.y, r) / RAD
    if (e > seen.land) {
      seen.land = e
      seen.wood = at.wood
    }
  }
  for (const t of trees) {
    const x = t.x - lens.x
    const z = t.z - lens.z
    const r = Math.hypot(x, z)
    const off = Math.abs((((Math.atan2(x, z) / RAD - azDeg) % 360) + 540) % 360 - 180)
    if (off > 0.25 + Math.atan2(0.3 * t.w, r) / RAD) continue
    seen.card = Math.max(seen.card, Math.atan2(t.y + 0.96 * t.h - lens.y, r) / RAD)
  }
  return seen
}

// The sun rises over low land and sets on the low wooded line of the ridge. The ridge is one long low line that wanders, with one hill at the left of the storm's frame.
export function checkPlace(): Rule[] {
  const rules: Rule[] = []
  const rule = (name: string, ok: boolean, detail: string): void => {
    rules.push({ name, ok, detail })
  }
  const moment = blankMoment()
  let morning = 0
  for (let s = 0; s <= 127; s += 0.25) {
    momentAt(s, moment)
    if (moment.sunElevationDeg < -1 || moment.sunElevationDeg > 2.5) continue
    const az = (Math.atan2(moment.sun.x, moment.sun.z) / RAD + 360) % 360
    if (az < 190) morning = Math.max(morning, skylineDeg(az))
  }
  // The last sun stands on the ridge: from the crane's lens the line is 0.75 degrees up for three degrees either side of bearing 226, wooded, and no tree stands over it.
  const trees = plantList()
  let evening = 0
  let eveningLow = 90
  let eveningWood = 1
  let eveningCard = -90
  for (const bar of [73, 74.5]) {
    for (let az = 223; az <= 229; az += 0.25) {
      const seen = fromLens(bar, az, trees)
      evening = Math.max(evening, seen.land)
      eveningLow = Math.min(eveningLow, seen.land)
      eveningWood = Math.min(eveningWood, seen.wood)
      eveningCard = Math.max(eveningCard, seen.card - seen.land)
    }
  }
  const line: number[] = []
  for (let az = 165; az <= 245; az += 0.5) line.push(skylineDeg(az))
  const lineAt = (az: number): number => line[Math.round((az - 165) * 2)]
  let lineLow = 90
  let lineHigh = 0
  for (let az = 190; az <= 240; az += 0.5) {
    if ((az > 200 && az < 214) || (az > 222 && az < 230)) continue
    lineLow = Math.min(lineLow, lineAt(az))
    lineHigh = Math.max(lineHigh, lineAt(az))
  }
  let hill = 0
  for (let az = 203; az <= 211; az += 0.5) hill = Math.max(hill, lineAt(az))
  let flattest = 90
  for (let i = 0; i + 20 < line.length; i++) {
    const span = line.slice(i, i + 21)
    flattest = Math.min(flattest, Math.max(...span) - Math.min(...span))
  }
  rule('the mornings', morning < 0.95, `the land under the rising sun stands ${morning.toFixed(2)} degrees at most`)
  rule('the last evening', eveningLow > 0.7 && evening < 0.8 && eveningWood > 0.5 && eveningCard < 0, `from the crane's lens at bars 73 and 74.5 the line the last sun stands on is ${eveningLow.toFixed(3)} to ${evening.toFixed(3)} degrees up from bearing 223 to 229, wooded (${eveningWood.toFixed(2)}), the tallest tree ${(-eveningCard).toFixed(3)} degrees under it`)
  rule('one long low line', lineLow > 0.7 && lineHigh < 1.7, `beside the hill the ridge stands ${lineLow.toFixed(2)} to ${lineHigh.toFixed(2)} degrees from bearing 190 to 240`)
  rule('the hill at the left of the storm', hill > 1.8 && hill < 2.3, `it stands ${hill.toFixed(2)} degrees`)
  rule('a line that wanders', flattest > 0.08, `over any 10 degrees of bearing from 165 to 245 the skyline moves by ${flattest.toFixed(2)} degrees or more`)

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
  return rules
}

export function placeCost(): string {
  const geometry = terrainGeometry()
  const trees = makeTrees()
  return `cost · land ${geometry.getAttribute('position').count} vertices, ${geometry.getIndex()!.count / 3} triangles, one draw call · trees and hedges ${trees.count} cards, one draw call · textures ${(atlasMegabytes + woodMapMegabytes).toFixed(1)} MB · no pass of its own`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rules = checkPlace()
  for (const r of rules) console.log(`${r.ok ? 'PASS' : 'FAIL'} · ${r.name} · ${r.detail}`)
  console.log(placeCost())
  if (rules.some((r) => !r.ok)) process.exitCode = 1
}
