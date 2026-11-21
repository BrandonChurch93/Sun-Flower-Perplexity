import * as THREE from 'three'
import { hash01, streamSeed } from '../../core/random.ts'
import { makeSurface } from '../../core/shading.ts'

const SEED = streamSeed('golden far')
const RAD = Math.PI / 180

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
  return uAirCool + uAirWarm * (0.1 * toSun * toSun);
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
${air}
// One crown: a dome as wide as its cell, each of its own height.
float crown(float run, float widthM, float salt) {
  float c = run / widthM;
  float f = 2.0 * fract(c) - 1.0;
  return (0.35 + 0.65 * hash21(vec2(floor(c), salt))) * sqrt(max(0.0, 1.0 - f * f));
}
void main() {
  float top = vInfo.z;
#ifdef TREES
  float stand = smoothstep(0.2, 0.8, 0.6 * valueNoise(vec2(vInfo.x * 0.026, uLayer)) + 0.4 * valueNoise(vec2(vInfo.x * 0.07, uLayer + 3.0)));
  top *= 0.45 + 0.37 * stand + 0.18 * max(crown(vInfo.x, 15.0, uLayer), max(crown(vInfo.x + 5.0, 9.5, uLayer + 2.0), crown(vInfo.x + 2.0, 5.5, uLayer + 4.0)));
  if (vInfo.y > top) discard;
  float mass = valueNoise(vec2(vInfo.x * 0.22, vInfo.y * 0.3 + uLayer));
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

function wrapNoise(az: number, cells: number, salt: number): number {
  const x = (az / (2 * Math.PI)) * cells
  const i = Math.floor(x)
  const f = x - i
  const s = f * f * (3 - 2 * f)
  const a = hash01(SEED + salt, ((i % cells) + cells) % cells)
  const b = hash01(SEED + salt, (((i + 1) % cells) + cells) % cells)
  return a + (b - a) * s
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function ridged(az: number, cells: number, salt: number): number {
  return 0.56 * wrapNoise(az, cells, salt) + 0.27 * wrapNoise(az, cells * 2, salt + 1) + 0.12 * wrapNoise(az, cells * 5, salt + 2) + 0.05 * wrapNoise(az, cells * 11, salt + 3)
}

interface Strip {
  name: string
  radiusM: number
  wander: number
  // The top of the layer as the angle it stands above the horizon, seen from the plant.
  lowDeg: number
  highDeg: number
  cells: number
  segments: number
  trees: boolean
  base: [number, number, number]
  rim: number
  // Toward the sun the layer stands this high instead, as one dark ridge under the sun.
  sunward?: [number, number]
}

const STRIPS: Strip[] = [
  { name: 'far ridge', radiusM: 5400, wander: 0.04, lowDeg: 0.5, highDeg: 1.9, cells: 22, segments: 1440, trees: false, base: [0.2, 0.26, 0.24], rim: 0 },
  { name: 'middle ridge', radiusM: 3900, wander: 0.06, lowDeg: 0.35, highDeg: 1.7, cells: 27, segments: 1440, trees: false, base: [0.15, 0.2, 0.15], rim: 0 },
  { name: 'near ridge', radiusM: 2500, wander: 0.08, lowDeg: 0.3, highDeg: 1.5, cells: 33, segments: 1440, trees: false, base: [0.04, 0.045, 0.03], rim: 0.01, sunward: [1.1, 1.75] },
  { name: 'far trees', radiusM: 1500, wander: 0.1, lowDeg: 0.35, highDeg: 1.0, cells: 40, segments: 1800, trees: true, base: [0.07, 0.1, 0.05], rim: 0.02 },
  { name: 'tree line', radiusM: 700, wander: 0.12, lowDeg: 1.6, highDeg: 2.5, cells: 40, segments: 2880, trees: true, base: [0.012, 0.022, 0.02], rim: 0.4 },
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

const SUN_GAP_DEG = 9
const SUN_GAP_TOP_DEG = 1.1
const SUN_RIDGE_TOP_DEG = 1.5
const LAND_FROM_M = 540
const LAND_TO_M = 5900

export interface FarLayers { meshes: THREE.Mesh[]; triangles: number }

export function makeFarLayers(sunAzimuthDeg: number, glow: [number, number, number]): FarLayers {
  const meshes: THREE.Mesh[] = []
  let triangles = 0
  const airUniforms = {
    uAirCool: { value: new THREE.Vector3(0.03, 0.046, 0.046) },
    uAirWarm: { value: new THREE.Vector3(0.3, 0.17, 0.07) },
    uAir: { value: 0.0003 },
  }
  const sunAz = sunAzimuthDeg * RAD
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, order: number): void => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.matrixAutoUpdate = false
    mesh.renderOrder = order
    meshes.push(mesh)
    triangles += (geometry.index as THREE.BufferAttribute).count / 3
  }
  const strip = (segments: number, at: (az: number) => { radius: number; top: number }): THREE.BufferGeometry => {
    const position = new Float32Array((segments + 1) * 2 * 3)
    const info = new Float32Array((segments + 1) * 2 * 3)
    const index: number[] = []
    let run = 0
    let px = 0
    let pz = 0
    for (let s = 0; s <= segments; s++) {
      const az = (s / segments) * 2 * Math.PI
      const { radius, top } = at(s === segments ? 0 : az)
      const x = Math.sin(az) * radius
      const z = Math.cos(az) * radius
      if (s > 0) run += Math.hypot(x - px, z - pz)
      px = x
      pz = z
      for (let k = 0; k < 2; k++) {
        const v = (s * 2 + k) * 3
        position[v] = x
        position[v + 1] = k ? top : -4
        position[v + 2] = z
        info[v] = run
        info[v + 1] = k ? top : -4
        info[v + 2] = top
      }
      if (s < segments) {
        const a = s * 2
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('aInfo', new THREE.BufferAttribute(info, 3))
    geometry.setIndex(index)
    return geometry
  }

  const land = new THREE.BufferGeometry()
  {
    const sides = 180
    const rings: number[] = []
    for (let r = LAND_FROM_M; r < LAND_TO_M; r *= 1.35) rings.push(r)
    rings.push(LAND_TO_M)
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

  STRIPS.forEach((layer, i) => {
    const geometry = strip(layer.segments, (az) => {
      const radius = layer.radiusM * (1 + layer.wander * (2 * wrapNoise(az, 7, 40 + i * 10) - 1))
      const shape = layer.trees ? 0.6 * wrapNoise(az, layer.cells, 100 + i * 10) + 0.4 * wrapNoise(az, layer.cells * 3, 101 + i * 10) : ridged(az, layer.cells, 100 + i * 10)
      let deg = layer.lowDeg + (layer.highDeg - layer.lowDeg) * shape
      let off = Math.abs(az - sunAz) % (2 * Math.PI)
      if (off > Math.PI) off = 2 * Math.PI - off
      const gap = Math.max(0, 1 - off / (SUN_GAP_DEG * RAD))
      const open = gap * gap * (3 - 2 * gap)
      if (!layer.trees) deg *= 1 - 0.55 * smooth(12, 30, off / RAD)
      if (layer.sunward) {
        const near = smooth(30, 12, off / RAD)
        deg = deg * (1 - near) + (layer.sunward[0] + (layer.sunward[1] - layer.sunward[0]) * shape) * near
      }
      deg = deg * (1 - open) + Math.min(deg, layer.sunward ? SUN_RIDGE_TOP_DEG : SUN_GAP_TOP_DEG * (0.55 + 0.45 * i / (STRIPS.length - 1))) * open
      if (layer.trees) {
        // The trees stand in stretches with open country between them, and the one sure opening lies just right of the sun, where the ridge shows.
        const right = ((((sunAz - az) / RAD + 180) % 360) + 360) % 360 - 180
        const stand = Math.min(i === STRIPS.length - 1 ? 1 : smooth(0.34, 0.56, wrapNoise(az, 10, 300 + i * 10)), smooth(5, 11, Math.abs(right - 8)))
        deg = 0.22 + (deg - 0.22) * stand
      }
      return { radius, top: radius * Math.tan(deg * RAD) + (layer.trees ? 4 : 0) }
    })
    const surface = makeSurface({
      name: `golden ${layer.name}`,
      vertex,
      fragment: `${layer.trees ? '#define TREES 1\n' : ''}${stripFragment}`,
      uniforms: { ...airUniforms, uBase: { value: new THREE.Vector3().fromArray(layer.base) }, uLayer: { value: i * 17.3 + 1.7 }, uRim: { value: layer.rim }, uFogShare: { value: layer.trees ? 0.01 : 0 } },
      side: THREE.DoubleSide,
      castShadow: false,
    })
    add(geometry, surface.main, 0)
  })

  VEILS.forEach((veil, i) => {
    const geometry = strip(96, () => ({ radius: veil.radiusM, top: veil.heightM }))
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
  return { meshes, triangles }
}
