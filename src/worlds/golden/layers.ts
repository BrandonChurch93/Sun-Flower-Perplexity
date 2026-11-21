import * as THREE from 'three'
import { makeSurface } from '../../core/shading.ts'
import { eveningHaze, lateEvening } from './sky.ts'
import { SKYLINE, SKYLINE_LAND_FROM_M, SKYLINE_LAND_TO_M, ringStrip, skylineAt, skylineCanopy, skylineLayerSalt, skylineStrip } from '../../weather/skyline.ts'

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
uniform float uLate;
uniform float uHaze;
uniform float uWoodM;
uniform float uRag;
uniform float uReach;
uniform vec3 uDark;
${air}
${skylineCanopy}
void main() {
  float top = vInfo.z;
  vec2 bearing = normalize(vWorld.xz);
  vec2 sunward = normalize(uSunDir.xz);
  float az = atan(sunward.x * bearing.y - sunward.y * bearing.x, dot(sunward, bearing));
#ifdef TREES
  top *= skylineCanopy(vInfo.x, uCrown, uLayer, uFloor);
  top *= 1.0 - uLate * uRag * (0.16 * valueNoise(vec2(vInfo.x * 5.3 / uCrown, uLayer + 21.0)) + 0.09 * valueNoise(vec2(vInfo.x * 17.0 / uCrown, uLayer + 27.0)));
  if (vInfo.y > top) discard;
  float mass = valueNoise(vec2(vInfo.x * 3.3 / uCrown, vInfo.y * 4.5 / uCrown + uLayer));
#else
#ifdef WOOD
  float stand = 1.0 - smoothstep(0.07, 0.4, az);
  top += uWoodM * (uLate * stand * skylineCanopy(vInfo.x, uCrown, uLayer, uFloor) * (0.62 + 0.26 * valueNoise(vec2(vInfo.x * 4.1 / uCrown, uLayer + 21.0)) + 0.12 * valueNoise(vec2(vInfo.x * 13.0 / uCrown, uLayer + 27.0))) - 1.0);
  if (vInfo.y > top) discard;
  float mass = valueNoise(vec2(vInfo.x * uReach * 0.012, vInfo.y * uReach * 0.03 + uLayer));
  float leaf = valueNoise(vec2(vInfo.x * 3.3 / uCrown, vInfo.y * 4.5 / uCrown + uLayer));
#else
  float mass = valueNoise(vec2(vInfo.x * 0.012, vInfo.y * 0.03 + uLayer));
#endif
#endif
#ifndef WOOD
  float leaf = mass;
#endif
  float f = saturate(vInfo.y / max(top, 1.0));
  vec3 color = uBase * (0.55 + 0.9 * mass) * skyAmbient(vec3(0.0, 0.3, 0.0)) * (0.07 + 0.07 * f);
  vec3 v = normalize(vWorld - uCamPos);
  color += uBase * uSunColor * vec3(1.0, 0.8, 0.9) * uRim * smoothstep(0.1, 0.7, f) * (0.5 + 1.3 * smoothstep(0.2, 0.9, mass)) * (0.03 + pow(saturate(dot(v, uSunDir)), 8.0));
#ifdef WOOD
  vec3 seen = uCamPos + (vWorld - uCamPos) * uReach;
#else
  vec3 seen = vWorld;
#endif
  color = mix(aerial(color, seen), 1.3 * airTone(v), 0.1 * exp(-max(vInfo.y, 0.0) / (0.22 * max(top, 6.0))));
  float theta = acos(clamp(dot(v, uSunDir), -1.0, 1.0));
  vec3 tone = mix(vec3(0.07, 0.085, 0.09), vec3(0.21, 0.165, 0.125), exp(-theta / 0.6)) + vec3(1.2, 0.75, 0.4) * exp(-theta / 0.07);
  float haze = uHaze;
#ifdef WOOD
  haze = mix(0.36, uHaze, stand);
#endif
  float share = haze + (1.0 - haze) * (0.8 * exp(-theta / 0.06) + 0.12 * exp(-theta / 0.3));
  share += (1.0 - share) * 0.3 * smoothstep(0.0, 0.1, az) * exp(-max(az, 0.0) / 0.4);
  share *= 1.0 - 0.6 * smoothstep(0.1, 0.25, -az) - 0.5 * smoothstep(0.6, 0.9, az);
  // The crowns thin out toward their tops and let the sky through.
  share += (1.0 - share) * 0.45 * uRag * smoothstep(0.8, 1.0, vInfo.y / max(top, 1.0));
  color = mix(color, mix(uDark * (0.6 + 0.8 * leaf), tone, share), uLate);
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
uniform float uWide;
uniform float uLate;
void main() {
  if (uDiag > 1) discard;
  vec3 v = normalize(vWorld - uCamPos);
  float theta = acos(clamp(dot(v, uSunDir), -1.0, 1.0));
  float bank = 0.55 + 0.9 * valueNoise(vec2(vInfo.x * 0.004 + uTime * 0.012 + uLayer * 5.0, vWorld.y * 0.06 + uLayer * 13.0 - uTime * 0.004));
  float thick = exp(-max(vWorld.y, 0.0) / uScaleM) * (1.0 - smoothstep(0.6, 1.0, vInfo.y / vInfo.z)) * mix(1.0 - smoothstep(-0.008, 0.001, v.y), max(1.0 - smoothstep(-0.028, -0.018, v.y), 0.1 * (1.0 - smoothstep(0.0, 0.05, v.y))), uLate);
  outColor = vec4(uGlow * vec3(1.0, 0.64, 0.5) * (uShare * thick * bank * (0.45 * exp(-theta / 0.06) + 0.42 * exp(-theta * theta / 0.08) + 0.2 * uWide * exp(-theta / 0.8))), 0.0);
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
type Rgb = [number, number, number]
const TONES: { base: Rgb; rim: number; fogShare: number; dark: Rgb; haze: number }[] = [
  { base: [0.2, 0.26, 0.24], rim: 0, fogShare: 0, dark: [0.02, 0.022, 0.02], haze: 0.3 },
  { base: [0.15, 0.2, 0.15], rim: 0, fogShare: 0, dark: [0.016, 0.018, 0.016], haze: 0.22 },
  { base: [0.04, 0.045, 0.03], rim: 0.01, fogShare: 0, dark: [0.012, 0.013, 0.011], haze: 0.15 },
  { base: [0.07, 0.1, 0.05], rim: 0.02, fogShare: 0.01, dark: [0.011, 0.013, 0.011], haze: 0.14 },
  { base: [0.012, 0.022, 0.02], rim: 0.4, fogShare: 0.01, dark: [0.009, 0.012, 0.011], haze: 0.1 },
  { base: [0.013, 0.023, 0.028], rim: 0.12, fogShare: 0.3, dark: [0.005, 0.008, 0.008], haze: 0.05 },
  { base: [0.009, 0.017, 0.022], rim: 0.1, fogShare: 0.3, dark: [0.004, 0.007, 0.007], haze: 0.04 },
  { base: [0.009, 0.017, 0.022], rim: 0.06, fogShare: 0.3, dark: [0.009, 0.008, 0.006], haze: 0.07 },
  { base: [0.035, 0.024, 0.012], rim: 0.04, fogShare: 0.3, dark: [0.009, 0.008, 0.006], haze: 0.07 },
]

// From 52 s a wood stands on the near ridge, the tree tops are ragged and every layer takes its share of the evening haze.
const WOOD = { layer: 2, heightM: 26, crownM: 15, floor: 0.3, near: 0.5, dark: [0.009, 0.008, 0.006] as Rgb, haze: 0.07 }

const VEILS: { radiusM: number; heightM: number; scaleM: number; share: number; late?: boolean }[] = [
  { radiusM: 9, heightM: 6, scaleM: 3, share: 0.25, late: true },
  { radiusM: 16, heightM: 6, scaleM: 3, share: 0.25, late: true },
  { radiusM: 30, heightM: 8, scaleM: 4, share: 0.25, late: true },
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

const HAZE_TONE = [0.14, 0.105, 0.05]
const AIR_COOL = [0.03, 0.046, 0.046]
const AIR_HAZE = [0.2, 0.17, 0.13]
const AIR_PER_M = 0.0003

export interface FarLayers { meshes: THREE.Mesh[]; triangles: number; setTime(time: number): void }

export function makeFarLayers(sunAzimuthDeg: number, glow: [number, number, number]): FarLayers {
  const meshes: THREE.Mesh[] = []
  let triangles = 0
  const airUniforms = {
    uAirCool: { value: new THREE.Vector3().fromArray(AIR_COOL) },
    uAirWarm: { value: new THREE.Vector3(0.3, 0.17, 0.07) },
    uAir: { value: AIR_PER_M },
  }
  const late = { value: 0 }
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, order: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.matrixAutoUpdate = false
    mesh.renderOrder = order
    meshes.push(mesh)
    triangles += (geometry.index as THREE.BufferAttribute).count / 3
    return mesh
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
      uniforms: { ...airUniforms, uBase: { value: new THREE.Vector3().fromArray(tone.base) }, uLayer: { value: skylineLayerSalt(i) }, uRim: { value: tone.rim }, uFogShare: { value: tone.fogShare }, uCrown: { value: layer.crownM }, uFloor: { value: layer.floor }, uLate: late, uHaze: { value: tone.haze }, uWoodM: { value: 0 }, uRag: { value: layer.rowM ? 0.3 : 1 }, uReach: { value: 1 }, uDark: { value: new THREE.Vector3().fromArray(tone.dark) } },
      side: THREE.DoubleSide,
      castShadow: false,
    })
    add(geometry, surface.main, 0)
  })
  const woodTone = TONES[WOOD.layer]
  const wood = add(
    ringStrip(SKYLINE[WOOD.layer].segments, (az) => {
      const at = skylineAt(WOOD.layer, az, sunAzimuthDeg)
      return { radius: at.radius * WOOD.near, top: at.top * WOOD.near + WOOD.heightM }
    }),
    makeSurface({
      name: 'golden wood on the ridge',
      vertex,
      fragment: `#define WOOD 1\n${stripFragment}`,
      uniforms: { ...airUniforms, uBase: { value: new THREE.Vector3().fromArray(woodTone.base) }, uLayer: { value: skylineLayerSalt(WOOD.layer) }, uRim: { value: woodTone.rim }, uFogShare: { value: woodTone.fogShare }, uCrown: { value: WOOD.crownM }, uFloor: { value: WOOD.floor }, uLate: late, uHaze: { value: WOOD.haze }, uWoodM: { value: WOOD.heightM }, uRag: { value: 1 }, uReach: { value: 1 / WOOD.near }, uDark: { value: new THREE.Vector3().fromArray(WOOD.dark) } },
      side: THREE.DoubleSide,
      castShadow: false,
    }).main,
    0,
  )
  wood.visible = false

  const wide = { value: 0 }
  const lateShare: { value: number }[] = []
  const lateVeils = VEILS.filter((veil) => veil.late)
  const shadeTone = { value: new THREE.Vector3().fromArray(SHADE_TONE) }
  VEILS.forEach((veil, i) => {
    const geometry = ringStrip(96, () => ({ radius: veil.radiusM, top: veil.heightM }))
    const surface = makeSurface({
      name: `golden veil ${i}`,
      vertex,
      fragment: veilFragment,
      uniforms: { uGlow: { value: new THREE.Vector3().fromArray(glow) }, uShare: veil.late ? lateShare[lateShare.push({ value: 0 }) - 1] : { value: veil.share }, uLayer: { value: i + 1 }, uScaleM: { value: veil.scaleM }, uWide: wide, uLate: late },
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
      uniforms: { uTone: shadeTone, uShare: { value: radiusM < 24 ? 0.3 : 0.32 }, uLayer: { value: i + 1 }, uFade: { value: new THREE.Vector2(1.6 + radiusM * 0.004, 1.6 + radiusM * 0.016) } },
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    })
    add(geometry, surface.main, 30 + (SHADES.length - i))
  })
  const setTime = (time: number): void => {
    const h = eveningHaze(time)
    late.value = lateEvening(time)
    wood.visible = late.value > 0
    wide.value = h
    lateShare.forEach((share, i) => { share.value = lateVeils[i].share * h })
    shadeTone.value.set(SHADE_TONE[0] + (HAZE_TONE[0] - SHADE_TONE[0]) * h, SHADE_TONE[1] + (HAZE_TONE[1] - SHADE_TONE[1]) * h, SHADE_TONE[2] + (HAZE_TONE[2] - SHADE_TONE[2]) * h)
    airUniforms.uAirCool.value.set(AIR_COOL[0] + (AIR_HAZE[0] - AIR_COOL[0]) * h, AIR_COOL[1] + (AIR_HAZE[1] - AIR_COOL[1]) * h, AIR_COOL[2] + (AIR_HAZE[2] - AIR_COOL[2]) * h)
    airUniforms.uAir.value = AIR_PER_M * (1 + 4 * h)
  }
  return { meshes, triangles, setTime }
}
