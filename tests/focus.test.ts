import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { frameCount, timeOf } from '../src/config.ts'
import { plantInputsAt } from '../src/director/inputs.ts'
import { poseAtTime } from '../src/director/state.ts'
import { cuts } from '../src/director/timeline.ts'
import { headAt, tipAt } from '../src/plant/model.ts'
import { bodyHalfDepth, bodyRadius } from '../src/plant/growth.ts'

describe('the point the lens holds', () => {
  it('lies on the line from the lens to the growing tip, never behind the tip', () => {
    const held = new THREE.Vector3()
    const tip = new THREE.Vector3()
    for (let f = 0; f < frameCount; f += 3) {
      const time = timeOf(f)
      const pose = poseAtTime(time, held)
      tipAt(time, plantInputsAt(time), tip)
      const toTip = tip.clone().sub(pose.position)
      const toHeld = held.clone().sub(pose.position)
      expect(toHeld.length(), `frame ${f}`).toBeLessThanOrEqual(toTip.length() + 1e-9)
      expect(toHeld.clone().normalize().dot(toTip.clone().normalize()), `frame ${f}`).toBeGreaterThan(1 - 1e-9)
    }
  })

  it('lies on the surface of the bud and the head once there is one', () => {
    const held = new THREE.Vector3()
    for (let f = 0; f < frameCount; f += 3) {
      const time = timeOf(f)
      const radius = bodyRadius(time)
      const depth = bodyHalfDepth(time)
      if (!(radius > 0.002)) continue
      poseAtTime(time, held)
      const h = headAt(time, plantInputsAt(time))
      const v = held.clone().sub(new THREE.Vector3(h.center.x, h.center.y, h.center.z))
      const along = v.dot(new THREE.Vector3(h.axis.x, h.axis.y, h.axis.z))
      const across = Math.sqrt(Math.max(0, v.lengthSq() - along * along))
      expect((along / depth) ** 2 + (across / radius) ** 2, `frame ${f}`).toBeCloseTo(1, 6)
    }
  })

  it('holds the side of the bud that is turned to the lens, not its middle', () => {
    const held = new THREE.Vector3()
    for (let f = 0; f < frameCount; f += 3) {
      const time = timeOf(f)
      const radius = bodyRadius(time)
      if (!(radius > 0.01)) continue
      const pose = poseAtTime(time, held)
      const h = headAt(time, plantInputsAt(time))
      const middle = new THREE.Vector3(h.center.x, h.center.y, h.center.z).sub(pose.position).length()
      expect(middle - held.clone().sub(pose.position).length(), `frame ${f}`).toBeGreaterThan(0.25 * Math.min(radius, bodyHalfDepth(time)))
    }
  })

  it('moves smoothly: the focus distance never steps more between frames than the frames around it do', () => {
    const held = new THREE.Vector3()
    const focus: number[] = []
    for (let f = 0; f < frameCount; f++) focus.push(poseAtTime(timeOf(f), held).focusM)
    const cutFrames = new Set(cuts.map((c) => c.frame))
    for (let f = 2; f < frameCount - 1; f++) {
      if (cutFrames.has(f) || cutFrames.has(f - 1) || cutFrames.has(f + 1)) continue
      const before = Math.abs(focus[f - 1] - focus[f - 2])
      const now = Math.abs(focus[f] - focus[f - 1])
      const after = Math.abs(focus[f + 1] - focus[f])
      expect(now, `frame ${f}`).toBeLessThanOrEqual(Math.max(before, after) * 1.6 + 2e-5)
    }
  })
})
