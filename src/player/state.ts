// What the page's own work on a frame costs with nothing drawn: the film sets every part to the frame, fills its buffers, and stops before the graphics card is asked for a picture.
// The time and the bytes are counted by owner. It measures and leaves no mark: the frame on screen is drawn again after it.
import * as THREE from 'three'
import { config, type TierId } from '../config.ts'
import { breathe } from '../core/yield.ts'
import type { Film } from '../director/film.ts'

export const DIRECTOR = 'director'
const FRAME_MS = 1000 / config.film.fps

export interface OwnerCost { owner: string; meanMs: number; worstMs: number; worstAtFrame: number; meanBytes: number; worstBytes: number; worstBytesAtFrame: number; meanWrites: number }

export interface StateRow { frame: number; ms: number; bytes: number; writes: number; byOwner: Record<string, { ms: number; bytes: number; writes: number }> }

export interface StateReport {
  at: string
  from: number
  to: number
  frames: number
  tier: string
  format: string
  quality: string
  // The whole of the page's own work on a frame, every owner together.
  script: OwnerCost
  overFrame: number
  owners: OwnerCost[]
  rows: StateRow[]
}

type Method = (...args: unknown[]) => unknown
type Bag = Record<string, unknown>
interface Ranged { updateRanges?: { start: number; count: number }[]; clearUpdateRanges?: () => void }

function bytesOf(thing: object): number {
  const ranged = thing as Ranged
  const held = thing as { array?: unknown; image?: { data?: unknown; width?: number; height?: number; depth?: number } | null }
  const data = ArrayBuffer.isView(held.array) ? held.array : ArrayBuffer.isView(held.image?.data) ? held.image.data : null
  const each = data ? ((data as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1) : 4
  let bytes = 0
  if (ranged.updateRanges && ranged.updateRanges.length > 0) for (const r of ranged.updateRanges) bytes += r.count * each
  else if (data) bytes = data.byteLength
  else bytes = (held.image?.width ?? 0) * (held.image?.height ?? 0) * (held.image?.depth ?? 1) * 4
  ranged.clearUpdateRanges?.()
  return bytes
}

function summed(name: string, rows: StateRow[], pick: (r: StateRow) => { ms: number; bytes: number; writes: number } | undefined): OwnerCost {
  const out: OwnerCost = { owner: name, meanMs: 0, worstMs: 0, worstAtFrame: -1, meanBytes: 0, worstBytes: 0, worstBytesAtFrame: -1, meanWrites: 0 }
  for (const r of rows) {
    const c = pick(r)
    if (!c) continue
    out.meanMs += c.ms / rows.length
    out.meanBytes += c.bytes / rows.length
    out.meanWrites += c.writes / rows.length
    if (c.ms > out.worstMs) {
      out.worstMs = c.ms
      out.worstAtFrame = r.frame
    }
    if (c.bytes > out.worstBytes) {
      out.worstBytes = c.bytes
      out.worstBytesAtFrame = r.frame
    }
  }
  return out
}

export function summarize(rows: StateRow[], facts: { from: number; to: number; tier: string; format: string; quality: string }): StateReport {
  const names = new Set<string>()
  for (const r of rows) for (const name of Object.keys(r.byOwner)) names.add(name)
  const owners = [...names].map((name) => summed(name, rows, (r) => r.byOwner[name])).sort((a, b) => b.meanMs - a.meanMs)
  return {
    at: new Date().toISOString(),
    ...facts,
    frames: rows.length,
    script: summed('script', rows, (r) => r),
    overFrame: rows.filter((r) => r.ms > FRAME_MS).length,
    owners,
    rows,
  }
}

const n1 = (v: number): string => v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)
const kb = (bytes: number): string => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} kB` : `${bytes.toFixed(0)} B`)

// The report as a table of plain text, to paste into a message.
export function stateText(report: StateReport): string {
  const line = (c: OwnerCost): string => `${c.owner.padEnd(10)} ${n1(c.meanMs).padStart(7)} ${n1(c.worstMs).padStart(7)} ${String(c.worstAtFrame).padStart(6)} ${kb(c.meanBytes).padStart(10)} ${kb(c.worstBytes).padStart(10)} ${n1(c.meanWrites).padStart(7)}`
  return [
    `frames ${report.from} to ${report.to}, ${report.frames} in a row, nothing drawn · ${report.format}, ${report.quality} quality, ${report.tier}`,
    `${'owner'.padEnd(10)} ${'mean ms'.padStart(7)} ${'worst'.padStart(7)} ${'at'.padStart(6)} ${'mean'.padStart(10)} ${'worst'.padStart(10)} ${'writes'.padStart(7)}`,
    line(report.script),
    ...report.owners.filter((c) => c.meanMs >= 0.005 || c.meanBytes > 0).map(line),
    `over ${FRAME_MS.toFixed(1)} ms of script: ${report.overFrame} of ${report.frames} frames`,
  ].join('\n')
}

// Steps the film through `from` to `to` in a row with nothing drawn. The frame before `from` is stepped first and not counted, so that the first counted frame follows its neighbour as in play.
export async function stateRun(film: Film, from: number, to: number, tier: TierId, onFrame?: (frame: number) => void): Promise<StateReport> {
  await film.load()
  const undo: (() => void)[] = []
  const stub = (target: object, name: string, put: Method): void => {
    const bag = target as Bag
    const own = Object.prototype.hasOwnProperty.call(bag, name)
    const was = bag[name]
    bag[name] = put
    undo.push(() => {
      if (own) bag[name] = was
      else delete bag[name]
    })
  }
  let owner = DIRECTOR
  let spent: Record<string, number> = {}
  let dirty = new Map<string, Set<object>>()
  const owned = (target: object | null, name: string, by: string): void => {
    if (!target) return
    const was = (target as Bag)[name]
    if (typeof was !== 'function') return
    stub(target, name, function (this: unknown, ...args: unknown[]) {
      const outer = owner
      if (outer === by) return (was as Method).apply(this, args)
      owner = by
      const t = performance.now()
      try {
        return (was as Method).apply(this, args)
      } finally {
        const took = performance.now() - t
        spent[by] = (spent[by] ?? 0) + took
        spent[outer] = (spent[outer] ?? 0) - took
        owner = outer
      }
    })
  }
  const watched = (proto: object): void => {
    const d = Object.getOwnPropertyDescriptor(proto, 'needsUpdate')
    if (!d || !d.set) return
    const set = d.set
    Object.defineProperty(proto, 'needsUpdate', {
      configurable: true,
      get: d.get,
      set(this: object, value: boolean) {
        set.call(this, value)
        if (value !== true) return
        let list = dirty.get(owner)
        if (!list) dirty.set(owner, (list = new Set()))
        list.add(this)
      },
    })
    undo.push(() => Object.defineProperty(proto, 'needsUpdate', d))
  }

  const { renderer } = film.stage
  const draw = renderer.render.bind(renderer)
  const nothing: Method = () => undefined
  stub(renderer, 'render', ((scene: THREE.Object3D, camera: THREE.Camera) => {
    if (scene !== film.scene) draw(scene, camera)
  }) as Method)
  stub(film.shadow, 'render', nothing)
  stub(film.post, 'render', nothing)
  stub(film.stage.accumulator, 'add', nothing)
  const finish = film.stage.finish.bind(film.stage)
  stub(film.stage, 'finish', nothing)
  if (film.sky) stub(film.sky, 'render', nothing)
  for (const name of ['setState', 'setQuality', 'show']) owned(film.ground, name, 'ground')
  for (const name of ['prepare', 'place']) owned(film.plant, name, 'plant')
  for (const name of ['prepare', 'place']) owned(film.companion, name, 'companion')
  for (const name of ['prepare', 'look', 'show']) owned(film.field, name, 'field')
  for (const name of ['light', 'prepare', 'face']) owned(film.sky, name, 'sky')
  for (const { name, part } of film.parts) for (const method of ['prepare', 'sample']) owned(part, method, name)
  watched(THREE.BufferAttribute.prototype)
  watched(THREE.InterleavedBuffer.prototype)
  watched(THREE.Texture.prototype)

  const rows: StateRow[] = []
  const step = async (frame: number): Promise<StateRow> => {
    owner = DIRECTOR
    spent = {}
    dirty = new Map()
    const t = performance.now()
    await film.renderFrame(frame, tier)
    const ms = performance.now() - t
    const byOwner: StateRow['byOwner'] = {}
    let inside = 0
    for (const [name, v] of Object.entries(spent)) {
      if (name === DIRECTOR) continue
      byOwner[name] = { ms: v, bytes: 0, writes: 0 }
      inside += v
    }
    byOwner[DIRECTOR] = { ms: Math.max(0, ms - inside), bytes: 0, writes: 0 }
    let bytes = 0
    let writes = 0
    for (const [name, list] of dirty) {
      const row = (byOwner[name] ??= { ms: 0, bytes: 0, writes: 0 })
      for (const thing of list) {
        const size = bytesOf(thing)
        row.bytes += size
        row.writes += 1
        bytes += size
        writes += 1
      }
    }
    return { frame, ms, bytes, writes, byOwner }
  }
  try {
    const first = Math.max(0, Math.round(from))
    const last = Math.max(first, Math.round(to))
    if (first > 0) {
      await step(first - 1)
      finish()
    }
    for (let frame = first; frame <= last; frame++) {
      rows.push(await step(frame))
      finish()
      onFrame?.(frame)
      await breathe()
    }
    return summarize(rows, { from: first, to: last, tier, format: `${film.format.width} x ${film.format.height}`, quality: film.quality ?? 'by tier' })
  } finally {
    for (let i = undo.length - 1; i >= 0; i--) undo[i]()
  }
}
