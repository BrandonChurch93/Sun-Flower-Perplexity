import { describe, expect, it } from 'vitest'
import { config, frameCount, timeOf } from '../src/config.ts'
import { plantInputsAt } from '../src/director/inputs.ts'
import { bractCount, leafCount, leafLength, rayCount, usePlant } from '../src/plant/growth.ts'
import { bractFrameAt, leafFrameAt, poseAt, rayFrameAt, seedLeafFrameAt, stemAt } from '../src/plant/skeleton.ts'
import { HERO, PART, buildStandIn, headAt, standInTopology, standInVertexCount } from '../src/plant/standin.ts'

describe('the parts of the plant', () => {
  it('hides a stand-in piece without moving the rest or the top', () => {
    const topology = standInTopology(HERO)
    const whole = new Float32Array(standInVertexCount * 3)
    const some = new Float32Array(standInVertexCount * 3)
    for (const frame of [195, 780, 1350, 1755]) {
      const time = timeOf(frame)
      const inputs = plantInputsAt(time)
      const top = buildStandIn(time, inputs, whole, null)
      for (const part of [PART.stem, PART.leaf, PART.body, PART.ray]) {
        expect(buildStandIn(time, inputs, some, null, HERO, 1 << part)).toBe(top)
        for (let v = 0; v < standInVertexCount; v++) {
          const hidden = topology.info[v * 3] === part
          for (let k = 0; k < 3; k++) expect(some[v * 3 + k]).toBe(hidden ? 0 : whole[v * 3 + k])
        }
      }
    }
  })

  it('gives every part the same head the camera is fitted to', () => {
    for (const frame of [780, 1080, 1350, 1515, 1755]) {
      const time = timeOf(frame)
      const inputs = plantInputsAt(time)
      const fitted = headAt(time, inputs)
      const pose = poseAt(time, inputs)
      expect(pose.head.cx).toBe(fitted.center.x)
      expect(pose.head.cy).toBe(fitted.center.y)
      expect(pose.head.cz).toBe(fitted.center.z)
      expect(pose.head.radius).toBe(fitted.radius)
      const end = stemAt(pose, 1)
      expect(end.y).toBe(fitted.stemEnd.y)
    }
  })

  it('moves the root of every leaf, bract, petal and seed leaf without a jump, for the plant and for a neighbor', () => {
    const step = 1 / config.film.fps
    for (const variant of [0, 37]) {
      usePlant(variant)
      const last = new Map<string, [number, number, number]>()
      for (let f = 0; f < frameCount; f += 1) {
        const time = timeOf(f)
        const pose = poseAt(time, plantInputsAt(time))
        const see = (name: string, o: { ox: number; oy: number; oz: number }) => {
          const before = last.get(name)
          if (before) expect(Math.hypot(o.ox - before[0], o.oy - before[1], o.oz - before[2])).toBeLessThan(0.4 * step)
          last.set(name, [o.ox, o.oy, o.oz])
        }
        for (let i = 0; i < leafCount; i += 5) if (leafLength(i, time) > 0) see(`leaf ${i}`, leafFrameAt(pose, i))
        for (let j = 0; j < bractCount; j += 7) see(`bract ${j}`, bractFrameAt(pose, j))
        for (let k = 0; k < rayCount; k += 11) see(`ray ${k}`, rayFrameAt(pose, k))
        see('seed leaf', seedLeafFrameAt(pose, 0))
      }
    }
    usePlant(0)
  })
})
