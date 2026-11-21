import * as THREE from 'three'
import { makeSurface } from '../../core/shading.ts'
import { SKYLINE, skylineCanopy, skylineLayerSalt, skylineRing, type SkylineRing } from '../../weather/skyline.ts'

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
  { base: [0.01, 0.04, 0.048], rim: 0.04 },
  { base: [0.002, 0.05, 0.068], rim: 0.03 },
  { base: [0.002, 0.043, 0.06], rim: 0.03 },
  { base: [0.006, 0.028, 0.036], rim: 0 },
  { base: [0.006, 0.028, 0.036], rim: 0 },
]

// The first light's air is thick and clears as the sun climbs: how many times thicker at the start, and the seconds over which it clears.
const EARLY_AIR = 8
const EARLY_AIR_FROM_S = 1.5
const EARLY_AIR_TO_S = 6

export interface FarLayers { meshes: THREE.Mesh[]; triangles: number; setTime(time: number): void }

export function makeFarLayers(skylineAzimuthDeg: number, airCool: [number, number, number], airWarm: [number, number, number], airPerM: number): FarLayers {
  const meshes: THREE.Mesh[] = []
  const rings: SkylineRing[] = []
  let triangles = 0
  const airUniforms = {
    uAirCool: { value: new THREE.Vector3().fromArray(airCool) },
    uAirWarm: { value: new THREE.Vector3().fromArray(airWarm) },
    uAir: { value: airPerM },
  }
  for (let i = 0; i < SKYLINE.length; i++) {
    const layer = SKYLINE[i]
    const tone = TONES[i]
    const ring = skylineRing(i, skylineAzimuthDeg)
    const geometry = ring.geometry
    rings.push(ring)
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
  const setTime = (time: number): void => {
    rings.forEach((ring) => ring.setTime(time))
    const t = Math.min(1, Math.max(0, (time - EARLY_AIR_FROM_S) / (EARLY_AIR_TO_S - EARLY_AIR_FROM_S)))
    airUniforms.uAir.value = airPerM * (1 + EARLY_AIR * (1 - t * t * (3 - 2 * t)))
  }
  return { meshes, triangles, setTime }
}
