import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { config } from '../src/config.ts'
import { hash01, streamSeed } from '../src/core/random.ts'
import { PLACE, WIND_TOWARD_DEG, blownOf, companionPlace, faceToward, fieldAge, fieldEast, fieldPicturesM, fieldPlaces, fieldWest, gustAt, kindTime, lateAt, nearVariants, farVariants, ownOf, right, settled, toward, windWay } from '../src/field/layout.ts'

const places = fieldPlaces()
const all = [places.near, places.far]
const growth = config.growth

describe('the field', () => {
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

  it('lies behind the plant only, inside its wedge, and has full rows to the last row of plants', () => {
    let deepest = 0
    for (const list of [places.near, places.far, places.pictures, places.under]) {
      for (let i = 0; i < list.length; i += PLACE) {
        const along = -(list[i] * toward.x + list[i + 1] * toward.z)
        const across = list[i] * right.x + list[i + 1] * right.z
        expect(along).toBeGreaterThan(-0.1)
        expect(across).toBeGreaterThan(-fieldWest(along) - 1.5)
        expect(across).toBeLessThan(fieldEast(along) + 1.5)
        deepest = Math.max(deepest, along)
      }
    }
    expect(deepest).toBeGreaterThan(fieldPicturesM)
  })

  it('has five neighbors before the rows, on the side of the companion', () => {
    expect(places.front.length / PLACE).toBe(5)
    for (let i = 0; i < places.front.length; i += PLACE) {
      expect(places.front[i] * right.x + places.front[i + 1] * right.z).toBeLessThanOrEqual(-1.3)
      expect(-(places.front[i] * toward.x + places.front[i + 1] * toward.z)).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('the neighbors grow on the clock of the plant', () => {
  const tiers = [
    { tier: 'near' as const, count: nearVariants.length },
    { tier: 'far' as const, count: farVariants.length },
    { tier: 'pictures' as const, count: farVariants.length },
  ]

  it('no clock runs backward, each kind is a little ahead or behind, and all meet the plant at the end', () => {
    for (const { tier, count } of tiers) {
      for (let k = 0; k < count; k++) {
        let before = kindTime(0, k, tier)
        for (let tau = 0.05; tau <= growth.seconds; tau += 0.05) {
          const at = kindTime(tau, k, tier)
          expect(at, `${tier} ${k} at ${tau}`).toBeGreaterThanOrEqual(before - 1e-9)
          expect(Math.abs(at - tau)).toBeLessThan(6)
          before = at
        }
        expect(kindTime(0, k, tier)).toBeCloseTo(0, 6)
        expect(kindTime(growth.seconds, k, tier)).toBeCloseTo(growth.seconds, 6)
      }
    }
    const apart = new Set(Array.from({ length: nearVariants.length }, (_, k) => kindTime(growth.frostHold, k, 'near').toFixed(2)))
    expect(apart.size).toBeGreaterThan(3)
    expect(fieldAge(growth.frostHold)).toBeLessThan(growth.frostHold)
  })

  it('go their own ways as the heads open, by degrees', () => {
    expect(lateAt(growth.bud)).toBe(0)
    expect(lateAt(growth.seconds)).toBe(1)
    for (let tau = 0; tau < growth.seconds; tau += 0.02) expect(lateAt(tau + 0.02) - lateAt(tau)).toBeLessThan(0.01)
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
    for (let a = 0; a < nearest.length; a++) {
      for (let b = a + 1; b < nearest.length; b++) {
        const p = nearest[a]
        const q = nearest[b]
        const apart = Number(Math.abs(p.tall - q.tall) > 0.02) + Number(Math.abs(p.head - q.head) > 0.03) + Number(Math.abs(p.nod - q.nod) > 0.05) + Number(Math.abs(p.turn - q.turn) > 0.09) + Number(p.kind !== q.kind)
        expect(apart, `${a} and ${b}`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('have heads from 0.75 to 1.15 of the size of their kind and stand from 0.85 to 1.1 as tall', () => {
    for (const from of all) {
      for (let i = 0; i < from.length; i += PLACE) {
        const own = ownOf(from[i + 7])
        expect(own.head).toBeGreaterThanOrEqual(0.75)
        expect(own.head).toBeLessThanOrEqual(1.15)
        expect(own.tall).toBeGreaterThanOrEqual(0.85)
        expect(own.tall).toBeLessThanOrEqual(1.1)
      }
    }
  })

  it('turn their heads mostly one way, each a little differently, and only once in bud', () => {
    let east = 0
    let count = 0
    const ways = new Set<string>()
    for (let i = 0; i < places.near.length; i += PLACE) {
      const id = places.near[i + 7]
      const way = faceToward(id)
      ways.add(way.toFixed(2))
      if (Math.cos(way - Math.PI / 2) > 0.7) east++
      count++
      expect(settled(growth.bud - 2, id)).toBe(0)
      expect(settled(growth.open + 1, id)).toBe(1)
    }
    expect(east / count).toBeGreaterThan(0.75)
    expect(east / count).toBeLessThan(0.97)
    expect(ways.size).toBeGreaterThan(count / 4)
  })
})

describe('the wind over the field', () => {
  it('sends one gust every few seconds, travelling toward azimuth 42', () => {
    expect(WIND_TOWARD_DEG).toBe(42)
    const peaks: number[] = []
    let last = gustAt(0, 0, 0)
    let rising = false
    for (let s = 0.02; s < 40; s += 0.02) {
      const g = gustAt(0, 0, s)
      if (rising && g < last && last > 0.7) peaks.push(s)
      rising = g > last
      last = g
    }
    expect(peaks.length).toBeGreaterThanOrEqual(8)
    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i] - peaks[i - 1]).toBeGreaterThan(2)
      expect(peaks[i] - peaks[i - 1]).toBeLessThan(6)
    }
    // The same front arrives later downwind.
    const arrives = (x: number, z: number): number => {
      for (let s = peaks[0] - 1; s < peaks[0] + 6; s += 0.01) if (gustAt(x, z, s) > 0.8) return s
      return NaN
    }
    expect(arrives(windWay.x * 6, windWay.z * 6)).toBeGreaterThan(arrives(0, 0) + 0.4)
  })

  it('is still in still air and bends a neighbor downwind in a gust', () => {
    const calm = blownOf(7, 3, -5, 60, 0, 0)
    expect(Math.hypot(calm.x, calm.z, calm.head, calm.leaves, calm.nod)).toBe(0)
    let most = 0
    for (let s = 55; s < 62; s += 0.05) {
      const b = blownOf(7, 3, -5, s, 0.54, 0.54)
      most = Math.max(most, b.x * windWay.x + b.z * windWay.z)
    }
    expect(most).toBeGreaterThan(0.1)
    expect(most).toBeLessThan(0.4)
  })
})

describe('the field knows no scene of the first film', () => {
  it('reads no scene time', () => {
    const banned = /segmentById|segmentStart|config\.segments|config\.keys|config\.worlds|worldOf|growthline|director\/registry|director\/inputs|worlds\/|units\//
    for (const name of readdirSync('src/field')) expect(banned.test(readFileSync(`src/field/${name}`, 'utf8')), name).toBe(false)
  })
})
