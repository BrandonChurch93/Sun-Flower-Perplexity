import { describe, expect, it } from 'vitest'
import { config, frameCount } from '../src/config.ts'
import { diagNames } from '../src/core/shading.ts'
import { VIEW, clampAzimuth, clampDolly, clampElevation, optionsFor, readOptions, writeOptions, type Mode } from '../src/director/modes.ts'
import { segments } from '../src/director/timeline.ts'

describe('readOptions', () => {
  it('keeps the defaults of every mode', () => {
    const live = readOptions('')
    expect(live.mode).toBe('live')
    expect(live.format).toBe(config.formats.preview)
    expect(live.tier).toBe('draft')
    expect(live.assets).toBe('web')
    expect(live.frame).toBe(0)
    expect(live.first).toBe(0)
    expect(live.last).toBe(frameCount - 1)
    expect(live.unit).toBeNull()
    expect(live.diag).toBe('beauty')
    expect(live.hold).toBe(false)
    expect(live.loop).toBe(false)
    expect(live.world).toBeNull()
    expect([live.az, live.el, live.dolly]).toEqual([0, 0, 1])
    expect(live.chosen).toEqual({ format: false, tier: false, assets: false })
    const auto = readOptions('?mode=autopilot')
    expect([auto.format.id, auto.tier, auto.assets]).toEqual([config.formats.preview.id, 'draft', 'web'])
    const capture = readOptions('?mode=capture')
    expect([capture.format.id, capture.tier, capture.assets]).toEqual([config.formats.master.id, 'draft', 'full'])
    const out = readOptions('?mode=export')
    expect([out.format.id, out.tier, out.assets]).toEqual([config.formats.master.id, 'final', 'full'])
  })

  it('falls back on what it does not know', () => {
    const o = readOptions('?mode=party&tier=best&assets=huge&unit=nope&diag=nope&world=mars&frame=abc&hold=maybe&loop=')
    expect(o.mode).toBe('live')
    expect(o.tier).toBe('draft')
    expect(o.assets).toBe('web')
    expect(o.unit).toBeNull()
    expect(o.diag).toBe('beauty')
    expect(o.world).toBeNull()
    expect(o.frame).toBe(0)
    expect(o.hold).toBe(false)
    expect(o.loop).toBe(false)
    expect(o.chosen).toEqual({ format: false, tier: false, assets: false })
  })

  it('reads the autopilot switches', () => {
    const o = readOptions(`?mode=autopilot&hold=1&loop=1&unit=${segments[1].id}&frame=12&tier=review`)
    expect(o.hold).toBe(true)
    expect(o.loop).toBe(true)
    expect(o.unit).toBe(segments[1].id)
    expect(o.frame).toBe(12)
    expect(o.tier).toBe('review')
    expect(o.chosen.tier).toBe(true)
  })

  it('clamps frames and the live view', () => {
    expect(readOptions('?frame=999999').frame).toBe(frameCount - 1)
    expect(readOptions('?frame=-5').frame).toBe(0)
    expect(readOptions('?frame=10.6').frame).toBe(11)
    expect(readOptions('?el=500').el).toBe(VIEW.elevationMaxDeg)
    expect(readOptions('?el=-500').el).toBe(VIEW.elevationMinDeg)
    expect(readOptions('?dolly=100').dolly).toBe(VIEW.dollyMax)
    expect(readOptions('?dolly=0.001').dolly).toBe(VIEW.dollyMin)
    expect(readOptions('?dolly=0').dolly).toBe(1)
    expect(readOptions('?dolly=-2').dolly).toBe(1)
    expect(readOptions('?az=540').az).toBe(-180)
    expect(readOptions('?az=-190').az).toBe(170)
    expect(readOptions('?az=Infinity&el=NaN&dolly=x').az).toBe(0)
    expect(readOptions('?az=Infinity&el=NaN&dolly=x').el).toBe(0)
    expect(readOptions('?az=Infinity&el=NaN&dolly=x').dolly).toBe(1)
  })

  it('reads every world and every diagnostic view', () => {
    for (const w of config.worlds) expect(readOptions(`?world=${w.id}`).world).toBe(w.id)
    for (const d of diagNames) expect(readOptions(`?diag=${d}`).diag).toBe(d)
  })
})

describe('the view limits', () => {
  it('rounds to steps that survive a trip through text', () => {
    expect(clampAzimuth(33.3333)).toBe(33.3)
    expect(clampAzimuth(-0.01)).toBe(0)
    expect(Object.is(clampAzimuth(-0.01), 0)).toBe(true)
    expect(clampElevation(12.26)).toBe(12.3)
    expect(clampDolly(1.23456)).toBe(1.235)
    for (const v of [0.1, 0.7, 12.3, -179.9, 59.9]) expect(Number(String(clampAzimuth(v)))).toBe(clampAzimuth(v))
  })
})

describe('writeOptions', () => {
  it('writes nothing for the defaults', () => {
    expect(writeOptions(readOptions(''))).toBe('')
    for (const mode of ['autopilot', 'capture', 'export'] as Mode[]) expect(writeOptions(readOptions(`?mode=${mode}`))).toBe(`?mode=${mode}`)
  })

  it('reads back as the same options', () => {
    const queries = [
      '',
      '?mode=autopilot&hold=1&format=preview',
      `?mode=autopilot&unit=${segments[2].id}&loop=1&tier=review`,
      `?frame=437&world=${config.worlds[3].id}&az=-42.5&el=18.2&dolly=1.75&diag=depth&tier=final&assets=full&format=${config.formats.master.id}`,
      '?mode=export&format=uhd&first=30&last=90',
      '?mode=capture&assets=web&diag=texels',
      '?tier=draft&format=preview&assets=web',
      '?az=721.26&el=99&dolly=9',
    ]
    for (const q of queries) {
      const a = readOptions(q)
      const b = readOptions(writeOptions(a))
      expect(b).toEqual(a)
      expect(writeOptions(b)).toBe(writeOptions(a))
    }
  })

  it('keeps a choice somebody made even when it equals the default', () => {
    expect(writeOptions(readOptions('?tier=draft'))).toBe('?tier=draft')
    expect(writeOptions(readOptions('?assets=web&format=preview'))).toContain('assets=web')
    expect(writeOptions(readOptions('?assets=web&format=preview'))).toContain('format=preview')
  })
})

describe('optionsFor', () => {
  it('carries the choices, the frame and the unit to another mode', () => {
    const from = readOptions(`?format=${config.formats.master.id}&tier=review&assets=full&frame=300&unit=${segments[1].id}&az=30&world=${config.worlds[0].id}`)
    const to = optionsFor('autopilot', from)
    expect(to.mode).toBe('autopilot')
    expect(to.format).toBe(config.formats.master)
    expect(to.tier).toBe('review')
    expect(to.assets).toBe('full')
    expect(to.frame).toBe(300)
    expect(to.unit).toBe(segments[1].id)
    expect([to.az, to.el, to.dolly, to.world]).toEqual([0, 0, 1, null])
    expect(readOptions(writeOptions(to))).toEqual(to)
  })

  it('leaves the defaults of the new mode alone when nothing was chosen', () => {
    const to = optionsFor('export', readOptions('?frame=12'))
    expect([to.format.id, to.tier, to.assets]).toEqual([config.formats.master.id, 'final', 'full'])
    expect(writeOptions(to)).toBe('?mode=export&frame=12')
  })
})
