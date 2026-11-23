import * as THREE from 'three'
import { glslCommon } from '../core/shading.ts'
import { remember } from '../core/programs.ts'
import { maxFillPx, skyness, sound } from './fill.ts'

// The side of the square of pixels whose lights are summed into one disc.
export const CELL = 8
const RIM = 0.3
const RIM_SHARE = 0.19

const head = /* glsl */ `precision highp float;
precision highp int;
precision highp sampler2D;
`

// What the hold took out of each pixel, summed over a square of pixels: the light of one disc, where it stands and how wide its blur circle is.
export function cellFragment(place: boolean): string {
  return /* glsl */ `${glslCommon}
uniform sampler2D tRaw;
uniform sampler2D tHeld;
layout(location = 0) out vec4 outColor;
${skyness}${sound}
void main() {
  ivec2 p = ${CELL} * ivec2(gl_FragCoord.xy);
  ivec2 top = textureSize(tRaw, 0) - 1;
  vec4 sum = vec4(0.0);
  for (int j = 0; j < ${CELL}; j++) for (int i = 0; i < ${CELL}; i++) {
    ivec2 q = p + ivec2(i, j);
    if (q.x > top.x || q.y > top.y) continue;
    vec4 raw = texelFetch(tRaw, q, 0);
    raw.a = circleOf(raw.a);
    vec4 held = texelFetch(tHeld, q, 0);
    vec3 e = max(sound(raw.rgb) - held.rgb, 0.0) * smoothstep(2.0, 4.0, held.a) * (1.0 - sky(raw.a));
    float l = dot(e, vec3(0.2126, 0.7152, 0.0722));
    ${place ? 'sum += vec4(l * (vec2(i, j) + 0.5), l, 0.0);' : 'sum += vec4(e, l * raw.a);'}
  }
  outColor = sum;
}
`
}

const discVertex = /* glsl */ `${head}
in vec3 position;
uniform sampler2D tLight;
uniform sampler2D tPlace;
uniform vec2 uSize;
uniform float uDiscScale;
out vec2 vAt;
out vec3 vLight;
out float vRadius;
out float vCircle;
void main() {
  ivec2 cells = textureSize(tLight, 0);
  ivec2 cell = ivec2(gl_InstanceID % cells.x, gl_InstanceID / cells.x);
  vec4 light = texelFetch(tLight, cell, 0);
  vec4 place = texelFetch(tPlace, cell, 0);
  vAt = vec2(0.0);
  vLight = vec3(0.0);
  vRadius = 1.0;
  vCircle = 1.0;
  if (cell.y >= cells.y || place.b <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 center = vec2(cell) * ${CELL.toFixed(1)} + place.rg / place.b;
  vCircle = light.a / place.b;
  vRadius = clamp(uDiscScale * vCircle, 1.5, ${maxFillPx.toFixed(1)});
  vAt = position.xy * (vRadius + 1.0);
  vLight = light.rgb / (3.14159265 * vRadius * vRadius * ${(1 + RIM * RIM_SHARE).toFixed(4)});
  gl_Position = vec4((center + vAt) / uSize * 2.0 - 1.0, 0.0, 1.0);
}
`

// One light out of focus: an even disc of the blur circle's size with a slightly brighter rim and a clean edge, cut where something sharper than the light stands in the pixel.
const discFragment = /* glsl */ `${head}
uniform sampler2D tRaw;
in vec2 vAt;
in vec3 vLight;
in float vRadius;
in float vCircle;
layout(location = 0) out vec4 outColor;
${sound}
void main() {
  float d = length(vAt);
  float shape = (1.0 - smoothstep(vRadius - 0.5, vRadius + 0.5, d)) * (1.0 + ${RIM.toFixed(2)} * smoothstep(0.8, 0.97, d / vRadius));
  float here = circleOf(texelFetch(tRaw, ivec2(gl_FragCoord.xy), 0).a);
  float open = smoothstep(0.4, 0.75, here / max(vCircle, 1e-3));
  outColor = vec4(vLight * (shape * open), 1.0);
}
`

// The discs laid over the filled frame. In a frame summed from several pictures drawn through one place on the lens, a pixel on the edge of a sharp thing still holds its share of the ground behind as it was drawn: that share is changed for the blurred ground beside it.
export const joinFragment = /* glsl */ `
uniform sampler2D tFill;
uniform sampler2D tDiscs;
uniform sampler2D tRaw;
uniform float uMixed;
uniform float uRadiusScale;
layout(location = 0) out vec4 outColor;
${skyness}${sound}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(tFill, p, 0);
  vec3 rgb = c.rgb;
  if (uMixed > 0.5) {
    float own = circleOf(texelFetch(tRaw, p, 0).a);
    if (abs(c.a) < 0.6 && own * uRadiusScale > 0.6 && sky(own) < 0.5) {
      ivec2 top = textureSize(tRaw, 0) - 1;
      float most = own;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) most = max(most, circleOf(texelFetch(tRaw, clamp(p + ivec2(i, j), ivec2(0), top), 0).a));
      vec3 was = vec3(0.0);
      vec3 now = vec3(0.0);
      float n = 0.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        ivec2 q = clamp(p + ivec2(i, j), ivec2(0), top);
        vec4 r = texelFetch(tRaw, q, 0);
        if (circleOf(r.a) < 0.85 * most) continue;
        was += sound(r.rgb);
        now += texelFetch(tFill, q, 0).rgb;
        n += 1.0;
      }
      float share = clamp(own / max(most, 1e-3), 0.0, 1.0);
      if (n > 0.0) rgb = max(rgb + share * (now - was) / n, share * now / n);
    }
  }
  outColor = vec4(rgb + texelFetch(tDiscs, p, 0).rgb, c.a);
}
`

const quad = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

// One quad for every square of the frame, made once: the vertex shader reads the light of its square and gives the quad the size of the blur circle, or none.
export class Discs {
  private readonly geometry = new THREE.InstancedBufferGeometry()
  private readonly material: THREE.RawShaderMaterial
  private readonly mesh: THREE.Mesh
  readonly uniforms: Record<string, THREE.IUniform> = { tLight: { value: null }, tPlace: { value: null }, tRaw: { value: null }, uSize: { value: new THREE.Vector2(1, 1) }, uDiscScale: { value: 0.5 } }

  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3))
    this.geometry.setIndex([0, 1, 2, 0, 2, 3])
    this.material = remember(new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: discVertex,
      fragmentShader: discFragment,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    }))
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.frustumCulled = false
  }

  setCells(count: number): void {
    this.geometry.instanceCount = count
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void {
    renderer.setRenderTarget(target)
    renderer.setClearColor(0x000000, 0)
    renderer.clear(true, false, false)
    renderer.render(this.mesh, quad)
  }
}
