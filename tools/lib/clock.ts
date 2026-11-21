import type { Budget } from '../../src/config.ts'

export interface Continuation { n: number; at: number; boxes: Record<string, number>; used: Record<string, number> }
export interface ClockState {
  version: 1
  boot: string | null
  last: number | null
  phases: Record<string, number>
  sinceStatus: number
  lastStatusAt: string | null
  continuations: Continuation[]
  extensions: Record<string, number>
  log: { at: string; kind: string; id?: number; addedSeconds: number }[]
}

export function emptyClock(): ClockState {
  return { version: 1, boot: null, last: null, phases: {}, sinceStatus: 0, lastStatusAt: null, continuations: [], extensions: {}, log: [] }
}

function iso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z')
}

export function start(state: ClockState, now: number, boot: string): ClockState {
  state.last = now
  state.boot = boot
  state.log.push({ at: iso(now), kind: 'start', addedSeconds: 0 })
  return state
}

function elapsed(state: ClockState, now: number, boot: string): number {
  const fresh = state.last === null || state.boot !== boot
  const added = fresh ? 0 : Math.max(0, (now - (state.last as number)) / 1000)
  state.last = now
  state.boot = boot
  return added
}

export function tick(state: ClockState, phase: number, now: number, boot: string): number {
  const added = elapsed(state, now, boot)
  const key = String(phase)
  state.phases[key] = (state.phases[key] ?? 0) + added
  const cont = state.continuations[state.continuations.length - 1]
  if (cont) cont.used[key] = (cont.used[key] ?? 0) + added
  state.sinceStatus += added
  state.log.push({ at: iso(now), kind: 'phase', id: phase, addedSeconds: Math.round(added) })
  return added
}

export function tickExtension(state: ClockState, n: number, now: number, boot: string): number {
  const added = elapsed(state, now, boot)
  const key = String(n)
  state.extensions[key] = (state.extensions[key] ?? 0) + added
  state.sinceStatus += added
  state.log.push({ at: iso(now), kind: 'extension', id: n, addedSeconds: Math.round(added) })
  return added
}

export function continueBuild(state: ClockState, n: number, donePhases: number[], now: number, boot: string, budget: Budget): Continuation {
  elapsed(state, now, boot)
  const open = Object.keys(budget.phaseHours).filter((p) => !donePhases.includes(Number(p)))
  const total = open.reduce((a, p) => a + budget.phaseHours[p], 0)
  const boxes: Record<string, number> = {}
  for (const p of Object.keys(budget.phaseHours)) boxes[p] = open.includes(p) && total > 0 ? (budget.continueHours * budget.phaseHours[p]) / total : 0
  const cont: Continuation = { n, at: now, boxes, used: {} }
  state.continuations.push(cont)
  state.log.push({ at: iso(now), kind: 'continue', id: n, addedSeconds: 0 })
  return cont
}

export function markStatus(state: ClockState, now: number): void {
  state.sinceStatus = 0
  state.lastStatusAt = iso(now)
}

export interface Report {
  phaseUsedH: number
  phaseBoxH: number
  usedH: number
  allowedH: number
  buildUsedH: number
  extraRounds: boolean
  halfPoint: boolean
  boxEnd: boolean
  budgetReportDue: boolean
  minutesSinceStatus: number
  statusOverdue: boolean
  lines: string[]
}

const h = (seconds: number) => seconds / 3600
const fmt = (hours: number) => hours.toFixed(2)

export function report(state: ClockState, phase: number, budget: Budget): Report {
  const key = String(phase)
  const cont = state.continuations[state.continuations.length - 1]
  const order = Object.keys(budget.phaseHours).sort((a, b) => Number(a) - Number(b))
  const boxes = cont ? cont.boxes : budget.phaseHours
  const usedBy = cont ? cont.used : state.phases
  const usedH = h(Object.values(usedBy).reduce((a, b) => a + b, 0))
  const buildUsedH = h(Object.values(state.phases).reduce((a, b) => a + b, 0))
  const allowedH = cont ? budget.continueHours : budget.runHours
  const phaseUsedH = h(usedBy[key] ?? 0)
  const phaseBoxH = boxes[key] ?? 0
  const upTo = order.filter((p) => Number(p) <= phase).reduce((a, p) => a + (boxes[p] ?? 0), 0)
  const extraRounds = usedH < upTo
  const halfPoint = phaseUsedH >= phaseBoxH / 2
  const boxEnd = phaseUsedH >= phaseBoxH
  const budgetReportDue = usedH >= allowedH
  const minutesSinceStatus = state.sinceStatus / 60
  const statusOverdue = minutesSinceStatus > budget.statusMaxGapMinutes
  const lines = [
    `phase ${phase}: ${fmt(phaseUsedH)} h used of its ${fmt(phaseBoxH)} h box`,
    cont
      ? `continuation ${cont.n}: ${fmt(usedH)} h used of ${fmt(allowedH)} h allowed (whole build so far ${fmt(buildUsedH)} h)`
      : `whole build: ${fmt(usedH)} h used of ${fmt(allowedH)} h allowed`,
    `extra rounds: ${extraRounds ? 'yes' : 'no'}`,
    `half point: ${halfPoint ? 'reached' : 'not reached'}`,
    `box end: ${boxEnd ? 'reached' : 'not reached'}`,
    `budget report: ${budgetReportDue ? 'due' : 'not due'}`,
    `since the last status: ${minutesSinceStatus.toFixed(0)} min${statusOverdue ? ' · status overdue' : ''}`,
  ]
  return { phaseUsedH, phaseBoxH, usedH, allowedH, buildUsedH, extraRounds, halfPoint, boxEnd, budgetReportDue, minutesSinceStatus, statusOverdue, lines }
}

export function reportExtension(state: ClockState, n: number, budget: Budget): { usedH: number; extraRounds: boolean; lines: string[] } {
  const usedH = h(state.extensions[String(n)] ?? 0)
  const extraRounds = usedH < budget.extendHours
  const minutesSinceStatus = state.sinceStatus / 60
  const statusOverdue = minutesSinceStatus > budget.statusMaxGapMinutes
  return {
    usedH,
    extraRounds,
    lines: [
      `extension ${n}: ${fmt(usedH)} h used of ${fmt(budget.extendHours)} h allowed`,
      `extra rounds: ${extraRounds ? 'yes' : 'no'}`,
      `since the last status: ${minutesSinceStatus.toFixed(0)} min${statusOverdue ? ' · status overdue' : ''}`,
    ],
  }
}

export function clockTable(state: ClockState, budget: Budget): string {
  const order = Object.keys(budget.phaseHours).sort((a, b) => Number(a) - Number(b))
  const rows = ['| Phase | Planned box | Time used |', '| --- | --- | --- |']
  for (const p of order) rows.push(`| ${p} | ${fmt(budget.phaseHours[p])} h | ${fmt(h(state.phases[p] ?? 0))} h |`)
  const total = h(Object.values(state.phases).reduce((a, b) => a + b, 0))
  rows.push(`| Whole build | ${fmt(budget.runHours)} h | ${fmt(total)} h |`)
  const extra: string[] = []
  for (const c of state.continuations) {
    const used = h(Object.values(c.used).reduce((a, b) => a + b, 0))
    const boxes = order.filter((p) => c.boxes[p] > 0).map((p) => `${p}: ${fmt(c.boxes[p])} h`).join(', ')
    extra.push(`- Continuation ${c.n}, started ${iso(c.at)}: ${fmt(used)} h used of ${fmt(budget.continueHours)} h. New boxes: ${boxes}.`)
  }
  for (const [n, s] of Object.entries(state.extensions)) extra.push(`- Extension ${n}: ${fmt(h(s))} h used of ${fmt(budget.extendHours)} h.`)
  return rows.join('\n') + (extra.length ? '\n\n' + extra.join('\n') : '')
}
