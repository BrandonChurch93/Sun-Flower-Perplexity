import fs from 'node:fs'
import path from 'node:path'
import { config, frameCount } from '../src/config.ts'
import { samplesOf, tierIds } from '../src/core/tiers.ts'
import { judgedFrames, segments } from '../src/director/timeline.ts'
import { flag, parseArgs, str } from './lib/args.ts'
import { WORK } from './lib/paths.ts'
import { readProgress, setSection, writeProgress } from './lib/progress.ts'
import { writeRecord } from './lib/record.ts'
import { openSession, recordBase } from './lib/render.ts'

const args = parseArgs()
const only = typeof args.format === 'string' ? args.format.split(',') : null
const formats = Object.values(config.formats).filter((f) => !only || only.includes(f.id))
const judged = judgedFrames()
const probes = segments.map((s) => {
  const inUnit = judged.filter((j) => j.unit === s.id)
  return { unit: s.id, frame: (inUnit.find((j) => j.key) ?? inUnit[0] ?? { frame: Math.round((s.firstFrame + s.lastFrame) / 2) }).frame, frames: s.frames }
})

interface UnitCost { unit: string; frame: number; frames: number; perSample: number; fixed: number }
interface FormatCost { format: string; width: number; height: number; startSeconds: number; warmSeconds: number; units: UnitCost[]; finalStillSeconds: number | null; targetMb: number }

const costs: FormatCost[] = []
let textureMb: Record<string, number> = {}
let record: ReturnType<typeof recordBase> | null = null
const few = samplesOf('draft')
const some = samplesOf('review')

for (const format of formats) {
  const session = await openSession({ format: format.id, what: `budget ${format.id}` })
  try {
    const warm0 = await session.time(probes[0].frame, 'draft')
    const units: UnitCost[] = []
    for (const p of probes) {
      await session.time(p.frame, 'draft')
      const a = Math.min(await session.time(p.frame, 'draft'), await session.time(p.frame, 'draft'))
      const b = await session.time(p.frame, 'review')
      const perSample = Math.max(0, (b - a) / (some - few))
      units.push({ unit: p.unit, frame: p.frame, frames: p.frames, perSample, fixed: Math.max(0, a - perSample * few) })
      console.log(`${format.id} · ${p.unit} (frame ${p.frame}) · ${few} sample ${a.toFixed(2)} s · ${some} samples ${b.toFixed(2)} s · ${perSample.toFixed(3)} s per sample`)
    }
    let finalStillSeconds: number | null = null
    if (format.id === config.formats.master.id && !flag(args, 'no-final')) {
      const hero = probes.reduce((w, p) => (units.find((u) => u.unit === p.unit)!.perSample > units.find((u) => u.unit === w.unit)!.perSample ? p : w), probes[0])
      finalStillSeconds = await session.time(hero.frame, 'final')
      console.log(`${format.id} · one judged still at the final tier (frame ${hero.frame}) · ${finalStillSeconds.toFixed(1)} s measured`)
    }
    const info = await session.info()
    record = recordBase(session, info, 'budget', 'beauty')
    textureMb[info.assets] = info.textureMb
    const targetMb = (format.width * format.height * (8 + 4 + 16 * 2 + 8 * 2 + 8 * 1.4)) / 1048576
    costs.push({ format: format.id, width: format.width, height: format.height, startSeconds: session.startSeconds, warmSeconds: Math.max(0, warm0 - (units[0].fixed + units[0].perSample * few)), units, finalStillSeconds, targetMb })
  } finally {
    await session.close()
  }
}

if (!flag(args, 'no-web')) {
  const session = await openSession({ format: config.formats.preview.id, assets: 'web', what: 'budget web set' })
  try {
    for (const p of probes) await session.time(p.frame, 'draft')
    textureMb.web = (await session.info()).textureMb
  } finally {
    await session.close()
  }
}

const frameSeconds = (c: FormatCost, tier: (typeof tierIds)[number], unit?: string): number => {
  const list = unit ? c.units.filter((u) => u.unit === unit) : c.units
  const frames = list.reduce((a, u) => a + u.frames, 0)
  return list.reduce((a, u) => a + u.frames * (u.fixed + u.perSample * samplesOf(tier)), 0) / frames
}
const filmHours = (c: FormatCost, tier: (typeof tierIds)[number]): number => (frameCount * frameSeconds(c, tier) + c.startSeconds + c.warmSeconds) / 3600
const hm = (hours: number): string => (hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)} h`)
const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length

const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
const scene = str(args, 'scene', 'the current scene')
const rows: string[] = []
rows.push(`Measured ${stamp} on the Builder's VM (${record?.machine.cores} cores, software WebGL2). One sample is one full render of the scene. A frame costs a fixed part (building the plant, the lens and grade stage) plus its samples.`)
rows.push('')
rows.push('| Format | Size | Seconds per sample | Fixed seconds per frame | ' + tierIds.map((t) => `Frame at \`${t}\` (${samplesOf(t)})`).join(' | ') + ' | Start-up | First frame extra |')
rows.push('| --- | --- | --- | --- | ' + tierIds.map(() => '---').join(' | ') + ' | --- | --- |')
for (const c of costs) {
  rows.push(`| ${c.format} | ${c.width} x ${c.height} | ${mean(c.units.map((u) => u.perSample)).toFixed(3)} (${Math.min(...c.units.map((u) => u.perSample)).toFixed(3)} to ${Math.max(...c.units.map((u) => u.perSample)).toFixed(3)}) | ${mean(c.units.map((u) => u.fixed)).toFixed(2)} | ${tierIds.map((t) => `${frameSeconds(c, t).toFixed(1)} s`).join(' | ')} | ${c.startSeconds.toFixed(1)} s | ${c.warmSeconds.toFixed(1)} s |`)
}
rows.push('')
rows.push('| Whole film (' + frameCount + ' frames) | ' + tierIds.map((t) => `\`${t}\``).join(' | ') + ' |')
rows.push('| --- | ' + tierIds.map(() => '---').join(' | ') + ' |')
for (const c of costs) rows.push(`| ${c.format}, one VM | ${tierIds.map((t) => hm(filmHours(c, t))).join(' | ')} |`)
const master = costs.find((c) => c.format === config.formats.master.id)
if (master) {
  rows.push('')
  rows.push('| Per unit in ' + master.format + ' | Frames | ' + tierIds.map((t) => `\`${t}\``).join(' | ') + ' |')
  rows.push('| --- | --- | ' + tierIds.map(() => '---').join(' | ') + ' |')
  for (const u of master.units) rows.push(`| ${u.unit} | ${u.frames} | ${tierIds.map((t) => hm((u.frames * (u.fixed + u.perSample * samplesOf(t))) / 3600)).join(' | ')} |`)
  rows.push('')
  const worst = Math.max(...master.units.map((u) => u.fixed + u.perSample * samplesOf('final')))
  rows.push(`- One judged still at the \`final\` tier in ${master.format}: ${worst.toFixed(0)} s from the per sample numbers${master.finalStillSeconds !== null ? `, ${master.finalStillSeconds.toFixed(0)} s measured` : ''}, plus ${(master.startSeconds + master.warmSeconds).toFixed(0)} s to start. It fits in \`sandbox.chunkBudgetMinutes\` (${config.sandbox.chunkBudgetMinutes} min)${worst + master.startSeconds < config.sandbox.chunkBudgetMinutes * 60 ? '' : ': NO, the frame must be split'}.`)
  const longest = Math.max(...master.units.map((u) => (u.frames * (u.fixed + u.perSample * samplesOf('final'))) / 3600))
  rows.push(`- The whole film at \`final\` in ${master.format} with the units split across sandbox agents ends when the longest unit ends: about ${hm(longest)} on a VM of this speed.`)
}
rows.push(`- Texture memory, as the loader counts it with mipmaps: ${Object.entries(textureMb).map(([set, mb]) => `\`${set}\` ${mb.toFixed(1)} MB of ${config.assetSets[set as keyof typeof config.assetSets].maxTextureMb} MB`).join(', ')}. Render targets on top of that: ${costs.map((c) => `${c.format} about ${c.targetMb.toFixed(0)} MB`).join(', ')}.`)

const out = path.join(WORK, 'budget', 'budget.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify({ at: stamp, scene, costs, textureMb }, null, 2) + '\n')
if (record) writeRecord(out, record)
const intro = 'Seconds per sample and per frame at each format and tier, the time for one judged still at the `final` tier, the time for the whole film at each tier, and the texture memory. Measured in Phases 0, 2, 3 and 5.'
if (!flag(args, 'no-write')) {
  const text = readProgress()
  const old = text.match(/## Render budget\n[\s\S]*?(?=\n## )/)?.[0] ?? ''
  const earlier = old.split('\n### ').slice(1).map((s) => '### ' + s.trim())
  const body = [intro, '', `### ${scene}`, '', ...rows, '', ...earlier.filter((e) => !e.startsWith(`### ${scene}\n`)).flatMap((e) => [e, ''])].join('\n')
  writeProgress(setSection(text, 'Render budget', body))
}
console.log(rows.join('\n'))
