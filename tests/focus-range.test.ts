import { describe, expect, it } from 'vitest'
import { config } from '../src/config.ts'
import { blurPx, cocPixels, ranged } from '../src/core/lens.ts'
import { closeAt, closeShots, cutFrames } from '../src/v2/cuts.ts'
import { fixedPose } from '../src/v2/rig.ts'

describe('the focus range', () => {
  it('is the thin lens where its two ends are one', () => {
    for (const depth of [0.05, 0.2, 0.31, 2, 1000]) expect(blurPx(40, 0.31, 0.31, depth)).toBe(40 * Math.abs(1 / depth - 1 / 0.31))
  })
  it('is sharp between its ends and grows from each of them', () => {
    expect(blurPx(40, 0.3, 0.2, 0.2)).toBe(0)
    expect(blurPx(40, 0.3, 0.2, 0.25)).toBe(0)
    expect(blurPx(40, 0.3, 0.2, 0.3)).toBe(0)
    expect(blurPx(40, 0.3, 0.2, 0.1)).toBeCloseTo(40 * (1 / 0.1 - 1 / 0.2), 9)
    expect(blurPx(40, 0.3, 0.2, 1e9)).toBeCloseTo(40 / 0.3, 6)
  })
  it('stands on every frame of every close shot, round the point the lens looks at', () => {
    expect(closeShots.length).toBe(cutFrames.length - 1)
    for (let k = 0; k < closeShots.length; k++) {
      for (const f of [cutFrames[k], Math.round(0.5 * (cutFrames[k] + cutFrames[k + 1])), cutFrames[k + 1] - 1]) {
        const view = closeAt(f / 30)
        expect(view).not.toBeNull()
        const pose = fixedPose(view!)
        expect(ranged(pose)).toBe(true)
        const reach = pose.focusM - closeShots[k].sharp![1]
        expect(pose.focusNearM!).toBeCloseTo(reach - closeShots[k].sharp![0], 9)
        const gate = config.camera.gateWidthMm
        expect(cocPixels(pose, gate, 1920, reach)).toBe(0)
        expect(cocPixels(pose, gate, 1920, 50)).toBeGreaterThan(60)
        expect(cocPixels(pose, gate, 1920, 50)).toBeLessThan(200)
      }
    }
    expect(closeAt((cutFrames[0] - 1) / 30)).toBeNull()
    expect(closeAt(cutFrames[cutFrames.length - 1] / 30)).toBeNull()
  })
})
