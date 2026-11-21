import * as THREE from 'three'
import { makeSurface } from '../../core/shading.ts'
import type { Uniforms } from '../../core/fullscreen.ts'
import { fogCloseAt, fogFarAt, fogLight } from '../../weather/fog/index.ts'
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

// A standing strip of the skyline, seen through the fog: uSee is the share of it that reaches the eye, the rest is the fog's own light from there. The banks in front take their part on top.
const stripFragment = /* glsl */ `
in vec3 vWorld;
in vec3 vInfo;
in float vDepth;
uniform vec3 uBase;
uniform float uLayer;
uniform float uSee;
uniform float uSeeGain;
uniform float uCrown;
uniform float uFloor;
${fogLight}
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
  vec3 v = normalize(vWorld - uCamPos);
  vec3 color = uBase * (0.6 + 0.8 * mass) * skyAmbient(vec3(0.0, 0.4, 0.0)) * (0.55 + 0.45 * f);
  // Hoar on the crowns: the tops are paler than the mass under them.
  color = mix(color, vec3(0.5, 0.53, 0.56) * skyAmbient(vec3(0.0, 1.0, 0.0)), 0.35 * smoothstep(0.55, 1.0, f) * smoothstep(0.3, 0.8, mass));
  float see = uSee * uSeeGain * (1.0 + 0.6 * uFogThin * exp(-acos(clamp(dot(v, uSunDir), -1.0, 1.0)) / 0.3));
  outColor = finish(mix(fogLight(v), color, see), uCamPos, min(vDepth, 100.0 * uFocusM), -1.0);
}
`

const landFragment = /* glsl */ `
in vec3 vWorld;
in vec3 vInfo;
in float vDepth;
${fogLight}
const vec3 LAND = vec3(0.1, 0.12, 0.115);
const float LAND_SEE = 0.5;
void main() {
  vec3 v = normalize(vWorld - uCamPos);
  outColor = finish(mix(fogLight(v), LAND * skyAmbient(vec3(0.0, 1.0, 0.0)), LAND_SEE), uCamPos, min(vDepth, 100.0 * uFocusM), -1.0);
}
`

// What each layer of the skyline is made of in the frost, and how much of it the fog lets through. The salt of a layer is the skyline's own, so a crown stands where it stands in every world.
const TONES: { base: [number, number, number]; see: number }[] = [
  { base: [0.2, 0.22, 0.24], see: 0.35 },
  { base: [0.17, 0.19, 0.2], see: 0.38 },
  { base: [0.12, 0.14, 0.14], see: 0.42 },
  { base: [0.1, 0.12, 0.11], see: 0.45 },
  { base: [0.07, 0.09, 0.08], see: 0.48 },
  { base: [0.06, 0.075, 0.07], see: 0.5 },
  { base: [0.05, 0.065, 0.06], see: 0.5 },
  { base: [0.06, 0.07, 0.065], see: 0.5 },
  { base: [0.07, 0.075, 0.07], see: 0.5 },
]

// The far shapes stand fainter behind the banks through the unit and come out this much as the fog thins, so the last second shows the ridge the cut needs.
const SEE_GAIN = 2
const SEE_FAINT = 0.5
const SEE_CUT = 2

export interface FarLayers { meshes: THREE.Mesh[]; triangles: number; setTime(time: number): void }

// skylineAzimuthDeg is the bearing the skyline is laid out round: the same one in every world, so the hills and the trees stand in the same places across a cut.
export function makeFarLayers(skylineAzimuthDeg: number, fog: Uniforms): FarLayers {
  const meshes: THREE.Mesh[] = []
  let triangles = 0
  const gain = { value: SEE_FAINT }
  const rings = SKYLINE.map((_, i) => skylineRing(i, skylineAzimuthDeg))
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material): void => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.matrixAutoUpdate = false
    meshes.push(mesh)
    triangles += (geometry.index as THREE.BufferAttribute).count / 3
  }
  const land = new THREE.BufferGeometry()
  {
    const sides = 90
    const radii = [SKYLINE_LAND_FROM_M, SKYLINE_LAND_TO_M]
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
  add(land, makeSurface({ name: 'frost far land', vertex, fragment: landFragment, uniforms: fog, side: THREE.DoubleSide, castShadow: false }).main)

  SKYLINE.forEach((layer, i) => {
    const tone = TONES[i]
    const surface = makeSurface({
      name: `frost ${layer.name}`,
      vertex,
      fragment: `${layer.trees ? '#define TREES 1\n' : ''}${stripFragment}`,
      uniforms: { ...fog, uBase: { value: new THREE.Vector3().fromArray(tone.base) }, uLayer: { value: skylineLayerSalt(i) }, uSee: { value: tone.see }, uSeeGain: gain, uCrown: { value: layer.crownM }, uFloor: { value: layer.floor } },
      side: THREE.DoubleSide,
      castShadow: false,
    })
    add(rings[i].geometry, surface.main)
  })
  return {
    meshes,
    triangles,
    setTime(time) {
      for (const ring of rings) ring.setTime(time)
      gain.value = SEE_FAINT + (SEE_GAIN - SEE_FAINT) * fogFarAt(time) + (SEE_CUT - SEE_FAINT) * fogCloseAt(time)
      meshes[0].position.y = skylineLandM(time) - SKYLINE_LAND_M
      meshes[0].updateMatrix()
    },
  }
}
