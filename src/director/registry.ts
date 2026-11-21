import { config } from '../config.ts'
import type { WorldDef, WorldSettings } from '../core/world.ts'
import { declareStandIn } from '../core/standins.ts'
import type { UnitFit } from './fit.ts'

const worldModules = import.meta.glob<{ world: WorldSettings }>('../worlds/*/index.ts', { eager: true })
const unitModules = import.meta.glob<{ fit: UnitFit }>('../units/*/index.ts', { eager: true })

const folder = (path: string): string => path.split('/').slice(-2)[0]

export const worlds: Record<string, WorldDef> = {}
for (const [path, module] of Object.entries(worldModules)) worlds[folder(path)] = { ...module.world, id: folder(path) }

export const fits: Record<string, UnitFit> = {}
for (const [path, module] of Object.entries(unitModules)) fits[folder(path)] = module.fit

for (const w of config.worlds) {
  const def = worlds[w.id]
  if (!def) throw new Error(`src/worlds/${w.id}/index.ts is missing`)
  if (def.standIn) declareStandIn(`world ${w.id}`, config.segments.filter((s) => s.world === w.id).map((s) => s.id))
}
for (const s of config.segments) if (!fits[s.id]) throw new Error(`src/units/${s.id}/index.ts is missing`)

export function worldOf(id: string): WorldDef {
  const def = worlds[id]
  if (!def) throw new Error(`unknown world "${id}"`)
  return def
}

export function fNumberPoints(): [number, number][] {
  const points: [number, number][] = []
  for (const s of config.segments) {
    const fit = fits[s.id].fNumber
    const keys = config.keys.filter((k) => k.unit === s.id)
    if (fit.keys.length !== keys.length) throw new Error(`src/units/${s.id} gives ${fit.keys.length} f-numbers for ${keys.length} keys`)
    if (fit.start !== undefined) points.push([s.start, fit.start])
    keys.forEach((k, i) => points.push([k.time, fit.keys[i]]))
    if (fit.end !== undefined) points.push([s.end - 1 / config.film.fps, fit.end])
  }
  points.sort((a, b) => a[0] - b[0])
  return points.filter((p, i) => i === 0 || p[0] > points[i - 1][0])
}
