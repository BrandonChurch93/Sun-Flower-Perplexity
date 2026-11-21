import * as THREE from 'three'
import { hash01, streamSeed } from '../../core/random.ts'
import { makeSurface } from '../../core/shading.ts'
import { windToward } from '../../plant/wind.ts'

const SEED = streamSeed('golden air')

// Each speck is a grain of pollen or dust at a real place, drawn as a point with the light its real size would send to the lens. The lens samples spread it into its disc.
const vertex = /* glsl */ `
in vec3 position;
in vec4 aSeed;
uniform float uNow;
uniform float uWind;
uniform vec2 uToward;
uniform vec3 uBox;
uniform vec3 uCenter;
uniform float uPixelAngle;
uniform float uSamples;
uniform float uWidth;
out vec3 vColor;
out float vSize;
void main() {
  float t = uNow;
  vec3 p = position;
  float along = dot(p.xz, uToward) - t * 1.6;
  float wave = 0.55 * sin(along * 0.9) + 0.3 * sin(along * 2.3 + 1.7);
  p.xz += uToward * (uWind * (0.18 + 0.3 * aSeed.z) * t + 0.05 * uWind * wave);
  p.x += 0.05 * sin(t * (0.35 + 0.5 * aSeed.x) + aSeed.y * 40.0);
  p.z += 0.05 * cos(t * (0.3 + 0.4 * aSeed.y) + aSeed.x * 31.0);
  p.y += 0.04 * sin(t * (0.4 + 0.3 * aSeed.w) + aSeed.z * 23.0) + 0.012 * t * (aSeed.w - 0.45);
  vec3 q = mod(p + uBox, 2.0 * uBox) - uBox;
  vec3 edge = smoothstep(vec3(0.0), 0.12 * uBox, uBox - abs(q));
  vec3 world = q + uCenter;
  vec4 view = viewMatrix * vec4(world, 1.0);
  float d = length(world - uCamPos);
  vec3 v = (world - uCamPos) / d;
  float toSun = saturate(dot(v, uSunDir));
  float sizeM = mix(0.0001, 0.0008, aSeed.x * aSeed.x);
  float angle = sizeM / d;
  // Out of focus, one lens sample carries its share of the speck's disc: the point is drawn that wide so the samples close into the disc.
  float coc = min(uCocScale * abs(1.0 / max(-view.z, 1e-4) - 1.0 / uFocusM), 2048.0);
  float need = max(angle / uPixelAngle, 2.0 * coc / sqrt(uSamples));
  float px = clamp(need, 1.0, 64.0);
  float flux = (angle * angle) / (px * px * uPixelAngle * uPixelAngle);
  float lit = smoothstep(1.0, 1.7, world.y);
  vColor = uSunColor * (0.2 + 1.2 * pow(toSun, 3.0) + 14.0 * pow(toSun, 40.0)) * flux * lit * edge.x * edge.y * edge.z * smoothstep(0.25, 0.6, d) * (1.0 - smoothstep(0.006, 0.02, coc / uWidth));
  vSize = px;
  gl_PointSize = px;
  gl_Position = projectionMatrix * view;
  if (uDiag > 1) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`

const fragment = /* glsl */ `
in vec3 vColor;
in float vSize;
void main() {
  float r = 2.0 * length(gl_PointCoord - 0.5);
  float disc = vSize > 2.0 ? 1.7 * (1.0 - smoothstep(0.55, 1.0, r)) : 1.0;
  outColor = vec4(vColor * disc, 0.0);
}
`

interface Cloud { count: number; box: [number, number, number]; center: [number, number, number] }

const CLOUDS: Cloud[] = [
  { count: 1100, box: [1.3, 0.7, 1.3], center: [0, 1.85, 0] },
  { count: 760, box: [5.5, 1.3, 5.5], center: [0, 2.3, 0] },
]

export interface Air { meshes: THREE.Points[]; sample(time: number, wind: number, pixelAngle: number, samples: number, width: number): void }

export function makeAir(): Air {
  const uniforms = {
    uNow: { value: 0 },
    uWind: { value: 0 },
    uPixelAngle: { value: 0.001 },
    uSamples: { value: 1 },
    uWidth: { value: 1920 },
    uToward: { value: new THREE.Vector2(windToward.x, windToward.z) },
  }
  const meshes = CLOUDS.map((cloud, c) => {
    const position = new Float32Array(cloud.count * 3)
    const seed = new Float32Array(cloud.count * 4)
    for (let i = 0; i < cloud.count; i++) {
      for (let k = 0; k < 3; k++) position[i * 3 + k] = (2 * hash01(SEED + c, i, k) - 1) * cloud.box[k]
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = hash01(SEED + c, i, 3 + k)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
    const surface = makeSurface({
      name: `golden air ${c}`,
      vertex,
      fragment,
      uniforms: { ...uniforms, uBox: { value: new THREE.Vector3().fromArray(cloud.box) }, uCenter: { value: new THREE.Vector3().fromArray(cloud.center) } },
      transparent: true,
      additive: true,
      depthWrite: false,
    })
    const points = new THREE.Points(geometry, surface.main)
    points.frustumCulled = false
    points.matrixAutoUpdate = false
    points.renderOrder = 42
    return points
  })
  return {
    meshes,
    sample(time, wind, pixelAngle, samples, width) {
      uniforms.uNow.value = time
      uniforms.uWind.value = wind
      uniforms.uPixelAngle.value = pixelAngle
      uniforms.uSamples.value = Math.max(1, samples)
      uniforms.uWidth.value = width
    },
  }
}
