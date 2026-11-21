import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { config } from '../src/config.ts'
import { poseOf, project } from '../src/director/pose.ts'
import { rigPathAt } from '../src/director/rig.ts'
import { PLACE, companionPlace, fieldPlaces, right, toward } from '../src/field/layout.ts'
import { heightAt } from '../src/plant/growth.ts'
import { timeOf } from '../src/config.ts'
import { rayLength } from '../src/plant/growth.ts'
import { sunDirection } from '../src/core/world.ts'
import { plantInputsAt, worldAtTime } from '../src/director/inputs.ts'
import { worldOf } from '../src/director/registry.ts'
import { poseAtTime } from '../src/director/state.ts'
import { headAt } from '../src/plant/model.ts'
import { sunDisc } from '../src/post/sun.ts'

const places = fieldPlaces()
const all = [places.near, places.far]

describe('the field', () => {
  it('shows at least the number of plants the film asks for at the field key', () => {
    const key = config.keys.find((k) => k.id === 'field')!
    const pose = poseOf({ ...rigPathAt(key.time), fNumber: 8 }, new THREE.Vector3(0, 1.6, 0))
    const aspect = config.formats.master.width / config.formats.master.height
    const top = heightAt(key.time) * 0.9
    let seen = 0
    const p = new THREE.Vector3()
    for (const list of all) {
      for (let i = 0; i < list.length; i += PLACE) {
        const at = project(pose, p.set(list[i], top * list[i + 3], list[i + 1]), aspect)
        if (at.depthM > 0 && at.x >= 0 && at.x <= 1 && at.y >= 0 && at.y <= 1) seen++
      }
    }
    expect(seen).toBeGreaterThanOrEqual(config.field.minPlantsInView)
  })

  it('stands in rows behind the plant, the first one the set distance away', () => {
    let nearest = Infinity
    for (const list of all) {
      for (let i = 0; i < list.length; i += PLACE) {
        const along = -(list[i] * toward.x + list[i + 1] * toward.z)
        nearest = Math.min(nearest, along)
        const row = (along - config.field.plantAheadOfRowM) / config.field.rowSpacingM
        expect(Math.abs(row - Math.round(row))).toBeLessThan(0.08)
      }
    }
    expect(nearest).toBeGreaterThan(config.field.plantAheadOfRowM - 0.06)
    expect(nearest).toBeLessThan(config.field.plantAheadOfRowM + 0.06)
  })

  it('keeps the spacing along a row', () => {
    const row: number[] = []
    for (let i = 0; i < places.near.length; i += PLACE) {
      const along = -(places.near[i] * toward.x + places.near[i + 1] * toward.z)
      if (Math.abs(along - config.field.plantAheadOfRowM) < 0.1) row.push(places.near[i] * right.x + places.near[i + 1] * right.z)
    }
    row.sort((a, b) => a - b)
    expect(row.length).toBeGreaterThan(10)
    for (let i = 1; i < row.length; i++) {
      const gap = row[i] - row[i - 1]
      if (gap > config.field.plantSpacingM * 1.6) continue
      expect(gap).toBeGreaterThan(config.field.plantSpacingM - 0.13)
      expect(gap).toBeLessThan(config.field.plantSpacingM + 0.13)
    }
  })

  it('places the companion from the config, in the ground', () => {
    const c = config.field.companion
    const at = companionPlace()
    expect(at.x * toward.x + at.z * toward.z).toBeCloseTo(c.towardCameraM, 9)
    expect(-(at.x * right.x + at.z * right.z)).toBeCloseTo(c.leftM, 9)
  })

  it('is the same field every time', () => {
    const again = fieldPlaces()
    expect(Array.from(again.near)).toEqual(Array.from(places.near))
    expect(again.far.length).toBe(places.far.length)
  })
})

describe('the neighbors before the rows, beside the companion', () => {
  const judged = [1350, 1515, 1755]
  const aspect = config.formats.master.width / config.formats.master.height
  const margin = 0.02
  const count = places.front.length / PLACE

  it('are five', () => {
    expect(count).toBe(5)
  })

  it('stand 1.3 m and more from the plant on the side of the companion, no nearer to the lens than the line the plant stands on', () => {
    for (let i = 0; i < places.front.length; i += PLACE) {
      const x = places.front[i]
      const z = places.front[i + 1]
      expect(x * right.x + z * right.z).toBeLessThanOrEqual(-1.3)
      expect(-(x * toward.x + z * toward.z)).toBeGreaterThanOrEqual(0)
      for (const frame of judged) {
        const pose = poseAtTime(timeOf(frame))
        const plant = project(pose, new THREE.Vector3(0, 0, 0), aspect).depthM
        expect(project(pose, new THREE.Vector3(x, 0, z), aspect).depthM, `frame ${frame}`).toBeGreaterThanOrEqual(plant)
      }
    }
  })

  it('never stand over the head of the plant, its stem or the disc of the sun in the judged frames', () => {
    for (const frame of judged) {
      const time = timeOf(frame)
      const pose = poseAtTime(time)
      const scale = pose.focalMm / config.camera.gateWidthMm
      const head = headAt(time, plantInputsAt(time))
      const center = new THREE.Vector3(head.center.x, head.center.y, head.center.z)
      const reachOfHead = head.radius + rayLength(0, time)
      // What must stay clear, each a point in the frame with its radius as a share of the frame's width: the head, the stem under it and the sun.
      const clear: { x: number; y: number; r: number }[] = []
      const at = project(pose, center, aspect)
      clear.push({ x: at.x, y: at.y, r: (reachOfHead / at.depthM) * scale })
      for (let k = 0; k <= 20; k++) {
        const s = project(pose, center.clone().multiplyScalar(k / 20), aspect)
        if (s.depthM > 0.05) clear.push({ x: s.x, y: s.y, r: (0.03 / s.depthM) * scale })
      }
      const sun = sunDirection(worldOf(worldAtTime(time)))
      if (sun.dot(pose.forward) > 0.05) {
        const s = project(pose, pose.position.clone().addScaledVector(sun, 1000), aspect)
        clear.push({ x: s.x, y: s.y, r: sunDisc })
      }
      for (let i = 0; i < places.front.length; i += PLACE) {
        const size = places.front[i + 3]
        const top = heightAt(time) * size
        // A neighbor is taken as wide as its leaves reach, from the ground to the top of its head.
        const reach = 0.45 * size + reachOfHead
        for (let y = 0; y <= top + reachOfHead; y += 0.05) {
          const p = project(pose, new THREE.Vector3(places.front[i], y, places.front[i + 1]), aspect)
          if (p.depthM <= 0.05) continue
          for (const c of clear) {
            const apart = Math.hypot(p.x - c.x, (p.y - c.y) / aspect)
            expect(apart, `frame ${frame}, neighbor ${i / PLACE}`).toBeGreaterThan((reach / p.depthM) * scale + c.r + margin)
          }
        }
      }
    }
  })
})

import { lateAt, nearVariants, ownOf } from '../src/field/layout.ts'
import { hash01, streamSeed } from '../src/core/random.ts'

describe('the neighbors from 52 s', () => {
  it('are as they were up to frame 1559 and go their own ways from frame 1560', () => {
    for (let frame = 0; frame <= 1559; frame += 3) expect(lateAt(timeOf(frame))).toBe(0)
    expect(lateAt(timeOf(1559))).toBe(0)
    expect(lateAt(52)).toBe(0)
    expect(lateAt(timeOf(1561))).toBeGreaterThan(0)
    expect(lateAt(timeOf(1755))).toBe(1)
    for (let frame = 1560; frame < 1799; frame++) expect(lateAt(timeOf(frame + 1)) - lateAt(timeOf(frame))).toBeLessThan(0.012)
  })

  it('are no two alike among the nearest thirty', () => {
    const seed = streamSeed('field')
    const list: { tall: number; head: number; nod: number; turn: number; kind: number; reach: number }[] = []
    for (const from of [places.near, places.front]) {
      for (let i = 0; i < from.length; i += PLACE) {
        const own = ownOf(from[i + 7])
        list.push({ tall: from[i + 3] * own.tall, head: own.head, nod: own.nod, turn: from[i + 2] + own.turn, kind: Math.floor(hash01(seed, 15, from[i + 7]) * nearVariants.length), reach: Math.hypot(from[i], from[i + 1]) })
      }
    }
    list.sort((a, b) => a.reach - b.reach)
    const nearest = list.slice(0, 30)
    for (const n of nearest) {
      expect(n.head).toBeGreaterThanOrEqual(0.75)
      expect(n.head).toBeLessThanOrEqual(1.15)
    }
    for (let a = 0; a < nearest.length; a++) {
      for (let b = a + 1; b < nearest.length; b++) {
        const p = nearest[a]
        const q = nearest[b]
        const apart = Number(Math.abs(p.tall - q.tall) > 0.02) + Number(Math.abs(p.head - q.head) > 0.03) + Number(Math.abs(p.nod - q.nod) > 0.05) + Number(Math.abs(p.turn - q.turn) > 0.09) + Number(p.kind !== q.kind)
        expect(apart, `${a} and ${b}`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('have heads from 0.75 to 1.15 of the size they had and stand from 0.85 to 1.1 as tall, over the whole field', () => {
    let low = { head: 9, tall: 9 }
    let high = { head: 0, tall: 0 }
    for (const from of all) {
      for (let i = 0; i < from.length; i += PLACE) {
        const own = ownOf(from[i + 7])
        low = { head: Math.min(low.head, own.head), tall: Math.min(low.tall, own.tall) }
        high = { head: Math.max(high.head, own.head), tall: Math.max(high.tall, own.tall) }
      }
    }
    expect(low.head).toBeGreaterThanOrEqual(0.75)
    expect(low.head).toBeLessThan(0.78)
    expect(high.head).toBeLessThanOrEqual(1.15)
    expect(high.head).toBeGreaterThan(1.12)
    expect(low.tall).toBeGreaterThanOrEqual(0.85)
    expect(high.tall).toBeLessThanOrEqual(1.1)
  })
})

import { behindAt, earlyAt, earlyCode, kindTime, nightAt } from '../src/field/layout.ts'

describe('before the bloom every neighbor is its own', () => {
  it('each kind is at its own stage in the rain and under the moon, and no clock runs backward', () => {
    for (const time of [14, 26]) {
      const clocks = [0, 1, 2, 3, 4, 5, 6].map((k) => kindTime(time, k, 'near'))
      for (let a = 0; a < clocks.length; a++) {
        expect(clocks[a]).toBeLessThan(time)
        for (let b = a + 1; b < clocks.length; b++) expect(Math.abs(clocks[a] - clocks[b]), `${time} s, ${a} and ${b}`).toBeGreaterThan(0.1)
      }
    }
    for (let k = 0; k < 7; k++) for (let f = 0; f < 1800; f++) expect(kindTime((f + 1) / 30, k, 'near')).toBeGreaterThan(kindTime(f / 30, k, 'near'))
  })

  it('no two of the nearest twenty have the same stalk, leaves and droop', () => {
    const near: { d: number; code: number }[] = []
    for (let i = 0; i < places.near.length; i += PLACE) near.push({ d: Math.hypot(places.near[i], places.near[i + 1]), code: earlyCode(ownOf(places.near[i + 7])) })
    near.sort((a, b) => a.d - b.d)
    const codes = near.slice(0, 20).map((n) => n.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('all of it is gone by 40.0 s, and the night by 35.5 s', () => {
    for (const time of [40, 45, 52, 58.5, 60]) {
      expect(earlyAt(time)).toBe(0)
      expect(behindAt(time)).toBe(0)
      expect(nightAt(time)).toBe(0)
    }
    expect(nightAt(35.5)).toBe(0)
    expect(earlyAt(26)).toBe(1)
  })
})

import { fieldAge, gapsAt, rainAt, standsClear, stiffAt } from '../src/field/layout.ts'

describe('the rain and the moon leave nothing behind', () => {
  it('the seedlings in the gaps stand only while the rain shot lasts', () => {
    const rain = config.segments.find((s) => s.id === 'rain') ?? { start: 8, end: 20 }
    expect(gapsAt(rain.start)).toBe(0)
    expect(gapsAt(rain.end - 1 / 30)).toBe(1)
    for (const time of [0, 4, rain.end, 26, 36, 40, 52, 60]) expect(gapsAt(time)).toBe(0)
  })

  it('from 21 s the field is its own age, and under the moon no kind is far behind', () => {
    for (const time of [21, 26, 36, 40, 45, 52, 58.5, 60]) {
      expect(rainAt(time)).toBe(0)
      expect(fieldAge(time)).toBe(time)
    }
    for (let k = 0; k < 7; k++) expect(26 - kindTime(26, k, 'near')).toBeLessThan(1.3)
    expect(stiffAt(26)).toBe(0)
    expect(stiffAt(36)).toBe(1)
  })

  it('some of the nearest stand clear under the moon and the code of a neighbor that does not is unchanged', () => {
    let clear = 0
    let seen = 0
    for (let i = 0; i < places.near.length; i += PLACE) {
      if (Math.hypot(places.near[i], places.near[i + 1]) >= 2.75) {
        expect(standsClear(places.near[i + 7], places.near[i], places.near[i + 1])).toBe(false)
        continue
      }
      seen++
      if (standsClear(places.near[i + 7], places.near[i], places.near[i + 1])) clear++
      const own = ownOf(places.near[i + 7])
      expect(earlyCode(own)).toBe(earlyCode(own, own.bud, own.leaf, own.droop))
    }
    expect(clear).toBeGreaterThanOrEqual(3)
    expect(clear).toBeLessThan(seen)
  })
})
