import raw from '../config/showcase.json'

export interface Format { id: string; width: number; height: number }
export interface Segment { id: string; world: string; start: number; end: number }
export interface Key { id: string; unit: string; time: number; image: string; settled?: string[] }
export interface CameraKey { time: number; distanceM: number; heightM: number; aimHeightM: number; frameX: number; azimuthDeg: number; focalMm: number }
export interface AssetSet { skyWidth: number; plantMapWidth: number; groundMapWidth: number; maxTextureMb: number }
export interface GrowthMark { seconds?: number; bar?: number; tau: number }
export interface Section { id: string; name: string; fromBar: number; toBar: number; kind: 'grow' | 'hold' | 'bloom' | 'field' }
export interface Look { id: string; section: string; seconds?: number; bar?: number; beat?: number; image: string }
export interface Budget {
  runHours: number
  phaseHours: Record<string, number>
  continueHours: number
  extendHours: number
  wrapUpMinutes: number
  floorFixMinutes: number
  statusMaxGapMinutes: number
  jobOverrunFactor: number
  agentWaitMinutes: number
  toolRetryMax: number
}
export interface Config {
  name: string
  slug: string
  seed: number
  repo: { url: string; branch: string; maxFileMb: number; maxTreeGb: number; maxPushGb: number }
  film: { fps: number; durationSeconds: number; shutterDegrees: number; hookSeconds: number }
  growth: { seconds: number; germination: GrowthMark[]; frostHold: number; stormHold: number; bud: number; open: number; crane: number; field: number }
  music: { title: string; bpm: number; beatsPerBar: number; bar1Seconds: number; seconds: number; sha256: string; map: string }
  sections: Section[]
  looks: Look[]
  formats: Record<'master' | 'preview' | 'uhd', Format>
  platform: { name: string; maxWidth: number; maxHeight: number; maxFps: number; maxBitrateMbps: number; standardAccountMaxSeconds: number; loopsUnderSeconds: number }
  export: { container: string; videoCodec: string; bitrateMbps: number; audio: string; proofSeconds: number; memoryTestSeconds: number; files: { master: string; uhd: string; clip: string; preview: string } }
  previewFilm: { bitrateMbps: number }
  tiers: Record<'draft' | 'review' | 'final', { samplesPerFrame: number }>
  assetSets: Record<'web' | 'full', AssetSet>
  worlds: { id: string; name: string }[]
  segments: Segment[]
  lookLockUnit: string
  buildOrderAfterLookLock: string[]
  keys: Key[]
  plant: {
    fullHeightM: number
    headDiameterM: number
    discDiameterM: number
    heightM: [number, number][]
    stages: Record<'emerge' | 'seedLeaves' | 'leaves' | 'bud' | 'bloom', [number, number]>
    leafCount: number
    rayFlorets: number
    discFlorets: number
    goldenAngleDeg: number
    leanEaseSeconds: number
  }
  camera: { gateWidthMm: number; keys: CameraKey[] }
  field: {
    plantSpacingM: number
    rowSpacingM: number
    minPlantsInView: number
    plantAheadOfRowM: number
    companion: { fromAzimuthDeg: number; leftM: number; towardCameraM: number; heightRatio: number }
  }
  continuity: { maxStepRatio: number }
  detail: { focusCocPx: number; minTexelsPerPixel: number; maxSoftPixelFraction: number; minSharpnessRatio: number; tipMarginFraction: number }
  reference: { photosPerPart: number; motionStudies: number }
  assets: { maxTakesPerAsset: number }
  quality: {
    passScore: number
    blockoutPass: number
    blockoutMaxRounds: number
    lookLockMaxRounds: number
    maxRoundsPerUnit: number
    wholeFilmMaxRounds: number
    polishMaxRounds: number
    plateauRounds: number
    recordRoundMaxRuns: number
    gauntletMaxPasses: number
    gateFixMaxAttempts: number
    compressionStressMbps: number
    stress: { seconds: number; units: string[]; tier: string }
    jury: { jurors: number; maxShareGap: number }
    crossMachineMinPsnr: number
  }
  critics: { maxImageLongEdgePx: number; contactSheetFrames: number; phonePreviewWidthPx: number; maxFilesPerMessage: number }
  status: { minGapMinutes: number; maxPictures: number; pictureLongEdgePx: number }
  budget: Budget
  sandbox: { stepTimeoutMinutes: number; chunkBudgetMinutes: number; previewFilmMaxHours: number; maxRenderProcesses: number; maxFramesOnDisk: number; minFreeDiskGb: number; maxDownloadGb: number; maxAgents: number }
  deliver: { sandboxMaster: boolean }
}

export type TierId = keyof Config['tiers']
export type FormatKey = keyof Config['formats']
export type AssetSetId = keyof Config['assetSets']

const REQUIRED: Record<string, string[]> = {
  '': ['name', 'slug', 'seed', 'repo', 'film', 'growth', 'music', 'sections', 'looks', 'formats', 'platform', 'export', 'previewFilm', 'tiers', 'assetSets', 'worlds', 'segments', 'lookLockUnit', 'buildOrderAfterLookLock', 'keys', 'plant', 'camera', 'field', 'continuity', 'detail', 'reference', 'assets', 'quality', 'critics', 'status', 'budget', 'sandbox', 'deliver'],
  repo: ['url', 'branch', 'maxFileMb', 'maxTreeGb', 'maxPushGb'],
  film: ['fps', 'durationSeconds', 'shutterDegrees', 'hookSeconds'],
  growth: ['seconds', 'germination', 'frostHold', 'stormHold', 'bud', 'open', 'crane', 'field'],
  music: ['title', 'bpm', 'beatsPerBar', 'bar1Seconds', 'seconds', 'sha256', 'map'],
  formats: ['master', 'preview', 'uhd'],
  platform: ['name', 'maxWidth', 'maxHeight', 'maxFps', 'maxBitrateMbps', 'standardAccountMaxSeconds', 'loopsUnderSeconds'],
  export: ['container', 'videoCodec', 'bitrateMbps', 'audio', 'proofSeconds', 'memoryTestSeconds', 'files'],
  previewFilm: ['bitrateMbps'],
  tiers: ['draft', 'review', 'final'],
  assetSets: ['web', 'full'],
  plant: ['fullHeightM', 'headDiameterM', 'discDiameterM', 'heightM', 'stages', 'leafCount', 'rayFlorets', 'discFlorets', 'goldenAngleDeg', 'leanEaseSeconds'],
  camera: ['gateWidthMm', 'keys'],
  field: ['plantSpacingM', 'rowSpacingM', 'minPlantsInView', 'plantAheadOfRowM', 'companion'],
  continuity: ['maxStepRatio'],
  detail: ['focusCocPx', 'minTexelsPerPixel', 'maxSoftPixelFraction', 'minSharpnessRatio', 'tipMarginFraction'],
  reference: ['photosPerPart', 'motionStudies'],
  assets: ['maxTakesPerAsset'],
  quality: ['passScore', 'blockoutPass', 'blockoutMaxRounds', 'lookLockMaxRounds', 'maxRoundsPerUnit', 'wholeFilmMaxRounds', 'polishMaxRounds', 'plateauRounds', 'recordRoundMaxRuns', 'gauntletMaxPasses', 'gateFixMaxAttempts', 'compressionStressMbps', 'stress', 'jury', 'crossMachineMinPsnr'],
  critics: ['maxImageLongEdgePx', 'contactSheetFrames', 'phonePreviewWidthPx', 'maxFilesPerMessage'],
  status: ['minGapMinutes', 'maxPictures', 'pictureLongEdgePx'],
  budget: ['runHours', 'phaseHours', 'continueHours', 'extendHours', 'wrapUpMinutes', 'floorFixMinutes', 'statusMaxGapMinutes', 'jobOverrunFactor', 'agentWaitMinutes', 'toolRetryMax'],
  sandbox: ['stepTimeoutMinutes', 'chunkBudgetMinutes', 'previewFilmMaxHours', 'maxRenderProcesses', 'maxFramesOnDisk', 'minFreeDiskGb', 'maxDownloadGb', 'maxAgents'],
  deliver: ['sandboxMaster'],
}

export class ConfigError extends Error {}

function fail(message: string): never {
  throw new ConfigError(`config/showcase.json: ${message}`)
}

function isWholeFrame(seconds: number, fps: number): boolean {
  const f = seconds * fps
  return Math.abs(f - Math.round(f)) < 1e-6
}

export interface ValidateOptions { imageExists?: (path: string) => boolean }

export function validateConfig(input: unknown, options: ValidateOptions = {}): Config {
  if (typeof input !== 'object' || input === null) fail('the config is not an object')
  const root = input as Record<string, unknown>
  for (const [section, names] of Object.entries(REQUIRED)) {
    const holder = section === '' ? root : (root[section] as Record<string, unknown> | undefined)
    if (typeof holder !== 'object' || holder === null) fail(`the key "${section}" is missing`)
    for (const name of names) {
      if (!(name in holder) || holder[name] === undefined || holder[name] === null) fail(`the key "${section === '' ? name : `${section}.${name}`}" is missing`)
    }
  }
  const c = input as Config
  const { fps, durationSeconds, hookSeconds } = c.film
  if (!(fps > 0) || !Number.isInteger(fps)) fail('film.fps must be a whole number above zero')
  if (!isWholeFrame(durationSeconds, fps)) fail('film.durationSeconds is not on a whole frame')
  if (!isWholeFrame(hookSeconds, fps)) fail('film.hookSeconds is not on a whole frame')
  if (!Array.isArray(c.segments) || c.segments.length === 0) fail('segments is empty')
  const worldIds = new Set(c.worlds.map((w) => w.id))
  if (c.segments[0].start !== 0) fail('the segments do not start at 0')
  let at = 0
  const seen = new Set<string>()
  for (const s of c.segments) {
    for (const name of ['id', 'world', 'start', 'end'] as const) if (s[name] === undefined) fail(`a segment is missing the key "${name}"`)
    if (seen.has(s.id)) fail(`the segment id "${s.id}" is used twice`)
    seen.add(s.id)
    if (!worldIds.has(s.world)) fail(`segment "${s.id}" names the unknown world "${s.world}"`)
    if (s.start > at + 1e-9) fail(`there is a gap before segment "${s.id}"`)
    if (s.start < at - 1e-9) fail(`segment "${s.id}" overlaps the one before it`)
    if (!(s.end > s.start)) fail(`segment "${s.id}" has no length`)
    if (!isWholeFrame(s.start, fps) || !isWholeFrame(s.end, fps)) fail(`a boundary of segment "${s.id}" is not on a whole frame`)
    at = s.end
  }
  if (Math.abs(at - c.growth.seconds) > 1e-9) fail('the last segment does not end at growth.seconds')
  if (!(durationSeconds > 0)) fail('film.durationSeconds must be above zero')
  if (!Array.isArray(c.sections) || c.sections.length === 0) fail('sections is empty')
  let bar = c.sections[0].fromBar
  const sectionIds = new Set<string>()
  for (const s of c.sections) {
    if (sectionIds.has(s.id)) fail(`the section id "${s.id}" is used twice`)
    sectionIds.add(s.id)
    if (s.fromBar !== bar) fail(`section "${s.id}" does not start where the one before it ends`)
    if (!(s.toBar > s.fromBar)) fail(`section "${s.id}" has no length`)
    bar = s.toBar
  }
  const lookIds = new Set<string>()
  for (const l of c.looks) {
    if (lookIds.has(l.id)) fail(`the look id "${l.id}" is used twice`)
    lookIds.add(l.id)
    if (!sectionIds.has(l.section)) fail(`look "${l.id}" names the unknown section "${l.section}"`)
    if (l.seconds === undefined && l.bar === undefined) fail(`look "${l.id}" has neither seconds nor a bar`)
    if (options.imageExists && !options.imageExists(l.image)) fail(`the reference image "${l.image}" is missing`)
  }
  const marks = c.growth.germination
  for (let i = 1; i < marks.length; i++) if (!(marks[i].tau > marks[i - 1].tau)) fail('growth.germination must rise')
  if (!seen.has(c.lookLockUnit)) fail(`lookLockUnit "${c.lookLockUnit}" is not a segment`)
  for (const id of c.buildOrderAfterLookLock) if (!seen.has(id)) fail(`buildOrderAfterLookLock names the unknown unit "${id}"`)
  const keyIds = new Set<string>()
  for (const k of c.keys) {
    for (const name of ['id', 'unit', 'time', 'image'] as const) if (k[name] === undefined) fail(`a key is missing "${name}"`)
    if (keyIds.has(k.id)) fail(`the key id "${k.id}" is used twice`)
    keyIds.add(k.id)
    const seg = c.segments.find((s) => s.id === k.unit)
    if (!seg) fail(`key "${k.id}" names the unknown unit "${k.unit}"`)
    if (!isWholeFrame(k.time, fps)) fail(`the time of key "${k.id}" is not on a whole frame`)
    if (k.time < seg.start || k.time >= seg.end) fail(`the time of key "${k.id}" lies outside the segment of its unit`)
    if (k.settled !== undefined && (!Array.isArray(k.settled) || k.settled.some((line) => typeof line !== 'string'))) fail(`"settled" of key "${k.id}" must be a list of lines`)
    if (options.imageExists && !options.imageExists(k.image)) fail(`the approved image "${k.image}" is missing`)
  }
  const boxes = Object.values(c.budget.phaseHours)
  const sum = boxes.reduce((a, b) => a + b, 0)
  if (Math.abs(sum - c.budget.runHours) > 1e-9) fail('budget.phaseHours does not add up to budget.runHours')
  for (const id of ['draft', 'review', 'final'] as const) if (!(c.tiers[id].samplesPerFrame >= 1)) fail(`tiers.${id}.samplesPerFrame must be at least 1`)
  const heights = c.plant.heightM
  for (let i = 1; i < heights.length; i++) {
    if (!(heights[i][0] > heights[i - 1][0])) fail('plant.heightM times must rise')
    if (heights[i][1] < heights[i - 1][1]) fail('plant.heightM must never fall')
  }
  const cam = c.camera.keys
  for (let i = 1; i < cam.length; i++) if (!(cam[i].time > cam[i - 1].time)) fail('camera.keys times must rise')
  return c
}

declare const __APPROVED_FILES__: string[] | undefined

function approvedList(): string[] | undefined {
  return typeof __APPROVED_FILES__ === 'undefined' ? undefined : __APPROVED_FILES__
}

const listed = approvedList()

export const config: Config = validateConfig(raw, listed ? { imageExists: (p) => listed.includes(p) } : {})

export const frameCount = Math.round(config.film.fps * config.film.durationSeconds)

export function frameOf(seconds: number): number {
  return Math.round(seconds * config.film.fps)
}

export function timeOf(frame: number): number {
  return frame / config.film.fps
}

// The film seconds at which a segment starts and ends and at which a key stands, by id. Code that means one of these times asks here and holds no copy of the number.
export function segmentStart(id: string): number {
  const segment = config.segments.find((s) => s.id === id)
  return segment ? segment.start : fail(`no segment "${id}"`)
}

export function segmentEnd(id: string): number {
  const segment = config.segments.find((s) => s.id === id)
  return segment ? segment.end : fail(`no segment "${id}"`)
}

export function keyTime(id: string): number {
  const key = config.keys.find((k) => k.id === id)
  return key ? key.time : fail(`no key "${id}"`)
}

// The master picture's width over its height.
export const masterAspect = config.formats.master.width / config.formats.master.height
