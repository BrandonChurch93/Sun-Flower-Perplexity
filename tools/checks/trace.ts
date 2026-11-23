import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { Args } from '../lib/args.ts'
import { flag, num, str } from '../lib/args.ts'
import { at } from '../lib/paths.ts'
import { barText, FRAMES, secondsOf } from './lib/film.ts'
import { finish, OUT, type Finding } from './lib/report.ts'
import { openSession, TRACED } from './lib/session.ts'
import { startTracing, stopTracing, type MadeThing } from './lib/tracer.ts'

const SENTENCE = 'nothing may be created on the graphics card after loading'

// Names what a frame makes on the graphics card and who makes it. The page is built with its names kept and a map back to the sources,
// every call that makes an object is noted with its stack, and the stack is read back to the film's own files: the nearest one is the maker.
// A program, and the program a vertex array is made under, is named by its uniforms too: the file of src/ that holds the most of them wrote the shader.
//   npm run checks -- made --trace --from 300 --to 640            after the film's own warming, frames in a row
//   npm run checks -- made --trace --from 318 --to 640 --cold     with no warming, as a runner that skips it starts: the first frame makes the film and is listed apart
//   npm run checks -- made --trace --cold --break made --at 302 --from 300 --to 304    a texture and a program made by the checks' own page at frame 302: must fail and name tools/checks/page/main.ts

interface Place { file: string; line: number; name: string }
interface Thing { frame: number; kind: string; what: string; by: Place[]; shader: string; folder: string }

interface Consumer { originalPositionFor(at: { line: number; column: number }): { source: string | null; line: number | null; name: string | null } }

function mapper(): (file: string, line: number, column: number) => Place | null {
  const require = createRequire(import.meta.url)
  const { SourceMapConsumer } = require('source-map-js') as { SourceMapConsumer: new (map: unknown) => Consumer }
  const maps = new Map<string, Consumer | null>()
  const assets = path.join(TRACED, 'assets')
  return (file, line, column) => {
    const base = path.basename(file)
    if (!maps.has(base)) {
      const map = path.join(assets, `${base}.map`)
      maps.set(base, fs.existsSync(map) ? new SourceMapConsumer(JSON.parse(fs.readFileSync(map, 'utf8'))) : null)
    }
    const consumer = maps.get(base)
    if (!consumer) return null
    const o = consumer.originalPositionFor({ line, column })
    if (!o.source || o.line === null) return null
    return { file: path.relative(at(), path.resolve(assets, o.source)), line: o.line, name: o.name ?? '' }
  }
}

function sources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = []
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (/\.(ts|glsl|vert|frag)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push({ file: path.relative(at(), full), text: fs.readFileSync(full, 'utf8') })
    }
  }
  walk(at('src'))
  return out
}

const folderOf = (file: string): string => (file.startsWith('src/') ? file.split('/').slice(0, 2).join('/') : file.startsWith('node_modules/') ? file.split('/').slice(0, 2).join('/') : file)

export async function run(args: Args): Promise<void> {
  const from = Math.max(0, num(args, 'from', 0))
  const to = Math.min(FRAMES - 1, num(args, 'to', FRAMES - 1))
  const cold = flag(args, 'cold')
  const broken = typeof args.break === 'string' ? args.break : null
  const tier = str(args, 'tier', 'draft')
  const name = `made.trace-${from}-${to}${cold ? '.cold' : ''}`
  if (broken && broken !== 'made') throw new Error('made --trace can break the film with --break made --at <frame>')
  const progress = path.join(OUT, `${name}.progress.txt`)
  const session = await openSession({ trace: true, sky: typeof args.sky === 'string' ? args.sky : undefined })
  const things: Thing[] = []
  const counted = new Map<number, Record<string, number>>()
  let loading: MadeThing[] = []
  let drawn = 0
  try {
    const locate = mapper()
    const files = sources()
    // The words every shader of three holds say nothing about whose it is.
    const everywhere = new Set(['modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix', 'cameraPosition', 'isOrthographic', 'position', 'normal', 'uv', 'color', 'opacity', 'diffuse', 'map', 'time', 'instanceMatrix', 'tDiffuse', 'resolution'])
    const shaderOf = (names: string[]): string => {
      const own = names.filter((n) => !everywhere.has(n) && n.length > 2)
      if (own.length === 0) return ''
      let best = { file: '', hits: 0 }
      for (const f of files) {
        let hits = 0
        for (const n of own) if (new RegExp(`\\b${n}\\b`).test(f.text)) hits++
        if (hits > best.hits) best = { file: f.file, hits }
      }
      return best.hits > 0 ? `${best.file} (${best.hits} of its ${own.length} own uniforms and attributes: ${own.slice(0, 5).join(', ')})` : ''
    }
    const read = (frame: number, made: MadeThing[]): Thing[] =>
      made.map((m) => {
        const by: Place[] = []
        for (const line of m.stack.split('\n')) {
          const hit = /\(?(https?:\/\/[^\s)]+):(\d+):(\d+)\)?$/.exec(line.trim())
          if (!hit) continue
          const place = locate(new URL(hit[1]).pathname, Number(hit[2]), Number(hit[3]))
          // The film counts what is made by wrapping the same calls (src/v2/counter.ts): its wrapper is on every stack and makes nothing itself.
          if (!place || place.file === 'src/v2/counter.ts' || (!broken && place.file.startsWith('tools/checks/'))) continue
          const fn = /^at (?:async )?(?:new )?([\w.$<>]+) /.exec(line.trim())?.[1] ?? ''
          by.push({ ...place, name: fn })
        }
        const own = by.filter((p) => p.file.startsWith('src/') || p.file.startsWith('tools/'))
        const shader = shaderOf(m.names)
        const maker = own[0]
        const folder = shader ? folderOf(shader.split(' ')[0]) : maker ? folderOf(maker.file) : by[0] ? folderOf(by[0].file) : 'not found'
        return { frame, kind: m.kind, what: m.what, by: own.slice(0, 4).length ? own.slice(0, 4) : by.slice(0, 2), shader, folder }
      })
    const t0 = Date.now()
    if (broken) await session.fault(broken, num(args, 'at'))
    if (!cold) await session.warm(tier)
    console.log(`made · traced · ${session.info.width} x ${session.info.height} · ${tier} · sky ${session.info.sky} · frames ${from} to ${to} in a row, ${cold ? 'cold: no warming' : `after the film's own warming (${((Date.now() - t0) / 1000).toFixed(0)} s)`} · loaded in ${session.startSeconds.toFixed(1)} s`)
    for (let f = from; f <= to; f++) {
      await session.page.evaluate(startTracing)
      const d = await session.draw(f, tier, false)
      const made = await session.page.evaluate(stopTracing)
      drawn++
      const count: Record<string, number> = {}
      for (const [k, v] of Object.entries(d.made as unknown as Record<string, number>)) if (v > 0 && !/^update/.test(k)) count[k] = v
      if (cold && f === from) loading = made
      else if (made.length || Object.keys(count).length) {
        counted.set(f, count)
        things.push(...read(f, made))
        console.log(`made · traced · frame ${f} made ${made.map((m) => m.kind).join(', ') || JSON.stringify(count)}`)
      }
      if (drawn % 20 === 0) fs.writeFileSync(progress, `frame ${f} · ${drawn} of ${to - from + 1} · ${things.length} things made so far\n`)
    }
  } finally {
    await session.close()
  }
  const findings: Finding[] = []
  const frames = [...new Set(things.map((t) => t.frame))]
  const judged = cold ? drawn - 1 : drawn
  findings.push({
    ok: things.length === 0 && counted.size === 0,
    what: things.length === 0 && counted.size === 0
      ? `${judged} frames (${cold ? from + 1 : from} to ${to}) drawn in a row ${cold ? `after a cold start at frame ${from}, with no warming` : "after the film's own warming"}: nothing was made on the graphics card`
      : `${judged} frames (${cold ? from + 1 : from} to ${to}) drawn in a row ${cold ? `after a cold start at frame ${from}, with no warming` : "after the film's own warming"}: ${things.length} things were made on ${frames.length} frames (${frames.slice(0, 12).join(', ')}${frames.length > 12 ? ', ...' : ''})`,
  })
  if (cold) {
    const kinds = new Map<string, number>()
    for (const m of loading) kinds.set(m.kind, (kinds.get(m.kind) ?? 0) + 1)
    findings.push({ ok: true, expected: true, what: `the cold start itself, frame ${from}, makes ${[...kinds].map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(', ')}: that is the film being built on its first frame, and is not judged` })
  }
  const said = (p: Place): string => `${p.file}:${p.line}${p.name ? ` (${p.name})` : ''}`
  for (const f of frames) {
    const mine = things.filter((t) => t.frame === f)
    const groups = new Map<string, { n: number; t: Thing }>()
    for (const t of mine) {
      const key = `${t.kind}|${t.what}|${t.by.map(said).join('<')}|${t.shader}`
      const g = groups.get(key)
      if (g) g.n++
      else groups.set(key, { n: 1, t })
    }
    for (const { n, t } of groups.values()) {
      findings.push({ ok: false, what: `frame ${f} (${barText(secondsOf(f))}): ${n} ${t.kind}${n === 1 ? '' : 's'}${t.what ? ` (${t.what})` : ''}, made from ${t.by.map(said).join(' < ') || 'a place the map does not name'}${t.shader ? `; its shader is written in ${t.shader}` : ''}. Owner: ${t.folder}` })
    }
    if (mine.length === 0) findings.push({ ok: false, what: `frame ${f}: the film's own count says ${JSON.stringify(counted.get(f))} and no call that makes an object was seen` })
  }
  finish({
    check: 'made',
    name,
    sentence: SENTENCE,
    subject: broken ? `a film that makes a texture and a program at frame ${num(args, 'at')}` : cold ? `the film started cold at frame ${from}, as a runner that skips the warming starts it` : 'the film',
    broken,
    complete: true,
    findings,
    table: { head: ['frame', 'what', 'named', 'made from', 'shader written in', 'owner'], rows: things.slice(0, 80).map((t) => [t.frame, t.kind, t.what.slice(0, 40), t.by.slice(0, 2).map(said).join(' < ').slice(0, 90), t.shader.split(' ')[0], t.folder]) },
    data: { from, to, cold, things, counted: Object.fromEntries(counted), loading: loading.length },
  })
}
