import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { config } from '../src/config.ts'
import { poseOf, project } from '../src/director/pose.ts'
import { rigPathAt } from '../src/director/rig.ts'
import { rigAt } from '../src/director/camera.ts'
import { plantInputsAt } from '../src/director/inputs.ts'
import { nearPlane } from '../src/director/pose.ts'
import { PLACE, companionPlace, companionVariant, fieldPlaces, right, toward } from '../src/field/layout.ts'
import { heightAt, usePlant } from '../src/plant/growth.ts'
import { buildStandIn, standInVertexCount } from '../src/plant/standin.ts'

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

  it('keeps the companion out of the frame through dawn, rain and night and at the frost key', () => {
    const fps = config.film.fps
    const night = config.segments.find((s) => s.id === 'night')!
    const frames: number[] = []
    for (let f = 0; f < night.end * fps; f += 5) frames.push(f)
    frames.push(night.end * fps - 1, Math.round(config.keys.find((k) => k.id === 'frost')!.time * fps))
    const aspect = config.formats.master.width / config.formats.master.height
    const at = companionPlace()
    const ratio = config.field.companion.heightRatio
    const pos = new Float32Array(standInVertexCount * 3)
    const p = new THREE.Vector3()
    for (const f of frames) {
      const time = f / fps
      const rig = rigAt(time)
      const pose = poseOf(rig, new THREE.Vector3())
      usePlant(companionVariant)
      buildStandIn(time, plantInputsAt(time), pos, null)
      usePlant(0)
      let inFrame = 0
      for (let i = 0; i < standInVertexCount; i++) {
        const seen = project(pose, p.set(at.x + pos[i * 3] * ratio, pos[i * 3 + 1] * ratio, at.z + pos[i * 3 + 2] * ratio), aspect)
        if (seen.depthM > nearPlane(rig) && seen.x >= 0 && seen.x <= 1 && seen.y >= 0 && seen.y <= 1) inFrame++
      }
      expect(inFrame, `frame ${f}`).toBe(0)
    }
  })
})
