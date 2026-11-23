import { describe, expect, it } from 'vitest'
import type { SkyLight } from '../src/v2/api.ts'
import { closeShots, cutFrames, type ShotLook } from '../src/v2/cuts.ts'
import { blankLook, lookAt } from '../src/v2/look.ts'
import { blankMoment, momentAt } from '../src/v2/now.ts'

const sky: SkyLight = { direct: [2.4, 1.6, 0.9], zenith: [0.18, 0.26, 0.42], horizon: [0.5, 0.52, 0.56], horizonSun: [0.9, 0.7, 0.5] }
const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

function at(frame: number) {
  const out = blankLook()
  lookAt(momentAt(frame / 30, blankMoment()), sky, out)
  return out
}

function plainAt(frame: number) {
  const saved: (ShotLook | undefined)[] = closeShots.map((s) => s.look)
  for (const s of closeShots) s.look = undefined
  const out = at(frame)
  closeShots.forEach((s, k) => (s.look = saved[k]))
  return out
}

describe('the look of a close shot', () => {
  it('stands on every frame of its shot, from the cut in to the cut out', () => {
    for (let k = 0; k < closeShots.length; k++) {
      const look = closeShots[k].look
      if (!look) continue
      for (const f of [cutFrames[k], Math.round(0.5 * (cutFrames[k] + cutFrames[k + 1])), cutFrames[k + 1] - 1]) {
        const def = at(f)
        const plain = plainAt(f)
        expect(def.grade.contrast / plain.grade.contrast).toBeCloseTo(look.contrast ?? 1, 9)
        expect(def.grade.saturation / plain.grade.saturation).toBeCloseTo(look.saturation ?? 1, 9)
        expect(def.grade.bloom / plain.grade.bloom).toBeCloseTo(look.bloom ?? 1, 9)
        expect(def.grade.vignette / plain.grade.vignette).toBeCloseTo(look.vignette ?? 1, 9)
        for (let i = 0; i < 3; i++) expect(def.grade.gain[i] / plain.grade.gain[i]).toBeCloseTo(look.gain?.[i] ?? 1, 9)
      }
    }
  })
  it('leaves the film alone outside the close shots', () => {
    for (const f of [0, 849, cutFrames[0] - 1, cutFrames[cutFrames.length - 1], 1700, 3112, 3809]) {
      expect(JSON.stringify(at(f))).toBe(JSON.stringify(plainAt(f)))
    }
  })
  it('moves the key, the fill and the sky by its factors and leaves the rest', () => {
    for (let k = 0; k < closeShots.length; k++) {
      const look = closeShots[k].look
      if (!look) continue
      const f = Math.round(0.5 * (cutFrames[k] + cutFrames[k + 1]))
      const def = at(f)
      const plain = plainAt(f)
      expect(def.grade.exposure / plain.grade.exposure).toBeCloseTo(look.level ?? 1, 6)
      expect((lum(def.sun.color) * def.grade.exposure) / (lum(plain.sun.color) * plain.grade.exposure)).toBeCloseTo(look.key ?? 1, 6)
      expect((lum(def.sky.zenith) * def.grade.exposure) / (lum(plain.sky.zenith) * plain.grade.exposure)).toBeCloseTo(look.fill ?? 1, 6)
      expect((lum(def.sky.horizon) * def.grade.exposure) / (lum(plain.sky.horizon) * plain.grade.exposure)).toBeCloseTo(look.fill ?? 1, 6)
      expect(def.grade.white).toBe(plain.grade.white)
      expect(def.fog.density).toBe(plain.fog.density)
      expect(def.sun.softnessDeg).toBe(plain.sun.softnessDeg)
    }
  })
})
