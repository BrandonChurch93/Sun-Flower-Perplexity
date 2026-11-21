import { describe, expect, it } from 'vitest'
import { config } from '../src/config.ts'
import { continueBuild, emptyClock, markStatus, report, reportExtension, start, tick, tickExtension } from '../tools/lib/clock.ts'

const budget = config.budget
const HOUR = 3600 * 1000
const MIN = 60 * 1000
const order = Object.keys(budget.phaseHours).sort((a, b) => Number(a) - Number(b))
const box = (p: number) => budget.phaseHours[String(p)]

describe('the clock', () => {
  it('adds nothing at a start', () => {
    const s = emptyClock()
    start(s, 1000, 'a')
    expect(Object.keys(s.phases).length).toBe(0)
    tick(s, 0, 1000 + 10 * MIN, 'a')
    start(s, 1000 + 5 * HOUR, 'a')
    expect(s.phases['0']).toBeCloseTo(600, 6)
  })

  it('adds nothing on the first tick of a new machine boot', () => {
    const s = emptyClock()
    start(s, 0, 'a')
    tick(s, 0, 10 * MIN, 'a')
    expect(tick(s, 0, 9 * HOUR, 'b')).toBe(0)
    expect(s.phases['0']).toBeCloseTo(600, 6)
    expect(tick(s, 0, 9 * HOUR + 5 * MIN, 'b')).toBeCloseTo(300, 6)
  })

  it('counts every other gap in full, to the phase that was ticked', () => {
    const s = emptyClock()
    start(s, 0, 'a')
    tick(s, 0, 20 * MIN, 'a')
    tick(s, 1, 50 * MIN, 'a')
    tick(s, 0, 55 * MIN, 'a')
    expect(s.phases['0']).toBeCloseTo(25 * 60, 6)
    expect(s.phases['1']).toBeCloseTo(30 * 60, 6)
    expect(report(s, 1, budget).usedH).toBeCloseTo(55 / 60, 6)
  })

  it('switches the half point and the box end on the time the phase used itself', () => {
    const s = emptyClock()
    start(s, 0, 'a')
    tick(s, 0, (box(0) / 2) * HOUR - MIN, 'a')
    expect(report(s, 0, budget).halfPoint).toBe(false)
    tick(s, 0, (box(0) / 2) * HOUR, 'a')
    expect(report(s, 0, budget).halfPoint).toBe(true)
    expect(report(s, 0, budget).boxEnd).toBe(false)
    tick(s, 0, box(0) * HOUR, 'a')
    expect(report(s, 0, budget).boxEnd).toBe(true)
    expect(report(s, 1, budget).halfPoint).toBe(false)
    expect(report(s, 1, budget).boxEnd).toBe(false)
  })

  it('stops extra rounds once the whole build has used the boxes up to and including the phase', () => {
    const s = emptyClock()
    start(s, 0, 'a')
    const upTo2 = box(0) + box(1) + box(2)
    tick(s, 0, (box(0) + 0.25) * HOUR, 'a')
    expect(report(s, 0, budget).extraRounds).toBe(false)
    expect(report(s, 1, budget).extraRounds).toBe(true)
    tick(s, 2, upTo2 * HOUR - MIN, 'a')
    expect(report(s, 2, budget).extraRounds).toBe(true)
    tick(s, 2, upTo2 * HOUR, 'a')
    expect(report(s, 2, budget).extraRounds).toBe(false)
    expect(report(s, 3, budget).extraRounds).toBe(true)
  })

  it('calls the budget report due once the run hours are used', () => {
    const s = emptyClock()
    start(s, 0, 'a')
    tick(s, 3, budget.runHours * HOUR - MIN, 'a')
    const before = report(s, 3, budget)
    expect(before.budgetReportDue).toBe(false)
    expect(before.lines).toContain('budget report: not due')
    tick(s, 3, budget.runHours * HOUR, 'a')
    const after = report(s, 3, budget)
    expect(after.budgetReportDue).toBe(true)
    expect(after.lines).toContain('budget report: due')
  })

  it('calls a status overdue past the largest gap, and a status resets it', () => {
    const s = emptyClock()
    start(s, 0, 'a')
    tick(s, 0, budget.statusMaxGapMinutes * MIN, 'a')
    expect(report(s, 0, budget).statusOverdue).toBe(false)
    tick(s, 0, (budget.statusMaxGapMinutes + 1) * MIN, 'a')
    const late = report(s, 0, budget)
    expect(late.statusOverdue).toBe(true)
    expect(late.lines.some((l) => l.includes('status overdue'))).toBe(true)
    markStatus(s, (budget.statusMaxGapMinutes + 1) * MIN)
    expect(report(s, 0, budget).statusOverdue).toBe(false)
    expect(report(s, 0, budget).minutesSinceStatus).toBe(0)
  })

  it('gives the unfinished phases new boxes when the build is continued', () => {
    const s = emptyClock()
    start(s, 0, 'a')
    tick(s, 4, budget.runHours * HOUR, 'a')
    const done = [0, 1, 2, 3]
    const cont = continueBuild(s, 1, done, budget.runHours * HOUR + MIN, 'a', budget)
    const open = order.filter((p) => !done.includes(Number(p)))
    const openSum = open.reduce((a, p) => a + budget.phaseHours[p], 0)
    for (const p of order) {
      if (done.includes(Number(p))) expect(cont.boxes[p]).toBe(0)
      else expect(cont.boxes[p]).toBeCloseTo((budget.continueHours * budget.phaseHours[p]) / openSum, 9)
    }
    expect(Object.values(cont.boxes).reduce((a, b) => a + b, 0)).toBeCloseTo(budget.continueHours, 9)
    const fresh = report(s, 4, budget)
    expect(fresh.usedH).toBe(0)
    expect(fresh.allowedH).toBe(budget.continueHours)
    expect(fresh.budgetReportDue).toBe(false)
    expect(fresh.extraRounds).toBe(true)
    tick(s, 4, budget.runHours * HOUR + MIN + cont.boxes['4'] * HOUR, 'a')
    const used = report(s, 4, budget)
    expect(used.boxEnd).toBe(true)
    expect(used.extraRounds).toBe(false)
    expect(used.buildUsedH).toBeCloseTo(budget.runHours + cont.boxes['4'], 6)
    tick(s, 5, budget.runHours * HOUR + MIN + budget.continueHours * HOUR, 'a')
    expect(report(s, 5, budget).budgetReportDue).toBe(true)
  })

  it('keeps an extension apart from the build and never calls a budget report in it', () => {
    const s = emptyClock()
    start(s, 0, 'a')
    tick(s, 6, 2 * HOUR, 'a')
    tickExtension(s, 1, 2 * HOUR + budget.extendHours * HOUR - MIN, 'a')
    const running = reportExtension(s, 1, budget)
    expect(running.extraRounds).toBe(true)
    tickExtension(s, 1, 2 * HOUR + budget.extendHours * HOUR, 'a')
    const ended = reportExtension(s, 1, budget)
    expect(ended.extraRounds).toBe(false)
    expect(ended.lines.some((l) => l.includes('budget report'))).toBe(false)
    expect(report(s, 6, budget).usedH).toBeCloseTo(2, 6)
  })
})
