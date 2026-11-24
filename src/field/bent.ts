import * as THREE from 'three'
import { FullscreenPass } from '../core/fullscreen.ts'
import { gustGlsl } from '../v2/wind.ts'
import { PLACE, windOf } from './layout.ts'

// What the gusts of the last shot do to every neighbor, worked out on the graphics card for a film that is played: a texel each, every kind in one texture, drawn once a frame.
// In script that costs the page more than a frame has to give. A recorded frame keeps the script's numbers, and so does a card that cannot draw into float textures.
const WIDE = 1024

export class Bent {
  // The row each kind's first neighbor lies in.
  readonly rows: number[] = []
  private readonly target: THREE.WebGLRenderTarget
  private readonly pass: FullscreenPass
  private readonly seconds = { value: 0 }
  private renderer: THREE.WebGLRenderer | null = null
  private held = -1

  // `lists` holds the places of each kind, in the order its neighbors are drawn.
  constructor(lists: Float32Array[]) {
    let high = 0
    for (const places of lists) {
      this.rows.push(high)
      high += Math.max(1, Math.ceil(places.length / PLACE / WIDE))
    }
    // Where each neighbor stands and two of its numbers for the wind, and its third in the texel that many rows above.
    const who = new Float32Array(WIDE * high * 2 * 4)
    lists.forEach((places, g) => {
      for (let k = 0; k < places.length / PLACE; k++) {
        const id = places[k * PLACE + 7]
        const at = (this.rows[g] * WIDE + k) * 4
        who[at] = places[k * PLACE]
        who[at + 1] = places[k * PLACE + 1]
        who[at + 2] = windOf(id, 0)
        who[at + 3] = windOf(id, 1)
        who[at + WIDE * high * 4] = windOf(id, 2)
      }
    })
    const data = new THREE.DataTexture(who, WIDE, high * 2, THREE.RGBAFormat, THREE.FloatType)
    data.minFilter = THREE.NearestFilter
    data.magFilter = THREE.NearestFilter
    data.generateMipmaps = false
    data.needsUpdate = true
    this.target = new THREE.WebGLRenderTarget(WIDE, high, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false })
    const fragment = /* glsl */ `
uniform sampler2D uWho;
uniform float uSeconds;
${gustGlsl}
layout(location = 0) out vec4 outBent;
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec4 who = texelFetch(uWho, at, 0);
  outBent = windBent(who.xy, uSeconds, vec3(who.zw, texelFetch(uWho, at + ivec2(0, ${high}), 0).x));
}
`
    this.pass = new FullscreenPass(fragment, { uWho: { value: data }, uSeconds: this.seconds })
  }

  get texture(): THREE.Texture {
    return this.target.texture
  }

  // Hands over the renderer the film is played with. A card that cannot draw into float textures is left to the script.
  on(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer.extensions.has('EXT_color_buffer_float') ? renderer : null
  }

  // Draws what the gusts do at one film second, once however often it is asked. False when the script has to work it out.
  draw(seconds: number): boolean {
    const renderer = this.renderer
    if (!renderer) return false
    if (seconds !== this.held) {
      this.held = seconds
      this.seconds.value = seconds
      const target = renderer.getRenderTarget()
      this.pass.render(renderer, this.target)
      renderer.setRenderTarget(target)
    }
    return true
  }
}
