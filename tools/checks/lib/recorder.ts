// Runs in the page before the film's own code. Notes every write into a buffer or a texture of the graphics card while it is switched on:
// how many bytes, into which buffer and from which array, so that the page can say whose it is.

export interface WriteRow { kind: string; owner: string; calls: number; bytes: number; objects: number; largest: number }

interface Call { kind: string; bytes: number; whole: number; label: string; src: object | null; into: object | null }
interface Notes { on: boolean; calls: Call[] }
type Owner = (src: object) => string | null

export function recorder(): void {
  const notes: Notes = { on: false, calls: [] }
  ;(window as unknown as { __writes: Notes }).__writes = notes
  const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...args: unknown[]) => unknown>
  const wrap = (name: string, describe: (gl: WebGL2RenderingContext, a: unknown[]) => Call): void => {
    const original = proto[name]
    proto[name] = function (this: WebGL2RenderingContext, ...a: unknown[]) {
      if (notes.on) notes.calls.push(describe(this, a))
      return original.apply(this, a)
    }
  }
  const view = (x: unknown): ArrayBufferView | null => (x && typeof x === 'object' && ArrayBuffer.isView(x) ? (x as ArrayBufferView) : null)
  const each = (v: ArrayBufferView): number => (v as unknown as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1
  const bound = (gl: WebGL2RenderingContext, target: number): object | null => gl.getParameter(target === gl.ELEMENT_ARRAY_BUFFER ? gl.ELEMENT_ARRAY_BUFFER_BINDING : target === gl.UNIFORM_BUFFER ? gl.UNIFORM_BUFFER_BINDING : gl.ARRAY_BUFFER_BINDING) as object | null
  wrap('bufferSubData', (gl, a) => {
    const v = view(a[2])
    const size = gl.getBufferParameter(a[0] as number, gl.BUFFER_SIZE) as number
    const bytes = v ? (a[4] ? (a[4] as number) * each(v) : v.byteLength - ((a[3] as number) || 0) * each(v)) : ((a[2] as ArrayBuffer | null)?.byteLength ?? 0)
    return { kind: 'buffer', bytes, whole: size, label: `a buffer of ${size} bytes`, src: (a[2] as object) ?? null, into: bound(gl, a[0] as number) }
  })
  wrap('bufferData', (gl, a) => {
    const v = view(a[1])
    const bytes = v ? v.byteLength : typeof a[1] === 'number' ? a[1] : ((a[1] as ArrayBuffer | null)?.byteLength ?? 0)
    return { kind: 'buffer given new storage', bytes, whole: bytes, label: `a buffer of ${bytes} bytes`, src: (a[1] as object) ?? null, into: bound(gl, a[0] as number) }
  })
  const pixels = (kind: string, sizeAt: number, deep: boolean) => (gl: WebGL2RenderingContext, a: unknown[]): Call => {
    const last = a[a.length - 1]
    const v = view(last) ?? view(a[a.length - 2])
    const w = a[sizeAt] as number
    const h = a[sizeAt + 1] as number
    const d = deep ? (a[sizeAt + 2] as number) : 1
    const sized = typeof w === 'number' && typeof h === 'number'
    // A write of a part of a texture is given the whole array and a rectangle: what goes to the card is the rectangle.
    const format = a[a.indexOf(v ?? last) - 2] as number
    const channels = format === gl.RED || format === gl.RED_INTEGER || format === gl.DEPTH_COMPONENT || format === gl.ALPHA || format === gl.LUMINANCE ? 1 : format === gl.RG || format === gl.RG_INTEGER || format === gl.LUMINANCE_ALPHA ? 2 : format === gl.RGB || format === gl.RGB_INTEGER ? 3 : 4
    const bytes = v ? (sized ? Math.min(v.byteLength, w * h * d * channels * each(v)) : v.byteLength) : sized ? w * h * d * 4 : 0
    const src = v ?? (last && typeof last === 'object' ? (last as object) : null)
    return { kind, bytes, whole: v ? v.byteLength : bytes, label: sized ? `a texture of ${w} x ${h}${deep ? ` x ${d}` : ''}` : 'a texture from an image', src, into: gl.getParameter(deep ? gl.TEXTURE_BINDING_3D : gl.TEXTURE_BINDING_2D) as object | null }
  }
  wrap('texSubImage2D', pixels('texture', 4, false))
  wrap('texSubImage3D', pixels('texture', 5, true))
  wrap('texImage2D', pixels('texture given new storage', 3, false))
  wrap('texImage3D', pixels('texture given new storage', 3, true))
}

export function startRecording(): void {
  const notes = (window as unknown as { __writes: Notes }).__writes
  notes.calls.length = 0
  notes.on = true
}

export function stopRecording(): WriteRow[] {
  const notes = (window as unknown as { __writes: Notes }).__writes
  notes.on = false
  const owner = (window as unknown as { __owner?: Owner }).__owner
  const rows = new Map<string, WriteRow & { into: Set<object> }>()
  for (const c of notes.calls) {
    const who = (c.src && owner ? owner(c.src) : null) ?? c.label
    const key = `${c.kind}|${who}`
    let row = rows.get(key)
    if (!row) rows.set(key, (row = { kind: c.kind, owner: who, calls: 0, bytes: 0, objects: 0, largest: 0, into: new Set() }))
    row.calls++
    row.bytes += c.bytes
    row.largest = Math.max(row.largest, c.whole)
    if (c.into) row.into.add(c.into)
  }
  notes.calls.length = 0
  return [...rows.values()].map(({ into, ...r }) => ({ ...r, objects: into.size })).sort((a, b) => b.bytes - a.bytes)
}
