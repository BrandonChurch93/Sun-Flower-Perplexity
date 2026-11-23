import { spawnSync } from 'node:child_process'
import type { Args } from '../lib/args.ts'
import { str } from '../lib/args.ts'
import { barText, FRAMES, secondsOf } from './lib/film.ts'
import { startRecording, stopRecording } from './lib/recorder.ts'
import { finish, table, type Finding } from './lib/report.ts'
import { openSession } from './lib/session.ts'
import { owned, top } from './writes.ts'

// Who costs what, for a list of spans in one call: one line an owner and a span.
//   npm run checks -- owners --spans 1255-1275,2078-2095,3000-3010
// Each span is drawn twice in a row after the film's own warming. The first pass reads the film's own laps (film.cost): the milliseconds of script by part, as `script` reads them.
// The second pass notes every write into a buffer or a texture, as `writes` does, and names its owner. The passes are apart because noting a write asks the graphics card a question, which costs time.
// Under the lines of a span stands every owner's share of its heaviest frame, and of each frame named with --at 849,1260, for which every write of 0.005 MB or more is named.
// The frame before a span is drawn first and not counted: a span starts after a jump.
// Time and bytes do not sit in the same line by chance: a part lays its arrays in its own lap, and the card takes them inside renderer.render, which is the line `scene`.
// The numbers are wall time on this machine: run it alone. It judges nothing: `script` and `writes --from` hold the limits.

const MB = 1048576
const NOT_PARTS = new Set(['script', 'wait', 'draw', 'drawScene', 'drawShadow'])

interface Line { span: string; owner: string; meanMs: number | null; worstMs: number | null; worstMsAt: number; meanMb: number; worstMb: number; worstMbAt: number; most: string }
interface Share { frame: number; owner: string; ms: number | null; mb: number; what: string }
interface Span { from: number; to: number; frames: number; shares: Share[]; each: { frame: number; script: number; mb: number; ms: Record<string, number>; by: Record<string, number>; what: Record<string, number> }[]; scriptMean: number; scriptWorst: number; scriptWorstAt: number; drawMean: number | null; mbMean: number; mbWorst: number; mbWorstAt: number; lines: Line[] }

const span = (text: string): [number, number] => {
  const [a, b] = text.split('-').map(Number)
  if (!Number.isInteger(a) || !Number.isInteger(b) || b < a) throw new Error(`a span is written first-last, as in 1255-1275: "${text}"`)
  return [Math.max(0, a), Math.min(FRAMES - 1, b)]
}

// The owner of a write, by the first name on its path: plant, companion, field, ground, and the name inside parts[...] for the parts the film keeps in a list.
const ownerOf = (path: string): string => {
  const t = top(path)
  const part = /^parts\[([\w -]+)\]/.exec(t)
  if (part) return part[1]
  return /^[\w-]+/.exec(t)?.[0] ?? t
}

export async function run(args: Args): Promise<void> {
  const spans = str(args, 'spans', '1255-1275,2078-2095,3000-3010').split(',').map(span)
  const tier = str(args, 'tier', 'draft')
  const at = new Set(str(args, 'at', '').split(',').filter(Boolean).map(Number))
  const busy = Number(spawnSync('pgrep', ['-c', '-f', 'type=gpu-process'], { encoding: 'utf8' }).stdout.trim()) || 0
  if (busy) console.log(`owners · NOT ALONE: ${busy} other pages are drawing on this machine now, so the milliseconds are too large`)
  const out: Span[] = []
  const session = await openSession({ record: true })
  try {
    const t0 = Date.now()
    await session.warm(tier)
    await session.cost()
    console.log(`owners · ${session.info.width} x ${session.info.height} · ${tier} · ${spans.length} spans · loaded in ${session.startSeconds.toFixed(1)} s, warmed in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
    for (const [from, to] of spans) {
      const name = `${from}-${to}`
      const n = to - from + 1
      const t1 = Date.now()
      const costs: { frame: number; cost: Record<string, number> }[] = []
      if (from > 0) await session.draw(from - 1, tier, false)
      for (let f = from; f <= to; f++) {
        await session.draw(f, tier, false)
        costs.push({ frame: f, cost: await session.cost() })
      }
      const bytes: { frame: number; by: Map<string, number>; what: Map<string, number>; all: number }[] = []
      if (from > 0) await session.draw(from - 1, tier, false)
      for (let f = from; f <= to; f++) {
        await session.page.evaluate(startRecording)
        await session.draw(f, tier, false)
        const written = await session.page.evaluate(stopRecording)
        const by = new Map<string, number>()
        const what = new Map<string, number>()
        let all = 0
        for (const r of written) {
          const o = ownerOf(r.owner)
          const w = owned(r.owner)
          by.set(o, (by.get(o) ?? 0) + r.bytes)
          const key = `${o}|${w.object.replace(/ \[\d+\]$/, '')} ${w.part}`
          what.set(key, (what.get(key) ?? 0) + r.bytes)
          all += r.bytes
        }
        bytes.push({ frame: f, by, what, all })
      }
      const owners = new Set<string>()
      for (const c of costs) for (const k of Object.keys(c.cost)) if (!NOT_PARTS.has(k)) owners.add(k)
      for (const b of bytes) for (const k of b.by.keys()) owners.add(k)
      const lines: Line[] = []
      for (const owner of owners) {
        const timed = costs.some((c) => c.cost[owner] !== undefined)
        const worst = costs.reduce((a, c) => ((c.cost[owner] ?? 0) > (a.cost[owner] ?? 0) ? c : a), costs[0])
        const heavy = bytes.reduce((a, b) => ((b.by.get(owner) ?? 0) > (a.by.get(owner) ?? 0) ? b : a), bytes[0])
        const parts = new Map<string, number>()
        for (const b of bytes) for (const [k, v] of b.what) if (k.startsWith(`${owner}|`)) parts.set(k.slice(owner.length + 1), (parts.get(k.slice(owner.length + 1)) ?? 0) + v)
        lines.push({
          span: name,
          owner,
          meanMs: timed ? costs.reduce((a, c) => a + (c.cost[owner] ?? 0), 0) / n : null,
          worstMs: timed ? (worst.cost[owner] ?? 0) : null,
          worstMsAt: worst.frame,
          meanMb: bytes.reduce((a, b) => a + (b.by.get(owner) ?? 0), 0) / n / MB,
          worstMb: (heavy.by.get(owner) ?? 0) / MB,
          worstMbAt: heavy.frame,
          most: [...parts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${(v / n / MB).toFixed(2)}`).join(', '),
        })
      }
      lines.sort((a, b) => (b.meanMs ?? 0) + b.meanMb - (a.meanMs ?? 0) - a.meanMb)
      const slow = costs.reduce((a, c) => (c.cost.script > a.cost.script ? c : a), costs[0])
      const fat = bytes.reduce((a, b) => (b.all > a.all ? b : a), bytes[0])
      const shares: Share[] = []
      for (const b of bytes) {
        if (b !== fat && !at.has(b.frame)) continue
        const c = costs.find((x) => x.frame === b.frame)
        for (const l of lines) {
          const ms = c?.cost[l.owner]
          const mb = (b.by.get(l.owner) ?? 0) / MB
          if (ms === undefined && mb === 0) continue
          const what = [...b.what].filter(([k]) => k.startsWith(`${l.owner}|`)).sort((x, y) => y[1] - x[1]).filter(([, v], i) => i < 4 || (at.has(b.frame) && v >= 0.005 * MB)).map(([k, v]) => `${k.slice(l.owner.length + 1)} ${(v / MB).toFixed(2)}`).join(', ')
          shares.push({ frame: b.frame, owner: l.owner, ms: ms ?? null, mb, what })
        }
        shares.push({ frame: b.frame, owner: 'all', ms: c?.cost.script ?? null, mb: b.all / MB, what: '' })
      }
      const each = bytes.map((b, i) => ({ frame: b.frame, script: costs[i].cost.script, mb: b.all / MB, ms: costs[i].cost, by: Object.fromEntries([...b.by].map(([k, v]) => [k, v / MB])), what: Object.fromEntries([...b.what].filter(([, v]) => v >= 0.005 * MB).map(([k, v]) => [k.replace('|', ': '), Number((v / MB).toFixed(3))])) }))
      const s: Span = { from, to, frames: n, shares, each, scriptMean: costs.reduce((a, c) => a + c.cost.script, 0) / n, scriptWorst: slow.cost.script, scriptWorstAt: slow.frame, drawMean: costs.every((c) => c.cost.draw !== undefined) ? costs.reduce((a, c) => a + c.cost.draw, 0) / n : null, mbMean: bytes.reduce((a, b) => a + b.all, 0) / n / MB, mbWorst: fat.all / MB, mbWorstAt: fat.frame, lines }
      out.push(s)
      console.log(`\nowners · frames ${from} to ${to} (${barText(secondsOf(from))} to ${barText(secondsOf(to))}) · ${n} frames in a row, twice · script ${s.scriptMean.toFixed(1)} ms a frame in the mean, worst ${s.scriptWorst.toFixed(1)} at frame ${s.scriptWorstAt}${s.drawMean === null ? '' : `, of the mean ${s.drawMean.toFixed(1)} inside renderer.render`} · ${s.mbMean.toFixed(2)} MB written a frame, most ${s.mbWorst.toFixed(2)} at frame ${s.mbWorstAt} · drawn in ${((Date.now() - t1) / 1000).toFixed(0)} s`)
      console.log(table(['span', 'owner', 'script ms mean', 'worst', 'at frame', 'MB a frame', 'most', 'at frame', 'what it writes most, MB a frame'], lines.map((l) => [l.span, l.owner, l.meanMs === null ? '' : l.meanMs.toFixed(1), l.worstMs === null ? '' : l.worstMs.toFixed(1), l.worstMs === null ? '' : l.worstMsAt, l.meanMb.toFixed(2), l.worstMb.toFixed(2), l.worstMb > 0 ? l.worstMbAt : '', l.most])))
      console.log(`\nowners · frame by frame: ${each.map((e) => `${e.frame} ${e.script.toFixed(0)} ms ${e.mb.toFixed(2)} MB`).join(' · ')}`)
      console.log(`\nowners · every owner's share of the frame that writes most${at.size ? ' and of the frames named with --at' : ''}`)
      console.log(table(['frame', 'owner', 'script ms', 'MB', 'what it writes, MB'], shares.map((x) => [x.frame, x.owner, x.ms === null ? '' : x.ms.toFixed(1), x.mb.toFixed(2), x.what])))
    }
  } finally {
    await session.close()
  }
  const findings: Finding[] = out.map((s) => ({ ok: true, expected: true, what: `frames ${s.from} to ${s.to}: script ${s.scriptMean.toFixed(1)} ms a frame in the mean, worst ${s.scriptWorst.toFixed(1)} at ${s.scriptWorstAt}; ${s.mbMean.toFixed(2)} MB written a frame, most ${s.mbWorst.toFixed(2)} at ${s.mbWorstAt}; by script: ${[...s.lines].sort((a, b) => (b.meanMs ?? 0) - (a.meanMs ?? 0)).slice(0, 4).map((l) => `${l.owner} ${(l.meanMs ?? 0).toFixed(1)}`).join(', ')}; by megabytes: ${[...s.lines].sort((a, b) => b.meanMb - a.meanMb).slice(0, 4).map((l) => `${l.owner} ${l.meanMb.toFixed(2)}`).join(', ')}` }))
  if (busy) findings.push({ ok: true, expected: true, what: `measured beside ${busy} other pages drawing: the milliseconds are too large, the megabytes are right` })
  finish({
    check: 'owners',
    name: `owners.${spans.map(([a, b]) => `${a}-${b}`).join('.')}`,
    sentence: 'no frame rate drop: who spends the script time of a frame and who writes to the graphics card',
    subject: 'the film',
    broken: null,
    complete: true,
    findings,
    table: { head: ['span', 'owner', 'script ms mean', 'worst', 'at frame', 'MB a frame', 'most', 'at frame', 'what it writes most, MB a frame'], rows: out.flatMap((s) => s.lines.map((l) => [l.span, l.owner, l.meanMs === null ? '' : l.meanMs.toFixed(1), l.worstMs === null ? '' : l.worstMs.toFixed(1), l.worstMs === null ? '' : l.worstMsAt, l.meanMb.toFixed(2), l.worstMb.toFixed(2), l.worstMb > 0 ? l.worstMbAt : '', l.most])) },
    data: { tier, busy, spans: out },
  })
}
