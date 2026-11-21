import * as THREE from 'three'
import { makeSurface } from '../../core/shading.ts'
import { SKYLINE, SKYLINE_LAND_FROM_M, SKYLINE_LAND_M, SKYLINE_LAND_TO_M, skylineCanopy, skylineLandM, skylineLayerSalt, skylineRing } from '../../weather/skyline.ts'

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
  vec3 color = uBase * (0.55 + 0.9 * mass) * skyAmbient(vec3(0.0, 0.3, 0.0)) * (0.25 + 0.35 * f);
  vec3 v = normalize(vWorld - uCamPos);
  color += uBase * uSunColor * uRim * smoothstep(0.1, 0.7, f) * (0.5 + 1.3 * smoothstep(0.2, 0.9, mass)) * (0.03 + pow(saturate(dot(v, uSunDir)), 8.0));
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
  vec3 color = 0.3 * albedo * (skyAmbient(vec3(0.0, 1.0, 0.0)) + uSunColor * max(uSunDir.y, 0.0));
  outColor = finish(aerial(color, vWorld), vWorld, min(vDepth, 100.0 * uFocusM), -1.0);
}
`

// The colors of the skyline's layers in this world: what each is made of and how much of the low sun its tops catch.
const TONES: { base: [number, number, number]; rim: number; fogShare: number }[] = [
  { base: [0.1, 0.12, 0.13], rim: 0.02, fogShare: 0 },
  { base: [0.09, 0.11, 0.12], rim: 0.02, fogShare: 0 },
  { base: [0.07, 0.09, 0.09], rim: 0.03, fogShare: 0 },
  { base: [0.05, 0.07, 0.06], rim: 0.05, fogShare: 0.01 },
  { base: [0.04, 0.06, 0.05], rim: 0.08, fogShare: 0.01 },
  { base: [0.035, 0.05, 0.045], rim: 0.1, fogShare: 0.3 },
  { base: [0.03, 0.045, 0.04], rim: 0.1, fogShare: 0.3 },
  { base: [0.03, 0.045, 0.04], rim: 0.06, fogShare: 0.3 },
  { base: [0.03, 0.04, 0.035], rim: 0.04, fogShare: 0.3 },
]

// The ridges stand this much taller under the night's key than the shared line draws them; the rain and the frost on either side of the night hide them.
const RIDGE_TALL = 2.1

export interface FarLayers { meshes: THREE.Mesh[]; triangles: number; setTime(time: number): void }

// The land is the same land in every world: its line is laid out round the bearing of the golden hour's sun.
export function makeFarLayers(landBearingDeg: number): FarLayers {
  const meshes: THREE.Mesh[] = []
  let triangles = 0
  const rings = SKYLINE.map((_, i) => skylineRing(i, landBearingDeg))
  const airUniforms = {
    uAirCool: { value: new THREE.Vector3(0.012, 0.022, 0.034) },
    uAirWarm: { value: new THREE.Vector3(0.03, 0.06, 0.08) },
    uAir: { value: 0.00015 },
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
    const radii: number[] = []
    for (let r = SKYLINE_LAND_FROM_M; r < SKYLINE_LAND_TO_M; r *= 1.35) radii.push(r)
    radii.push(SKYLINE_LAND_TO_M)
    const position = new Float32Array(radii.length * sides * 3)
    const info = new Float32Array(radii.length * sides * 3)
    const index: number[] = []
    radii.forEach((r, j) => {
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
  add(land, makeSurface({ name: 'night far land', vertex, fragment: landFragment, uniforms: airUniforms, side: THREE.DoubleSide, castShadow: false }).main, 0)

  SKYLINE.forEach((layer, i) => {
    const geometry = rings[i].geometry
    const tone = TONES[i]
    const surface = makeSurface({
      name: `night ${layer.name}`,
      vertex,
      fragment: `${layer.trees ? '#define TREES 1\n' : ''}${stripFragment}`,
      uniforms: { ...airUniforms, uBase: { value: new THREE.Vector3().fromArray(tone.base) }, uLayer: { value: skylineLayerSalt(i) }, uRim: { value: tone.rim }, uFogShare: { value: tone.fogShare }, uCrown: { value: layer.crownM }, uFloor: { value: layer.floor } },
      side: THREE.DoubleSide,
      castShadow: false,
    })
    add(geometry, surface.main, 0)
    if (!layer.trees && !layer.rowM) {
      const mesh = meshes[meshes.length - 1]
      mesh.scale.y = RIDGE_TALL
      mesh.updateMatrix()
    }
  })

  const plain = meshes[0]
  return {
    meshes,
    triangles,
    setTime: (time) => {
      rings.forEach((ring) => ring.setTime(time))
      plain.position.y = skylineLandM(time) - SKYLINE_LAND_M
      plain.updateMatrix()
    },
  }
}
