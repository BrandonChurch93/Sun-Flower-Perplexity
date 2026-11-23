import * as THREE from 'three'
import type { Format, TierId } from '../../../src/config.ts'
import { Film } from '../../../src/director/film.ts'
import type { Moment, Quality } from '../../../src/v2/api.ts'
import { installCounter, madeSince, madeSoFar, type Made } from '../../../src/v2/counter.ts'
import { later, now } from '../../../src/v2/now.ts'
import { views, type ViewName } from '../../../src/v2/shots.ts'

// The film itself, driven by the checks: the same Film, the same draw path, at any size, with a counter read on every frame.
// It can also break the film on purpose, so that each check can be shown to fail.

export interface Drawn { frame: number; seconds: number; made: Made; png: string | null }
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
  // 'moon' makes the night's key `a` times as strong from frame `b` on, 'slow' makes the field's turn last `a` ms longer in frame `b` or, with b under 0, in every frame.
  fault(kind: string, a: number, b: number): void
  // Which pixels of the last frame the scene drew into, row by row from the top: '1' where the scene's own numbers, before the lens and the grain, hold any light, '0' where the frame was left empty.
  covered(): string
  // Where the page's own time went in the last frame drawn, in milliseconds by part: the film's own laps (film.cost). The first call hands the film its clock.
  cost(): Record<string, number>
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
const film = new Film(canvas, format, 'full', { sky: q.get('sky') ?? undefined, only, view, quality })
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
    target[name as unknown as number] = typeof value === 'number' && now.lightKind === 'moon' && now.frame >= moonFrom ? value * moon : value
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
;(window as unknown as { __owner: (src: object) => string | null }).__owner = (src) => {
  owners ??= ownersOf()
  return owners.get(src) ?? (ArrayBuffer.isView(src) ? (owners.get(src.buffer) ?? null) : null)
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
    const before = madeSoFar()
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
    return { ...film.cost }
  },
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
    else if (kind === 'slow') {
      slowMs = a
      slowAt = b
    }
    else throw new Error(`unknown fault "${kind}"`)
  },
}
