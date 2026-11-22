import * as THREE from 'three'
import { segmentEnd, segmentStart } from '../../config.ts'
import { makeSurface } from '../../core/shading.ts'
import { SKYLINE, SKYLINE_LAND_FROM_M, SKYLINE_LAND_M, SKYLINE_LAND_TO_M, ringStrip, skylineCanopy, skylineLandM, skylineLayerSalt, skylineRing, type SkylineRing } from '../../weather/skyline.ts'

// A strip's top is ragged, so it stands this much taller than the line it should read as; the front row of the wood stands lower than the back one.
const HILL_GAIN = 1.47
const WOOD_GAIN = 1.39
const FRONT_ROW = 0.72

const vertex = /* glsl */ `
const float HILL_GAIN = ${HILL_GAIN.toFixed(3)};
const float WOOD_GAIN = ${WOOD_GAIN.toFixed(3)};
const float FRONT_ROW = ${FRONT_ROW.toFixed(3)};
in vec3 position;
in vec3 aInfo;
out vec3 vWorld;
out vec3 vInfo;
out float vDepth;
uniform float uSunDeg;
uniform float uLow;
uniform float uKind;
uniform float uLandShare;
void main() {
  vec3 at = position;
  // Seen through the rain from the soil, the near land is the approved frame's own line by bearing: a wood that stands tall at the far left and again at the far right, and one long hill between them that peaks left of the plant. uLow is 0 at both cuts, so the land never jumps at one. uKind: 0 far land, 1 the wood's back row, 2 its front row, 3 a bank, 4 the plain.
  float right = 180.0 - mod(degrees(atan(position.x, position.z)) - uSunDeg + 540.0, 360.0);
  float peak = (right - 26.0) / 2.2;
  float wood = 0.5 + 1.45 * (1.0 - smoothstep(17.0, 22.0, right)) + 0.35 * smoothstep(47.0, 56.0, right);
  float hill = 0.28 + 0.59 * (1.0 - smoothstep(28.0, 35.5, right)) + 0.3 * exp(-peak * peak) + 0.5 * smoothstep(46.0, 55.0, right);
  float deg = uKind > 2.5 ? HILL_GAIN * hill : WOOD_GAIN * wood * (uKind > 1.5 ? FRONT_ROW : 1.0);
  float want = uKind > 3.5 ? at.y * uLandShare : uKind > 0.5 ? length(position.xz) * tan(radians(deg)) : at.y;
  if (uLow > 0.0 && at.y > 0.0) at.y = mix(at.y, want, uLow);
  vec4 world = modelMatrix * vec4(at, 1.0);
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
uniform float uSunDeg;
uniform float uAir;
uniform float uAirShare;
uniform float uFlash;
// The band is brightest right of the frame's middle, and the wet air under it carries that light: 0 far from that bearing, 1 at it.
float underBand(vec3 world) {
  float t = (mod(degrees(atan(world.x, world.z)) - uSunDeg + 540.0, 360.0) - 180.0 + 35.5) / 9.0;
  return exp(-t * t);
}
vec3 aerial(vec3 color, vec3 world) {
  float d = length(world - uCamPos);
  return mix(color, uAirTone * (1.0 + 0.6 * uFlash), 1.0 - exp(-d * uAir * uAirShare));
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
uniform float uTwigs;
uniform float uClumps;
uniform float uWoods;
uniform float uLow;
uniform float uKind;
uniform float uHaze;
${air}
${skylineCanopy}
const float WOODS_M = 45.0;
void main() {
  float top = vInfo.z;
#ifdef TREES
  top *= skylineCanopy(vInfo.x, uCrown, uLayer, uFloor) * (1.0 - uTwigs * (1.0 - max(skylineCrown(vInfo.x, 0.29 * uCrown, uLayer + 7.0), skylineCrown(vInfo.x + 0.1 * uCrown, 0.17 * uCrown, uLayer + 9.0)))) * (1.0 - uClumps * (1.0 - max(skylineCrown(vInfo.x + 0.4 * uCrown, 2.7 * uCrown, uLayer + 11.0), skylineCrown(vInfo.x + 1.5 * uCrown, 2.1 * uCrown, uLayer + 13.0))));
  // Under the rain's long lens the wood's top is a row of crowns of its own, gone again by both cuts.
  top *= 1.0 - (uKind < 2.5 ? uLow : 0.0) * 0.24 * (1.0 - max(skylineCrown(vInfo.x + 0.7, 1.3, uLayer + 21.0), skylineCrown(vInfo.x, 0.9, uLayer + 23.0)));
  if (vInfo.y > top) discard;
  float mass = valueNoise(vec2(vInfo.x * 3.3 / uCrown, vInfo.y * 4.5 / uCrown + uLayer));
#else
  top *= skylineCanopy(vInfo.x, WOODS_M, uLayer, uWoods);
  if (vInfo.y > top) discard;
  float mass = valueNoise(vec2(vInfo.x * 0.012, vInfo.y * 0.03 + uLayer));
#endif
  float f = saturate(vInfo.y / max(top, 1.0));
  vec3 color = uBase * (0.6 + 0.8 * mass) * skyAmbient(vec3(0.0, 0.6, 0.0)) * (0.5 + 0.5 * f);
  // Toward the bright band the rain in front of the far land is lit, and the land goes grey in it.
  float off = mod(degrees(atan(vWorld.x, vWorld.z)) - uSunDeg + 540.0, 360.0) - 180.0;
  color = mix(aerial(color, vWorld), uAirTone * mix(0.34, 1.75, underBand(vWorld)) * (uKind < 0.5 ? 1.6 : 1.0), uHaze * 0.85 * smoothstep(-17.5, -21.0, off));
  // The crowns of the wood stand in the wet air above its dark body, the back row deeper in it than the front one.
  color = mix(color * (1.0 - 0.3 * uHaze * (uKind > 0.5 ? 1.0 - f : 0.0)), uAirTone * 0.6, uHaze * (uKind > 2.5 ? 0.0 : uKind > 1.5 ? 0.4 : uKind > 0.5 ? 0.9 : 0.0) * smoothstep(0.45, 1.0, f));
  outColor = finish(color, uCamPos, min(vDepth, 100.0 * uFocusM), -1.0);
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
uniform float uSunDeg;
void main() {
  if (uDiag > 1) discard;
  float t = (mod(degrees(atan(vWorld.x, vWorld.z)) - uSunDeg + 540.0, 360.0) - 180.0 + 35.5) / 9.0;
  float lit = mix(0.25, 1.2, exp(-t * t)) * (1.0 - 0.55 * smoothstep(1.61, 2.17, t));
  float gusts = valueNoise(vec2(vInfo.x * 0.35 / uScaleM - uTime * 0.05 + uLayer * 3.0, uLayer));
  float billow = valueNoise(vec2(vInfo.x * 0.06 / uScaleM + uTime * 0.02 + uLayer * 7.0, uLayer + 4.0));
  float h = max(vWorld.y, 0.0) / (uScaleM * (0.7 + 0.6 * billow));
  // Thickest a little above the ground and thinning to nothing where the sheet meets it, so no sheet draws a line on the soil.
  float thick = exp(-h) * smoothstep(0.0, 0.6, h) * 1.6;
  outColor = vec4(uMist * lit * (1.0 + 0.6 * uFlash), saturate(uShare * thick * (0.6 + 0.8 * gusts)));
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

// Far sheets stand in front of dark land and under the bright band, so they read paler than the spray at the plant's foot.
const VEILS = [
  { radiusM: 1.6, heightM: 0.5, scaleM: 0.035, share: 0.05, light: 1 },
  { radiusM: 3, heightM: 0.8, scaleM: 0.05, share: 0.1, light: 1.4 },
  { radiusM: 6, heightM: 1.2, scaleM: 0.08, share: 0.3, light: 2.2 },
  { radiusM: 12, heightM: 2, scaleM: 0.07, share: 0.45, light: 3.0 },
  { radiusM: 24, heightM: 4, scaleM: 0.1, share: 0.45, light: 3.2 },
  { radiusM: 48, heightM: 8, scaleM: 0.15, share: 0.6, light: 3.6 },
  { radiusM: 150, heightM: 20, scaleM: 0.5, share: 0.3, light: 3.6 },
  { radiusM: 600, heightM: 60, scaleM: 2, share: 0.15, light: 2.6 },
]

// The wood behind the field stands on rising ground, over the rain that lies low: it keeps its dark.
const ROW_AIR = 0.12
// The night's own line, so the cut into the night changes no silhouette: crowns that end in small crowns and stand in clumps, a hedge on the two level banks, woods along the ridges. All grow in after the cut into the rain, which the dawn's line meets.
const HEDGE_CROWN_M = 2.4
const HEDGE_FLOOR = 0.66
const TWIGS = 0.14
// Under the rain's key the hedge on the banks is most of the way back to a smooth hill.
const HILL_SMOOTH = 0.65
const CLUMPS = 0.3
const WOODS_FLOOR = 0.8
const RAIN_FROM_S = segmentStart('rain')
const RAIN_TO_S = segmentEnd('rain')
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

export interface FarLayers { meshes: THREE.Mesh[]; flash(amount: number): void; setTime(time: number): void }

export function makeFarLayers(skylineAzimuthDeg: number, airTone: [number, number, number], mist: [number, number, number]): FarLayers {
  const meshes: THREE.Mesh[] = []
  const flash = { value: 0 }
  const airUniforms = { uAirTone: { value: new THREE.Vector3().fromArray(airTone) }, uSunDeg: { value: skylineAzimuthDeg }, uAir: { value: 0.004 }, uAirShare: { value: 1 }, uFlash: flash }
  const low = { value: 0 }
  const landShare = { value: 1 }
  const hedgeFloor = { value: 1 }
  const twigs = { value: 0 }
  const clumps = { value: 0 }
  const woods = { value: 1 }
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
        position[v + 1] = SKYLINE_LAND_M
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
  add(land, makeSurface({ name: 'rain far land', vertex, fragment: landFragment, uniforms: { ...airUniforms, uLow: low, uKind: { value: 4 }, uLandShare: landShare }, side: THREE.DoubleSide, castShadow: false }).main, 0)

  const rings: SkylineRing[] = []
  SKYLINE.forEach((layer, i) => {
    const hedge = !layer.trees && layer.rowM !== undefined
    const surface = makeSurface({
      name: `rain ${layer.name}`,
      vertex,
      fragment: `${layer.trees || hedge ? '#define TREES 1\n' : ''}${stripFragment}`,
      uniforms: { ...airUniforms, uAirShare: { value: layer.rowM ? ROW_AIR : 1 }, uHaze: low, uBase: { value: new THREE.Vector3().fromArray(TONES[i]) }, uLayer: { value: skylineLayerSalt(i) }, uCrown: { value: hedge ? HEDGE_CROWN_M : layer.crownM }, uFloor: hedge ? hedgeFloor : { value: layer.floor }, uTwigs: layer.rowM ? twigs : { value: 0 }, uClumps: layer.rowM ? clumps : { value: 0 }, uWoods: woods, uSunDeg: { value: skylineAzimuthDeg }, uLow: low, uKind: { value: !layer.rowM ? 0 : hedge ? 3 : i === 5 ? 1 : 2 }, uLandShare: landShare },
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
      uniforms: { uMist: { value: new THREE.Vector3().fromArray(mist).multiplyScalar(veil.light) }, uShare: { value: veil.share }, uLayer: { value: i + 1 }, uScaleM: { value: veil.scaleM }, uFlash: flash, uSunDeg: { value: skylineAzimuthDeg } },
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    })
    add(ringStrip(96, () => ({ radius: veil.radiusM, top: veil.heightM })), surface.main, 43 + (VEILS.length - i) * 0.01)
  })
  return {
    meshes,
    flash: (amount) => { flash.value = amount },
    setTime: (time) => {
      for (const ring of rings) ring.setTime(time)
      low.value = smooth(RAIN_FROM_S, RAIN_FROM_S + 3.5, time) * (1 - smooth(RAIN_TO_S - 5.5, RAIN_TO_S - 0.1, time))
      const grown = smooth(RAIN_FROM_S, RAIN_FROM_S + 3.5, time)
      hedgeFloor.value = 1 + (HEDGE_FLOOR - 1) * grown * (1 - HILL_SMOOTH * low.value)
      twigs.value = TWIGS * grown
      clumps.value = CLUMPS * grown
      woods.value = 1 + (WOODS_FLOOR - 1) * grown
      landShare.value = skylineLandM(time) / SKYLINE_LAND_M
    },
  }
}
