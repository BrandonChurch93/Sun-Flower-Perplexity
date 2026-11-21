import * as THREE from 'three'
import { makeSurface } from '../../core/shading.ts'
import { SKYLINE, SKYLINE_LAND_FROM_M, SKYLINE_LAND_TO_M, ringStrip, skylineCanopy, skylineLayerSalt, skylineRing, type SkylineRing } from '../../weather/skyline.ts'

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

// Falling rain between the lens and a far thing greys it far sooner than clear air does, and the grey is lit from the bright band.
const air = /* glsl */ `
uniform vec3 uAirTone;
uniform float uAir;
uniform float uFlash;
vec3 aerial(vec3 color, vec3 world) {
  float d = length(world - uCamPos);
  return mix(color, uAirTone * (1.0 + 0.6 * uFlash), 1.0 - exp(-d * uAir));
}
`

const stripFragment = /* glsl */ `
in vec3 vWorld;
in vec3 vInfo;
in float vDepth;
uniform vec3 uBase;
uniform float uLayer;
uniform float uCrown;
uniform float uFloor;
${air}
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
  vec3 color = uBase * (0.6 + 0.8 * mass) * skyAmbient(vec3(0.0, 0.6, 0.0)) * (0.5 + 0.5 * f);
  outColor = finish(aerial(color, vWorld), uCamPos, min(vDepth, 100.0 * uFocusM), -1.0);
}
`

const landFragment = /* glsl */ `
in vec3 vWorld;
in vec3 vInfo;
in float vDepth;
${air}
void main() {
  vec2 p = vWorld.xz;
  float kind = valueNoise(p * vec2(0.0021, 0.0034) + 3.1);
  float tone = valueNoise(p * 0.011 + 9.0);
  vec3 albedo = mix(vec3(0.03, 0.045, 0.022), vec3(0.035, 0.032, 0.028), smoothstep(0.45, 0.55, kind)) * (0.8 + 0.4 * tone);
  // Soaked land throws the bright band back toward the lens at this flat an angle.
  vec3 color = albedo * skyAmbient(vec3(0.0, 1.0, 0.0)) + 0.03 * uSkyHorizon * smoothstep(0.35, 0.8, valueNoise(p * 0.05 + 2.0));
  outColor = finish(aerial(color, vWorld), uCamPos, min(vDepth, 100.0 * uFocusM), -1.0);
}
`

// The spray thrown up by the landing drops and the rain itself seen edge on: a pale band that lies on the ground and thickens with distance.
const veilFragment = /* glsl */ `
in vec3 vWorld;
in vec3 vInfo;
in float vDepth;
uniform vec3 uMist;
uniform float uShare;
uniform float uLayer;
uniform float uScaleM;
uniform float uFlash;
void main() {
  if (uDiag > 1) discard;
  float gusts = valueNoise(vec2(vInfo.x * 0.35 / uScaleM - uTime * 0.05 + uLayer * 3.0, uLayer));
  float billow = valueNoise(vec2(vInfo.x * 0.06 / uScaleM + uTime * 0.02 + uLayer * 7.0, uLayer + 4.0));
  float h = max(vWorld.y, 0.0) / (uScaleM * (0.7 + 0.6 * billow));
  // Thickest a little above the ground and thinning to nothing where the sheet meets it, so no sheet draws a line on the soil.
  float thick = exp(-h) * smoothstep(0.0, 0.6, h) * 1.6;
  outColor = vec4(uMist * (1.0 + 0.6 * uFlash), saturate(uShare * thick * (0.6 + 0.8 * gusts)));
}
`

// What each layer of the shared skyline is made of in the rain.
const TONES: [number, number, number][] = [
  [0.2, 0.25, 0.27],
  [0.16, 0.21, 0.22],
  [0.1, 0.14, 0.14],
  [0.03, 0.055, 0.055],
  [0.016, 0.034, 0.036],
  [0.012, 0.026, 0.026],
  [0.01, 0.022, 0.022],
  [0.014, 0.022, 0.02],
  [0.018, 0.024, 0.02],
]

const VEILS = [
  { radiusM: 1.6, heightM: 0.5, scaleM: 0.035, share: 0.05 },
  { radiusM: 3, heightM: 0.8, scaleM: 0.05, share: 0.06 },
  { radiusM: 6, heightM: 1.2, scaleM: 0.08, share: 0.09 },
  { radiusM: 12, heightM: 2, scaleM: 0.14, share: 0.08 },
  { radiusM: 24, heightM: 4, scaleM: 0.25, share: 0.08 },
  { radiusM: 48, heightM: 8, scaleM: 0.5, share: 0.1 },
  { radiusM: 150, heightM: 20, scaleM: 1.6, share: 0.12 },
  { radiusM: 600, heightM: 60, scaleM: 6, share: 0.15 },
]

export interface FarLayers { meshes: THREE.Mesh[]; flash(amount: number): void; setTime(time: number): void }

export function makeFarLayers(skylineAzimuthDeg: number, airTone: [number, number, number], mist: [number, number, number]): FarLayers {
  const meshes: THREE.Mesh[] = []
  const flash = { value: 0 }
  const airUniforms = { uAirTone: { value: new THREE.Vector3().fromArray(airTone) }, uAir: { value: 0.00028 }, uFlash: flash }
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, order: number): void => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.matrixAutoUpdate = false
    mesh.renderOrder = order
    meshes.push(mesh)
  }
  const land = new THREE.BufferGeometry()
  {
    const sides = 180
    const rings: number[] = []
    for (let r = SKYLINE_LAND_FROM_M; r < SKYLINE_LAND_TO_M; r *= 1.35) rings.push(r)
    rings.push(SKYLINE_LAND_TO_M)
    const position = new Float32Array(rings.length * sides * 3)
    const info = new Float32Array(rings.length * sides * 3)
    const index: number[] = []
    rings.forEach((r, j) => {
      for (let s = 0; s < sides; s++) {
        const az = (s / sides) * 2 * Math.PI
        const v = (j * sides + s) * 3
        position[v] = Math.sin(az) * r
        position[v + 1] = 1.3
        position[v + 2] = Math.cos(az) * r
        info[v] = r
        if (j > 0) {
          const p = (j - 1) * sides
          const q = j * sides
          const t = (s + 1) % sides
          index.push(p + s, q + s, q + t, p + s, q + t, p + t)
        }
      }
    })
    land.setAttribute('position', new THREE.BufferAttribute(position, 3))
    land.setAttribute('aInfo', new THREE.BufferAttribute(info, 3))
    land.setIndex(index)
  }
  add(land, makeSurface({ name: 'rain far land', vertex, fragment: landFragment, uniforms: airUniforms, side: THREE.DoubleSide, castShadow: false }).main, 0)

  const rings: SkylineRing[] = []
  SKYLINE.forEach((layer, i) => {
    const surface = makeSurface({
      name: `rain ${layer.name}`,
      vertex,
      fragment: `${layer.trees ? '#define TREES 1\n' : ''}${stripFragment}`,
      uniforms: { ...airUniforms, uBase: { value: new THREE.Vector3().fromArray(TONES[i]) }, uLayer: { value: skylineLayerSalt(i) }, uCrown: { value: layer.crownM }, uFloor: { value: layer.floor } },
      side: THREE.DoubleSide,
      castShadow: false,
    })
    const ring = skylineRing(i, skylineAzimuthDeg)
    rings.push(ring)
    add(ring.geometry, surface.main, 0)
  })

  VEILS.forEach((veil, i) => {
    const surface = makeSurface({
      name: `rain veil ${i}`,
      vertex,
      fragment: veilFragment,
      uniforms: { uMist: { value: new THREE.Vector3().fromArray(mist) }, uShare: { value: veil.share }, uLayer: { value: i + 1 }, uScaleM: { value: veil.scaleM }, uFlash: flash },
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    })
    add(ringStrip(96, () => ({ radius: veil.radiusM, top: veil.heightM })), surface.main, 43 + (VEILS.length - i) * 0.01)
  })
  return { meshes, flash: (amount) => { flash.value = amount }, setTime: (time) => { for (const ring of rings) ring.setTime(time) } }
}
