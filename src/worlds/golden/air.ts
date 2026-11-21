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
  float sizeM = mix(0.00006, 0.0006, aSeed.x * aSeed.x * aSeed.x);
  float angle = sizeM / d;
  float px = clamp(angle / uPixelAngle, 1.0, 6.0);
  float flux = (angle * angle) / (px * px * uPixelAngle * uPixelAngle);
  float lit = smoothstep(1.0, 1.7, world.y);
  vColor = uSunColor * (0.12 + 0.5 * pow(toSun, 3.0) + 14.0 * pow(toSun, 40.0)) * flux * lit * edge.x * edge.y * edge.z;
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
  vec2 c = gl_PointCoord - 0.5;
  if (vSize > 2.0 && dot(c, c) > 0.25) discard;
  outColor = vec4(vColor, 0.0);
}
`

interface Cloud { count: number; box: [number, number, number]; center: [number, number, number] }

const CLOUDS: Cloud[] = [
  { count: 900, box: [2.4, 0.9, 2.4], center: [0, 1.9, 0] },
  { count: 700, box: [9, 1.4, 9], center: [0, 2.4, 0] },
]

export interface Air { meshes: THREE.Points[]; sample(time: number, wind: number, pixelAngle: number): void }

export function makeAir(): Air {
  const uniforms = {
    uNow: { value: 0 },
    uWind: { value: 0 },
    uPixelAngle: { value: 0.001 },
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
    sample(time, wind, pixelAngle) {
      uniforms.uNow.value = time
      uniforms.uWind.value = wind
      uniforms.uPixelAngle.value = pixelAngle
    },
  }
}
