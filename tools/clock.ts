import fs from 'node:fs'
import { config } from '../src/config.ts'
import { parseArgs, flag } from './lib/args.ts'
import { CLOCK_FILE } from './lib/paths.ts'
import { clockTable, continueBuild, emptyClock, markStatus, report, reportExtension, start, tick, tickExtension, type ClockState } from './lib/clock.ts'
import { donePhases, readProgress, setSection, writeProgress } from './lib/progress.ts'

export function bootId(): string {
  try {
    return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
  } catch {
    return 'unknown-boot'
  }
}

export function loadClock(): ClockState {
  return fs.existsSync(CLOCK_FILE) ? (JSON.parse(fs.readFileSync(CLOCK_FILE, 'utf8')) as ClockState) : emptyClock()
}

export function saveClock(state: ClockState): void {
  fs.writeFileSync(CLOCK_FILE, JSON.stringify(state, null, 1) + '\n')
}

export function writeClockTable(state: ClockState): void {
  const intro = 'Copied from the output of `npm run clock` at every status. Working time only.'
  const tail = 'Continuations and extensions are listed under this table with their own hours.'
  writeProgress(setSection(readProgress(), 'Clock', `${intro}\n\n${clockTable(state, config.budget)}\n\n${tail}`))
}

function main(): void {
  const args = parseArgs()
  const state = loadClock()
  const now = typeof args.at === 'string' ? Date.parse(args.at) : Date.now()
  const boot = bootId()
  const stamp = new Date(now).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
  if (flag(args, 'start')) {
    start(state, now, boot)
    saveClock(state)
    console.log(`clock · task start marked at ${stamp}. No time added.`)
    return
  }
  if (args.continue !== undefined) {
    const n = Number(args.continue)
    const done = typeof args.done === 'string' ? args.done.split(',').map(Number) : donePhases(readProgress())
    const cont = continueBuild(state, n, done, now, boot, config.budget)
    saveClock(state)
    writeClockTable(state)
    console.log(`clock · continuation ${n} recorded at ${stamp}. New boxes: ${Object.entries(cont.boxes).filter(([, v]) => v > 0).map(([p, v]) => `${p}: ${v.toFixed(2)} h`).join(', ')}`)
    return
  }
  if (args.extension !== undefined) {
    const n = Number(args.extension)
    const added = flag(args, 'show') ? 0 : tickExtension(state, n, now, boot)
    const r = reportExtension(state, n, config.budget)
    console.log(`clock · extension ${n} · ${stamp} · added ${(added / 60).toFixed(1)} min`)
    for (const line of r.lines) console.log(line)
    if (flag(args, 'status')) markStatus(state, now)
    saveClock(state)
    writeClockTable(state)
    return
  }
  if (args.phase !== undefined) {
    const phase = Number(args.phase)
    if (!(String(phase) in config.budget.phaseHours)) throw new Error(`unknown phase ${args.phase}`)
    const added = flag(args, 'show') ? 0 : tick(state, phase, now, boot)
    const r = report(state, phase, config.budget)
    console.log(`clock · phase ${phase} · ${stamp} · added ${(added / 60).toFixed(1)} min`)
    for (const line of r.lines) console.log(line)
    if (flag(args, 'status')) markStatus(state, now)
    saveClock(state)
    writeClockTable(state)
    return
  }
  console.log('usage: npm run clock -- --start | --phase N [--status] [--show] | --continue N | --extension N [--status]')
  process.exitCode = 1
}

if (process.argv[1] && process.argv[1].endsWith('clock.ts')) main()
