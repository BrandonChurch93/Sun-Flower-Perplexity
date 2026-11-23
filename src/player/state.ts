// What the page's own work on a frame costs with nothing drawn: the film sets every part to the frame, the renderer walks the scene and hands the graphics card what was filled, and every draw call is left out.
// The time is counted by owner and the bytes by whose storage they went into. It measures and leaves no mark: the frame on screen is drawn again after it.
import * as THREE from 'three'
import { config, type TierId } from '../config.ts'
import { breathe } from '../core/yield.ts'
import type { Film } from '../director/film.ts'
import { madeSoFar, type Made } from '../v2/counter.ts'

export const DIRECTOR = 'director'
// The renderer's own pass over the scene and the shadow map: sorting, uniforms, state. Its draw calls are left out.
export const RENDERER = 'renderer'
// Handing the filled bytes to the graphics card.
export const SENDING = 'sending'
// A picture that a later frame may reuse (the sky's clouds, the far field, the ripples) is really drawn, and its time is kept out of the script.
const DRAWN = 'drawn'
const UNNAMED = 'unnamed'
const FRAME_MS = 1000 / config.film.fps
const SILENT = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear', 'clearBufferfv', 'clearBufferiv', 'clearBufferuiv', 'clearBufferfi', 'blitFramebuffer', 'generateMipmap']
const SENT = ['bufferSubData', 'texSubImage2D', 'texSubImage3D']
const THINGS: (keyof Made)[] = ['programs', 'shaders', 'textures', 'buffers', 'framebuffers', 'renderbuffers', 'uploads', 'vertexArrays']

export interface OwnerCost { owner: string; meanMs: number; worstMs: number; worstAtFrame: number; meanBytes: number; worstBytes: number; worstBytesAtFrame: number; meanWrites: number }

// `ms` is the script of the frame, every owner together. `drawnMs` is the time of the pictures really drawn inside it, which is not in `ms`.
export interface StateRow { frame: number; ms: number; drawnMs?: number; bytes: number; writes: number; byOwner: Record<string, { ms: number; bytes: number; writes: number }> }

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
  // The three seconds of film whose frames cost the most script, the dearest first.
  stretches: StateStretch[]
  complete: boolean
  // Pictures really drawn inside the frames, kept out of every other number here.
  drawnMs: { mean: number; worst: number; worstAtFrame: number }
  // What the run made on the graphics card: programs, shaders, textures, buffers, vertex arrays, storage. It must be nothing.
  made: number
  rows: StateRow[]
}

export interface StateStretch { from: number; to: number; frames: number; meanMs: number; worstMs: number; worstAtFrame: number; meanBytes: number; owners: [string, number][] }

const STRETCH_FRAMES = config.film.fps
const WORST_STRETCHES = 3

function worstStretches(rows: StateRow[]): StateStretch[] {
  const windows = new Map<number, StateRow[]>()
  for (const r of rows) {
    const key = Math.floor(r.frame / STRETCH_FRAMES)
    const list = windows.get(key)
    if (list) list.push(r)
    else windows.set(key, [r])
  }
  return [...windows.entries()]
    .map(([key, list]): StateStretch => {
      const all = summed('script', list, (r) => r)
      const names = new Set<string>()
      for (const r of list) for (const name of Object.keys(r.byOwner)) names.add(name)
      const owners = [...names]
        .map((name): [string, number] => [name, summed(name, list, (r) => r.byOwner[name]).meanMs])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
      return { from: key * STRETCH_FRAMES, to: key * STRETCH_FRAMES + STRETCH_FRAMES - 1, frames: list.length, meanMs: all.meanMs, worstMs: all.worstMs, worstAtFrame: all.worstAtFrame, meanBytes: all.meanBytes, owners }
    })
    .sort((a, b) => b.meanMs - a.meanMs)
    .slice(0, WORST_STRETCHES)
}

type Method = (...args: unknown[]) => unknown
type Bag = Record<string, unknown>

// The bytes a call sends, as the film's own counter reads them.
function sizeOf(gl: WebGL2RenderingContext, name: string, args: unknown[]): { bytes: number; data: object | null } {
  const each = (v: unknown): number => (v as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1
  if (name === 'bufferSubData') {
    const data = args[2] as ArrayBufferView | ArrayBuffer | null
    if (!data || typeof data !== 'object' || !('byteLength' in data)) return { bytes: 0, data: null }
    const from = typeof args[3] === 'number' ? args[3] : 0
    const length = typeof args[4] === 'number' && args[4] > 0 ? args[4] : data.byteLength / each(data) - from
    return { bytes: length * each(data), data }
  }
  const flat = name === 'texSubImage2D'
  const data = args[flat ? 8 : 10]
  const format = args[flat ? 6 : 8] as number
  if (!ArrayBuffer.isView(data)) return { bytes: 0, data: null }
  const channels = format === gl.RED || format === gl.RED_INTEGER || format === gl.DEPTH_COMPONENT || format === gl.ALPHA || format === gl.LUMINANCE ? 1 : format === gl.RG || format === gl.RG_INTEGER || format === gl.LUMINANCE_ALPHA ? 2 : format === gl.RGB || format === gl.RGB_INTEGER ? 3 : 4
  const texels = flat ? (args[4] as number) * (args[5] as number) : (args[5] as number) * (args[6] as number) * (args[7] as number)
  return { bytes: Math.min(data.byteLength, texels * channels * each(data)), data }
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

export function summarize(rows: StateRow[], facts: { from: number; to: number; tier: string; format: string; quality: string }, complete = true, made = 0): StateReport {
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
    stretches: worstStretches(rows),
    complete,
    drawnMs: rows.reduce((a, r) => ({ mean: a.mean + (r.drawnMs ?? 0) / rows.length, worst: Math.max(a.worst, r.drawnMs ?? 0), worstAtFrame: (r.drawnMs ?? 0) > a.worst ? r.frame : a.worstAtFrame }), { mean: 0, worst: 0, worstAtFrame: -1 }),
    made,
    rows,
  }
}

const n1 = (v: number): string => v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)
const kb = (bytes: number): string => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} kB` : `${bytes.toFixed(0)} B`)

// The owners in one order whatever they cost, so that two runs can be laid side by side.
const FIRST = ['plant', 'companion', 'field', 'ground', 'sky']
const LAST = [RENDERER, SENDING, 'post', DIRECTOR, UNNAMED]
export function inOrder(names: string[]): string[] {
  const rest = names.filter((n) => !FIRST.includes(n) && !LAST.includes(n)).sort()
  return [...FIRST, ...rest, ...LAST].filter((n) => names.includes(n))
}

// The report as a table of plain text, to paste into a message.
export function stateText(report: StateReport): string {
  const line = (c: OwnerCost): string => `${c.owner.padEnd(10)} ${n1(c.meanMs).padStart(7)} ${n1(c.worstMs).padStart(7)} ${String(c.worstAtFrame).padStart(6)} ${kb(c.meanBytes).padStart(10)} ${kb(c.worstBytes).padStart(10)} ${n1(c.meanWrites).padStart(7)}`
  const by = new Map(report.owners.map((c) => [c.owner, c]))
  return [
    `script alone: frames ${report.from} to ${report.to}, ${report.frames} set in a row with every draw call left out${report.complete ? '' : ', stopped early'}, ${report.format}, ${report.quality} quality`,
    `ms a frame by owner, and the bytes sent into its storage (${RENDERER}: the walk over the scene, ${SENDING}: handing the bytes over):`,
    `${'owner'.padEnd(10)} ${'mean ms'.padStart(7)} ${'worst'.padStart(7)} ${'at'.padStart(6)} ${'sent'.padStart(10)} ${'worst'.padStart(10)} ${'writes'.padStart(7)}`,
    line(report.script),
    ...inOrder([...by.keys()]).map((name) => by.get(name) as OwnerCost).filter((c) => c.meanMs >= 0.005 || c.meanBytes > 0).map(line),
    `over ${FRAME_MS.toFixed(1)} ms of script: ${report.overFrame} of ${report.frames} frames`,
    `made on the graphics card during the run: ${report.made === 0 ? 'nothing' : `${report.made} things`}`,
    ...(report.drawnMs.worst > 0 ? [`not in the sums: pictures kept for later frames were really drawn, ${n1(report.drawnMs.mean)} ms a frame, the most ${n1(report.drawnMs.worst)} ms at frame ${report.drawnMs.worstAtFrame}`] : []),
    `the ${report.stretches.length === 1 ? 'dearest second' : `${report.stretches.length} dearest seconds`} of film:`,
    ...report.stretches.map((w) => `  frames ${w.from} to ${w.to}: mean ${n1(w.meanMs)} ms, worst ${n1(w.worstMs)} ms at frame ${w.worstAtFrame}, ${kb(w.meanBytes)} a frame (${w.owners.map(([name, v]) => `${name} ${n1(v)}`).join(', ')})`),
  ].join('\n')
}

// Steps the film through `from` to `to` in a row with every draw call left out. The frame before `from` is stepped first and not counted, so that the first counted frame follows its neighbour as in play.
export async function stateRun(film: Film, from: number, to: number, tier: TierId, hooks: { onFrame?(frame: number): void; stopped?(): boolean } = {}): Promise<StateReport> {
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
  let sent: Record<string, { bytes: number; writes: number }> = {}
  // Draw calls are left out while `quiet` is up, unless a picture that is kept for later frames is being drawn inside.
  let quiet = 0
  let loud = 0
  let inScene = 0
  const charge = <T>(by: string, run: () => T): T => {
    const outer = owner
    if (outer === by) return run()
    owner = by
    const t = performance.now()
    try {
      return run()
    } finally {
      const took = performance.now() - t
      spent[by] = (spent[by] ?? 0) + took
      spent[outer] = (spent[outer] ?? 0) - took
      owner = outer
    }
  }
  const hushed = <T>(run: () => T): T => {
    quiet++
    try {
      return run()
    } finally {
      quiet--
    }
  }
  const aloud = <T>(run: () => T): T => {
    loud++
    try {
      return charge(DRAWN, run)
    } finally {
      loud--
    }
  }
  const owned = (target: object | null, name: string, by: string, hush = false): void => {
    if (!target) return
    const was = (target as Bag)[name]
    if (typeof was !== 'function') return
    stub(target, name, function (this: unknown, ...args: unknown[]) {
      const run = (): unknown => charge(by, () => (was as Method).apply(this, args))
      return hush ? hushed(run) : run()
    })
  }
  // Whose storage an array is: the owner that last marked it to be sent.
  const whose = new WeakMap<object, string>()
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
        const held = this as { array?: unknown; image?: { data?: unknown } | null }
        const data = ArrayBuffer.isView(held.array) ? held.array : ArrayBuffer.isView(held.image?.data) ? held.image.data : null
        if (data) whose.set(data, owner)
      },
    })
    undo.push(() => Object.defineProperty(proto, 'needsUpdate', d))
  }

  const { renderer, gl } = film.stage
  const bag = gl as unknown as Bag
  for (const name of SILENT) {
    const was = bag[name]
    if (typeof was !== 'function') continue
    stub(gl, name, (...args: unknown[]) => (quiet > 0 && loud === 0 ? undefined : (was as Method).apply(gl, args)))
  }
  for (const name of SENT) {
    const was = bag[name]
    if (typeof was !== 'function') continue
    stub(gl, name, (...args: unknown[]) => {
      const { bytes, data } = sizeOf(gl, name, args)
      const by = (data && whose.get(data)) ?? (owner === RENDERER || owner === SENDING ? UNNAMED : owner)
      const row = (sent[by] ??= { bytes: 0, writes: 0 })
      row.bytes += bytes
      row.writes += 1
      return charge(SENDING, () => (was as Method).apply(gl, args))
    })
  }
  const draw = renderer.render as unknown as Method
  stub(renderer, 'render', (...args: unknown[]) => {
    if (args[0] === film.scene) {
      inScene++
      try {
        return hushed(() => charge(RENDERER, () => draw.apply(renderer, args)))
      } finally {
        inScene--
      }
    }
    if (inScene > 0 || quiet === 0) return aloud(() => draw.apply(renderer, args))
    return draw.apply(renderer, args)
  })
  const clear = renderer.clear as unknown as Method
  stub(renderer, 'clear', (...args: unknown[]) => {
    if (inScene === 0 && quiet === 0 && owner === DIRECTOR) return hushed(() => clear.apply(renderer, args))
    if (inScene > 0 || quiet === 0) return aloud(() => clear.apply(renderer, args))
    return clear.apply(renderer, args)
  })
  stub(film.shadow, 'render', ((was: Method) => (...args: unknown[]) => hushed(() => was.apply(film.shadow, args)))(film.shadow.render as unknown as Method))
  stub(film.stage.accumulator, 'add', ((was: Method) => (...args: unknown[]) => hushed(() => was.apply(film.stage.accumulator, args)))(film.stage.accumulator.add as unknown as Method))
  owned(film.post, 'render', 'post', true)
  const finish = film.stage.finish.bind(film.stage)
  stub(film.stage, 'finish', () => undefined)
  owned(film.sky, 'render', 'sky', true)
  for (const name of ['setState', 'setQuality', 'show']) owned(film.ground, name, 'ground')
  for (const name of ['prepare', 'place']) owned(film.plant, name, 'plant')
  for (const name of ['prepare', 'place']) owned(film.companion, name, 'companion')
  for (const name of ['prepare', 'look', 'show']) owned(film.field, name, 'field')
  for (const name of ['light', 'prepare', 'face']) owned(film.sky, name, 'sky')
  for (const { name, part } of film.parts) for (const method of ['prepare', 'sample']) owned(part, method, name)
  // What an owner does as the renderer comes to one of its shapes is its own script.
  const shapes = (roots: THREE.Object3D[], by: string): void => {
    for (const root of roots)
      root.traverse((object) => {
        for (const name of ['onBeforeRender', 'onAfterRender', 'onBeforeShadow', 'onAfterShadow']) if (Object.prototype.hasOwnProperty.call(object, name)) owned(object, name, by)
      })
  }
  shapes([film.ground.mesh, ...film.ground.casters.map((c) => c.mesh)], 'ground')
  shapes(film.plant.meshes, 'plant')
  shapes(film.companion.meshes, 'companion')
  shapes(film.field.meshes, 'field')
  for (const { name, part } of film.parts) shapes(part.objects, name)
  watched(THREE.BufferAttribute.prototype)
  watched(THREE.InterleavedBuffer.prototype)
  watched(THREE.Texture.prototype)

  const rows: StateRow[] = []
  const step = async (frame: number): Promise<StateRow> => {
    owner = DIRECTOR
    spent = {}
    sent = {}
    const t = performance.now()
    await film.renderFrame(frame, tier)
    const whole = performance.now() - t
    const drawnMs = spent[DRAWN] ?? 0
    const ms = Math.max(0, whole - drawnMs)
    const byOwner: StateRow['byOwner'] = {}
    let inside = 0
    for (const [name, v] of Object.entries(spent)) {
      if (name === DIRECTOR || name === DRAWN) continue
      byOwner[name] = { ms: Math.max(0, v), bytes: 0, writes: 0 }
      inside += v
    }
    byOwner[DIRECTOR] = { ms: Math.max(0, ms - inside), bytes: 0, writes: 0 }
    let bytes = 0
    let writes = 0
    for (const [name, v] of Object.entries(sent)) {
      const row = (byOwner[name] ??= { ms: 0, bytes: 0, writes: 0 })
      row.bytes += v.bytes
      row.writes += v.writes
      bytes += v.bytes
      writes += v.writes
    }
    return { frame, ms, drawnMs, bytes, writes, byOwner }
  }
  try {
    const first = Math.max(0, Math.round(from))
    const last = Math.max(first, Math.round(to))
    if (first > 0) {
      await step(first - 1)
      finish()
    }
    const before = madeSoFar()
    let complete = true
    for (let frame = first; frame <= last; frame++) {
      if (hooks.stopped?.()) {
        complete = false
        break
      }
      rows.push(await step(frame))
      finish()
      hooks.onFrame?.(frame)
      await breathe()
    }
    const after = madeSoFar()
    const made = THINGS.reduce((a, k) => a + (after[k] - before[k]), 0)
    return summarize(rows, { from: first, to: rows.length ? rows[rows.length - 1].frame : first, tier, format: `${film.format.width} x ${film.format.height}`, quality: film.quality ?? 'by tier' }, complete, made)
  } finally {
    for (let i = undo.length - 1; i >= 0; i--) undo[i]()
  }
}
