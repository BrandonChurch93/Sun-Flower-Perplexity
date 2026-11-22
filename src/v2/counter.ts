// Counts what the graphics card is asked to make. After the loading screen every one of these must stay at zero.
// `uploads` are calls that give a texture, a buffer or a renderbuffer its storage. `updates` write into storage that already exists, which a running film may do.
export interface Made { programs: number; shaders: number; textures: number; buffers: number; framebuffers: number; renderbuffers: number; uploads: number; uploadBytes: number; updates: number; updateBytes: number }

const made: Made = { programs: 0, shaders: 0, textures: 0, buffers: 0, framebuffers: 0, renderbuffers: 0, uploads: 0, uploadBytes: 0, updates: 0, updateBytes: 0 }
let installed = false

function sizeOf(args: unknown[]): number {
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
      if (bytes) made[bytes] += sizeOf(args)
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
