import * as THREE from 'three'
import type { Format, TierId } from '../../../src/config.ts'
import { Film } from '../../../src/director/film.ts'
import type { Dials, Moment, Quality } from '../../../src/v2/api.ts'
import { installCounter, madeSince, madeSoFar, type Made } from '../../../src/v2/counter.ts'
import { later, now } from '../../../src/v2/now.ts'
import { views, type ViewName } from '../../../src/v2/shots.ts'
import { direction } from '../../../src/v2/sun.ts'

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
  // Wind at rest, no weather, the sun and the clouds standing where they are told: what is left can only change with the clocks.
  still(on: boolean): void
  // Keeps the frame on the canvas as it was before the lens and the grade, in the scene's linear numbers.
  keep(name: string): void
  differ(a: string, b: string): FloatDiff
  // Faults: 'cut' swaps the camera from a frame on, 'made' builds a mesh with a new texture and a new program at a frame,
  // 'dice' turns the camera by a throw of Math.random, 'memory' turns it by how many frames were drawn before, 'grow' moves the plant's clock inside a stretch of frames.
  fault(kind: string, a: number, b: number): void
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

const REST: Dials = { cover: 0, overcast: 0, sunThrough: 1, fog: 0, cold: 0, frost: 0, dew: 0, rain: 0, wet: 0, puddle: 0, flash: 0, burst: 0, wind: 0, lapse: 0, evening: 0 }
const STILL_SUN = { azimuthDeg: 60, elevationDeg: 50 }
let stillOn = false
let grow: { from: number; to: number; rate: number } | null = null

// The film writes the instant of each frame into `now` and `later`. A pinned field keeps what the check gave it, whatever is written.
function pin<T extends object, K extends keyof T>(target: T, key: K, pinned: () => T[K] | undefined): void {
  let raw = target[key]
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    get: () => {
      const p = pinned()
      return p === undefined ? raw : p
    },
    set: (v: T[K]) => {
      raw = v
    },
  })
}

function pinVector(v: THREE.Vector3, pinned: THREE.Vector3): void {
  const set = v.set.bind(v)
  const copy = v.copy.bind(v)
  v.set = (x: number, y: number, z: number) => (stillOn ? set(pinned.x, pinned.y, pinned.z) : set(x, y, z))
  v.copy = (o: THREE.Vector3) => (stillOn ? set(pinned.x, pinned.y, pinned.z) : copy(o))
}

function rig(m: Moment): void {
  const sun = direction(STILL_SUN.azimuthDeg, STILL_SUN.elevationDeg, new THREE.Vector3())
  for (const key of Object.keys(REST) as (keyof Dials)[]) pin(m.dials, key, () => (stillOn ? REST[key] : undefined))
  pin(m, 'sunElevationDeg', () => (stillOn ? STILL_SUN.elevationDeg : undefined))
  pin(m, 'sunAzimuthDeg', () => (stillOn ? STILL_SUN.azimuthDeg : undefined))
  pin(m, 'night', () => (stillOn ? 0 : undefined))
  pin(m, 'lightKind', () => (stillOn ? 'sun' : undefined))
  for (const key of ['shiftX', 'shiftZ', 'evolve', 'speedX', 'speedZ'] as const) pin(m.cloud, key, () => (stillOn ? 0 : undefined))
  pinVector(m.sun, sun)
  pinVector(m.light, sun)
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

window.checks = {
  ready,
  info: () => ({ sky: film.skyName, width: film.stage.width, height: film.stage.height, textureMb: film.textureMb(), parts: film.parts.map((p) => p.name) }),
  warm: (tier) => film.warm(tier as TierId),
  made: () => madeSoFar(),
  async draw(frame, tier, png) {
    if (cutFrom >= 0) film.view.fixed = frame >= cutFrom ? views.crane : base
    if (madeAt === frame) film.scene.add(lateMesh())
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
    stillOn = on
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
  fault(kind, a, b) {
    if (kind === 'cut') cutFrom = a
    else if (kind === 'made') madeAt = a
    else if (kind === 'dice') dice = true
    else if (kind === 'memory') memory = true
    else if (kind === 'grow') grow = { from: a, to: b, rate: 0.05 }
    else throw new Error(`unknown fault "${kind}"`)
  },
}
