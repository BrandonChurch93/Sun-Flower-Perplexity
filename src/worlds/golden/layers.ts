import * as THREE from 'three'
import { makeSurface } from '../../core/shading.ts'
import { SKYLINE, SKYLINE_LAND_FROM_M, SKYLINE_LAND_TO_M, ringStrip, skylineCanopy, skylineLayerSalt, skylineStrip } from '../../weather/skyline.ts'

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

const air = /* glsl */ `
uniform vec3 uAirCool;
uniform vec3 uAirWarm;
uniform float uAir;
vec3 airTone(vec3 dir) {
  float toSun = saturate(dot(dir, uSunDir));
  return uAirCool + uAirWarm * (0.1 * toSun * toSun + 0.3 * pow(toSun, 24.0));
}
vec3 aerial(vec3 color, vec3 world) {
  vec3 v = world - uCamPos;
  float d = length(v);
  return mix(color, airTone(v / d), 1.0 - exp(-d * uAir));
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
uniform float uFogShare;
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
  vec3 color = uBase * (0.55 + 0.9 * mass) * skyAmbient(vec3(0.0, 0.3, 0.0)) * (0.07 + 0.07 * f);
  vec3 v = normalize(vWorld - uCamPos);
  color += uBase * uSunColor * vec3(1.0, 0.8, 0.9) * uRim * smoothstep(0.1, 0.7, f) * (0.5 + 1.3 * smoothstep(0.2, 0.9, mass)) * (0.03 + pow(saturate(dot(v, uSunDir)), 8.0));
  color = mix(aerial(color, vWorld), 1.3 * airTone(v), 0.1 * exp(-max(vInfo.y, 0.0) / (0.22 * max(top, 6.0))));
  outColor = finish(color, mix(uCamPos, vWorld, uFogShare), min(vDepth, 100.0 * uFocusM), -1.0);
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
  vec3 crop = vec3(0.075, 0.07, 0.02);
  vec3 stubble = vec3(0.15, 0.125, 0.06);
  vec3 pasture = vec3(0.05, 0.075, 0.028);
  vec3 albedo = mix(pasture, stubble, smoothstep(0.52, 0.56, kind));
  albedo = mix(albedo, crop, max(1.0 - smoothstep(0.38, 0.42, kind), 1.0 - smoothstep(800.0, 1000.0, vInfo.x)));
  albedo *= 0.85 + 0.3 * tone;
  vec3 v = normalize(vWorld - uCamPos);
  float toSun = saturate(dot(v, uSunDir));
  vec3 color = albedo * (skyAmbient(vec3(0.0, 1.0, 0.0)) + uSunColor * (0.05 + 0.12 * toSun * toSun));
  outColor = finish(aerial(color, vWorld), vWorld, min(vDepth, 100.0 * uFocusM), -1.0);
}
`

// A veil of lit ground mist: it lies below eye level, so it shows over the field and leaves the land above the horizon to the lens.
const veilFragment = /* glsl */ `
in vec3 vWorld;
in vec3 vInfo;
in float vDepth;
uniform vec3 uGlow;
uniform float uShare;
uniform float uLayer;
uniform float uScaleM;
void main() {
  if (uDiag > 1) discard;
  vec3 v = normalize(vWorld - uCamPos);
  float theta = acos(clamp(dot(v, uSunDir), -1.0, 1.0));
  float bank = 0.55 + 0.9 * valueNoise(vec2(vInfo.x * 0.004 + uTime * 0.012 + uLayer * 5.0, vWorld.y * 0.06 + uLayer * 13.0 - uTime * 0.004));
  float thick = exp(-max(vWorld.y, 0.0) / uScaleM) * (1.0 - smoothstep(0.6, 1.0, vInfo.y / vInfo.z)) * (1.0 - smoothstep(-0.008, 0.001, v.y));
  outColor = vec4(uGlow * vec3(1.0, 0.64, 0.5) * (uShare * thick * bank * (0.45 * exp(-theta / 0.06) + 0.42 * exp(-theta * theta / 0.08))), 0.0);
}
`

// A bank of shaded evening air standing in the far field: away from the sun it dims what lies behind it, up to the feet of the trees' crowns.
const shadeFragment = /* glsl */ `
in vec3 vWorld;
in vec3 vInfo;
in float vDepth;
uniform vec3 uTone;
uniform float uShare;
uniform float uLayer;
uniform vec2 uFade;
void main() {
  if (uDiag > 1) discard;
  vec3 v = normalize(vWorld - uCamPos);
  float away = 1.0 - smoothstep(0.9, 0.985, dot(v, uSunDir));
  float bank = 0.8 + 0.4 * valueNoise(vec2(vInfo.x * 0.05 + uTime * 0.01 + uLayer * 5.0, vWorld.y * 0.4 + uLayer * 13.0));
  float thick = 1.0 - smoothstep(uFade.x, uFade.y, vWorld.y);
  outColor = vec4(uTone, saturate(uShare * thick * away * bank));
}
`

// The colors of the skyline's layers in this world: what each is made of and how much of the low sun its tops catch.
const TONES: { base: [number, number, number]; rim: number; fogShare: number }[] = [
  { base: [0.2, 0.26, 0.24], rim: 0, fogShare: 0 },
  { base: [0.15, 0.2, 0.15], rim: 0, fogShare: 0 },
  { base: [0.04, 0.045, 0.03], rim: 0.01, fogShare: 0 },
  { base: [0.07, 0.1, 0.05], rim: 0.02, fogShare: 0.01 },
  { base: [0.012, 0.022, 0.02], rim: 0.4, fogShare: 0.01 },
  { base: [0.013, 0.023, 0.028], rim: 0.12, fogShare: 0.3 },
  { base: [0.009, 0.017, 0.022], rim: 0.1, fogShare: 0.3 },
  { base: [0.009, 0.017, 0.022], rim: 0.06, fogShare: 0.3 },
  { base: [0.035, 0.024, 0.012], rim: 0.04, fogShare: 0.3 },
]

const VEILS = [
  { radiusM: 70, heightM: 50, scaleM: 6, share: 0.11 },
  { radiusM: 130, heightM: 60, scaleM: 7, share: 0.16 },
  { radiusM: 240, heightM: 70, scaleM: 7, share: 0.19 },
  { radiusM: 480, heightM: 80, scaleM: 8, share: 0.17 },
  { radiusM: 1100, heightM: 110, scaleM: 9, share: 0.15 },
  { radiusM: 3200, heightM: 260, scaleM: 60, share: 0.5 },
  { radiusM: 4600, heightM: 330, scaleM: 80, share: 0.5 },
]

const SHADES = [9, 14, 20, 26, 34, 42, 50, 58, 64]
const SHADE_TONE: [number, number, number] = [0.016, 0.0165, 0.016]

export interface FarLayers { meshes: THREE.Mesh[]; triangles: number }

export function makeFarLayers(sunAzimuthDeg: number, glow: [number, number, number]): FarLayers {
  const meshes: THREE.Mesh[] = []
  let triangles = 0
  const airUniforms = {
    uAirCool: { value: new THREE.Vector3(0.03, 0.046, 0.046) },
    uAirWarm: { value: new THREE.Vector3(0.3, 0.17, 0.07) },
    uAir: { value: 0.0003 },
  }
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, order: number): void => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.matrixAutoUpdate = false
    mesh.renderOrder = order
    meshes.push(mesh)
    triangles += (geometry.index as THREE.BufferAttribute).count / 3
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
  add(land, makeSurface({ name: 'golden far land', vertex, fragment: landFragment, uniforms: airUniforms, side: THREE.DoubleSide, castShadow: false }).main, 0)

  SKYLINE.forEach((layer, i) => {
    const geometry = skylineStrip(i, sunAzimuthDeg)
    const tone = TONES[i]
    const surface = makeSurface({
      name: `golden ${layer.name}`,
      vertex,
      fragment: `${layer.trees ? '#define TREES 1\n' : ''}${stripFragment}`,
      uniforms: { ...airUniforms, uBase: { value: new THREE.Vector3().fromArray(tone.base) }, uLayer: { value: skylineLayerSalt(i) }, uRim: { value: tone.rim }, uFogShare: { value: tone.fogShare }, uCrown: { value: layer.crownM }, uFloor: { value: layer.floor } },
      side: THREE.DoubleSide,
      castShadow: false,
    })
    add(geometry, surface.main, 0)
  })

  VEILS.forEach((veil, i) => {
    const geometry = ringStrip(96, () => ({ radius: veil.radiusM, top: veil.heightM }))
    const surface = makeSurface({
      name: `golden veil ${i}`,
      vertex,
      fragment: veilFragment,
      uniforms: { uGlow: { value: new THREE.Vector3().fromArray(glow) }, uShare: { value: veil.share }, uLayer: { value: i + 1 }, uScaleM: { value: veil.scaleM } },
      side: THREE.DoubleSide,
      transparent: true,
      additive: true,
      depthWrite: false,
    })
    add(geometry, surface.main, 43 + (VEILS.length - i))
  })
  SHADES.forEach((radiusM, i) => {
    const geometry = ringStrip(96, () => ({ radius: radiusM, top: 4 }))
    const surface = makeSurface({
      name: `golden shade ${i}`,
      vertex,
      fragment: shadeFragment,
      uniforms: { uTone: { value: new THREE.Vector3().fromArray(SHADE_TONE) }, uShare: { value: radiusM < 24 ? 0.3 : 0.32 }, uLayer: { value: i + 1 }, uFade: { value: new THREE.Vector2(1.6 + radiusM * 0.004, 1.6 + radiusM * 0.016) } },
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    })
    add(geometry, surface.main, 30 + (SHADES.length - i))
  })
  return { meshes, triangles }
}
