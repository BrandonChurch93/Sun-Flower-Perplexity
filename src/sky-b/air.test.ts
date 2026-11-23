import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import type { RGB } from '../core/world.ts'
import { Air } from './air.ts'

const rgb = (): RGB => [0, 0, 0]

describe('sky air transport', () => {
  let air: Air

  before(() => { air = new Air() })

  it('keeps clear sun units and reddens the low path', () => {
    const high = air.sunAt(60, rgb())
    const low = air.sunAt(2, rgb())
    assert.ok(high[0] > 8.4 && high[0] < 9.5)
    assert.ok(high[2] > 6.7 && high[2] < 7.8)
    assert.ok(low[0] > 0.85 && low[0] < 1.5)
    assert.ok(low[2] < 0.05)
    assert.ok(low[2] / low[0] < high[2] / high[0])
  })

  it('keeps the night airglow and a blue midday zenith', () => {
    const day = air.skyAt(60, 1, Math.PI / 2, rgb())
    const night = air.skyAt(-18, 1, Math.PI / 2, rgb())
    assert.ok(day[0] > 0.18)
    assert.ok(day[2] > 1.0)
    assert.ok(day[2] / day[0] > 3.5)
    assert.ok(night[2] > 0.003 && night[2] < 0.009)
  })

  it('gives the same directional result after interleaving light queries', () => {
    const a = air.skyAt(-4.8, 0.047, 0.12, rgb())
    air.deckAt(14, rgb())
    air.sunAt(4.5, rgb(), true)
    air.moonAt(-18, rgb())
    assert.deepEqual(air.skyAt(-4.8, 0.047, 0.12, rgb()), a)
  })

  it('keeps a directional horizon glow at fourteen degrees below and eases through twilight', () => {
    const rim = air.skyAt(-14, 0.025, 0, rgb())
    const away = air.skyAt(-14, 0.025, 0.5, rgb())
    const above = air.skyAt(-14, 0.2, 0, rgb())
    assert.ok(rim[1] > 1.8 * away[1])
    assert.ok(rim[1] > 4 * above[1])
    for (let e = -13.5; e <= 0; e += 0.5) {
      assert.ok(air.skyAt(e, 0.025, 0, rgb())[1] > air.skyAt(e - 0.5, 0.025, 0, rgb())[1])
      assert.ok(air.moonAt(e, rgb())[0] <= air.moonAt(e - 0.5, rgb())[0])
    }
  })
})
