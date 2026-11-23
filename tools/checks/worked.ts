import { spawnSync } from 'node:child_process'
import type { Args } from '../lib/args.ts'
import { flag, str } from '../lib/args.ts'
import { barText, FRAMES, secondsOf } from './lib/film.ts'
import { run as inside } from './inside.ts'
import { finish, table, type Finding } from './lib/report.ts'
import { openSession } from './lib/session.ts'
import type { Worked } from './page/main.ts'

// What a frame costs with nothing made and nothing written: the work three.js and the graphics card do the first time they meet something.
//   npm run checks -- worked --at 849,1260,3318
// After the film's own warming, for each frame named: the two frames before it are drawn, then the frame, then the frame once more, then the one after.
// For each of the four it prints the script time and the time inside renderer.render, and beside the frame before it names
// the programs drawn with for the first time since the page loaded, the questions the page stood still for (three.js asks the card for a program's uniforms and places at its first use), and the materials three.js looked up afresh, with the mark that changed.
// The frame drawn once more shows what the frame costs when all of that is behind it: the difference is the price of meeting it in play.
// The milliseconds are wall time on this machine: run it alone. It judges nothing; `script` holds the limits.

// Where the script's time went in one frame, read by the browser's own sampler every tenth of a millisecond: each function with the time in itself (`self`) and with all it calls (`whole`), named with its caller.
interface Spent { name: string; self: number; whole: number }
interface Profile { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }[]; samples?: number[]; timeDeltas?: number[] }

function spent(profile: Profile): Spent[] {
  const parent = new Map<number, number>()
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const label = (id: number): string => {
    const n = byId.get(id)
    if (!n) return ''
    return n.callFrame.functionName || (n.callFrame.url ? `(no name, line ${n.callFrame.lineNumber + 1})` : '(the browser)')
  }
  const out = new Map<string, Spent>()
  const samples = profile.samples ?? []
  const deltas = profile.timeDeltas ?? []
  for (let i = 0; i < samples.length; i++) {
    const ms = (deltas[i] ?? 0) / 1000
    const seen = new Set<string>()
    for (let id: number | undefined = samples[i], leaf = true; id !== undefined; id = parent.get(id), leaf = false) {
      const up = parent.get(id)
      const name = `${label(id)}${up !== undefined && label(up) ? ` < ${label(up)}` : ''}`
      const line = out.get(name) ?? { name, self: 0, whole: 0 }
      if (leaf) line.self += ms
      if (!seen.has(name)) line.whole += ms
      seen.add(name)
      out.set(name, line)
    }
  }
  return [...out.values()]
}

interface Read { frame: number; label: string; script: number; scene: number; shadow: number; parts: Record<string, number>; worked: Worked; spent: Spent[] }

const PARTS_OUT = new Set(['script', 'wait', 'draw', 'drawScene', 'drawShadow'])

export async function run(args: Args): Promise<void> {
  if (flag(args, 'inside')) return inside(args)
  const at = str(args, 'at', '849,1260,3318').split(',').filter(Boolean).map(Number).filter((f) => Number.isInteger(f) && f >= 3 && f < FRAMES - 1)
  const tier = str(args, 'tier', 'draft')
  const busy = Number(spawnSync('pgrep', ['-c', '-f', 'type=gpu-process'], { encoding: 'utf8' }).stdout.trim()) || 0
  if (busy) console.log(`worked · NOT ALONE: ${busy} other pages are drawing on this machine now, so the milliseconds are too large`)
  const findings: Finding[] = []
  const rows: (string | number)[][] = []
  const data: { frame: number; reads: Read[] }[] = []
  const session = await openSession({ plain: true, work: true, named: true })
  const cdp = await session.page.context().newCDPSession(session.page)
  try {
    const t0 = Date.now()
    await session.warm(tier)
    await session.cost()
    const warmed = await session.worked()
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 })
    console.log(`worked · ${session.info.width} x ${session.info.height} · ${tier} · loaded in ${session.startSeconds.toFixed(1)} s, warmed in ${((Date.now() - t0) / 1000).toFixed(1)} s · the loading and warming drew with ${warmed.programs.length} programs`)
    for (const f of at) {
      const reads: Read[] = []
      const one = async (frame: number, label: string): Promise<void> => {
        const sampled = label !== 'lead'
        if (sampled) await cdp.send('Profiler.start')
        await session.draw(frame, tier, false)
        const profile = sampled ? ((await cdp.send('Profiler.stop')) as unknown as { profile: Profile }).profile : null
        const cost = await session.cost()
        const worked = await session.worked()
        reads.push({ frame, label, script: cost.script ?? 0, scene: cost.drawScene ?? 0, shadow: cost.drawShadow ?? 0, parts: Object.fromEntries(Object.entries(cost).filter(([k]) => !PARTS_OUT.has(k))), worked, spent: profile ? spent(profile) : [] })
      }
      await one(f - 3, 'lead')
      await one(f - 2, 'lead')
      await one(f - 1, 'before')
      await one(f, 'the frame')
      await one(f, 'once more')
      await one(f + 1, 'after')
      data.push({ frame: f, reads })
      const [, , before, here, again, after] = reads
      const asked = (r: Read): number => r.worked.asks.reduce((a, x) => a + x.ms, 0)
      const looked = (r: Read): number => r.worked.materials.reduce((a, x) => a + x.calls, 0)
      console.log(`\nworked · frame ${f} (${barText(secondsOf(f))})`)
      console.log(table(['drawn', 'frame', 'script ms', 'scene draw', 'shadow draw', 'heaviest parts', 'programs first drawn with', 'questions', 'ms in them', 'materials looked up'], [before, here, again, after].map((r) => [r.label, r.frame, r.script.toFixed(1), r.scene.toFixed(1), r.shadow.toFixed(1), Object.entries(r.parts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', '), r.worked.programs.filter((p) => p.first).length, r.worked.asks.reduce((a, x) => a + x.calls, 0), asked(r).toFixed(1), looked(r)])))
      for (const r of [before, here, again, after]) rows.push([f, r.label, r.frame, r.script.toFixed(1), r.scene.toFixed(1), r.shadow.toFixed(1), r.worked.programs.filter((p) => p.first).length, asked(r).toFixed(1), looked(r)])
      const owner = (name: string): string => here.worked.owners[name.replace(/ \(program \d+\)$/, '')] ?? 'not in the scene (a pass of the film)'
      const first = here.worked.programs.filter((p) => p.first)
      const beforeAsks = new Map(before.worked.asks.map((a) => [`${a.name} ${a.about}`, a]))
      const asks = here.worked.asks.filter((a) => a.calls > (beforeAsks.get(`${a.name} ${a.about}`)?.calls ?? 0)).sort((a, b) => b.ms - a.ms)
      const beforeLooked = new Map(before.worked.materials.map((m) => [m.name, m.calls]))
      const fresh = here.worked.materials.filter((m) => m.calls > (beforeLooked.get(m.name) ?? 0))
      const beforeDrawn = new Set(before.worked.programs.map((p) => p.name))
      const enter = here.worked.programs.filter((p) => !beforeDrawn.has(p.name) && !p.first)
      const callsOf = (r: Read): Map<string, { calls: number; ms: number }> => new Map(r.worked.calls.map((c) => [c.name, c]))
      const [cb, ch, ca] = [callsOf(before), callsOf(here), callsOf(again)]
      const heavy = here.worked.calls.filter((c) => c.ms >= 0.2 || c.ms - (ca.get(c.name)?.ms ?? 0) >= 0.1).sort((a, b) => b.ms - a.ms)
      const sum = (m: Map<string, { calls: number; ms: number }>): number => [...m.values()].reduce((a, c) => a + c.ms, 0)
      console.log(`worked · ${f} · the page's time inside calls to the card: ${sum(ch).toFixed(1)} ms here, ${sum(cb).toFixed(1)} the frame before, ${sum(ca).toFixed(1)} drawn once more; the questions it waits on: ${here.worked.asks.filter((a) => a.ms >= 1).map((a) => `${a.name} ${a.ms.toFixed(0)} ms`).join(', ') || 'none of 1 ms'}`)
      if (heavy.length) console.log(table(['call', 'times here', 'ms here', 'times before', 'ms before', 'times once more', 'ms once more'], heavy.slice(0, 16).map((c) => [c.name, c.calls, c.ms.toFixed(2), cb.get(c.name)?.calls ?? 0, (cb.get(c.name)?.ms ?? 0).toFixed(2), ca.get(c.name)?.calls ?? 0, (ca.get(c.name)?.ms ?? 0).toFixed(2)])))
      const idle = /^\((idle|program|garbage collector|root)\)|^\(the browser\)$/
      const was = (r: Read, name: string): Spent | undefined => r.spent.find((x) => x.name === name)
      const selfTop = here.spent.filter((x) => !idle.test(x.name)).sort((a, b) => b.self - a.self).slice(0, 14)
      const wholeTop = here.spent.filter((x) => !idle.test(x.name) && x.whole - (was(before, x.name)?.whole ?? 0) >= 1).sort((a, b) => b.whole - (was(before, b.name)?.whole ?? 0) - (a.whole - (was(before, a.name)?.whole ?? 0))).slice(0, 24)
      console.log(`worked · ${f} · where the script's time went, by the browser's sampler (ms in the function itself):\n${table(['function < its caller', 'here', 'before', 'once more', 'after'], selfTop.map((x) => [x.name, x.self.toFixed(1), (was(before, x.name)?.self ?? 0).toFixed(1), (was(again, x.name)?.self ?? 0).toFixed(1), (was(after, x.name)?.self ?? 0).toFixed(1)]))}`)
      console.log(`worked · ${f} · functions that took at least 1 ms more than in the frame before, with all they call:\n${table(['function < its caller', 'here', 'before', 'once more', 'after'], wholeTop.map((x) => [x.name, x.whole.toFixed(1), (was(before, x.name)?.whole ?? 0).toFixed(1), (was(again, x.name)?.whole ?? 0).toFixed(1), (was(after, x.name)?.whole ?? 0).toFixed(1)]))}`)
      if (first.length) console.log(`worked · ${f} · drawn with for the first time since the page loaded:\n${table(['program', 'draws', 'whose'], first.map((p) => [p.name, p.draws, owner(p.name)]))}`)
      if (enter.length) console.log(`worked · ${f} · drawn with here and not in the frame before, though met in the warming:\n${table(['program', 'draws', 'whose'], enter.map((p) => [p.name, p.draws, owner(p.name)]))}`)
      if (asks.length) console.log(`worked · ${f} · questions the page stood still for, more than in the frame before:\n${table(['question', 'about', 'calls', 'ms', 'whose'], asks.slice(0, 40).map((a) => [a.name, a.about || 'the card', a.calls, a.ms.toFixed(2), a.about ? owner(a.about) : '']))}`)
      if (fresh.length) console.log(`worked · ${f} · materials three.js looked up afresh, more than in the frame before:\n${table(['material', 'kind', 'times', 'what changed', 'whose'], fresh.slice(0, 60).map((m) => [m.name, m.kind, m.calls, m.changed.join('; ') || 'no mark of its own: the state round it', owner(m.name)]))}`)
      findings.push({ ok: true, expected: true, what: `frame ${f}: script ${here.script.toFixed(1)} ms (scene draw ${here.scene.toFixed(1)}) against ${before.script.toFixed(1)} (${before.scene.toFixed(1)}) the frame before and ${again.script.toFixed(1)} (${again.scene.toFixed(1)}) drawn once more; ${first.length} programs drawn with for the first time${first.length ? ` (${first.slice(0, 8).map((p) => p.name).join(', ')})` : ''}, ${asked(here).toFixed(1)} ms in ${here.worked.asks.reduce((a, x) => a + x.calls, 0)} questions against ${asked(before).toFixed(1)} ms, ${looked(here)} materials looked up against ${looked(before)}${fresh.length ? ` (${fresh.slice(0, 8).map((m) => m.name).join(', ')})` : ''}` })
    }
  } finally {
    await session.close()
  }
  if (busy) findings.push({ ok: true, expected: true, what: `measured beside ${busy} other pages drawing: the milliseconds are too large, the names are right` })
  finish({
    check: 'worked',
    name: `worked.${at.join('.')}`,
    sentence: 'no frame rate drop: what a frame costs the first time the film meets something, with nothing made and nothing written',
    subject: 'the film',
    broken: null,
    complete: true,
    findings,
    table: { head: ['at', 'drawn', 'frame', 'script ms', 'scene draw', 'shadow draw', 'programs first drawn with', 'ms in questions', 'materials looked up'], rows },
    data: { tier, busy, frames: data },
  })
}
