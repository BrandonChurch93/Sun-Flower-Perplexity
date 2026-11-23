import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { config } from '../src/config.ts'
import { parseArgs, flag, str } from './lib/args.ts'
import { at, WORK } from './lib/paths.ts'
import { loadClock, saveClock, writeClockTable, bootId } from './clock.ts'
import { markStatus, report, reportExtension, tick, tickExtension } from './lib/clock.ts'
import { readLooks } from './lib/looks.ts'
import { inlinePicture } from './lib/inline.ts'
import { appendToSection, getField, getSection, readProgress, setField, setSection, writeProgress } from './lib/progress.ts'
import { keyComparisons, renderSlotBusy } from './lib/statuspics.ts'

interface Pic { file: string; caption: string }

const args = parseArgs()
const extension = args.extension !== undefined ? Number(args.extension) : null
const phase = extension === null ? Number(str(args, 'phase')) : -1
const unit = typeof args.unit === 'string' ? args.unit : null
const round = typeof args.round === 'string' ? args.round : null
const sentence = (t: string) => (t && !/[.?]$/.test(t.trim()) ? `${t.trim()}.` : t.trim())
const changed = sentence(str(args, 'changed', ''))
const next = sentence(str(args, 'next', ''))
const max = config.status.maxPictures

const explicit: Pic[] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith('--') && a.includes('=') && fs.existsSync(path.resolve(a.slice(a.lastIndexOf('=') + 1))))
  .map((a) => ({ caption: a.slice(0, a.lastIndexOf('=')), file: path.resolve(a.slice(a.lastIndexOf('=') + 1)) }))

const now = Date.now()
const state = loadClock()
const boot = bootId()
let clockLines: string[]
let timeLine: string
if (extension !== null) {
  tickExtension(state, extension, now, boot)
  const r = reportExtension(state, extension, config.budget)
  clockLines = r.lines
  timeLine = `${r.usedH.toFixed(1)} h of ${config.budget.extendHours} h in extension ${extension}`
} else {
  tick(state, phase, now, boot)
  const r = report(state, phase, config.budget)
  clockLines = r.lines
  timeLine = `${r.usedH.toFixed(1)} h of ${r.allowedH} h`
}
markStatus(state, now)
saveClock(state)
writeClockTable(state)

const shownFile = path.join(WORK, 'status', 'shown.json')
const shown: string[] = fs.existsSync(shownFile) ? JSON.parse(fs.readFileSync(shownFile, 'utf8')) : []
const pics: Pic[] = []
const have = (file: string) => pics.some((p) => p.file === file)
for (const p of explicit) if (pics.length < max && fs.existsSync(p.file)) pics.push(p)
if (unit && !flag(args, 'only-explicit')) {
  for (const p of await keyComparisons(unit, { render: !renderSlotBusy() && !flag(args, 'no-render') })) if (pics.length < max && !have(p.file)) pics.push(p)
}
if (!flag(args, 'only-explicit')) {
  const looks = readLooks().reverse()
  for (const look of looks) {
    const file = at(look.file)
    if (pics.length >= max) break
    if (have(file) || shown.includes(look.file)) continue
    pics.push({ file, caption: look.caption || path.basename(file) })
  }
}
if (pics.length === 0 && !unit) {
  const dir = path.join(WORK, 'sheets')
  const sheets = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^film-.*\.jpg$/.test(f)).sort() : []
  for (const f of sheets.slice(0, max)) pics.push({ file: path.join(dir, f), caption: `Whole film sheet ${f.replace(/\.jpg$/, '')}` })
}
if (pics.length === 0) pics.push({ file: at('references/approved/contact-sheet.jpg'), caption: 'The eight approved images, in film order' })

const text = readProgress()
const lastNo = Number((getField(text, 'Last status') ?? '').match(/^(\d+)/)?.[1] ?? 0)
const no = String(lastNo + 1).padStart(2, '0')
const stamp = new Date(now).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
const url = getField(text, 'App URL') ?? ''
const published = /^https?:/.test(url)
const preview = getField(text, 'Review preview') ?? ''

const outDir = at('out', 'stills', 'status')
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })
const inline = []
const kept: { name: string; caption: string }[] = []
for (let i = 0; i < pics.length; i++) {
  const name = `status-${i + 1}.jpg`
  await sharp(pics[i].file)
    .rotate()
    .resize({ width: config.status.pictureLongEdgePx, height: config.status.pictureLongEdgePx, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#101010' })
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(path.join(outDir, name))
  kept.push({ name, caption: pics[i].caption })
  inline.push(await inlinePicture(path.join(outDir, name), pics[i].caption))
}

const where = extension !== null ? `Extension ${extension}` : `Phase ${phase}`
const head = [where, unit ? `unit ${unit}` : null, round ? `round ${round}` : null].filter(Boolean).join(' · ')
const lines = [
  `Status ${no} · ${head}${changed ? `. ${changed}` : ''}`,
  `${next ? `Next: ${next} ` : ''}Time used: ${timeLine}.`,
  published ? `Review page: ${url.replace(/\/$/, '')}/review.html` : /^https?:/.test(preview) ? `Review page, private preview: ${preview}` : 'Review page: not published yet.',
]
fs.writeFileSync(
  path.join(outDir, 'STATUS.md'),
  [`# Status ${no}`, '', `${stamp}`, '', ...lines.map((l) => `- ${l}`), '', ...kept.map((k) => `- \`${k.name}\`: ${k.caption}`), ''].join('\n'),
)
fs.mkdirSync(path.join(WORK, 'status'), { recursive: true })
fs.writeFileSync(path.join(WORK, 'status', 'status.json'), JSON.stringify({ pics: inline, lines }))
for (const p of pics) {
  const rel = path.relative(at(), p.file)
  if (!shown.includes(rel)) shown.push(rel)
}
fs.writeFileSync(shownFile, JSON.stringify(shown.slice(-400)))

let progress = readProgress()
progress = setField(progress, 'Last status', `${no} · ${stamp} · ${head}`)
const latestIntro = 'Newest first. Each line names the pictures of one status in `out/stills/status/`, with the time and the caption, so this page shows where the film is.'
const old = getSection(progress, 'Latest pictures')
  .split('\n')
  .filter((l) => l.startsWith('- '))
const entry = `- ${stamp} · status ${no} · ${head} · ${kept.map((k) => `\`${k.name}\`: ${k.caption}`).join('; ')}`
progress = setSection(progress, 'Latest pictures', [latestIntro, '', entry, ...old.slice(0, 11)].join('\n'))
progress = appendToSection(progress, 'Session log', `- Status ${no}, ${stamp}, ${head}. ${changed} Next: ${next} Time used: ${timeLine}.\n  Pictures: ${kept.map((k) => k.caption).join('; ')}.`)
writeProgress(progress)

console.log(lines.join('\n'))
console.log('---')
console.log(clockLines.join('\n'))
console.log('---')
console.log(`pictures: ${kept.map((k) => `${k.name} (${k.caption})`).join(' | ')}`)
console.log(`inline file: ${path.join(WORK, 'status', 'status.json')}`)
