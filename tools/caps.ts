import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { config } from '../src/config.ts'
import { at, WORK } from './lib/paths.ts'
import { GL_FLAGS, chromePath, launch, machine, openPage } from './lib/browser.ts'
import { serve } from './lib/server.ts'

const dir = path.join(WORK, 'caps')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><meta charset="utf-8"><title>caps</title><canvas id="c" width="64" height="64"></canvas>')
const served = await serve(dir)
const browser = await launch()
const page = await openPage(browser)
await page.goto(served.url + '/index.html')
const { master, uhd, preview } = config.formats
const result = await page.evaluate(
  async ({ sizes, bitrate, fps }) => {
    const canvas = document.getElementById('c') as HTMLCanvasElement
    const gl = canvas.getContext('webgl2')
    if (!gl) return { webgl2: false }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const names = ['MAX_TEXTURE_SIZE', 'MAX_3D_TEXTURE_SIZE', 'MAX_CUBE_MAP_TEXTURE_SIZE', 'MAX_ARRAY_TEXTURE_LAYERS', 'MAX_RENDERBUFFER_SIZE', 'MAX_COLOR_ATTACHMENTS', 'MAX_DRAW_BUFFERS', 'MAX_SAMPLES', 'MAX_TEXTURE_IMAGE_UNITS', 'MAX_VERTEX_TEXTURE_IMAGE_UNITS', 'MAX_COMBINED_TEXTURE_IMAGE_UNITS', 'MAX_VERTEX_ATTRIBS', 'MAX_VERTEX_UNIFORM_VECTORS', 'MAX_FRAGMENT_UNIFORM_VECTORS', 'MAX_VARYING_VECTORS', 'MAX_VERTEX_UNIFORM_BLOCKS', 'MAX_FRAGMENT_UNIFORM_BLOCKS', 'MAX_UNIFORM_BLOCK_SIZE', 'MAX_ELEMENTS_VERTICES', 'MAX_ELEMENTS_INDICES', 'MAX_ELEMENT_INDEX', 'MAX_TEXTURE_LOD_BIAS', 'MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS'] as const
    const limits: Record<string, number | number[]> = {}
    for (const n of names) limits[n] = gl.getParameter((gl as unknown as Record<string, number>)[n]) as number
    limits.MAX_VIEWPORT_DIMS = Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array)
    limits.ALIASED_POINT_SIZE_RANGE = Array.from(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)
    limits.ALIASED_LINE_WIDTH_RANGE = Array.from(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE) as Float32Array)
    const extensions = (gl.getSupportedExtensions() ?? []).slice().sort()
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
    if (aniso) limits.MAX_TEXTURE_MAX_ANISOTROPY = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number
    const precision = (shader: number, kind: number) => {
      const p = gl.getShaderPrecisionFormat(shader, kind)
      return p ? [p.rangeMin, p.rangeMax, p.precision] : null
    }
    const floatTargets: Record<string, boolean> = {}
    gl.getExtension('EXT_color_buffer_float')
    gl.getExtension('EXT_color_buffer_half_float')
    for (const [name, internal, type] of [['RGBA16F', gl.RGBA16F, gl.HALF_FLOAT], ['RGBA32F', gl.RGBA32F, gl.FLOAT], ['R11F_G11F_B10F', gl.R11F_G11F_B10F, gl.HALF_FLOAT]] as const) {
      const tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, name === 'R11F_G11F_B10F' ? gl.RGB : gl.RGBA, type, null)
      const fb = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      floatTargets[name] = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.deleteFramebuffer(fb)
      gl.deleteTexture(tex)
    }
    const codecs: Record<string, Record<string, boolean>> = {}
    const hasEncoder = typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== 'undefined'
    if (hasEncoder) {
      const strings = ['avc1.640034', 'avc1.640033', 'avc1.640032', 'avc1.64002A', 'avc1.640029', 'avc1.640028', 'avc1.4D4034', 'avc1.4D4033', 'avc1.4D4032', 'avc1.4D402A', 'avc1.4D4029', 'avc1.4D4028', 'avc1.420034', 'avc1.420033', 'avc1.420032', 'avc1.42002A', 'avc1.420029', 'avc1.420028', 'avc1.42001F', 'avc1.42E01F', 'vp09.00.40.08', 'vp8', 'av01.0.08M.08']
      for (const [label, w, h] of sizes) {
        codecs[label] = {}
        for (const codec of strings) {
          try {
            const s = await VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate: bitrate * 1e6, framerate: fps })
            codecs[label][codec] = !!s.supported
          } catch {
            codecs[label][codec] = false
          }
        }
      }
    }
    return {
      webgl2: true,
      version: gl.getParameter(gl.VERSION) as string,
      shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION) as string,
      vendor: dbg ? (gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) as string) : (gl.getParameter(gl.VENDOR) as string),
      renderer: dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string) : (gl.getParameter(gl.RENDERER) as string),
      limits,
      extensions,
      floatTargets,
      precision: { vertexHighFloat: precision(gl.VERTEX_SHADER, gl.HIGH_FLOAT), fragmentHighFloat: precision(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT), fragmentHighInt: precision(gl.FRAGMENT_SHADER, gl.HIGH_INT) },
      secureContext: window.isSecureContext,
      videoEncoder: hasEncoder,
      codecs,
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
    }
  },
  { sizes: [['master', master.width, master.height], ['preview', preview.width, preview.height], ['uhd', uhd.width, uhd.height]] as [string, number, number][], bitrate: config.export.bitrateMbps, fps: config.film.fps },
)
const version = browser.version()
await browser.close()
await served.close()
if (!result.webgl2) throw new Error('this browser has no WebGL2')
const out = {
  note: 'Written by npm run caps. The WebGL2 limits and extensions of the Phase 0 machine under software rendering. G10 compares what the app requires against this file.',
  measuredAt: new Date().toISOString(),
  browser: { name: 'Chrome for Testing', version, path: chromePath().replace(os.homedir(), '~'), flags: GL_FLAGS },
  machine: machine(),
  ...result,
}
fs.writeFileSync(at('config', 'webgl-caps.json'), JSON.stringify(out, null, 1) + '\n')
console.log(`browser ${version}`)
console.log(`renderer ${out.renderer}`)
console.log(`limits ${JSON.stringify(out.limits)}`)
console.log(`extensions (${out.extensions?.length}) ${out.extensions?.join(' ')}`)
console.log(`float targets ${JSON.stringify(out.floatTargets)}`)
console.log(`secure context ${out.secureContext}, VideoEncoder ${out.videoEncoder}`)
for (const [label, map] of Object.entries(out.codecs ?? {})) console.log(`encode ${label}: ${Object.entries(map).filter(([, ok]) => ok).map(([c]) => c).join(' ') || 'none'}`)
