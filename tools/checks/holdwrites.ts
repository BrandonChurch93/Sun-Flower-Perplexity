import fs from 'node:fs'
import path from 'node:path'
import type { Args } from '../lib/args.ts'
import { num, str } from '../lib/args.ts'
import { barText, FRAMES, holds, secondsOf } from './lib/film.ts'
import { meantCuts } from './lib/meant.ts'
import { startRecording, stopRecording } from './lib/recorder.ts'
import { finish, OUT, type Finding } from './lib/report.ts'
import { openSession } from './lib/session.ts'
import { owned } from './writes.ts'

const SENTENCE = 'in the frost and the storm the flower does not grow, so nothing of it is written again; a cut costs nothing'
const MB = 1048576

// What a stretch of frames writes into named textures and buffers, frame by frame, drawn in a row after the film's own warming.
// The rule: inside a hold nothing is written into the watched things on any frame but the hold's first, and nothing on a frame the film cuts on.
//   npm run checks -- writes --from 849 --to 1262                      the frost hold and the frames after it, watching uHairs and uPicks
//   npm run checks -- writes --from 1672 --to 2085 --watch uHairs,uPicks
//   npm run checks -- writes --from 1680 --to 1692 --break grow        a plant that grows inside the hold: must fail
// Frames outside a hold are listed and not judged, but for the cut frames.

interface Watched { object: string; part: string; bytes: number; fresh: boolean }
interface Row { frame: number; textureBytes: number; bufferBytes: number; watched: Watched[]; unnamed: number; lens: number; lensBefore: number; changed: string[] }

// What a coat of hairs chooses its hairs by, in the order the plant keeps it: under a held lens, and otherwise by the stepped view.
const SIGN = ['eye x', 'eye y', 'eye z', 'forward x', 'forward y', 'forward z', 'pixels for a tangent of one', 'focus distance', 'blur scale', 'width', 'height', 'shown', 'keys', 'shape', 'near end of the focus range']
const STEPPED = ['stepped eye x', 'stepped eye y', 'stepped eye z', 'stepped pixels a meter', 'stepped focus distance', 'stepped blur scale']
const short = (v: number): string => (Number.isInteger(v) ? String(v) : Math.abs(v) >= 100 ? v.toFixed(2) : v.toPrecision(6))

export async function run(args: Args): Promise<void> {
  const from = Math.max(1, num(args, 'from', holds[0].first))
  const to = Math.min(FRAMES - 1, num(args, 'to', holds[0].last + 3))
  const tier = str(args, 'tier', 'draft')
  const watch = str(args, 'watch', 'uHairs,uPicks').split(',')
  const broken = typeof args.break === 'string' ? args.break : null
  if (broken && broken !== 'grow') throw new Error('writes --from can break the film with --break grow: the plant grows inside the hold')
  const name = broken ? `writes.broken-${broken}` : `writes.hold-${from}-${to}`
  const progress = path.join(OUT, `${name}.progress.txt`)
  const cuts = new Set(meantCuts())
  const holdOf = (f: number): (typeof holds)[number] | null => holds.find((h) => f >= h.first && f <= h.last) ?? null
  const rows: Row[] = []
  const session = await openSession({ record: true, sky: typeof args.sky === 'string' ? args.sky : undefined })
  try {
    const t0 = Date.now()
    if (broken) await session.fault('grow', secondsOf(from + 2), secondsOf(to))
    await session.warm(tier)
    console.log(`writes · ${session.info.width} x ${session.info.height} · ${tier} · frames ${from} to ${to} in a row after the film's own warming (${((Date.now() - t0) / 1000).toFixed(0)} s), watching ${watch.join(', ')}`)
    await session.draw(from - 1, tier, false)
    let before = await session.lens()
    for (let f = from; f <= to; f++) {
      await session.page.evaluate(startRecording)
      await session.draw(f, tier, false)
      const written = await session.page.evaluate(stopRecording)
      const lens = await session.lens()
      const row: Row = { frame: f, textureBytes: 0, bufferBytes: 0, watched: [], unnamed: 0, lens: lens.held, lensBefore: before.held, changed: [] }
      for (const r of written) {
        if (r.kind.startsWith('texture')) row.textureBytes += r.bytes
        else row.bufferBytes += r.bytes
        if (r.kind.startsWith('texture') && /^a texture /.test(r.owner)) row.unnamed += r.bytes
        const o = owned(r.owner)
        if (watch.includes(o.part)) row.watched.push({ object: o.object, part: o.part, bytes: r.bytes, fresh: r.kind.endsWith('new storage') })
      }
      if (row.watched.length) {
        const was = new Map(before.signs.map((x) => [x.owner, x.numbers]))
        const said = new Map<string, number>()
        for (const x of lens.signs) {
          const old = was.get(x.owner)
          if (!old) continue
          const names = x.numbers.length === STEPPED.length ? STEPPED : SIGN
          x.numbers.forEach((v, k) => {
            if (v === old[k] || (Number.isNaN(v) && Number.isNaN(old[k]))) return
            const what = `${names[k] ?? `number ${k}`} ${short(old[k])} to ${short(v)}`
            said.set(what, (said.get(what) ?? 0) + 1)
          })
        }
        row.changed = [...said].sort((a, b) => b[1] - a[1]).map(([what, n]) => `${what} (${n} coats)`)
      }
      if (row.watched.length) console.log(`writes · frame ${f} writes ${(row.watched.reduce((a, w) => a + w.bytes, 0) / MB).toFixed(2)} MB into ${[...new Set(row.watched.map((w) => w.part))].join(', ')} · lens ${row.lensBefore} to ${row.lens} · ${row.changed.slice(0, 4).join(', ') || 'nothing of the sign differs'}`)
      else if (row.unnamed > 0.1 * MB) console.log(`writes · frame ${f} writes ${(row.unnamed / MB).toFixed(2)} MB into textures without a name`)
      before = lens
      rows.push(row)
      if (rows.length % 20 === 0) fs.writeFileSync(progress, `frame ${f} · ${rows.length} of ${to - from + 1} · ${rows.filter((r) => r.watched.length).length} frames write into ${watch.join(', ')} so far\n`)
    }
  } finally {
    await session.close()
  }
  const sum = (r: Row): number => r.watched.reduce((a, w) => a + w.bytes, 0)
  const said = (r: Row): string => {
    const by = new Map<string, number>()
    for (const w of r.watched) by.set(`${w.object.replace(/ \[\d+\]$/, '')} ${w.part}`, (by.get(`${w.object.replace(/ \[\d+\]$/, '')} ${w.part}`) ?? 0) + w.bytes)
    return [...by].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${(v / MB).toFixed(2)}`).join(', ')
  }
  const lensOf = (r: Row): string => `${r.lens < 0 ? 'no held lens' : `held lens ${r.lens}`}${r.lens === r.lensBefore ? ', as in the frame before' : `, ${r.lensBefore < 0 ? 'none' : r.lensBefore} in the frame before`}; of what the hairs are chosen by, ${r.changed.length ? `${r.changed.slice(0, 5).join(', ')}${r.changed.length > 5 ? `, and ${r.changed.length - 5} more` : ''} differ from the frame before` : 'nothing differs from the frame before'}${r.watched.some((w) => w.fresh) ? '; a texture was given new storage' : ''}`
  const where = (f: number): string => {
    const h = holdOf(f)
    return `${cuts.has(f) ? 'a cut frame, ' : ''}${h ? (f === h.first ? `the first frame of ${h.name}` : `inside ${h.name}`) : 'not in a hold'}`
  }
  const writing = rows.filter((r) => r.watched.length)
  const judgedRows = rows.filter((r) => cuts.has(r.frame) || (holdOf(r.frame) !== null && holdOf(r.frame)?.first !== r.frame))
  const faulty = judgedRows.filter((r) => r.watched.length)
  const findings: Finding[] = []
  findings.push({
    ok: faulty.length === 0,
    what: faulty.length === 0
      ? `${judgedRows.length} frames inside a hold or on a cut (of ${rows.length} drawn in a row, ${from} to ${to}): none writes into ${watch.join(' or ')}`
      : `${faulty.length} of ${judgedRows.length} frames inside a hold or on a cut write into ${watch.join(' or ')}, ${(faulty.reduce((a, r) => a + sum(r), 0) / MB).toFixed(2)} MB in all: ${faulty.slice(0, 12).map((r) => `${r.frame} (${(sum(r) / MB).toFixed(2)} MB)`).join(', ')}${faulty.length > 12 ? ', ...' : ''}. Owner: src/plant`,
  })
  for (const r of faulty.slice(0, 12)) findings.push({ ok: false, what: `frame ${r.frame} (${barText(secondsOf(r.frame))}, ${where(r.frame)}): ${(sum(r) / MB).toFixed(2)} MB in ${r.watched.length} writes: ${said(r)}. ${lensOf(r)}` })
  for (const c of [...cuts].filter((f) => f >= from && f <= to)) {
    const r = rows.find((x) => x.frame === c)
    if (r) findings.push({ ok: r.watched.length === 0, what: `the cut into frame ${c}: ${r.watched.length === 0 ? `nothing written into ${watch.join(' or ')}` : `${(sum(r) / MB).toFixed(2)} MB written into ${said(r)}`}; ${((r.textureBytes + r.bufferBytes) / MB).toFixed(2)} MB written in all` })
  }
  // A texture written from an array the page cannot trace to its owner may be a coat of hairs under another name: it is not passed in silence.
  const nameless = judgedRows.filter((r) => r.unnamed > 0.1 * MB)
  if (nameless.length) findings.push({ ok: false, what: `${nameless.length} frames inside a hold or on a cut write textures that could not be traced to an owner, so they are not shown to be free of hairs: ${nameless.slice(0, 8).map((r) => `${r.frame} (${(r.unnamed / MB).toFixed(2)} MB)`).join(', ')}${nameless.length > 8 ? ', ...' : ''}` })
  const allowed = writing.filter((r) => !judgedRows.includes(r))
  if (allowed.length) findings.push({ ok: true, expected: true, what: `listed, not judged: ${allowed.length} frames that are a hold's first frame or outside the holds write into them: ${allowed.slice(0, 10).map((r) => `${r.frame} (${(sum(r) / MB).toFixed(2)} MB, ${where(r.frame)})`).join(', ')}${allowed.length > 10 ? ', ...' : ''}` })
  const all = rows.map((r) => (r.textureBytes + r.bufferBytes) / MB)
  const worst = rows.reduce((a, r) => (r.textureBytes + r.bufferBytes > a.textureBytes + a.bufferBytes ? r : a), rows[0])
  findings.push({ ok: true, expected: true, what: `everything written, whatever its name: ${(all.reduce((a, b) => a + b, 0) / all.length).toFixed(2)} MB a frame in the mean, the most ${((worst.textureBytes + worst.bufferBytes) / MB).toFixed(2)} MB at frame ${worst.frame} (${where(worst.frame)})` })
  finish({
    check: 'writes',
    name,
    sentence: SENTENCE,
    subject: broken ? 'a film whose plant grows inside the hold' : 'the film',
    broken,
    complete: true,
    findings,
    table: { head: ['frame', 'bar', 'where', `MB into ${watch.join(', ')}`, 'the largest of them', 'MB written in all', 'the lens'], rows: writing.slice(0, 60).map((r) => [r.frame, barText(secondsOf(r.frame)).slice(4), where(r.frame), (sum(r) / MB).toFixed(2), said(r), ((r.textureBytes + r.bufferBytes) / MB).toFixed(2), lensOf(r)]) },
    data: { from, to, watch, rows },
  })
}
