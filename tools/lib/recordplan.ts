import { segments } from '../../src/director/timeline.ts'

export const FILM = 'film'
export const UNIT_CRITICS = ['R1', 'R3', 'R4']
export const FILM_CRITICS = ['R5', 'R6', 'R7', 'R4', 'R2']

export interface SubPack { name: string; unit: string | null; critics: string[] }

export function subPacks(): SubPack[] {
  return [...segments.map((s) => ({ name: s.id, unit: s.id as string | null, critics: UNIT_CRITICS })), { name: FILM, unit: null, critics: FILM_CRITICS }]
}

export function recordSelection(only?: string[]): SubPack[] {
  const all = subPacks()
  if (!only || only.length === 0) return all
  const picked = new Map<string, Set<string>>()
  const add = (sub: SubPack, critic: string): void => {
    picked.set(sub.name, (picked.get(sub.name) ?? new Set()).add(critic))
  }
  const names = `${all.map((s) => s.name).join(', ')}; the units hold ${UNIT_CRITICS.join(', ')} and ${FILM} holds ${FILM_CRITICS.join(', ')}`
  for (const raw of only) {
    const item = raw.trim()
    if (item === '') continue
    const [head, tail, more] = item.split(':')
    if (more !== undefined) throw new Error(`--only "${item}" is not NAME, NAME:CRITIC or CRITIC`)
    const sub = all.find((s) => s.name.toLowerCase() === head.toLowerCase())
    if (tail === undefined) {
      if (sub) {
        for (const critic of sub.critics) add(sub, critic)
        continue
      }
      const critic = head.toUpperCase()
      const holders = all.filter((s) => s.critics.includes(critic))
      if (holders.length === 0) throw new Error(`--only "${item}" names no sub pack and no critic of the record round: ${names}`)
      for (const s of holders) add(s, critic)
      continue
    }
    if (!sub) throw new Error(`--only "${item}": there is no sub pack "${head}": ${names}`)
    const critic = tail.toUpperCase()
    if (!sub.critics.includes(critic)) throw new Error(`--only "${item}": the sub pack ${sub.name} holds ${sub.critics.join(', ')} in the record round`)
    add(sub, critic)
  }
  return all.filter((s) => picked.has(s.name)).map((s) => ({ ...s, critics: s.critics.filter((c) => picked.get(s.name)?.has(c)) }))
}
