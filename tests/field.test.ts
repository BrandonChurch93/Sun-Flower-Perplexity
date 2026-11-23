import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { config } from '../src/config.ts'
import { hash01, streamSeed } from '../src/core/random.ts'
import { ALL_OPEN_T, FIRST_RAY_T, OPENS, PLACE, blownOf, companionPlace, faceToward, fieldAge, fieldEast, fieldPicturesM, fieldPlaces, fieldWest, kindTime, lateAt, nearVariants, farVariants, ownOf, right, settled, shareOf, sizeOf, statureAt, toward } from '../src/field/layout.ts'
import { ROOM_M, bySeen, filmLens, frameOf, needed } from '../src/field/seen.ts'
import { heightAt } from '../src/plant/growth.ts'
import { barTime, tauAt, tauAtBar } from '../src/v2/clock.ts'
import { rigAtFilm } from '../src/v2/rig.ts'
import { WIND_TOWARD_DEG, gustAt, windWay } from '../src/v2/wind.ts'

const places = fieldPlaces()
const all = [places.near, places.far]
const growth = config.growth

describe('the field', () => {
  it('stands in rows that run away from the plant, a lane on its axis, the row ends the set distance away', () => {
    const { rowSpacingM, plantSpacingM, plantAheadOfRowM } = config.field
    let nearest = Infinity
    for (let i = 0; i < places.far.length; i += PLACE) {
      const across = places.far[i] * right.x + places.far[i + 1] * right.z
      const row = across / rowSpacingM - 0.5
      expect(Math.abs(row - Math.round(row)) * rowSpacingM).toBeLessThan(0.1)
    }
    for (let i = 0; i < places.near.length; i += PLACE) nearest = Math.min(nearest, -(places.near[i] * toward.x + places.near[i + 1] * toward.z))
    expect(nearest).toBeGreaterThan(plantAheadOfRowM - 0.07)
    expect(nearest).toBeLessThan(plantAheadOfRowM + plantSpacingM)
  })

  it('keeps the spacing along a row', () => {
    const { rowSpacingM, plantSpacingM } = config.field
    const row: number[] = []
    for (let i = 0; i < places.far.length; i += PLACE) {
      const across = places.far[i] * right.x + places.far[i + 1] * right.z
      if (Math.abs(across - 4.5 * rowSpacingM) < 0.2) row.push(-(places.far[i] * toward.x + places.far[i + 1] * toward.z))
    }
    row.sort((a, b) => a - b)
    expect(row.length).toBeGreaterThan(10)
    for (let i = 1; i < row.length; i++) {
      const gap = row[i] - row[i - 1]
      if (gap > plantSpacingM * 1.6) continue
      expect(gap).toBeGreaterThan(plantSpacingM - 0.2)
      expect(gap).toBeLessThan(plantSpacingM + 0.2)
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

  it('no clock runs backward, each kind is a little ahead or behind, and every kind has the age of the plant at the end', () => {
    for (const { tier, count } of tiers) {
      for (let k = 0; k < count; k++) {
        let before = kindTime(0, k, tier)
        for (let tau = 0.05; tau <= growth.seconds; tau += 0.05) {
          const at = kindTime(tau, k, tier)
          expect(at, `${tier} ${k} at ${tau}`).toBeGreaterThanOrEqual(before - 1e-9)
          expect(at).toBeLessThan(tau + 3)
          expect(at).toBeGreaterThan(tau - 13)
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

  it('open after the plant, as a second wave: no yellow before bar 58.33, most by bar 61, all by bar 63, no two kinds on one frame', () => {
    const frames = Math.round(config.film.durationSeconds * 30)
    const firsts: number[] = []
    const opens: number[] = []
    let total = 0
    let openAt61 = 0
    for (const { tier, count } of tiers) {
      for (let k = 0; k < count; k++) {
        expect(kindTime(tauAtBar(58.33), k, tier), `${tier} ${k}`).toBeLessThan(FIRST_RAY_T)
        expect(kindTime(tauAtBar(63), k, tier), `${tier} ${k}`).toBeGreaterThanOrEqual(ALL_OPEN_T)
        let first = -1
        let open = -1
        let before = kindTime(tauAt(0), k, tier)
        for (let f = 1; f < frames; f++) {
          const at = kindTime(tauAt(f / 30), k, tier)
          expect(at).toBeGreaterThanOrEqual(before)
          expect(at - before, `${tier} ${k} frame ${f}`).toBeLessThan(0.12)
          if (first < 0 && at >= FIRST_RAY_T) first = f
          if (open < 0 && at >= ALL_OPEN_T) open = f
          before = at
        }
        expect(open - first, `${tier} ${k}`).toBeGreaterThanOrEqual(40)
        firsts.push(first)
        opens.push(open)
        total++
        if (kindTime(tauAtBar(61), k, tier) >= ALL_OPEN_T) openAt61++
      }
    }
    expect(new Set(firsts).size).toBe(firsts.length)
    expect(new Set(opens).size).toBe(opens.length)
    expect(openAt61 / total).toBeGreaterThan(0.75)
    // The plant's own rays are out before the first of the field's.
    expect(tauAt(Math.min(...firsts) / 30)).toBeGreaterThan(FIRST_RAY_T + 2.5)
  })

  it('has no step where a bud fills, opens, and ages: the clock of a kind is one unbroken line', () => {
    for (const { tier, count } of tiers) {
      for (let k = 0; k < count; k++) {
        for (const bar of OPENS[tier][k]) {
          const at = tauAtBar(bar)
          for (let d = -0.002; d <= 0.002; d += 0.00001) expect(Math.abs(kindTime(at + d + 0.00001, k, tier) - kindTime(at + d, k, tier)), `${tier} ${k} bar ${bar}`).toBeLessThan(0.002)
        }
        const bud = growth.bud
        expect(Math.abs(kindTime(bud + 1e-7, k, tier) - kindTime(bud - 1e-7, k, tier))).toBeLessThan(1e-5)
      }
    }
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

  // Every full neighbor's height at one bar of the film, lowest and highest. The few that are far behind in their rows are left out of the lowest.
  const heightsAt = (bar: number): { low: number; high: number; each: number[] } => {
    const tau = tauAtBar(bar)
    const st = statureAt(tau)
    const each: number[] = []
    let low = Infinity
    let high = 0
    const tiers = [{ tier: 'near' as const, list: places.near, kinds: nearVariants.length }, { tier: 'far' as const, list: places.far, kinds: farVariants.length }]
    for (const { tier, list, kinds } of tiers) {
      for (let k = 0; k < kinds; k++) {
        const mine = shareOf(list, k, kinds)
        const kindTall = heightAt(kindTime(tau, k, tier))
        for (let i = 0; i < mine.length; i += PLACE) {
          const own = ownOf(mine[i + 7])
          const h = sizeOf(st, mine[i + 3], mine[i + 6], own, kindTall, Math.hypot(mine[i], mine[i + 1])) * kindTall
          each.push(h)
          high = Math.max(high, h)
          if (own.young > 0.7) low = Math.min(low, h)
        }
      }
    }
    return { low, high, each }
  }

  it('is a young field under a towering plant in the storm, and stays under the lens on the way up', () => {
    const storm = heightsAt(35)
    const plant = heightAt(tauAtBar(35))
    expect(storm.low).toBeGreaterThan(0.44 * plant)
    expect(storm.high).toBeLessThan(0.505 * plant)
    for (let bar = 43; bar <= 55; bar += 0.25) expect(heightsAt(bar).high, `bar ${bar}`).toBeLessThan(rigAtFilm(barTime(bar)).heightM)
    // In bloom the field has its full size: the plant stands a little over it.
    const bloom = heightsAt(61)
    expect(bloom.high).toBeGreaterThan(0.8 * heightAt(tauAtBar(61)))
    expect(bloom.high).toBeLessThan(heightAt(tauAtBar(61)))
  })

  it('no neighbor ever gets shorter: every one of them, at every eighth of a bar', () => {
    let before = heightsAt(0).each
    for (let bar = 0.125; bar <= 75; bar += 0.125) {
      const now = heightsAt(bar).each
      let worst = 0
      for (let i = 0; i < now.length; i++) worst = Math.max(worst, before[i] - now[i])
      expect(worst, `bar ${bar}`).toBeLessThan(1e-6)
      before = now
    }
  })
})

describe('the part of each list a frame draws', () => {
  const lens = filmLens(16 / 9)
  const frames = lens.length / 5
  // The test each neighbor is given as it is drawn.
  const kept = (f: number, x: number, z: number): boolean => {
    const ox = x - lens[f * 5]
    const oz = z - lens[f * 5 + 1]
    const depth = ox * lens[f * 5 + 2] + oz * lens[f * 5 + 3]
    const side = Math.abs(oz * lens[f * 5 + 2] - ox * lens[f * 5 + 3])
    return !(depth < -ROOM_M || side > Math.max(depth, 0) * lens[f * 5 + 4] + ROOM_M * (1 + lens[f * 5 + 4]))
  }

  it('holds every neighbor the frame can see, at every frame, and few it cannot', () => {
    let sent = 0
    let seen = 0
    for (const list of [shareOf(places.near, 0, nearVariants.length), shareOf(places.far, 1, farVariants.length), shareOf(places.under, 2, 4)]) {
      const sorted = bySeen(list, lens)
      const need = needed(sorted, lens)
      expect([...sorted].sort()).toEqual([...list].sort())
      for (let f = 0; f < frames; f += 2) {
        let last = 0
        let inside = 0
        for (let k = 0; k < sorted.length / PLACE; k++) {
          if (!kept(f, sorted[k * PLACE], sorted[k * PLACE + 1])) continue
          last = k + 1
          inside++
        }
        expect(need[f]).toBeGreaterThanOrEqual(last)
        expect(inside).toBeGreaterThanOrEqual(0.75 * need[f])
        sent += need[f]
        seen += inside
      }
    }
    expect(seen / sent).toBeGreaterThan(0.9)
  })

  it('serves the film\'s own lens and no other', () => {
    const mine = lens.slice(1502 * 5, 1503 * 5)
    expect(frameOf(lens, 1502 / config.film.fps, mine)).toBe(1502)
    expect(frameOf(lens, 1502.4 / config.film.fps, mine)).toBe(1502)
    mine[0] += 0.5
    expect(frameOf(lens, 1502 / config.film.fps, mine)).toBe(-1)
    expect(frameOf(lens, 900 / config.film.fps, lens.slice(1502 * 5, 1503 * 5))).toBe(-1)
  })
})

describe('the field knows no scene of the first film', () => {
  it('reads no scene time', () => {
    const banned = /segmentById|segmentStart|config\.segments|config\.keys|config\.worlds|worldOf|growthline|director\/registry|director\/inputs|worlds\/|units\//
    for (const name of readdirSync('src/field')) expect(banned.test(readFileSync(`src/field/${name}`, 'utf8')), name).toBe(false)
  })
})
