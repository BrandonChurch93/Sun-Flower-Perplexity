import * as THREE from 'three'
import { makeSurface } from '../../core/shading.ts'
import { SKYLINE, ringStrip, skylineAt, skylineCanopy, skylineLayerSalt } from '../../weather/skyline.ts'

const RAD = Math.PI / 180

// The camera lies on bare soil and the sun has just cleared the land. The skyline is the shared one, laid out round the same bearing as in every world, so each hill and each tree stands where it stands after the cut. Only where this world's sun rises the land is held under the sun's lower limb: the rows of trees open there and the hills lie low.
const SUN_CLEAR_DEG = 14
const SUN_FULL_DEG = 26
const UNDER_SUN_DEG = [0.3, 0.34, 0.4, 0.42, 0.46, 0.4, 0.44, 0.3, 0.3]

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function dawnSkylineAt(i: number, az: number, skylineAzimuthDeg: number, sunAzimuthDeg: number): { radius: number; top: number } {
  const at = skylineAt(i, az, skylineAzimuthDeg)
  let off = Math.abs(az - sunAzimuthDeg * RAD) % (2 * Math.PI)
  if (off > Math.PI) off = 2 * Math.PI - off
  const cap = at.radius * Math.tan(UNDER_SUN_DEG[i] * RAD)
  const near = smooth(SUN_FULL_DEG, SUN_CLEAR_DEG, off / RAD)
  return { radius: at.radius, top: at.top + (Math.min(at.top, cap) - at.top) * near }
}

const vertex = /* glsl */ `
in vec3 position;
in vec3 aInfo;
out vec3 vWorld;
out vec3 vInfo;
out float vDepth;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vInfo = aInfo;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

// A standing strip: vInfo is the run along it in meters, the height above the ground and the height of its top there.
const stripFragment = /* glsl */ `
in vec3 vWorld;
in vec3 vInfo;
in float vDepth;
uniform vec3 uBase;
uniform float uLayer;
uniform float uRim;
uniform float uCrown;
uniform float uFloor;
uniform vec3 uAirCool;
uniform vec3 uAirWarm;
uniform float uAir;
${skylineCanopy}
void main() {
  float top = vInfo.z;
#ifdef TREES
  top *= skylineCanopy(vInfo.x, uCrown, uLayer, uFloor);
  if (vInfo.y > top) discard;
  float mass = valueNoise(vec2(vInfo.x * 3.3 / uCrown, vInfo.y * 4.5 / uCrown + uLayer));
#else
  float mass = valueNoise(vec2(vInfo.x * 0.012, vInfo.y * 0.03 + uLayer));
#endif
  float f = saturate(vInfo.y / max(top, 1.0));
  vec3 ray = vWorld - uCamPos;
  float d = length(ray);
  vec3 v = ray / d;
  float toSun = saturate(dot(v, uSunDir));
  vec3 color = uBase * (0.6 + 0.8 * mass) * skyAmbient(vec3(0.0, 0.3, 0.0)) * (0.5 + 0.5 * f);
  color += uBase * uSunColor * uRim * smoothstep(0.3, 0.9, f) * (0.4 + 1.2 * smoothstep(0.2, 0.9, mass)) * pow(toSun, 8.0);
  vec3 airTone = uAirCool + uAirWarm * (0.15 * toSun * toSun + 0.5 * pow(toSun, 24.0));
  color = mix(color, airTone, 1.0 - exp(-d * uAir));
  outColor = finish(color, uCamPos, min(vDepth, 100.0 * uFocusM), -1.0);
}
`

// What each layer is made of at dawn, and how much of the low sun its top catches.
const TONES: { base: [number, number, number]; rim: number }[] = [
  { base: [0.1, 0.15, 0.17], rim: 0 },
  { base: [0.08, 0.12, 0.13], rim: 0 },
  { base: [0.04, 0.06, 0.06], rim: 0.01 },
  { base: [0.03, 0.055, 0.05], rim: 0.02 },
  { base: [0.014, 0.03, 0.03], rim: 0.04 },
  { base: [0.012, 0.028, 0.03], rim: 0.03 },
  { base: [0.009, 0.022, 0.025], rim: 0.03 },
  { base: [0.009, 0.02, 0.023], rim: 0 },
  { base: [0.009, 0.02, 0.023], rim: 0 },
]

export interface FarLayers { meshes: THREE.Mesh[]; triangles: number }

export function makeFarLayers(skylineAzimuthDeg: number, sunAzimuthDeg: number, airCool: [number, number, number], airWarm: [number, number, number], airPerM: number): FarLayers {
  const meshes: THREE.Mesh[] = []
  let triangles = 0
  const airUniforms = {
    uAirCool: { value: new THREE.Vector3().fromArray(airCool) },
    uAirWarm: { value: new THREE.Vector3().fromArray(airWarm) },
    uAir: { value: airPerM },
  }
  for (let i = 0; i < SKYLINE.length; i++) {
    const layer = SKYLINE[i]
    const tone = TONES[i]
    const geometry = ringStrip(layer.segments, (az) => dawnSkylineAt(i, az, skylineAzimuthDeg, sunAzimuthDeg))
    const surface = makeSurface({
      name: `dawn ${layer.name}`,
      vertex,
      fragment: `${layer.trees ? '#define TREES 1\n' : ''}${stripFragment}`,
      uniforms: { ...airUniforms, uBase: { value: new THREE.Vector3().fromArray(tone.base) }, uLayer: { value: skylineLayerSalt(i) }, uRim: { value: tone.rim }, uCrown: { value: layer.crownM }, uFloor: { value: layer.floor } },
      side: THREE.DoubleSide,
      castShadow: false,
    })
    const mesh = new THREE.Mesh(geometry, surface.main)
    mesh.frustumCulled = false
    mesh.matrixAutoUpdate = false
    meshes.push(mesh)
    triangles += (geometry.index as THREE.BufferAttribute).count / 3
  }
  return { meshes, triangles }
}
