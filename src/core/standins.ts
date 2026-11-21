import { config } from '../config.ts'

export interface StandIn { name: string; units: string[] }

const list = new Map<string, string[]>()

export const allUnits = (): string[] => config.segments.map((s) => s.id)

export function declareStandIn(name: string, units: string[] = allUnits()): void {
  list.set(name, units.slice())
}

export function endStandIn(name: string): void {
  list.delete(name)
}

export function standIns(): StandIn[] {
  return Array.from(list.entries())
    .map(([name, units]) => ({ name, units }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
