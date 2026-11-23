import * as THREE from 'three'
import { makePartSurface, partGeometry, type PartOptions } from '../plant/part.ts'

// Hoarfrost on the neighbors. A neighbor carries no crystals of its own, and behind a close lens it is a soft shape: what is seen of its frost is the few facets
// that mirror the sun at the lens. Each is a point of two pixels fixed on a leaf, and the lens blur spreads it into a disc.
// A blade that has not left the stem yet carries none: how far from the stem's line a place must stand, in meters of the kind's own shape.
const NEAR_STEM_M = [0.006, 0.018]
// How bright the disc of a facet stands, as a share of the sun on a white wall, whatever the blur.
const LEVEL = 0.18
// The blur circle a facet is counted at when it is in focus, in pixels: it never goes out, it is a small hard point there.
const SHARP_PX = 6
// The widest blur circle a disc holds its level at, as a share of the frame's height: wider than that it thins as a real one does.
const WIDEST = 0.1
// A facet is small: past this distance it sends the lens less light, by the square of the distance, and fewer of them are large enough to send any.
const FULL_M = 2.6
// The share of the places on a blade that carry a facet large enough to be seen, near the lens.
const SHARE = 0.35
// A neighbor that stands small in the frame, far off or before a wide lens, seldom has a facet that finds the lens: this share of them do, each with a strength of its own
// down to the weakest, and none brighter than one that stands large. How large a neighbor stands is counted in heights of the frame to a meter.
const SMALL = [0.9, 1.8]
const FEW = 0.35
const WEAKEST = 0.3
// The most a pixel may hold: a brighter point is spread over more pixels.
const MOST = 16000

const vertex = /* glsl */ `
in vec3 position;
in vec2 uv;
in vec4 aLeaf;
uniform float uRime;
out vec3 vLight;
out float vWide;
void main() {
  vec3 world = plantWorld(position);
  float own = fract(0.6180339 * float(gl_VertexID) + 0.7548777 * aVary.w + 0.37 * aLeaf.x);
  // Rime stands on the margin and the tip of a blade that has left the stem, more of it toward the tip.
  float blade = smoothstep(0.25, 0.5, uv.y) * (0.45 + 0.55 * abs(uv.x)) * smoothstep(${NEAR_STEM_M[0].toFixed(3)}, ${NEAR_STEM_M[1].toFixed(3)}, length(position.xz));
  // The facets come with the frost, a few at a time, and are gone with it the same way.
  float there = uRime * smoothstep(0.0, 0.15, uRime - 0.8 * hash11(own + 5.0)) * blade * (plantSize() > 0.0 ? 1.0 : 0.0);
  vec4 view = viewMatrix * vec4(world, 1.0);
  float depth = -view.z;
  vec3 toEye = normalize(uCamPos - world);
  // A facet mirrors the sun at the lens from one side only: it turns as the lens and the sun move, never by itself.
  vec3 q = normalize(vec3(hash11(own + 1.0), hash11(own + 2.0), hash11(own + 3.0)) * 2.0 - 1.0 + vec3(1e-4, 0.0, 0.0));
  float lit = pow(0.5 + 0.5 * cos(140.0 * dot(q, normalize(toEye + uSunDir)) + 6.2832 * hash11(own + 4.0)), 16.0);
  float behind = 0.3 + 0.7 * saturate(dot(-toEye, uSunDir));
  float coc = max(min(uCocScale * abs(1.0 / max(depth, 1e-4) - 1.0 / uFocusM), 2048.0), ${SHARP_PX.toFixed(1)});
  float far = min(1.0, ${(FULL_M * FULL_M).toFixed(3)} / max(depth * depth, 1e-4));
  // The air between dims it as it dims the leaf it stands on.
  vec3 ray = world - uCamPos;
  float d = length(ray);
  float k = uFogFalloff * ray.y;
  float thick = uFogDensity * exp(-uFogFalloff * max(uCamPos.y, 0.0)) * d * (abs(k) > 1e-4 ? (1.0 - exp(-k)) / k : 1.0);
  float away = 1.0 - smoothstep(${SMALL[0].toFixed(2)}, ${SMALL[1].toFixed(2)}, 0.5 * projectionMatrix[1][1] / max(depth, 1e-4));
  float keep = ${SHARE.toFixed(3)} * far;
  float plant = hash11(0.731 * aVary.w + 0.19);
  float few = mix(1.0, ${FEW.toFixed(3)}, away);
  float carried = smoothstep(0.0, 0.3 * few, few - plant) * mix(1.0, ${WEAKEST.toFixed(3)} + ${(1 - WEAKEST).toFixed(3)} * hash11(plant + 9.0), away);
  float facet = smoothstep(0.0, 0.25 * keep, keep - hash11(own + 7.0));
  float held = min(coc, ${WIDEST.toFixed(3)} * uSize.y);
  float sum = ${LEVEL.toFixed(3)} * (0.4 + 0.6 * hash11(own + 6.0)) * lit * behind * 0.785 * held * held * far * exp(-thick) * there * facet * carried;
  vec3 light = uSunColor * sum;
  // What a pixel may hold is bounded: a brighter point takes more pixels, and its sum stays.
  float wide = clamp(sqrt(max(light.r, max(light.g, light.b)) / ${MOST.toFixed(1)}), 1.0, 4.0);
  vLight = light / (wide * wide);
  vWide = wide;
  // It stands on the skin, a little toward the lens, so the leaf never hides its own frost.
  view.xyz *= 1.0 - 0.004 / max(depth, 0.05);
  gl_PointSize = 2.0 * wide + 1.0;
  gl_Position = sum > 1e-3 ? projectionMatrix * view : vec4(2.0, 2.0, 2.0, 1.0);
}
`

const fragment = /* glsl */ `
in vec3 vLight;
in float vWide;
void main() {
  if (uDiag > 1) discard;
  // A tent as wide as the point: whatever pixels it falls on, their sum is the point's light.
  vec2 at = (gl_PointCoord * 2.0 - 1.0) * (vWide + 0.5) / vWide;
  outColor = vec4(vLight * max(1.0 - abs(at.x), 0.0) * max(1.0 - abs(at.y), 0.0), 1.0);
}
`

// The frost of one kind of neighbor: a point on each place of its leaves' own shape, so it stands where the leaves stand whatever they do.
export class Rime {
  readonly points: THREE.Points
  readonly geometry: THREE.InstancedBufferGeometry
  private readonly amount = { value: 0 }

  constructor(options: PartOptions, leaves: THREE.BufferGeometry, uniforms: Record<string, THREE.IUniform>) {
    this.geometry = partGeometry(options) as THREE.InstancedBufferGeometry
    for (const name of ['position', 'uv', 'aLeaf', 'aFieldNow', 'aFieldWas']) if (leaves.getAttribute(name)) this.geometry.setAttribute(name, leaves.getAttribute(name))
    const surface = makePartSurface(options, {
      name: 'rime of the rows',
      vertex,
      fragment,
      uniforms: { ...uniforms, uRime: this.amount },
      side: THREE.DoubleSide,
      transparent: true,
      additive: true,
      depthWrite: false,
    })
    this.points = new THREE.Points(this.geometry, surface.main)
    this.points.frustumCulled = false
    this.points.matrixAutoUpdate = false
    this.points.renderOrder = 19
    this.points.visible = false
  }

  set(amount: number, on: boolean): void {
    this.amount.value = amount
    this.points.visible = on && amount > 0
  }
}
