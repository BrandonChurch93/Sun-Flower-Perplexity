import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { blankMoment } from '../v2/now.ts'
import { direction } from '../v2/sun.ts'
import { make } from './index.ts'

describe('photographed solar centre', () => {
  it('lifts the normalized mid-shutter direction at the last sunset without mutating the moments', () => {
    const open = blankMoment(), close = blankMoment()
    open.sunElevationDeg = -0.85
    close.sunElevationDeg = -0.65
    open.dials.evening = 1
    direction(208.2, open.sunElevationDeg, open.sun)
    direction(208.6, close.sunElevationDeg, close.sun)
    const a = open.sun.clone(), b = close.sun.clone()
    const mid = a.clone().lerp(b, 0.5).normalize()
    const out = new THREE.Vector3()
    const sky = make()
    expect(sky.face!(open, close, out)).toBe(out)
    expect(out.length()).toBeCloseTo(1, 14)
    expect(out.y - mid.y).toBeGreaterThan(0.016)
    expect(Math.atan2(out.x, out.z)).toBeCloseTo(Math.atan2(mid.x, mid.z), 14)
    expect(open.sun.equals(a) && close.sun.equals(b)).toBe(true)
    expect(sky.face!(open, close, new THREE.Vector3(1, 1, 1)).equals(out)).toBe(true)
  })

  it('leaves midday and a sun well under the horizon in their geometric directions', () => {
    const sky = make()
    for (const elevation of [40, -3]) {
      const open = blankMoment(), close = blankMoment()
      open.sunElevationDeg = close.sunElevationDeg = elevation
      direction(205, elevation, open.sun)
      direction(206, elevation, close.sun)
      const mid = open.sun.clone().lerp(close.sun, 0.5).normalize()
      expect(sky.face!(open, close, new THREE.Vector3()).distanceTo(mid)).toBeLessThan(1e-14)
    }
  })
})
