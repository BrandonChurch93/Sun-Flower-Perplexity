import * as THREE from 'three'
import type { Assets } from '../core/assets.ts'
import { makeSurface, type Surface, type SurfaceOptions } from '../core/shading.ts'
import type { Caster } from '../core/shadow.ts'
import type { PlantInputs } from './growth.ts'
import type { Pose } from './skeleton.ts'
import { STEM_LEAN, STEM_SWING, swayGlsl, windToward } from './wind.ts'
import { config } from '../config.ts'

const SHUTTER_SECONDS = config.film.shutterDegrees / 360 / config.film.fps

// 'hero' is the plant the lens holds, and the companion beside it. 'near' and 'far' are the neighbors in the field: one shape drawn once per neighbor.
export type PartDetail = 'hero' | 'near' | 'far'

export interface PartOptions {
  detail: PartDetail
  // 0 is the plant. Any other number is a neighbor with its own small differences.
  variant: number
  // The places of the neighbors when the part is drawn once per neighbor. Null for the plant and the companion.
  places: THREE.InstancedInterleavedBuffer | null
}

// One organ of the plant at its real quality. It owns its meshes and fills them for the two ends of the shutter.
export interface PlantPart {
  readonly name: string
  readonly meshes: THREE.Mesh[]
  // The meshes that throw a shadow, each with its surface.
  readonly casters: Caster[]
  load?(assets: Assets): Promise<void>
  // Called twice a frame with the plant posed for that moment: slot 0 is the open shutter, slot 1 its close.
  fill(slot: 0 | 1, pose: Pose): void
  // Called once a frame after both fills.
  finish(time: number, inputs: PlantInputs): void
}

export type PartMaker = (options: PartOptions) => PlantPart | null

// What a neighbor's place holds, eight numbers each: x, z, turn, size, lean x, lean z, tone, id.
export const PLACE = 8

// How high the canopy of the field stands. The neighbors are lit by their depth in it instead of by the shadow map.
// The wind's strength and the height of a full size neighbor, so that each neighbor sways with the swell that reaches its own place.
export const fieldUniforms = { uCanopy: { value: 0 }, uPlantWind: { value: 0 }, uPlantHeight: { value: 1 } }

// The state of the plant's skin: 0 to 1 each.
export const stateUniforms = { uPlantWet: { value: 0 }, uPlantFrost: { value: 0 }, uPlantDew: { value: 0 } }

// Every vertex of a part goes through plantWorld, so that the same part stands as the plant, as the companion and as each neighbor.
export const plantVertexGlsl = /* glsl */ `
#ifdef PLANT_FIELD
in vec4 aPlace;
in vec4 aVary;
uniform float uPlantWind;
uniform float uPlantHeight;
${swayGlsl}
// How far the wind carries a point of a neighbor sideways, in meters: the same bend the plant's own stem takes, from 0.3 of its height up.
vec2 plantBlow(vec2 at, float y, float size) {
  if (uPlantWind <= 0.0) return vec2(0.0);
  float tall = max(uPlantHeight * size, 0.001);
  float k = clamp((y / tall - 0.3) / 0.7, 0.0, 1.0);
  float lean = uPlantWind * (${STEM_LEAN.toFixed(4)} + ${STEM_SWING.toFixed(4)} * plantSway(uTime + uShutter * ${SHUTTER_SECONDS.toFixed(6)}, at));
  return vec2(${windToward.x.toFixed(4)}, ${windToward.z.toFixed(4)}) * (lean * tall * 0.7 * (k * k * k - 0.5 * k * k * k * k));
}
#endif
out float vPlantTone;

vec3 plantWorld(vec3 local) {
#ifdef PLANT_FIELD
  float c = cos(aPlace.z);
  float s = sin(aPlace.z);
  vec3 p = local * aPlace.w;
  p.xz += aVary.xy * p.y;
  vPlantTone = aVary.z;
  vec2 blow = plantBlow(aPlace.xy, p.y, aPlace.w);
  return vec3(c * p.x + s * p.z + aPlace.x + blow.x, p.y, c * p.z - s * p.x + aPlace.y + blow.y);
#else
  vPlantTone = 0.5;
  return (modelMatrix * vec4(local, 1.0)).xyz;
#endif
}

vec3 plantDirection(vec3 d) {
#ifdef PLANT_FIELD
  float c = cos(aPlace.z);
  float s = sin(aPlace.z);
  return vec3(c * d.x + s * d.z, d.y, c * d.z - s * d.x);
#else
  return normalize(mat3(modelMatrix) * d);
#endif
}

float plantSize() {
#ifdef PLANT_FIELD
  return aPlace.w;
#else
  return length(modelMatrix[0].xyz);
#endif
}
`

export const plantFragmentGlsl = /* glsl */ `
in float vPlantTone;
uniform float uPlantWet;
uniform float uPlantFrost;
uniform float uPlantDew;
#ifdef PLANT_FIELD
uniform float uCanopy;
#endif

// How much of the sun reaches a point, 0 to 1. offsetDir is the surface normal on the lit side.
float plantSun(vec3 world, vec3 offsetDir) {
#ifdef PLANT_FIELD
  // The sun crosses the field on a slant: a point under the tops is lit through as many meters of leaves as its depth over the sun's height.
  // The tops are uneven in long streaks that run the way the light does.
  vec2 toSun = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  float streak = valueNoise(vec2(dot(world.xz, toSun) * 0.11, (world.x * toSun.y - world.z * toSun.x) * 0.8));
  float under = max(uCanopy * (0.93 + 0.2 * streak) - world.y, 0.0);
  return exp(-1.5 * under / max(uSunDir.y, 0.06));
#else
  return sunShadow(world, offsetDir, uShadowTexelM * 2.5);
#endif
}

// How much of the sky a point sees, 0 to 1.
float plantSky(vec3 world) {
#ifdef PLANT_FIELD
  float under = max(uCanopy * 1.04 - world.y, 0.0);
  return mix(0.1, 1.0, exp(-3.2 * under / max(uCanopy, 0.05)));
#else
  return 1.0;
#endif
}

// A neighbor's own tone, about 0.78 to 1.22. 1 for the plant.
float plantTone() {
  return 0.78 + 0.44 * vPlantTone;
}
`

// A surface for a part. The vertex shader gets plantWorld, plantDirection and plantSize. The fragment shader gets plantSun, plantSky, plantTone and the three skin states.
export function makePartSurface(options: PartOptions, o: SurfaceOptions): Surface {
  const define = options.places ? '#define PLANT_FIELD 1\n' : ''
  return makeSurface({
    ...o,
    vertex: `${define}${plantVertexGlsl}\n${o.vertex}`,
    fragment: `${define}${plantFragmentGlsl}\n${o.fragment}`,
    castShadow: options.places ? false : o.castShadow,
    uniforms: { ...stateUniforms, ...(options.places ? fieldUniforms : {}), ...(o.uniforms ?? {}) },
  })
}

// The geometry of a part: drawn once for the plant, once per neighbor in the field.
export function partGeometry(options: PartOptions): THREE.BufferGeometry {
  if (!options.places) return new THREE.BufferGeometry()
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('aPlace', new THREE.InterleavedBufferAttribute(options.places, 4, 0))
  geometry.setAttribute('aVary', new THREE.InterleavedBufferAttribute(options.places, 4, 4))
  geometry.instanceCount = options.places.count
  return geometry
}

export function partMesh(geometry: THREE.BufferGeometry, surface: Surface): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, surface.main)
  mesh.frustumCulled = false
  mesh.matrixAutoUpdate = false
  return mesh
}
