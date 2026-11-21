import fs from 'node:fs'
import path from 'node:path'
import { config } from '../src/config.ts'
import { at, WORK } from './lib/paths.ts'
import { getField, getSection, readProgress } from './lib/progress.ts'
import { ensureBuild } from './lib/render.ts'

const SITE_LIMIT_MB = 450

ensureBuild()
const dist = at('dist')
const out = path.join(dist, 'review')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const mbOf = (file: string) => fs.statSync(file).size / 1048576
const progress = readProgress()

interface Item { title: string; file: string; note?: string }
const copy = (from: string, name: string): string => {
  fs.copyFileSync(from, path.join(out, name))
  return `review/${name}`
}

const latest: Item[] = []
const statusDir = at('out', 'stills', 'status')
let statusLines: string[] = []
let statusTime = ''
if (fs.existsSync(path.join(statusDir, 'STATUS.md'))) {
  const text = fs.readFileSync(path.join(statusDir, 'STATUS.md'), 'utf8')
  statusTime = text.split('\n').find((l) => /UTC$/.test(l.trim()))?.trim() ?? ''
  statusLines = text.split('\n').filter((l) => l.startsWith('- ') && !l.startsWith('- `')).map((l) => l.slice(2))
  for (const m of text.matchAll(/^- `([^`]+)`: (.*)$/gm)) {
    const file = path.join(statusDir, m[1])
    if (fs.existsSync(file)) latest.push({ title: m[2], file: copy(file, m[1]) })
  }
}

const videos: { section: 'films' | 'clips'; title: string; from: string; name: string; mb: number; note?: string }[] = []
const recordNote = (file: string): string | undefined => {
  const p = `${file}.json`
  if (!fs.existsSync(p)) return undefined
  try {
    const r = JSON.parse(fs.readFileSync(p, 'utf8')) as { tier?: string; format?: string; at?: string; engineHash?: string }
    return [r.tier ? `${r.tier} tier` : null, r.format, r.at ? r.at.replace('T', ' ').slice(0, 16) + ' UTC' : null, r.engineHash ? `build ${r.engineHash.slice(0, 8)}` : null].filter(Boolean).join(' · ')
  } catch {
    return undefined
  }
}
if (fs.existsSync(at('out', 'preview.mp4'))) videos.push({ section: 'films', title: 'The film so far', from: at('out', 'preview.mp4'), name: 'preview.mp4', mb: mbOf(at('out', 'preview.mp4')), note: recordNote(at('out', 'preview.mp4')) })
if (fs.existsSync(at('out', 'roughcut.mp4'))) videos.push({ section: 'films', title: 'Rough cut, made from the approved stills to judge the pacing', from: at('out', 'roughcut.mp4'), name: 'roughcut.mp4', mb: mbOf(at('out', 'roughcut.mp4')) })
const clipFiles = new Map<string, string>()
for (const dir of [at('out', 'clips'), path.join(WORK, 'clips')]) {
  if (!fs.existsSync(dir)) continue
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.mp4'))) clipFiles.set(name, path.join(dir, name))
}
for (const s of config.segments) {
  const from = clipFiles.get(`${s.id}.mp4`)
  if (from) videos.push({ section: 'clips', title: `${s.id}, ${s.start} to ${s.end} s`, from, name: `clip-${s.id}.mp4`, mb: mbOf(from), note: recordNote(from) })
}

const stills: Item[] = []
const stillsDir = at('out', 'stills')
if (fs.existsSync(stillsDir)) {
  const names = fs.readdirSync(stillsDir).filter((n) => /\.(jpg|jpeg|png|webp)$/i.test(n)).sort()
  const rank = (n: string) => (n.startsWith('compare-') ? 0 : n.startsWith('sheet') || n.startsWith('film-') ? 1 : 2)
  for (const name of names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))) {
    const label = name.startsWith('compare-')
      ? `Key ${name.replace(/^compare-|\.\w+$/g, '')}: the approved image beside the frame of the film`
      : name.replace(/\.\w+$/, '').replace(/[-_]/g, ' ')
    stills.push({ title: label, file: copy(path.join(stillsDir, name), name) })
  }
}

const siteMb = (): number => {
  let total = 0
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name)
      if (fs.statSync(p).isDirectory()) walk(p)
      else total += mbOf(p)
    }
  }
  walk(dist)
  return total
}
const leftOut: string[] = []
let room = SITE_LIMIT_MB - siteMb()
const shown: Item[][] = [[], []]
for (const v of [...videos].sort((a, b) => a.mb - b.mb)) {
  if (v.mb > room) {
    leftOut.push(`${v.title} (${v.mb.toFixed(0)} MB)`)
    continue
  }
  room -= v.mb
  shown[v.section === 'films' ? 0 : 1].push({ title: v.title, file: copy(v.from, v.name), note: v.note })
}
const order = (list: Item[], names: string[]) => list.sort((a, b) => names.indexOf(a.file) - names.indexOf(b.file))
order(shown[0], videos.map((v) => `review/${v.name}`))
order(shown[1], videos.map((v) => `review/${v.name}`))

const clockRow = getSection(progress, 'Clock').match(/\| Whole build \| ([^|]+)\| ([^|]+)\|/)
const phaseLine = getField(progress, 'Current phase') ?? ''
const buildLine = getField(progress, 'Build') ?? ''
const now = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
const figure = (i: Item) => `<figure><img src="${esc(i.file)}" alt="${esc(i.title)}" loading="lazy"><figcaption>${esc(i.title)}</figcaption></figure>`
const film = (i: Item) => `<figure><video src="${esc(i.file)}" controls playsinline preload="metadata"></video><figcaption>${esc(i.title)}${i.note ? `<span>${esc(i.note)}</span>` : ''}</figcaption></figure>`
const part = (title: string, body: string, empty: string) => `<section><h2>${title}</h2>${body || `<p class="empty">${empty}</p>`}</section>`

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(config.name)} · review</title>
<link rel="icon" href="data:,">
<style>
:root { color-scheme: dark; --bg: #14130f; --panel: #1d1b16; --line: #34312a; --text: #ece7db; --soft: #a59f90; --gold: #e2b23a; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
main { max-width: 1120px; margin: 0 auto; padding: 28px 20px 80px; }
header { padding: 8px 0 22px; border-bottom: 1px solid var(--line); }
h1 { font-size: 26px; line-height: 1.2; margin: 0 0 10px; font-weight: 650; letter-spacing: -0.01em; }
h2 { font-size: 15px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold); margin: 0 0 16px; font-weight: 600; }
.facts { display: flex; flex-wrap: wrap; gap: 6px 22px; color: var(--soft); font-size: 14px; margin: 0; padding: 0; list-style: none; }
.facts b { color: var(--text); font-weight: 550; }
nav { display: flex; gap: 18px; padding: 14px 0 0; font-size: 14px; }
a { color: var(--gold); text-decoration: none; }
a:hover, a:focus-visible { text-decoration: underline; }
section { padding: 30px 0 6px; border-bottom: 1px solid var(--line); }
section:last-of-type { border-bottom: 0; }
figure { margin: 0 0 26px; }
img, video { display: block; width: 100%; height: auto; background: var(--panel); border-radius: 6px; }
figcaption { color: var(--soft); font-size: 14px; padding: 8px 2px 0; }
figcaption span { display: block; font-size: 12.5px; opacity: 0.8; }
.status { margin: 0 0 20px; padding: 14px 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; font-size: 15px; }
.status p { margin: 0 0 6px; }
.status p:last-child { margin: 0; color: var(--soft); }
.empty, .note { color: var(--soft); font-size: 14px; margin: 0 0 24px; }
</style>
</head>
<body>
<main>
<header>
<h1>${esc(config.name)}</h1>
<ul class="facts">
<li>Page made <b>${esc(now)}</b></li>
<li>Build <b>${esc(buildLine)}</b></li>
<li>Phase <b>${esc(phaseLine)}</b></li>
${clockRow ? `<li>Time used <b>${esc(clockRow[2].trim())}</b> of ${esc(clockRow[1].trim())}</li>` : ''}
</ul>
<nav><a href="#latest">Latest</a><a href="#films">Films</a><a href="#clips">Clips</a><a href="#comparisons">Comparisons</a><a href="./index.html">Open the scene</a></nav>
</header>
<div id="latest">${part('Latest', `${statusLines.length ? `<div class="status">${statusLines.slice(0, 2).map((l) => `<p>${esc(l)}</p>`).join('')}<p>${esc(statusTime)}</p></div>` : ''}${latest.map(figure).join('')}`, 'No status pictures yet.')}</div>
<div id="films">${part('Films', shown[0].map(film).join(''), 'No film yet.')}</div>
<div id="clips">${part('Clips', shown[1].map(film).join(''), 'No clips yet. A clip appears here when its unit is finished.')}</div>
<div id="comparisons">${part('Comparisons', stills.map(figure).join(''), 'No comparison images or contact sheets yet.')}</div>
${leftOut.length ? `<p class="note">Left out because the hosting has a size limit: ${esc(leftOut.join(', '))}. These files are in the repo.</p>` : ''}
</main>
</body>
</html>
`
fs.writeFileSync(path.join(dist, 'review.html'), html)
console.log(`review page: dist/review.html · ${latest.length} status pictures, ${shown[0].length} films, ${shown[1].length} clips, ${stills.length} comparison images and sheets · site ${siteMb().toFixed(1)} MB${leftOut.length ? ` · left out: ${leftOut.join(', ')}` : ''}`)
