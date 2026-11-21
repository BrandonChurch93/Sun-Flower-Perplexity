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
