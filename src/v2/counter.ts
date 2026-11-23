// Counts what the graphics card is asked to make. After the loading screen every one of these must stay at zero.
// `uploads` are calls that give a texture, a buffer or a renderbuffer its storage. `updates` write into storage that already exists, which a running film may do.
export interface Made { programs: number; shaders: number; textures: number; buffers: number; framebuffers: number; renderbuffers: number; uploads: number; uploadBytes: number; updates: number; updateBytes: number; bufferUpdates: number; bufferUpdateBytes: number; textureUpdates: number; textureUpdateBytes: number }

const made: Made = { programs: 0, shaders: 0, textures: 0, buffers: 0, framebuffers: 0, renderbuffers: 0, uploads: 0, uploadBytes: 0, updates: 0, updateBytes: 0, bufferUpdates: 0, bufferUpdateBytes: 0, textureUpdates: 0, textureUpdateBytes: 0 }
let installed = false

function sizeOf(gl: WebGL2RenderingContext, name: string, args: unknown[]): number {
  const each = (v: unknown): number => (v as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1
  if (name === 'bufferSubData') {
    const data = args[2] as ArrayBufferView | ArrayBuffer | null
    if (!data || typeof data !== 'object' || !('byteLength' in data)) return 0
    const from = typeof args[3] === 'number' ? args[3] : 0
    const length = typeof args[4] === 'number' && args[4] > 0 ? args[4] : data.byteLength / each(data) - from
    return length * each(data)
  }
  if (name === 'texSubImage2D' && typeof args[4] === 'number' && typeof args[5] === 'number' && ArrayBuffer.isView(args[8])) {
    const f = args[6] as number
    const channels = f === gl.RED || f === gl.RED_INTEGER || f === gl.DEPTH_COMPONENT || f === gl.ALPHA || f === gl.LUMINANCE ? 1 : f === gl.RG || f === gl.RG_INTEGER || f === gl.LUMINANCE_ALPHA ? 2 : f === gl.RGB || f === gl.RGB_INTEGER ? 3 : 4
    return Math.min((args[8] as ArrayBufferView).byteLength, args[4] * args[5] * channels * each(args[8]))
  }
  for (const a of args) {
    if (a && typeof a === 'object' && 'byteLength' in (a as ArrayBufferView)) return (a as ArrayBufferView).byteLength
    if (a && typeof a === 'object' && 'width' in (a as { width: number }) && 'height' in (a as { height: number })) return (a as { width: number }).width * (a as { height: number }).height * 4
  }
  return 0
}

export function installCounter(): void {
  if (installed || typeof WebGL2RenderingContext === 'undefined') return
  installed = true
  const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...args: unknown[]) => unknown>
  const count = (name: string, key: keyof Made, bytes: 'uploadBytes' | 'updateBytes' | null = null) => {
    const original = proto[name]
    if (typeof original !== 'function') return
    proto[name] = function (this: unknown, ...args: unknown[]) {
      made[key]++
      const size = bytes ? sizeOf(this as WebGL2RenderingContext, name, args) : 0
      if (bytes) made[bytes] += size
      if (bytes === 'updateBytes') {
        const buffer = name === 'bufferSubData'
        made[buffer ? 'bufferUpdates' : 'textureUpdates']++
        made[buffer ? 'bufferUpdateBytes' : 'textureUpdateBytes'] += size
      }
      return original.apply(this, args)
    }
  }
  count('createProgram', 'programs')
  count('createShader', 'shaders')
  count('createTexture', 'textures')
  count('createBuffer', 'buffers')
  count('createFramebuffer', 'framebuffers')
  count('createRenderbuffer', 'renderbuffers')
  for (const name of ['texImage2D', 'texImage3D', 'texStorage2D', 'texStorage3D', 'compressedTexImage2D', 'compressedTexImage3D', 'bufferData', 'renderbufferStorage', 'renderbufferStorageMultisample', 'copyTexImage2D']) count(name, 'uploads', 'uploadBytes')
  for (const name of ['texSubImage2D', 'texSubImage3D', 'bufferSubData', 'compressedTexSubImage2D']) count(name, 'updates', 'updateBytes')
}

export function madeSoFar(): Made {
  return { ...made }
}

export function madeSince(then: Made): Made {
  const out = { ...made }
  for (const key of Object.keys(out) as (keyof Made)[]) out[key] -= then[key]
  return out
}

export function nothingMade(m: Made): boolean {
  return m.programs + m.shaders + m.textures + m.buffers + m.framebuffers + m.renderbuffers + m.uploads === 0
}
