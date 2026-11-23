// Runs in the page before the film's own code. Notes every object the film asks the graphics card to make while it is switched on,
// with the stack of the call, so that the check can name the file that made it.

export interface MadeThing { kind: string; stack: string; what: string; names: string[] }

interface Note { kind: string; stack: string; object: object | null; program: WebGLProgram | null; size: string }
interface Notes { on: boolean; things: Note[]; fresh: WeakMap<object, Note> }

export function tracer(): void {
  const notes: Notes = { on: false, things: [], fresh: new WeakMap() }
  ;(window as unknown as { __made: Notes }).__made = notes
  ;(Error as unknown as { stackTraceLimit: number }).stackTraceLimit = 60
  const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...args: unknown[]) => unknown>
  const KINDS: Record<string, string> = { createProgram: 'program', createShader: 'shader', createTexture: 'texture', createBuffer: 'buffer', createFramebuffer: 'framebuffer', createRenderbuffer: 'renderbuffer', createVertexArray: 'vertex array' }
  for (const [name, kind] of Object.entries(KINDS)) {
    const original = proto[name]
    proto[name] = function (this: WebGL2RenderingContext, ...a: unknown[]) {
      const object = original.apply(this, a) as object | null
      if (notes.on) {
        const note: Note = { kind, stack: new Error().stack ?? '', object, program: kind === 'vertex array' ? (this.getParameter(this.CURRENT_PROGRAM) as WebGLProgram | null) : null, size: '' }
        notes.things.push(note)
        if (object) notes.fresh.set(object, note)
      }
      return object
    }
  }
  // three flags a shader for deletion once its program is linked, and its source cannot be read after that: the name is kept when the source is given.
  const shaderNames = new WeakMap<object, string>()
  const programNames = new WeakMap<object, string>()
  ;(window as unknown as { __programNames: WeakMap<object, string> }).__programNames = programNames
  const source = proto.shaderSource
  proto.shaderSource = function (this: WebGL2RenderingContext, ...a: unknown[]) {
    const name = /#define SHADER_NAME (\S+)/.exec(String(a[1]))?.[1]
    if (name && a[0]) shaderNames.set(a[0] as object, name)
    return source.apply(this, a)
  }
  const attach = proto.attachShader
  proto.attachShader = function (this: WebGL2RenderingContext, ...a: unknown[]) {
    const name = a[1] ? shaderNames.get(a[1] as object) : undefined
    if (name && a[0]) programNames.set(a[0] as object, name)
    return attach.apply(this, a)
  }
  const sized = (name: string, binding: (gl: WebGL2RenderingContext, a: unknown[]) => object | null, size: (a: unknown[]) => string): void => {
    const original = proto[name]
    proto[name] = function (this: WebGL2RenderingContext, ...a: unknown[]) {
      if (notes.on) {
        const into = binding(this, a)
        const note = into ? notes.fresh.get(into) : undefined
        if (note && !note.size) note.size = size(a)
      }
      return original.apply(this, a)
    }
  }
  const texture = (gl: WebGL2RenderingContext, a: unknown[]): object | null => gl.getParameter(a[0] === gl.TEXTURE_3D ? gl.TEXTURE_BINDING_3D : a[0] === gl.TEXTURE_2D_ARRAY ? gl.TEXTURE_BINDING_2D_ARRAY : a[0] === gl.TEXTURE_2D ? gl.TEXTURE_BINDING_2D : gl.TEXTURE_BINDING_CUBE_MAP) as object | null
  sized('texStorage2D', texture, (a) => `${a[3]} x ${a[4]}, ${a[1]} levels`)
  sized('texStorage3D', texture, (a) => `${a[3]} x ${a[4]} x ${a[5]}`)
  sized('texImage2D', texture, (a) => (typeof a[3] === 'number' && typeof a[4] === 'number' ? `${a[3]} x ${a[4]}` : 'from an image'))
  sized('texImage3D', texture, (a) => `${a[3]} x ${a[4]} x ${a[5]}`)
  sized('bufferData', (gl, a) => gl.getParameter(a[0] === gl.ELEMENT_ARRAY_BUFFER ? gl.ELEMENT_ARRAY_BUFFER_BINDING : a[0] === gl.UNIFORM_BUFFER ? gl.UNIFORM_BUFFER_BINDING : gl.ARRAY_BUFFER_BINDING) as object | null, (a) => {
    const d = a[1] as ArrayBufferView | ArrayBuffer | number | null
    return `${typeof d === 'number' ? d : (d?.byteLength ?? 0)} bytes${a[0] === 0x8893 ? ', indices' : ''}`
  })
  sized('renderbufferStorage', (gl) => gl.getParameter(gl.RENDERBUFFER_BINDING) as object | null, (a) => `${a[2]} x ${a[3]}`)
  sized('renderbufferStorageMultisample', (gl) => gl.getParameter(gl.RENDERBUFFER_BINDING) as object | null, (a) => `${a[3]} x ${a[4]}, ${a[1]} samples`)
}

export function startTracing(): void {
  const notes = (window as unknown as { __made: Notes }).__made
  notes.things.length = 0
  notes.on = true
}

// What was made since startTracing. A program, and the program a vertex array was made under, is named by three's SHADER_NAME and by its own uniforms and attributes.
export function stopTracing(): MadeThing[] {
  const notes = (window as unknown as { __made: Notes }).__made
  notes.on = false
  const canvas = document.querySelector('canvas') as HTMLCanvasElement
  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext
  const named = (program: WebGLProgram | null): { what: string; names: string[] } => {
    if (!program || !gl.isProgram(program)) return { what: '', names: [] }
    const sources = (gl.getAttachedShaders(program) ?? []).map((s) => gl.getShaderSource(s) ?? '')
    const name = (window as unknown as { __programNames: WeakMap<object, string> }).__programNames.get(program) ?? ''
    const names: string[] = []
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const uniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
      for (let i = 0; i < uniforms; i++) names.push((gl.getActiveUniform(program, i)?.name ?? '').replace(/\[.*$/, ''))
      const attributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) as number
      for (let i = 0; i < attributes; i++) names.push(gl.getActiveAttrib(program, i)?.name ?? '')
    } else {
      for (const m of sources.join('\n').matchAll(/uniform\s+\w+\s+(\w+)/g)) names.push(m[1])
    }
    return { what: name, names: [...new Set(names.filter(Boolean))] }
  }
  const out = notes.things.map((n) => {
    const p = n.kind === 'program' ? named(n.object as WebGLProgram) : n.kind === 'vertex array' ? named(n.program) : { what: '', names: [] }
    return { kind: n.kind, stack: n.stack, what: [p.what, n.size].filter(Boolean).join(', '), names: p.names }
  })
  notes.things.length = 0
  return out
}
