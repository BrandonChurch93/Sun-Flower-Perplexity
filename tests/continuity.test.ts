import { describe, expect, it } from 'vitest'
import { config, frameCount } from '../src/config.ts'
import { continuityFrom } from '../src/director/continuity.ts'
import * as THREE from 'three'
import { horizonY, poseOf } from '../src/director/pose.ts'
import { rigPathAt } from '../src/director/rig.ts'
import { stateAt } from '../src/director/state.ts'
import { cuts } from '../src/director/growthline.ts'
import { cuts as filmCuts, segments } from '../src/director/timeline.ts'

describe('continuity of a film with no cut', () => {
  it('has no cut in the film and keeps the cuts of the plant clock for the growth path', () => {
    expect(filmCuts.length).toBe(0)
    expect(cuts.length).toBeGreaterThan(0)
  })

  it('moves the camera and the plant no more at a section line than between ordinary neighbors', () => {
    for (const s of segments.slice(1)) {
      const result = continuityFrom(stateAt, s.firstFrame)
      expect(result.worst.ratio, `section ${s.id} at frame ${s.firstFrame}, ${result.worst.name}`).toBeLessThanOrEqual(config.continuity.maxStepRatio)
    }
  })

  it('gives finite numbers on every frame', () => {
    for (let f = 0; f < frameCount; f += 7) {
      const s = stateAt(f)
      for (const v of [...s.camera, ...s.plant]) expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('gives the same numbers every time', () => {
    for (const f of [0, 239, 240, 901, 2083, frameCount - 1]) expect(stateAt(f)).toEqual(stateAt(f))
  })

  it('carries each key and never rocks the horizon before the rain key', () => {
    const point = new THREE.Vector3()
    const height = config.formats.master.height
    const horizon = (frame: number): number => horizonY(poseOf({ ...rigPathAt(frame / config.film.fps), fNumber: 8 }, point), config.formats.master.width / height) * height
    for (const key of config.camera.keys) expect(rigPathAt(key.time).aimHeightM).toBeCloseTo(key.aimHeightM, 9)
    let back = 0
    for (let f = 1; f <= 14 * config.film.fps; f++) back += Math.max(0, horizon(f - 1) - horizon(f))
    expect(back).toBeLessThan(1)
  })
})
