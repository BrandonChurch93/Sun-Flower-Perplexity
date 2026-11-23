import fs from 'node:fs'
import { openSession } from './lib/render.ts'

// npx tsx tools/made-where.mts 3331,3340-3350 /abs/out/prefix names every vertex array made after warming, its program and its first draw. ONLY=sky,ground draws those parts alone.
const frames = process.argv[2].split(',').flatMap((x) => {
  const [a, b] = x.split('-').map(Number)
  return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i)
})
const out = process.argv[3]
const only = process.env.ONLY ?? ''
const session = await openSession({ format: 'preview', extra: only ? `sky=sky&only=${encodeURIComponent(only)}` : 'sky=sky', what: 'bench' })
try {
  await session.page.evaluate(() => window.showcase.warm('draft'))
  console.log('warmed')
  await session.page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    const gl = canvas.getContext('webgl2') as WebGL2RenderingContext
    const found: unknown[] = []
    ;(window as unknown as { vaoFound: unknown[] }).vaoFound = found
    let pending: Record<string, unknown> | null = null
    const create = gl.createVertexArray
    gl.createVertexArray = function (this: WebGL2RenderingContext) {
      const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null
      const shaders = program ? gl.getAttachedShaders(program) ?? [] : []
      const sources = shaders.map((s) => gl.getShaderSource(s) ?? '')
      const count = program ? gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) as number : 0
      const attributes = program ? Array.from({ length: count }, (_, i) => gl.getActiveAttrib(program, i)?.name) : []
      const uniformCount = program ? gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number : 0
      const uniforms = program ? Array.from({ length: uniformCount }, (_, i) => gl.getActiveUniform(program, i)?.name) : []
      pending = { stack: new Error().stack, sources, attributes, uniforms, draws: [] as unknown[] }
      found.push(pending)
      return create.apply(this, [])
    } as typeof gl.createVertexArray
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'] as const) {
      const original = gl[name] as (...a: unknown[]) => void
      ;(gl as unknown as Record<string, unknown>)[name] = function (this: WebGL2RenderingContext, ...a: unknown[]) {
        if (pending && (pending.draws as unknown[]).length < 1) (pending.draws as unknown[]).push({ name, args: a })
        if (pending) pending = (pending.draws as unknown[]).length ? null : pending
        return original.apply(this, a)
      }
    }
  })
  for (const f of frames) {
    await session.page.evaluate(([n, t]) => window.showcase.renderFrame(n as number, t as string), [f, 'draft'] as const)
    const found = await session.page.evaluate(() => (window as unknown as { vaoFound: unknown[] }).vaoFound.splice(0)) as { sources: string[]; attributes: string[]; uniforms: string[]; draws: unknown[]; stack: string }[]
    console.log(`frame ${f} · vertex arrays made ${found.length}`)
    found.forEach((v, i) => {
      fs.writeFileSync(`${out}-${f}-${i}.json`, JSON.stringify(v, null, 1))
      console.log(`  attributes ${v.attributes.join(' ')}\n  uniforms ${v.uniforms.join(' ')}\n  first draw ${JSON.stringify(v.draws)}`)
    })
  }
} finally {
  await session.close()
}
