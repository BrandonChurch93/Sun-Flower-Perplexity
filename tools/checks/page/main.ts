import * as THREE from 'three'
import type { Format, TierId } from '../../../src/config.ts'
import { Film } from '../../../src/director/film.ts'
import type { Moment, Quality } from '../../../src/v2/api.ts'
import { installCounter, madeSince, madeSoFar, type Made } from '../../../src/v2/counter.ts'
import { held } from '../../../src/v2/held.ts'
import { later, now } from '../../../src/v2/now.ts'
import { views, type ViewName } from '../../../src/v2/shots.ts'

// The film itself, driven by the checks: the same Film, the same draw path, at any size, with a counter read on every frame.
// It can also break the film on purpose, so that each check can be shown to fail.

export interface Drawn { frame: number; seconds: number; made: Made; png: string | null }
export interface Numbers { none: number; over: number; most: number; at: [number, number]; where: number[] }
export interface Sparks { count: number; worst: number; at: [number, number]; value: number; near: number; mean: number; where: number[]; wild: number[] }
// `wild` holds x, y from the top and the value of each pixel over `fail` times what is near it.
export interface Spot { worst: number; wild: number; value: number; at: [number, number]; size: number; plain: number }
// What three.js and the graphics card were asked in the frames since the last call, beside the plain drawing.
// `programs`: each program drawn with, how often, and whether a draw with it was its first since the page loaded. `asks`: each question put to the card that the page stands still for, by name and by the program asked about, with the time inside it.
// `materials`: each material three.js worked through again (its program looked up afresh), how often, and which of its marks changed since the last call. `owners`: who holds a material of that name in the film.
export interface Worked {
  programs: { name: string; draws: number; first: boolean }[]
  asks: { name: string; about: string; calls: number; ms: number }[]
  materials: { name: string; kind: string; calls: number; changed: string[] }[]
  // Every call into the graphics card by name, with the page's time inside it: what the card is handed costs the page the copying.
  calls: { name: string; calls: number; ms: number }[]
  owners: Record<string, string>
}
export interface FloatDiff { values: number; differing: number; largest: number; mean: number }
export interface ChecksPage {
  ready: Promise<void>
  info(): { sky: string; width: number; height: number; textureMb: number; parts: string[] }
  warm(tier: string): Promise<void>
  made(): Made
  draw(frame: number, tier: string, png: boolean): Promise<Drawn>
  setView(name: string): void
  // The film's own switch for the world at rest: no weather, no wind, one fixed sun. What is left can only change with the clocks.
  still(on: boolean): void
  // Keeps the frame on the canvas as it was before the lens and the grade, in the scene's linear numbers.
  keep(name: string): void
  differ(a: string, b: string): FloatDiff
  // Faults: 'cut' swaps the camera from a frame on, 'made' builds a mesh with a new texture and a new program at a frame,
  // 'dice' turns the camera by a throw of Math.random, 'memory' turns it by how many frames were drawn before, 'grow' moves the plant's clock inside a stretch of frames,
  // 'moon' makes the night's key `a` times as strong from frame `b` on, 'slow' makes the field's turn last `a` ms longer in frame `b` or, with b under 0, in every frame,
  // 'number' gives the key light no number in frame `a`, 'bright' makes it ten million times as strong in frame `a`.
  fault(kind: string, a: number, b: number): void
  // Which pixels of the last frame the scene drew into, row by row from the top: '1' where the scene's own numbers, before the lens and the grain, hold any light, '0' where the frame was left empty.
  covered(): string
  // Where the page's own time went in the last frame drawn, in milliseconds by part: the film's own laps (film.cost), and beside them the time inside renderer.render
  // (draw), with the scene's and the shadow map's share of it. The first call hands the film its clock and starts that timer.
  cost(): Record<string, number>
  // The lens the film holds for the frame last drawn (-1 where the plant grows), and the numbers each coat of hairs last chose its hairs by: a coat sends its hairs again when one of them changes.
  lens(): { held: number; signs: { owner: string; numbers: number[] }[] }
  // The frame last drawn as it is handed to the lens, in the scene's own numbers: how many pixels hold no number, how many hold one over `limit`, the largest number that is in order, and where the bad pixels are (x, then y from the top).
  numbers(limit: number): Numbers
  // Reads every sample of each frame drawn from now on, against the same limit (0 stops it): what `numbers` says then holds for each sample and not only for their sum.
  watch(limit: number): void
  // Draws the frames that follow at one place a pixel where the film draws them at four (false puts the four back): the same frame without the smoothing of its edges.
  plain(on: boolean): void
  // Keeps the numbers of the frame last drawn, before the lens, for `sparks`.
  note(): void
  // The kept frame against the frame last drawn: a pixel of the kept one is a spark when it holds more than `times` what any pixel within `reach` of it holds in the other, and more than `times` the other's mean. With the kept frame drawn at four places a pixel and the other at one, a spark is a place the smoothing lit by itself.
  sparks(times: number, reach: number, fail: number): Sparks
  // After `sparks`, the square of `r` pixels round a place (x, then y from the top): the most a pixel in it holds of what is near it, how many of its pixels hold over `fail` times that, the largest value in it and where, how many pixels of the square hold at least half that value, and the largest value the frame at one place a pixel holds in it.
  spot(x: number, y: number, r: number, fail: number): Spot
  // Draws only the named parts of the scene from the next frame on (plant, companion, field, ground, sky and each part's name); none named draws them all.
  only(names: string[]): void
  // Only on a page opened with work=1: what the frames since the last call asked of three.js and of the card, and starts the next count.
  worked(): Worked
  // The same fixed script, run now and timed, or run inside the n-th draw call of the next frame.
  loop(work: number): number
  loopAt(work: number, call: number): void
  loopRead(): { ms: number; calls: number }
}

declare global {
  interface Window { checks: ChecksPage }
}

const q = new URLSearchParams(location.search)
const format: Format = { id: 'check', width: Number(q.get('w') ?? 320), height: Number(q.get('h') ?? 180) }
const only = (q.get('only') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
const view = (q.get('view') ?? 'film') as ViewName
const quality = (q.get('quality') as Quality | null) ?? null
const canvas = document.getElementById('film') as HTMLCanvasElement

installCounter()
const film = new Film(canvas, format, 'full', { sky: q.get('sky') ?? undefined, only, view, quality, smooth: q.get('plain') !== '1' })
const ready = film.load()

let grow: { from: number; to: number; rate: number } | null = null

// The film writes the instant of each frame into `now` and `later`. For the fault that grows in a hold, the plant's clock read from them runs on.
function rig(m: Moment): void {
  let tau = m.tau
  Object.defineProperty(m, 'tau', {
    configurable: true,
    enumerable: true,
    get: () => (grow && m.t > grow.from ? tau + grow.rate * (Math.min(m.t, grow.to) - grow.from) : tau),
    set: (v: number) => {
      tau = v
    },
  })
}
rig(now)
rig(later)

const base = film.view.fixed
let cutFrom = -1
let madeAt = -1
let dice = false
let memory = false
let moon = 1
let moonFrom = 0
let lostAt = -1
let watching = 0
let tapped = false
let marks = new Uint8Array(0)
let noted = new Float32Array(0)
let ratios = new Float32Array(0)
let plains = new Float32Array(0)
let fine: THREE.WebGLRenderTarget | null = null
let halves = new Uint16Array(0)

// Reads every sample of a frame as it is added to the frame's sum: 1 where a place holds no number, 2 where it holds one over the limit. A sample drawn at four places a pixel is read after they are joined, so one lost place of the four shows as a quarter: the limit is divided by the places.
function tap(): void {
  tapped = true
  const stage = film.stage
  const add = stage.accumulator.add.bind(stage.accumulator)
  stage.accumulator.add = (renderer, sample, weight) => {
    add(renderer, sample, weight)
    if (watching <= 0) return
    const { width, height } = stage
    const target = sample === stage.smooth.texture ? stage.smooth : sample === stage.sample.texture ? stage.sample : null
    if (!target) return
    if (marks.length !== width * height) marks = new Uint8Array(width * height)
    if (halves.length !== width * height * 4) halves = new Uint16Array(width * height * 4)
    renderer.readRenderTargetPixels(target, 0, 0, width, height, halves)
    const top = THREE.DataUtils.toHalfFloat(Math.min(65504, watching / Math.max(1, target.samples)))
    for (let i = 0, p = 0; i < marks.length; i++, p += 4) {
      const r = halves[p] & 0x7fff
      const g = halves[p + 1] & 0x7fff
      const b = halves[p + 2] & 0x7fff
      const a = halves[p + 3] & 0x7fff
      if (r >= 0x7c00 || g >= 0x7c00 || b >= 0x7c00 || a >= 0x7c00) marks[i] = 1
      else if (marks[i] === 0 && (r > top || g > top || b > top)) marks[i] = 2
    }
  }
}
let brightAt = -1
// How long a frame spends inside renderer.render: all of it, the part that draws the scene into the frame, and the part that draws the shadow map. It is time and no pixel.
const drawMs = { draw: 0, drawScene: 0, drawShadow: 0 }
let timed = false
function timeDraws(): void {
  if (timed) return
  timed = true
  const { renderer } = film.stage
  const inner = renderer.render.bind(renderer)
  let depth = 0
  renderer.render = (scene, camera) => {
    const outer = depth++ === 0
    const t = performance.now()
    try {
      inner(scene, camera)
    } finally {
      depth--
    }
    if (!outer) return
    const ms = performance.now() - t
    drawMs.draw += ms
    if (scene === film.scene) drawMs[renderer.getRenderTarget() === film.stage.sample ? 'drawScene' : 'drawShadow'] += ms
  }
}
// The work a frame can cost with nothing made and nothing written: a program used for the first time (three.js asks the card for its uniforms and places, and the page waits), a material looked up afresh, any question the page waits on.
const SIGNS = ['__version', 'lightsStateVersion', 'needsLights', 'outputColorSpace', 'toneMapping', 'batching', 'instancing', 'instancingColor', 'instancingMorph', 'skinning', 'morphTargets', 'morphNormals', 'morphColors', 'morphTargetsCount', 'envMap', 'fog', 'numClippingPlanes', 'numIntersection', 'vertexAlphas', 'vertexTangents', 'currentProgram']
const WAITS = ['readPixels', 'finish', 'checkFramebufferStatus', 'clientWaitSync']
const DRAWS = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']
const working = q.get('work') === '1'
const workDraws = new Map<WebGLProgram, number>()
const workFirst = new Set<WebGLProgram>()
const workDrawn = new WeakSet<WebGLProgram>()
const workAsks = new Map<string, { name: string; program: WebGLProgram | null; calls: number; ms: number }>()
const workCalls = new Map<string, { calls: number; ms: number }>()
const workLooked = new Map<THREE.Material, number>()
const workMarks = new Map<THREE.Material, unknown[]>()
let workCurrent: WebGLProgram | null = null
const marksOf = (m: THREE.Material): unknown[] => {
  const p = film.stage.renderer.properties.get(m) as Record<string, unknown>
  return [m.version, JSON.stringify(m.defines ?? null), ...SIGNS.map((k) => p[k])]
}
function workTaps(): void {
  const gl = film.stage.renderer.getContext() as unknown as Record<string, (...a: unknown[]) => unknown>
  const names = new Set<string>()
  for (let o: object | null = gl; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) for (const k of Object.getOwnPropertyNames(o)) names.add(k)
  for (const name of names) {
    const asks = /^(get|is)[A-Z]/.test(name) || WAITS.includes(name)
    const draws = DRAWS.includes(name)
    let inner: (...a: unknown[]) => unknown
    try {
      if (typeof gl[name] !== 'function') continue
      inner = gl[name].bind(gl)
    } catch {
      continue
    }
    if (name === 'useProgram') {
      gl[name] = (p) => {
        workCurrent = p as WebGLProgram | null
        return inner(p)
      }
    } else if (!asks) {
      const line = { calls: 0, ms: 0 }
      gl[name] = (...a) => {
        if (draws && workCurrent) {
          workDraws.set(workCurrent, (workDraws.get(workCurrent) ?? 0) + 1)
          if (!workDrawn.has(workCurrent)) {
            workDrawn.add(workCurrent)
            workFirst.add(workCurrent)
          }
        }
        const t = performance.now()
        const out = inner(...a)
        line.ms += performance.now() - t
        if (line.calls++ === 0) workCalls.set(name, line)
        return out
      }
    } else {
      gl[name] = (...a) => {
        const program = a[0] instanceof WebGLProgram ? a[0] : null
        const t = performance.now()
        const out = inner(...a)
        const ms = performance.now() - t
        const key = `${name} ${program ? idOf(program) : ''}`
        const line = workAsks.get(key) ?? { name, program, calls: 0, ms: 0 }
        line.calls++
        line.ms += ms
        workAsks.set(key, line)
        return out
      }
    }
  }
  const key = THREE.Material.prototype.customProgramCacheKey
  THREE.Material.prototype.customProgramCacheKey = function (this: THREE.Material) {
    workLooked.set(this, (workLooked.get(this) ?? 0) + 1)
    return key.call(this)
  }
}
// A fixed piece of script of the kind a coat's choosing is: numbers worked out, gathered and sorted. It touches nothing of the film.
function fixed(work: number): number {
  const t = performance.now()
  const kept: number[] = []
  let h = 1
  for (let i = 0; i < work; i++) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0
    const v = Math.sin(h * 1e-6) * Math.sqrt(i + 1)
    if (v > 0) kept.push(v)
  }
  kept.sort((a, b) => a - b)
  if (kept.length === 0) throw new Error('nothing gathered')
  return performance.now() - t
}
let loopWork = 0
let loopCall = 0
let loopCalls = 0
let loopMs = -1
let loopTapped = false
function loopTap(): void {
  if (loopTapped) return
  loopTapped = true
  const gl = film.stage.renderer.getContext() as unknown as Record<string, (...a: unknown[]) => unknown>
  for (const name of DRAWS) {
    const inner = gl[name].bind(gl)
    gl[name] = (...a) => {
      if (++loopCalls === loopCall) loopMs = fixed(loopWork)
      return inner(...a)
    }
  }
}
let workCount = 0
const workNumbers = new WeakMap<WebGLProgram, number>()
function idOf(p: WebGLProgram): number {
  let n = workNumbers.get(p)
  if (n === undefined) workNumbers.set(p, (n = workCount++))
  return n
}
if (working) workTaps()
let slowMs = 0
let slowAt = -1
// The fault of a part that takes too long: the field's turn in a frame lasts `slowMs` longer, in every frame or in one. It is time and no pixel.
const showField = film.field.show.bind(film.field)
film.field.show = (on: boolean): void => {
  if (slowMs > 0 && (slowAt < 0 || slowAt === now.frame)) {
    const until = performance.now() + slowMs
    while (performance.now() < until);
  }
  showField(on)
}
// The night's key light, written by the film into its look on every frame, comes out `moon` times as strong: the fault of a moon brighter than the dusk.
const key = film.look.sun as { color: number[] }
key.color = new Proxy(key.color, {
  set(target, name, value) {
    const strong = typeof value === 'number' && now.lightKind === 'moon' && now.frame >= moonFrom ? value * moon : value
    target[name as unknown as number] = typeof value === 'number' && now.frame === lostAt ? NaN : typeof strong === 'number' && now.frame === brightAt ? strong * 1e7 : strong
    return true
  },
})
let drawnBefore = 0
const kept = new Map<string, Float32Array>()

function lateMesh(): THREE.Mesh {
  const data = new Uint8Array(64 * 64 * 4).fill(180)
  const map = new THREE.DataTexture(data, 64, 64)
  map.needsUpdate = true
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.02), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }))
  mesh.frustumCulled = false
  mesh.position.set(0, 0.3, 0)
  mesh.updateMatrixWorld(true)
  return mesh
}

// The fault of a first draw the warming missed: a mesh whose geometry and whose material have both been drawn while warming, on other meshes, and which is itself hidden until its frame.
// Nothing is left to compile or to send when it shows; only its vertex array is made.
let firstAt = -1
let hidden: THREE.Mesh | null = null
function hideOne(): void {
  const shape = new THREE.PlaneGeometry(0.02, 0.02)
  const plain = new THREE.MeshBasicMaterial({ color: 0x808080, side: THREE.DoubleSide })
  const other = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide })
  const place = (m: THREE.Mesh, x: number): THREE.Mesh => {
    m.frustumCulled = false
    m.position.set(x, 0.3, 0)
    m.updateMatrixWorld(true)
    film.scene.add(m)
    return m
  }
  place(new THREE.Mesh(shape, plain), -0.03)
  place(new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.02), other), 0.03)
  hidden = place(new THREE.Mesh(shape, other), 0)
  hidden.visible = false
}

// Whose array is this: the path from the film to it, through the film's own objects.
let owners: Map<object, string> | null = null
let signed: [Float64Array, string][] | null = null
function ownersOf(): Map<object, string> {
  const out = new Map<object, string>()
  const seen = new Set<object>()
  // A thing is named by who owns it: the plant, the companion, the ground, the field and each part are walked first, one after the other, each stopping at what belongs to the whole film or to another of them. The film's own lists come last.
  const owning: [unknown, string][] = [[film.plant, 'film.plant'], [film.companion, 'film.companion'], [film.ground, 'film.ground'], [film.field, 'film.field'], ...film.parts.map((p): [unknown, string] => [p.part, `film.parts[${p.name}]`]), [film, 'film']]
  const shared = new Set<unknown>([film.scene, film.stage, film.view, ...owning.map(([v]) => v)])
  const queue: [unknown, string][] = []
  for (let i = 0, next = 0; (i < queue.length || next < owning.length) && seen.size < 600000; i++) {
    const root = i === queue.length
    if (root) queue.push(owning[next++])
    const [v, p] = queue[i]
    if (!v || typeof v !== 'object' || seen.has(v) || (!root && next < owning.length && shared.has(v))) continue
    seen.add(v)
    if (ArrayBuffer.isView(v)) {
      out.set(v, p)
      if (!out.has(v.buffer)) out.set(v.buffer, p)
      continue
    }
    if (v instanceof ArrayBuffer || v instanceof Node || v instanceof WebGL2RenderingContext) continue
    if (Array.isArray(v)) {
      if (typeof v[0] === 'number') continue
      v.forEach((x, n) => queue.push([x, `${p}[${(x as { name?: string } | null)?.name || n}]`]))
      continue
    }
    if (v instanceof Map) {
      for (const [k, x] of v) queue.push([x, `${p}.${typeof k === 'string' ? k : 'entry'}`])
      continue
    }
    if (v instanceof Set) {
      for (const x of v) queue.push([x, `${p}.entry`])
      continue
    }
    // The film's own names come before the scene's list of children, and a part's name before the plain list of meshes, so that a mesh is called by its owner.
    const own = Object.keys(v)
    const keys = v === film ? [...own.filter((k) => k !== 'scene'), 'scene'] : own.includes('parts') ? own.filter((k) => k !== 'meshes') : own
    for (const key of keys) if (key !== 'parent') queue.push([(v as Record<string, unknown>)[key], `${p}.${key}`])
  }
  return out
}
// An array the film made after the owners were last listed has no name yet: they are listed again, once a frame at the most.
let listedFor = -1
;(window as unknown as { __owner: (src: object) => string | null }).__owner = (src) => {
  owners ??= ownersOf()
  const find = (): string | null => (owners as Map<object, string>).get(src) ?? (ArrayBuffer.isView(src) ? ((owners as Map<object, string>).get(src.buffer) ?? null) : null)
  const found = find()
  if (found || listedFor === drawnBefore) return found
  listedFor = drawnBefore
  owners = ownersOf()
  signed = null
  return find()
}

window.checks = {
  ready,
  info: () => ({ sky: film.skyName, width: film.stage.width, height: film.stage.height, textureMb: film.textureMb(), parts: film.parts.map((p) => p.name) }),
  warm: (tier) => film.warm(tier as TierId),
  made: () => madeSoFar(),
  async draw(frame, tier, png) {
    if (cutFrom >= 0) film.view.fixed = frame >= cutFrom ? views.crane : base
    if (madeAt === frame) film.scene.add(lateMesh())
    if (hidden) hidden.visible = frame >= firstAt
    if (dice) film.view.azimuthDeg = 0.4 * Math.random()
    if (memory) film.view.azimuthDeg = 0.05 * drawnBefore
    drawnBefore++
    marks.fill(0)
    const before = madeSoFar()
    drawMs.draw = drawMs.drawScene = drawMs.drawShadow = 0
    const t0 = performance.now()
    await film.renderFrame(frame, tier as TierId)
    const seconds = (performance.now() - t0) / 1000
    return { frame, seconds, made: madeSince(before), png: png ? canvas.toDataURL('image/png') : null }
  },
  setView(name) {
    film.view.fixed = name === 'film' ? null : views[name as Exclude<ViewName, 'film'>]
  },
  still(on) {
    film.setStill(on)
  },
  keep(name) {
    const { width, height, renderer, accumulator } = film.stage
    const pixels = new Float32Array(width * height * 4)
    renderer.readRenderTargetPixels(accumulator.target, 0, 0, width, height, pixels)
    kept.set(name, pixels)
  },
  differ(a, b) {
    const x = kept.get(a)
    const y = kept.get(b)
    if (!x || !y || x.length !== y.length) throw new Error(`nothing kept as "${a}" or "${b}"`)
    let differing = 0
    let largest = 0
    let sum = 0
    for (let i = 0; i < x.length; i++) {
      if ((i & 3) === 3) continue
      const d = Math.abs(x[i] - y[i])
      if (d > 0 || Number.isNaN(d)) {
        differing++
        if (d > largest) largest = d
        sum += d
      }
    }
    const values = (x.length / 4) * 3
    return { values, differing, largest, mean: sum / values }
  },
  covered() {
    const { width, height, renderer, accumulator } = film.stage
    const pixels = new Float32Array(width * height * 4)
    renderer.readRenderTargetPixels(accumulator.target, 0, 0, width, height, pixels)
    const rows: string[] = []
    for (let y = height - 1; y >= 0; y--) {
      let row = ''
      for (let x = 0; x < width; x++) {
        const p = 4 * (y * width + x)
        row += pixels[p] + pixels[p + 1] + pixels[p + 2] > 0 || pixels[p + 3] > 0.5 ? '1' : '0'
      }
      rows.push(row)
    }
    return rows.join('')
  },
  cost() {
    if (!film.clock) film.clock = () => performance.now()
    timeDraws()
    return { ...film.cost, ...drawMs }
  },
  lens() {
    owners ??= ownersOf()
    signed ??= [...owners].filter(([v, p]) => v instanceof Float64Array && /\.(sign|key)$/.test(p) && !/lenses/.test(p)) as [Float64Array, string][]
    return { held: held.lens, signs: signed.map(([v, p]) => ({ owner: p, numbers: Array.from(v) })) }
  },
  watch(limit) {
    watching = limit
    if (limit > 0 && !tapped) tap()
  },
  plain(on) {
    const stage = film.stage as unknown as { smooth: THREE.WebGLRenderTarget; sample: THREE.WebGLRenderTarget }
    fine ??= stage.smooth
    stage.smooth = on ? stage.sample : fine
  },
  note() {
    const { width, height, renderer, accumulator } = film.stage
    if (noted.length !== width * height * 4) noted = new Float32Array(width * height * 4)
    renderer.readRenderTargetPixels(accumulator.target, 0, 0, width, height, noted)
  },
  sparks(times, reach, fail) {
    const { width, height, renderer, accumulator } = film.stage
    const pixels = new Float32Array(width * height * 4)
    renderer.readRenderTargetPixels(accumulator.target, 0, 0, width, height, pixels)
    const level = (from: Float32Array, i: number): number => {
      const v = Math.max(Math.abs(from[4 * i]), Math.abs(from[4 * i + 1]), Math.abs(from[4 * i + 2]))
      return Number.isFinite(v) ? v : 0
    }
    const n = width * height
    const across = new Float32Array(n)
    const near = new Float32Array(n)
    let sum = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let m = 0
        for (let k = Math.max(0, x - reach); k <= Math.min(width - 1, x + reach); k++) m = Math.max(m, level(pixels, y * width + k))
        across[y * width + x] = m
        sum += level(pixels, y * width + x)
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let m = 0
        for (let k = Math.max(0, y - reach); k <= Math.min(height - 1, y + reach); k++) m = Math.max(m, across[k * width + x])
        near[y * width + x] = m
      }
    }
    const mean = sum / n
    const out: Sparks = { count: 0, worst: 0, at: [0, 0], value: 0, near: 0, mean, where: [], wild: [] }
    ratios = new Float32Array(n)
    plains = new Float32Array(n)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        const ratio = level(noted, i) / Math.max(near[i], mean, 1e-9)
        ratios[i] = ratio
        plains[i] = level(pixels, i)
        if (ratio > fail && out.wild.length < 600) out.wild.push(x, height - 1 - y, level(noted, i))
        if (ratio > out.worst) {
          out.worst = ratio
          out.at = [x, height - 1 - y]
          out.value = level(noted, i)
          out.near = near[i]
        }
        if (ratio > times) {
          out.count++
          if (out.where.length < 8000) out.where.push(x, height - 1 - y)
        }
      }
    }
    return out
  },
  spot(x, y, r, fail) {
    const { width, height } = film.stage
    const out: Spot = { worst: 0, wild: 0, value: 0, at: [x, y], size: 0, plain: 0 }
    const level = (i: number): number => {
      const v = Math.max(Math.abs(noted[4 * i]), Math.abs(noted[4 * i + 1]), Math.abs(noted[4 * i + 2]))
      return Number.isFinite(v) ? v : 0
    }
    const each = (visit: (i: number, px: number, py: number) => void): void => {
      for (let py = Math.max(0, y - r); py <= Math.min(height - 1, y + r); py++) for (let px = Math.max(0, x - r); px <= Math.min(width - 1, x + r); px++) visit((height - 1 - py) * width + px, px, py)
    }
    each((i, px, py) => {
      out.worst = Math.max(out.worst, ratios[i])
      if (ratios[i] > fail) out.wild++
      out.plain = Math.max(out.plain, plains[i])
      if (level(i) > out.value) {
        out.value = level(i)
        out.at = [px, py]
      }
    })
    each((i) => {
      if (level(i) >= 0.5 * out.value) out.size++
    })
    return out
  },
  numbers(limit) {
    const { width, height, renderer, accumulator } = film.stage
    const pixels = new Float32Array(width * height * 4)
    renderer.readRenderTargetPixels(accumulator.target, 0, 0, width, height, pixels)
    const out: Numbers = { none: 0, over: 0, most: 0, at: [0, 0], where: [] }
    const seen = marks.length === width * height ? marks : null
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = 4 * (y * width + x)
        const r = Math.abs(pixels[p])
        const g = Math.abs(pixels[p + 1])
        const b = Math.abs(pixels[p + 2])
        const mark = seen ? seen[y * width + x] : 0
        const lost = mark === 1 || !Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b) || !Number.isFinite(pixels[p + 3])
        const high = !lost && (mark === 2 || r > limit || g > limit || b > limit)
        if (lost) out.none++
        else if (high) out.over++
        else if (Math.max(r, g, b) > out.most) {
          out.most = Math.max(r, g, b)
          out.at = [x, height - 1 - y]
        }
        if ((lost || high) && out.where.length < 8000) out.where.push(x, height - 1 - y)
      }
    }
    return out
  },
  only(names) {
    const set = (film as unknown as { only: Set<string> }).only
    set.clear()
    for (const n of names) set.add(n)
  },
  worked() {
    if (!working) throw new Error('open the page with work=1')
    const { renderer } = film.stage
    const named = new Map<WebGLProgram, string>()
    for (const p of (renderer.info.programs ?? []) as unknown as { program: WebGLProgram; name: string; type: string; id: number }[]) named.set(p.program, `${p.name || p.type || 'no name'} (program ${p.id})`)
    const nameOf = (p: WebGLProgram | null): string => (p ? (named.get(p) ?? 'a program three.js does not list') : '')
    const owners: Record<string, string> = {}
    const groups: [string, THREE.Object3D[]][] = [['plant', film.plant.meshes], ['companion', film.companion.meshes], ['field', film.field.meshes], ['ground', [film.ground.mesh, ...film.ground.casters.map((c) => c.mesh)]], ...film.parts.map((p): [string, THREE.Object3D[]] => [p.name, p.part.objects])]
    const mine = new Set<THREE.Material>()
    const hold = (owner: string, o: THREE.Object3D): void => {
      const x = o as unknown as { material?: THREE.Material | THREE.Material[]; customDepthMaterial?: THREE.Material; customDistanceMaterial?: THREE.Material }
      for (const m of [x.material, x.customDepthMaterial, x.customDistanceMaterial].flat()) {
        if (!m) continue
        mine.add(m)
        const key = m.name || m.type
        const path = `${owner}: ${o.name || o.type}`
        if (!owners[key]) owners[key] = path
        else if (!owners[key].split(' | ').includes(path) && owners[key].length < 160) owners[key] += ` | ${path}`
      }
    }
    for (const [owner, list] of groups) for (const top of list) top.traverse((o) => hold(owner, o))
    film.scene.traverse((o) => {
      const x = o as unknown as { material?: THREE.Material | THREE.Material[] }
      if ([x.material].flat().some((m) => m && !mine.has(m))) hold('film', o)
    })
    const materials: Worked['materials'] = []
    for (const m of new Set([...mine, ...workLooked.keys()])) {
      const now = marksOf(m)
      const before = workMarks.get(m)
      workMarks.set(m, now)
      const calls = workLooked.get(m) ?? 0
      if (!calls) continue
      const changed: string[] = []
      const keys = ['version', 'defines', ...SIGNS]
      const say = (v: unknown): string => (v === undefined ? 'unset' : v === null ? 'none' : typeof v === 'object' ? ((v as { id?: number }).id !== undefined ? `number ${(v as { id: number }).id}` : 'set') : String(v).slice(0, 80))
      if (!before) changed.push('first met here')
      else for (let i = 0; i < now.length; i++) if (now[i] !== before[i]) changed.push(`${keys[i]}: ${say(before[i])} to ${say(now[i])}`)
      materials.push({ name: m.name || 'no name', kind: m.type, calls, changed })
    }
    const out: Worked = {
      programs: [...workDraws].map(([p, draws]) => ({ name: nameOf(p), draws, first: workFirst.has(p) })),
      asks: [...workAsks.values()].map((a) => ({ name: a.name, about: nameOf(a.program), calls: a.calls, ms: a.ms })),
      materials,
      calls: [...workCalls].map(([name, c]) => ({ name, calls: c.calls, ms: c.ms })),
      owners,
    }
    for (const c of workCalls.values()) c.calls = c.ms = 0
    workCalls.clear()
    workDraws.clear()
    workFirst.clear()
    workAsks.clear()
    workLooked.clear()
    return out
  },
  loop: (work) => fixed(work),
  loopAt(work, call) {
    loopTap()
    loopWork = work
    loopCall = call
    loopCalls = 0
    loopMs = -1
  },
  loopRead: () => ({ ms: loopMs, calls: loopCalls }),
  fault(kind, a, b) {
    if (kind === 'cut') cutFrom = a
    else if (kind === 'made') madeAt = a
    else if (kind === 'first-draw') {
      firstAt = a
      hideOne()
    }
    else if (kind === 'dice') dice = true
    else if (kind === 'memory') memory = true
    else if (kind === 'grow') grow = { from: a, to: b, rate: 0.05 }
    else if (kind === 'moon') {
      moon = a
      moonFrom = b
    }
    else if (kind === 'number') lostAt = a
    else if (kind === 'bright') brightAt = a
    else if (kind === 'slow') {
      slowMs = a
      slowAt = b
    }
    else throw new Error(`unknown fault "${kind}"`)
  },
}
