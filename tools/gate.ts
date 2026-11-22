import { execSync, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { config, frameCount } from '../src/config.ts'
import { continuityFrom } from '../src/director/continuity.ts'
import type { FrameState } from '../src/director/state.ts'
import { cuts, judgedFrames } from '../src/director/timeline.ts'
import { flag, parseArgs, str } from './lib/args.ts'
import { computeHashes } from './lib/hashes.ts'
import { at, ROOT, WORK } from './lib/paths.ts'
import { getSection, readProgress } from './lib/progress.ts'
import { readRecord } from './lib/record.ts'
import { openSession } from './lib/render.ts'

interface Result { id: string; ok: boolean; detail: string }
type Check = () => Promise<Result> | Result

const args = parseArgs()
const GATE_DIR = path.join(WORK, 'gate')
fs.mkdirSync(GATE_DIR, { recursive: true })

function run(command: string, timeoutMinutes = 9): { ok: boolean; text: string } {
  const r = spawnSync('bash', ['-lc', command], { cwd: ROOT, encoding: 'utf8', timeout: timeoutMinutes * 60000, maxBuffer: 64 * 1024 * 1024 })
  return { ok: r.status === 0, text: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

const tail = (text: string, n = 6) => text.trim().split('\n').slice(-n).join(' / ')
const tracked = (): string[] => execSync('git ls-files -z', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean)

const g1: Check = () => {
  const r = run('npm run build')
  return { id: 'G1', ok: r.ok, detail: r.ok ? 'npm run build exits clean, no type errors' : tail(r.text) }
}

const g2: Check = () => {
  const file = path.join(GATE_DIR, 'tests.json')
  fs.rmSync(file, { force: true })
  const r = run(`npx vitest run --reporter=json --outputFile=${JSON.stringify(file)}`)
  let detail = tail(r.text)
  if (fs.existsSync(file)) {
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as { numTotalTests: number; numPassedTests: number; numFailedTests: number; numTotalTestSuites: number }
    detail = `${j.numPassedTests} of ${j.numTotalTests} unit tests pass${j.numFailedTests ? `, ${j.numFailedTests} fail` : ''}`
  }
  return { id: 'G2', ok: r.ok, detail }
}

const g3: Check = () => {
  const file = path.join(WORK, 'determinism', 'result.json')
  const hashes = computeHashes()
  const record = readRecord(file)
  if (!flag(args, 'fresh') && record && record.engineHash === hashes.engineHash && JSON.stringify(record.unitHashes) === JSON.stringify(hashes.unitHashes)) {
    const j = JSON.parse(fs.readFileSync(file, 'utf8')) as { ok: boolean; frames: number[]; format: string; tier: string }
    if (j.ok) return { id: 'G3', ok: true, detail: `frames ${j.frames.join(', ')} are pixel identical across fresh page loads and in another order (${j.format}, ${j.tier}; result of this build reused)` }
  }
  const r = run('npx tsx tools/determinism.ts', 40)
  return { id: 'G3', ok: r.ok, detail: tail(r.text, 1) }
}

const g4: Check = async () => {
  const problems: string[] = []
  const seen: string[] = []
  let count = -1
  for (const format of Object.values(config.formats)) {
    const session = await openSession({ format: format.id, what: 'gate G4' })
    try {
      const { png } = await session.render(judgedFrames()[1].frame, 'draft')
      const meta = await sharp(png).metadata()
      seen.push(`${format.id} ${meta.width} x ${meta.height}`)
      if (meta.width !== format.width || meta.height !== format.height) problems.push(`a ${format.id} still is ${meta.width} x ${meta.height}, not ${format.width} x ${format.height}`)
      count = (await session.info()).frameCount
    } finally {
      await session.close()
    }
  }
  const dir = path.join(WORK, 'stills')
  let checked = 0
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.png'))) {
      const record = readRecord(path.join(dir, name))
      const format = Object.values(config.formats).find((f) => f.id === record?.format)
      if (!format) continue
      const meta = await sharp(path.join(dir, name)).metadata()
      checked++
      if (meta.width !== format.width || meta.height !== format.height) problems.push(`${name} is ${meta.width} x ${meta.height}`)
    }
  }
  const wanted = config.film.fps * config.film.durationSeconds
  if (count !== wanted || frameCount !== wanted) problems.push(`info().frameCount is ${count}, not ${wanted}`)
  return { id: 'G4', ok: problems.length === 0, detail: problems.length ? problems.join('; ') : `stills are ${seen.join(', ')}; ${checked} stills on disk match their format; info().frameCount is ${count}` }
}

const g5: Check = async () => {
  const problems: string[] = []
  for (const mode of ['capture', 'autopilot']) {
    const session = await openSession({ mode, format: config.formats.preview.id, what: 'gate G5', extra: mode === 'autopilot' ? 'hold=1' : '' })
    try {
      await session.page.waitForTimeout(600)
      const found = await session.page.evaluate(() => {
        const out: string[] = []
        const canvas = document.getElementById('film')
        for (const el of Array.from(document.body.querySelectorAll('*'))) {
          if (el === canvas || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue
          const box = el.getBoundingClientRect()
          const style = getComputedStyle(el)
          if (box.width < 1 || box.height < 1 || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue
          const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0)
          const painted = style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.borderTopWidth !== '0px' || own || el.tagName === 'IMG' || el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT'
          if (painted) out.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`)
        }
        return { out, cursor: getComputedStyle(document.body).cursor }
      })
      if (found.out.length) problems.push(`${mode} shows ${found.out.slice(0, 5).join(', ')}`)
    } finally {
      await session.close()
    }
  }
  const proof = path.join(WORK, 'export', 'proof.json')
  let exportNote = 'the export proof has not been made yet'
  if (fs.existsSync(proof)) {
    const j = JSON.parse(fs.readFileSync(proof, 'utf8')) as { interfaceFree?: boolean }
    if (j.interfaceFree === false) problems.push('the export proof holds an interface element')
    else exportNote = 'the export proof frames are clean'
  }
  return { id: 'G5', ok: problems.length === 0, detail: problems.length ? problems.join('; ') : `no interface element in capture or autopilot; ${exportNote}` }
}

const g6: Check = () => {
  const section = getSection(readProgress(), 'Judged frames')
  const listed = new Set([...section.matchAll(/^\| (\d+) \|/gm)].map((m) => Number(m[1])))
  const missing = judgedFrames().filter((j) => !listed.has(j.frame))
  return { id: 'G6', ok: missing.length === 0, detail: missing.length ? `the config is valid, but frames ${missing.map((j) => j.frame).join(', ')} are not on the judged list in kit/PROGRESS.md` : `the config passes validation and all ${judgedFrames().length} computed judged frames are on the list in kit/PROGRESS.md` }
}

const g7: Check = () => {
  const p = config.platform
  const m = config.formats.master
  const problems: string[] = []
  if (m.width > p.maxWidth || m.height > p.maxHeight) problems.push(`the master is ${m.width} x ${m.height}, over ${p.maxWidth} x ${p.maxHeight}`)
  if (config.film.fps > p.maxFps) problems.push(`${config.film.fps} fps is over ${p.maxFps}`)
  if (config.export.bitrateMbps > p.maxBitrateMbps) problems.push(`${config.export.bitrateMbps} Mbps is over ${p.maxBitrateMbps}`)
  if (config.film.durationSeconds > p.standardAccountMaxSeconds) problems.push(`${config.film.durationSeconds} s is over ${p.standardAccountMaxSeconds} s`)
  return { id: 'G7', ok: problems.length === 0, detail: problems.length ? problems.join('; ') : `the master (${m.width} x ${m.height}, ${config.film.fps} fps, ${config.export.bitrateMbps} Mbps, ${config.film.durationSeconds} s) fits ${p.name}` }
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p, out)
    else if (name !== '.DS_Store' && name !== '.gitkeep') out.push(p)
  }
  return out
}

const g8: Check = () => {
  const problems: string[] = []
  const ledger = fs.existsSync(at('ASSETS.md')) ? fs.readFileSync(at('ASSETS.md'), 'utf8') : ''
  const third = walk(at('public', 'assets', 'third-party'))
  for (const file of third) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/')
    if (!ledger.includes(rel) && !ledger.includes(path.basename(file))) problems.push(`${rel} has no row in ASSETS.md`)
  }
  const made = walk(at('public', 'assets')).filter((f) => !f.includes(`${path.sep}third-party${path.sep}`))
  for (const file of made) {
    const rel = path.relative(at('public', 'assets'), file).split(path.sep)
    const owner = rel[0] === 'worlds' ? path.join('worlds', rel[1]) : rel[0]
    // The recipe sits beside the part that owns the file: the nearest RECIPE.md from the file's own folder (without its set) up to its owner.
    const sets = Object.keys(config.assetSets)
    const folders = rel.slice(0, -1).filter((name) => !sets.includes(name))
    const least = owner.split(path.sep).length
    const tried: string[] = []
    let named = false
    let found = false
    for (let depth = folders.length; depth >= least && !named; depth--) {
      const recipe = at('assets-src', ...folders.slice(0, depth), 'RECIPE.md')
      tried.push(path.relative(ROOT, recipe).split(path.sep).join('/'))
      if (!fs.existsSync(recipe)) continue
      found = true
      named = fs.readFileSync(recipe, 'utf8').includes(path.basename(file))
    }
    if (!found) problems.push(`${rel.join('/')} has no recipe (looked for ${tried.join(', ')})`)
    else if (!named) problems.push(`no recipe names ${path.basename(file)} (looked in ${tried.join(', ')})`)
  }
  return { id: 'G8', ok: problems.length === 0, detail: problems.length ? problems.slice(0, 6).join('; ') : `${third.length} third-party files have ledger rows, ${made.length} generated files have recipes` }
}

const g9: Check = () => {
  const problems: string[] = []
  const files = tracked()
  let total = 0
  let largest = { file: '', mb: 0 }
  for (const f of files) {
    const p = at(f)
    if (!fs.existsSync(p)) continue
    const mb = fs.statSync(p).size / 1048576
    total += mb
    if (mb > largest.mb) largest = { file: f, mb }
    if (mb > config.repo.maxFileMb) problems.push(`${f} is ${mb.toFixed(0)} MB`)
    if (f.startsWith('references/cache/') || f.startsWith('out/work/')) problems.push(`${f} is tracked`)
    if (/(^|\/)\.env(\.|$)/.test(f) || /\.(pem|key|p12)$/.test(f)) problems.push(`${f} looks like a secret`)
  }
  if (total / 1024 > config.repo.maxTreeGb) problems.push(`the tracked files add up to ${(total / 1024).toFixed(2)} GB`)
  const secret = /(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{20,})/
  for (const f of files) {
    if (!/\.(ts|js|json|md|html|css|txt|yml|yaml|sh|npmrc)$/.test(f) && !f.endsWith('.npmrc')) continue
    const p = at(f)
    if (!fs.existsSync(p) || fs.statSync(p).size > 4 * 1048576) continue
    if (secret.test(fs.readFileSync(p, 'utf8'))) problems.push(`${f} holds what looks like a secret`)
  }
  const manifest = at('references', 'approved', 'MANIFEST.sha256')
  let hashed = 0
  if (!fs.existsSync(manifest)) problems.push('references/approved/MANIFEST.sha256 is missing')
  else {
    for (const line of fs.readFileSync(manifest, 'utf8').split('\n')) {
      const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/)
      if (!m) continue
      const p = at('references', 'approved', m[2].trim())
      if (!fs.existsSync(p)) problems.push(`${m[2]} is missing`)
      else if (crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') !== m[1]) problems.push(`${m[2]} no longer has its listed hash`)
      else hashed++
    }
  }
  return { id: 'G9', ok: problems.length === 0, detail: problems.length ? problems.slice(0, 6).join('; ') : `${files.length} tracked files, ${total.toFixed(0)} MB in all, the largest ${largest.mb.toFixed(1)} MB (${largest.file}); no secret; ${hashed} approved files match the manifest` }
}

const g10: Check = async () => {
  const caps = JSON.parse(fs.readFileSync(at('config', 'webgl-caps.json'), 'utf8')) as { limits: Record<string, number | number[]>; extensions: string[] }
  const problems: string[] = []
  const lines: string[] = []
  for (const format of [config.formats.master, config.formats.uhd]) {
    const session = await openSession({ format: format.id, what: 'gate G10' })
    try {
      await session.render(judgedFrames()[1].frame, 'draft')
      const need = await session.page.evaluate(() => window.showcase.requirements())
      for (const e of need.extensions) if (!caps.extensions.includes(e)) problems.push(`the extension ${e} is not in config/webgl-caps.json`)
      for (const [name, value] of Object.entries(need.limits)) {
        const have = caps.limits[name]
        const most = Array.isArray(have) ? Math.min(...have) : have
        if (typeof most !== 'number') problems.push(`the limit ${name} was not recorded`)
        else if (value > most) problems.push(`${format.id} needs ${name} ${value}, the record has ${most}`)
      }
      lines.push(`${format.id}: ${need.extensions.join(', ')}; ${Object.entries(need.limits).map(([k, v]) => `${k} ${v}`).join(', ')}`)
    } finally {
      await session.close()
    }
  }
  return { id: 'G10', ok: problems.length === 0, detail: problems.length ? problems.join('; ') : `everything the app requires is in the Phase 0 record (${lines.join(' | ')})` }
}

const g11: Check = async () => {
  const problems: string[] = []
  const lines: string[] = []
  for (const set of Object.keys(config.assetSets) as (keyof typeof config.assetSets)[]) {
    const session = await openSession({ assets: set, what: 'gate G11' })
    try {
      for (const j of judgedFrames().filter((_, i) => i % 3 === 1)) await session.time(j.frame, 'draft')
      const mb = (await session.info()).textureMb
      lines.push(`${set} ${mb.toFixed(0)} MB of ${config.assetSets[set].maxTextureMb}`)
      if (mb > config.assetSets[set].maxTextureMb) problems.push(`the ${set} set holds ${mb.toFixed(0)} MB, over ${config.assetSets[set].maxTextureMb}`)
    } finally {
      await session.close()
    }
  }
  return { id: 'G11', ok: problems.length === 0, detail: problems.length ? problems.join('; ') : `texture memory: ${lines.join(', ')}` }
}

const g12: Check = async () => {
  const problems: string[] = []
  const lines: string[] = []
  const session = await openSession({ format: config.formats.preview.id, what: 'gate G12' })
  try {
    for (const cut of cuts) {
      const frames = [cut.frame - 2, cut.frame - 1, cut.frame, cut.frame + 1]
      const states = (await session.page.evaluate((list) => list.map((f) => window.showcase.state(f)), frames)) as FrameState[]
      const c = continuityFrom((f) => states[frames.indexOf(f)], cut.frame)
      if (states[1].world !== cut.fromWorld || states[2].world !== cut.toWorld) problems.push(`cut ${cut.index} (frame ${cut.frame}): the world goes from ${states[1].world} to ${states[2].world}, not from ${cut.fromWorld} to ${cut.toWorld}`)
      const bad = c.steps.filter((s) => s.ratio > config.continuity.maxStepRatio)
      for (const s of bad) problems.push(`cut ${cut.index} (frame ${cut.frame}): ${s.name} steps ${s.across.toExponential(2)} against ${s.ordinary.toExponential(2)} beside it`)
      lines.push(`cut ${cut.index} worst ratio ${c.worst.ratio.toFixed(2)} (${c.worst.name})`)
    }
  } finally {
    await session.close()
  }
  return { id: 'G12', ok: problems.length === 0, detail: problems.length ? problems.slice(0, 6).join('; ') : `${lines.join(', ')}; the limit is ${config.continuity.maxStepRatio}` }
}

const g13: Check = async () => {
  const section = getSection(readProgress(), 'Units')
  const finished = [...section.matchAll(/^\| ([a-z-]+) \| finished \|/gm)].map((m) => m[1])
  const session = await openSession({ what: 'gate G13' })
  try {
    for (const j of judgedFrames()) await session.time(j.frame, 'draft')
    const standIns = (await session.info()).standIns
    const bad = standIns.filter((s) => s.units.some((u) => finished.includes(u)))
    return {
      id: 'G13',
      ok: bad.length === 0,
      detail: bad.length ? `${bad.map((s) => `${s.name} (${s.units.filter((u) => finished.includes(u)).join(', ')})`).join('; ')} still stand in for finished units` : `finished units: ${finished.join(', ') || 'none'}; ${standIns.length} stand-ins remain, none in a finished unit`,
    }
  } finally {
    await session.close()
  }
}

function probe(file: string): { width: number; height: number; frames: number; fps: number; codec: string } | null {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames,r_frame_rate,codec_name', '-of', 'json', file], { encoding: 'utf8' })
  if (r.status !== 0) return null
  const s = (JSON.parse(r.stdout) as { streams: { width: number; height: number; nb_read_frames: string; r_frame_rate: string; codec_name: string }[] }).streams[0]
  if (!s) return null
  const [n, d] = s.r_frame_rate.split('/').map(Number)
  return { width: s.width, height: s.height, frames: Number(s.nb_read_frames), fps: n / (d || 1), codec: s.codec_name }
}

const d1: Check = () => {
  const file = at('out', 'roughcut.mp4')
  if (!fs.existsSync(file)) return { id: 'D1', ok: false, detail: 'out/roughcut.mp4 does not exist' }
  const p = probe(file)
  const f = config.formats.preview
  if (!p) return { id: 'D1', ok: false, detail: 'ffprobe could not read out/roughcut.mp4' }
  const ok = p.frames === frameCount && p.width === f.width && p.height === f.height
  return { id: 'D1', ok, detail: `out/roughcut.mp4 has ${p.frames} frames at ${p.width} x ${p.height}, ${p.fps} fps (wanted ${frameCount} frames at ${f.width} x ${f.height})` }
}

const d2: Check = () => {
  const file = at('out', 'preview.mp4')
  if (!fs.existsSync(file)) return { id: 'D2', ok: false, detail: 'out/preview.mp4 does not exist' }
  const p = probe(file)
  const f = config.formats.preview
  if (!p) return { id: 'D2', ok: false, detail: 'ffprobe could not read out/preview.mp4' }
  const problems: string[] = []
  if (p.frames !== frameCount) problems.push(`${p.frames} frames, not ${frameCount}`)
  if (Math.abs(p.fps - config.film.fps) > 1e-6) problems.push(`${p.fps} fps, not ${config.film.fps}`)
  if (p.width !== f.width || p.height !== f.height) problems.push(`${p.width} x ${p.height}, not ${f.width} x ${f.height}`)
  const mb = fs.statSync(file).size / 1048576
  if (mb >= config.repo.maxFileMb) problems.push(`${mb.toFixed(0)} MB, over ${config.repo.maxFileMb}`)
  const recordFile = at('out', 'preview.mp4.json')
  if (!fs.existsSync(recordFile)) problems.push('it has no record')
  else {
    const record = JSON.parse(fs.readFileSync(recordFile, 'utf8')) as { engineHash: string; unitHashes: Record<string, string>; m1?: { checked: number; failed: number[] } }
    const hashes = computeHashes()
    if (record.engineHash !== hashes.engineHash || JSON.stringify(record.unitHashes) !== JSON.stringify(hashes.unitHashes)) problems.push('it was not rendered from the current build')
    if (!record.m1) problems.push('its record holds no M1 result')
    else if (record.m1.checked !== frameCount) problems.push(`its record holds the M1 result of ${record.m1.checked} frames`)
    else if (record.m1.failed.length) {
      const open = getSection(readProgress(), 'Open items')
      if (!/M1/.test(open)) problems.push(`${record.m1.failed.length} frames failed M1 and are not logged as open items`)
    }
  }
  return { id: 'D2', ok: problems.length === 0, detail: problems.length ? `out/preview.mp4: ${problems.join('; ')}` : `out/preview.mp4 has ${p.frames} frames at ${p.width} x ${p.height}, ${p.fps} fps, ${mb.toFixed(1)} MB, from the current build, with the M1 result of every frame` }
}

const d3: Check = () => {
  const file = path.join(WORK, 'export', 'proof.json')
  if (!fs.existsSync(file)) return { id: 'D3', ok: false, detail: 'the export proof does not exist. Run npm run proof' }
  const j = JSON.parse(fs.readFileSync(file, 'utf8')) as { ok: boolean; engineHash: string; unitHashes: Record<string, string>; detail: string; interfaceFree?: boolean }
  const hashes = computeHashes()
  const current = j.engineHash === hashes.engineHash && JSON.stringify(j.unitHashes) === JSON.stringify(hashes.unitHashes)
  const ok = j.ok && current && j.interfaceFree !== false
  return { id: 'D3', ok, detail: !current ? 'the export proof was not made from the current build' : j.detail }
}

const CHECKS: Record<string, Check> = { G1: g1, G2: g2, G3: g3, G4: g4, G5: g5, G6: g6, G7: g7, G8: g8, G9: g9, G10: g10, G11: g11, G12: g12, G13: g13, D1: d1, D2: d2, D3: d3 }
const MACHINE = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13']
const PHASES: Record<string, string[]> = {
  '0': ['G1', 'G2', 'G3', 'G4', 'G10'],
  '1': ['D1'],
  '2': [...MACHINE.slice(0, 12), 'D2', 'D3'],
  '3': MACHINE,
  '4': MACHINE,
  '5': [...MACHINE, 'D2'],
  '6': [...MACHINE, 'D2', 'D3'],
}

const phase = str(args, 'phase', '')
let ids: string[]
if (typeof args.only === 'string') ids = args.only.split(',').map((s) => s.trim().toUpperCase())
else if (flag(args, 'machine')) ids = phase === '2' ? MACHINE.slice(0, 12) : MACHINE
else if (phase in PHASES) ids = PHASES[phase]
else throw new Error('usage: npm run gate -- --phase N [--machine] [--only G1,G2] [--fresh]')

const results: Result[] = []
for (const id of ids) {
  const check = CHECKS[id]
  if (!check) throw new Error(`unknown check ${id}`)
  let result: Result
  try {
    result = await check()
  } catch (error) {
    result = { id, ok: false, detail: `the check itself failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}` }
  }
  results.push(result)
  console.log(`${result.id} ${result.ok ? 'pass' : 'FAIL'} · ${result.detail}`)
}
const hashes = computeHashes()
const out = path.join(GATE_DIR, `phase-${phase || 'x'}${flag(args, 'machine') ? '-machine' : ''}.json`)
fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), phase, ...hashes, results }, null, 2) + '\n')
const red = results.filter((r) => !r.ok)
console.log(red.length ? `gate: ${red.length} of ${results.length} red (${red.map((r) => r.id).join(', ')})` : `gate: all ${results.length} green`)
process.exit(red.length ? 1 : 0)
