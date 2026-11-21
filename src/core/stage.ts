import * as THREE from 'three'
import type { Format } from '../config.ts'
import { Accumulator } from './accumulator.ts'
import { shared } from './shading.ts'

export const REQUIRED_EXTENSIONS = ['EXT_color_buffer_float']

export class Stage {
  readonly renderer: THREE.WebGLRenderer
  readonly gl: WebGL2RenderingContext
  readonly accumulator: Accumulator
  sample: THREE.WebGLRenderTarget
  width: number
  height: number
  lost = false
  readonly shaderErrors: string[] = []
  private readonly pixel = new Uint8Array(4)

  constructor(readonly canvas: HTMLCanvasElement, format: Format) {
    this.width = format.width
    this.height = format.height
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
    this.gl = this.renderer.getContext() as WebGL2RenderingContext
    for (const name of REQUIRED_EXTENSIONS) if (!this.gl.getExtension(name)) throw new Error(`this browser lacks the WebGL2 extension ${name}`)
    this.renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
      const text = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].filter((t) => t && t.trim().length > 1).join(' | ')
      this.shaderErrors.push(text)
    }
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(this.width, this.height, false)
    this.renderer.autoClear = false
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    this.renderer.setClearColor(0x000000, 0)
    this.sample = Stage.sampleTarget(this.width, this.height)
    this.accumulator = new Accumulator(this.width, this.height)
    shared.uSize.value.set(this.width, this.height)
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault()
      this.lost = true
    })
  }

  private static sampleTarget(width: number, height: number): THREE.WebGLRenderTarget {
    const t = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    })
    t.texture.colorSpace = THREE.NoColorSpace
    return t
  }

  setSize(format: Format): void {
    this.width = format.width
    this.height = format.height
    this.renderer.setSize(this.width, this.height, false)
    this.sample.setSize(this.width, this.height)
    this.accumulator.setSize(this.width, this.height)
    shared.uSize.value.set(this.width, this.height)
  }

  // WebGL calls return before a software rasterizer has finished. Reading one pixel back makes the frame real.
  finish(): void {
    this.renderer.setRenderTarget(null)
    this.gl.readPixels(0, 0, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.pixel)
    if (this.shaderErrors.length) throw new Error(`a shader did not compile: ${this.shaderErrors.join(' || ')}`)
    if (this.lost) throw new Error('the WebGL context was lost')
  }

  targetBytes(): number {
    return this.width * this.height * (8 + 4) + this.accumulator.bytes()
  }
}
