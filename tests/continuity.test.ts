import { describe, expect, it } from 'vitest'
import { config, frameCount } from '../src/config.ts'
import { continuityFrom } from '../src/director/continuity.ts'
import * as THREE from 'three'
import { horizonY, poseOf } from '../src/director/pose.ts'
import { rigPathAt } from '../src/director/rig.ts'
import { stateAt } from '../src/director/state.ts'
import { cuts } from '../src/director/timeline.ts'

describe('continuity across the cuts', () => {
  it('has cuts to test', () => {
    expect(cuts.length).toBeGreaterThan(0)
  })

  it('moves the camera and the plant no more across a cut than between ordinary neighbors', () => {
    for (const cut of cuts) {
      const result = continuityFrom(stateAt, cut.frame)
      expect(result.worst.ratio, `cut ${cut.index} at frame ${cut.frame}, ${result.worst.name}`).toBeLessThanOrEqual(config.continuity.maxStepRatio)
      expect(stateAt(cut.frame).world).toBe(cut.toWorld)
      expect(stateAt(cut.frame - 1).world).toBe(cut.fromWorld)
    }
  })

  it('gives finite numbers on every frame', () => {
    for (let f = 0; f < frameCount; f += 7) {
      const s = stateAt(f)
      for (const v of [...s.camera, ...s.plant]) expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('gives the same numbers every time', () => {
    for (const f of [0, 239, 240, 901, frameCount - 1]) expect(stateAt(f)).toEqual(stateAt(f))
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
