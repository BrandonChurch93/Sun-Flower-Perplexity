import fs from 'node:fs'
import path from 'node:path'
import { config, frameCount } from '../src/config.ts'
import { heightAt } from '../src/plant/model.ts'
import { barTime } from '../src/v2/clock.ts'
import { blankMoment, momentAt } from '../src/v2/now.ts'

const out = process.argv[2] ?? 'out/work/filmclock.csv'
const m = blankMoment()
const names = Object.keys(m.dials) as (keyof typeof m.dials)[]
const lines = [['frame', 't', 'bar', 'tau', 'heightM', 'world', 'sunElevationDeg', 'sunAzimuthDeg', 'night', 'light', 'cloudKm', ...names].join(',')]
for (let f = 0; f < frameCount; f++) {
  momentAt(f / config.film.fps, m)
  const row = [f, m.t.toFixed(4), m.bar.toFixed(4), m.tau.toFixed(4), heightAt(m.tau).toFixed(4), m.world.toFixed(5), m.sunElevationDeg.toFixed(3), m.sunAzimuthDeg.toFixed(3), m.night.toFixed(3), m.lightKind, Math.hypot(m.cloud.shiftX, m.cloud.shiftZ).toFixed(3), ...names.map((n) => m.dials[n].toFixed(4))]
  lines.push(row.join(','))
}
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, lines.join('\n') + '\n')
const marks = config.sections.map((s) => `${s.name} bar ${s.fromBar} at ${barTime(s.fromBar).toFixed(3)} s`)
console.log(`${frameCount} frames written to ${out}\n${marks.join('\n')}`)
