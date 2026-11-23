import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { Args } from '../lib/args.ts'
import { num, str } from '../lib/args.ts'
import { launch, openPage } from '../lib/browser.ts'
import { serve } from '../lib/server.ts'
import { barText, barTime, FPS, secondsOf } from './lib/film.ts'
import { recorder, startRecording, stopRecording, type WriteRow } from './lib/recorder.ts'
import { OUT, table } from './lib/report.ts'
import { openSession } from './lib/session.ts'

// What one frame writes into buffers and textures that already exist, and whose they are.
//   npm run checks -- writes                          the frost hold, the fast time lapse, the storm hold and the bloom
//   npm run checks -- writes --bars 21,29,35,61       the frames at these bars
//   npm run checks -- writes --tier review            with the samples of the export
//   npm run checks -- writes --read writes.main       prints a table measured before, without drawing
//   npm run checks -- writes --root ../main --seconds 4,14,25,35,46,56     another checkout of the film (version 1), at these film seconds
// The frame before is drawn first, so that what is noted is what a frame costs while the film plays.

const MB = 1048576
const mb = (bytes: number): string => (bytes / MB).toFixed(bytes < 0.1 * MB ? 3 : 2)

export interface Place { name: string; frame: number; rows: WriteRow[]; drawSeconds: number }

// The path from the film to an array, cut into the object that owns it and the part of it that is written.
function owned(owner: string): { object: string; part: string } {
  const s = owner.replace(/^film\./, '').replace(/\.array$/, '').replace(/\.children\[/g, '[').replace(/\.parts\[([^\]]+)\]\.meshes\[/g, ' $1 [')
  const uniform = /^(.*?)\.(?:material\.)?uniforms\.(\w+)\.value\b/.exec(s)
  if (uniform) return { object: uniform[1], part: uniform[2] }
  const attribute = /^(.*?)\.geometry\.(?:attributes\.(\w+)|(index))/.exec(s)
  if (attribute) return { object: attribute[1], part: attribute[2] ?? 'index' }
  const cut = s.lastIndexOf('.')
  return cut > 0 ? { object: s.slice(0, cut), part: s.slice(cut + 1) } : { object: s, part: '' }
}

// The first name on the path: the plant, its companion, the field, the ground, a part of the sky.
const top = (owner: string): string => (owner.startsWith('a ') ? 'not named: this checkout has no list of owners' : (/^[\w-]+(\[[\w -]+\])?/.exec(owned(owner).object)?.[0] ?? owner))

export function summary(place: Place): { owner: string; textureMb: number; textures: number; bufferMb: number; buffers: number }[] {
  const out = new Map<string, { owner: string; textureMb: number; textures: number; bufferMb: number; buffers: number }>()
  for (const r of place.rows) {
    if (r.kind.endsWith('new storage')) continue
    const key = top(r.owner)
    const o = out.get(key) ?? { owner: key, textureMb: 0, textures: 0, bufferMb: 0, buffers: 0 }
    if (r.kind === 'texture') {
      o.textureMb += r.bytes / MB
      o.textures += r.calls
    } else {
      o.bufferMb += r.bytes / MB
      o.buffers += r.calls
    }
    out.set(key, o)
  }
  return [...out.values()].sort((a, b) => b.textureMb + b.bufferMb - a.textureMb - a.bufferMb)
}

function print(place: Place): void {
  const written = place.rows.filter((r) => !r.kind.endsWith('new storage'))
  const total = written.reduce((a, r) => a + r.bytes, 0)
  const calls = written.reduce((a, r) => a + r.calls, 0)
  const fresh = place.rows.filter((r) => r.kind.endsWith('new storage'))
  console.log(`\nwrites · ${place.name} · frame ${place.frame} · ${calls} writes into what exists, ${mb(total)} MB${fresh.length ? ` · and ${fresh.reduce((a, r) => a + r.calls, 0)} given new storage, ${mb(fresh.reduce((a, r) => a + r.bytes, 0))} MB` : ''} · drawn in ${place.drawSeconds.toFixed(1)} s`)
  console.log(table(['owner', 'texture writes', 'MB', 'buffer writes', 'MB', 'share'], summary(place).map((o) => [o.owner, o.textures, mb(o.textureMb * MB), o.buffers, mb(o.bufferMb * MB), total > 0 ? `${((100 * (o.textureMb + o.bufferMb) * MB) / total).toFixed(0)} %` : ''])) + '\n')
  const groups = new Map<string, { calls: number; bytes: number; parts: Set<string>; largest: number }>()
  for (const r of place.rows) {
    const o = owned(r.owner)
    const key = r.kind === 'buffer' ? `${o.object} · buffers` : `${o.object} · ${r.kind} ${o.part}`
    const g = groups.get(key) ?? { calls: 0, bytes: 0, parts: new Set<string>(), largest: 0 }
    g.calls += r.calls
    g.bytes += r.bytes
    g.parts.add(o.part)
    g.largest = Math.max(g.largest, r.largest)
    groups.set(key, g)
  }
  const rows = [...groups.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 22)
  console.log(table(['whose, and what is written', 'writes', 'MB a frame', 'largest MB', 'share', 'parts'], rows.map(([k, g]) => [k, g.calls, mb(g.bytes), mb(g.largest), total > 0 ? `${((100 * g.bytes) / total).toFixed(0)} %` : '', [...g.parts].slice(0, 5).join(' ')])))
}

// The same table for a page of notes.
function markdown(place: Place, most: number): string {
  const written = place.rows.filter((r) => !r.kind.endsWith('new storage'))
  const fresh = place.rows.filter((r) => r.kind.endsWith('new storage'))
  const total = written.reduce((a, r) => a + r.bytes, 0)
  const groups = new Map<string, { calls: number; bytes: number; largest: number; parts: Set<string> }>()
  for (const r of place.rows) {
    const o = owned(r.owner)
    const key = r.kind === 'buffer' ? `${o.object}, buffers` : `${o.object}, ${r.kind} ${o.part}`
    const g = groups.get(key) ?? { calls: 0, bytes: 0, largest: 0, parts: new Set<string>() }
    g.calls += r.calls
    g.bytes += r.bytes
    g.largest = Math.max(g.largest, r.largest)
    g.parts.add(o.part)
    groups.set(key, g)
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].bytes - a[1].bytes)
  const rest = sorted.slice(most)
  const lines = [
    `**${place.name}, frame ${place.frame}**: ${written.reduce((a, r) => a + r.calls, 0)} writes into what exists, ${mb(total)} MB${fresh.length ? `; and ${fresh.reduce((a, r) => a + r.calls, 0)} objects given new storage, ${mb(fresh.reduce((a, r) => a + r.bytes, 0))} MB` : ''}. By owner: ${summary(place).map((o) => `${o.owner} ${mb((o.textureMb + o.bufferMb) * MB)} MB (${o.textures} texture writes ${mb(o.textureMb * MB)} MB, ${o.buffers} buffer writes ${mb(o.bufferMb * MB)} MB)`).join('; ')}.`,
    '',
    '| whose, and what is written | writes | MB a frame | largest MB | which |',
    '| --- | ---: | ---: | ---: | --- |',
    ...sorted.slice(0, most).map(([k, g]) => `| ${k} | ${g.calls} | ${mb(g.bytes)} | ${mb(g.largest)} | ${[...g.parts].slice(0, 5).join(' ')} |`),
    ...(rest.length ? [`| the other ${rest.length} | ${rest.reduce((a, [, g]) => a + g.calls, 0)} | ${mb(rest.reduce((a, [, g]) => a + g.bytes, 0))} | ${mb(Math.max(...rest.map(([, g]) => g.largest)))} | |`] : []),
    '',
  ]
  return lines.join('\n')
}

async function another(root: string, seconds: number[], tier: string, format: string): Promise<Place[]> {
  const dir = path.resolve(root)
  if (!fs.existsSync(path.join(dir, 'dist', 'index.html'))) {
    console.log(`writes · building ${dir}`)
    execSync('npx vite build', { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] })
  }
  const fps = (JSON.parse(fs.readFileSync(path.join(dir, 'config', 'showcase.json'), 'utf8')) as { film: { fps: number } }).film.fps
  const served = await serve(path.join(dir, 'dist'))
  const browser = await launch()
  const places: Place[] = []
  try {
    const page = await openPage(browser, 1280, 720)
    await page.addInitScript(recorder)
    await page.goto(`${served.url}/index.html?mode=capture&format=${format}&assets=full&diag=beauty`, { waitUntil: 'load' })
    await page.waitForFunction(() => typeof (window as unknown as { showcase?: object }).showcase === 'object', undefined, { timeout: 120000 })
    await page.evaluate(() => (window as unknown as { showcase: { ready: Promise<void> } }).showcase.ready)
    const draw = (f: number): Promise<number> =>
      page.evaluate(
        async ([frame, t]) => {
          const t0 = performance.now()
          await (window as unknown as { showcase: { renderFrame(f: number, t: string): Promise<void> } }).showcase.renderFrame(frame as number, t as string)
          return (performance.now() - t0) / 1000
        },
        [f, tier] as const,
      )
    for (const s of seconds) {
      const frame = Math.round(s * fps)
      // The first frame of a place has never been drawn: that is what a scene change costs there. Then the frame after it, which is what a frame costs while the scene plays.
      for (const [f, name] of [[frame, `${s} s, the first frame drawn there`], [frame + 1, `${s} s, the frame after`]] as const) {
        await page.evaluate(startRecording)
        const drawSeconds = await draw(f)
        const rows = await page.evaluate(stopRecording)
        places.push({ name, frame: f, rows, drawSeconds })
        print(places[places.length - 1])
      }
    }
  } finally {
    await browser.close().catch(() => undefined)
    await served.close().catch(() => undefined)
  }
  return places
}

export async function run(args: Args): Promise<void> {
  const tier = str(args, 'tier', 'draft')
  const root = str(args, 'root', '')
  let places: Place[] = []
  let name = 'writes'
  if (typeof args.read === 'string') {
    // Prints a table that was measured before, without drawing.
    for (const p of (JSON.parse(fs.readFileSync(path.join(OUT, `${args.read}.json`), 'utf8')) as { places: Place[] }).places) {
      if (args.md) console.log(markdown(p, num(args, 'most', 10)))
      else print(p)
    }
    return
  }
  if (root) {
    name = `writes.${path.basename(path.resolve(root))}`
    places = await another(root, str(args, 'seconds', '4').split(',').map(Number), tier, str(args, 'format', 'preview'))
  } else {
    const bars = str(args, 'bars', '21,29,35,61').split(',').map(Number)
    const NAMES: Record<number, string> = { 21: 'the frost hold', 29: 'the fast time lapse', 35: 'the storm hold', 61: 'the bloom' }
    const session = await openSession({ width: num(args, 'width', 320), height: num(args, 'height', 180), sky: typeof args.sky === 'string' ? args.sky : undefined, record: true })
    try {
      await session.warm(tier)
      for (const b of bars) {
        const frame = Math.round(barTime(b) * FPS)
        await session.draw(frame - 1, tier, false)
        await session.page.evaluate(startRecording)
        const d = await session.draw(frame, tier, false)
        const rows = await session.page.evaluate(stopRecording)
        places.push({ name: `${NAMES[b] ?? 'the film'}, ${barText(secondsOf(frame))}`, frame, rows, drawSeconds: d.seconds })
        print(places[places.length - 1])
      }
    } finally {
      await session.close()
    }
  }
  fs.mkdirSync(OUT, { recursive: true })
  const file = path.join(OUT, `${name}.json`)
  fs.writeFileSync(file, JSON.stringify({ tier, at: new Date().toISOString(), places }, null, 2) + '\n')
  console.log(`\nwrites · written to ${path.relative(process.cwd(), file)}`)
}
