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
export const fieldUniforms = { uCanopy: { value: 0 }, uClosed: { value: 0 }, uDeep: { value: 0 }, uSquat: { value: 0 }, uHang: { value: 0 }, uWide: { value: 0 }, uLate: { value: 0 }, uMoon: { value: 0 }, uEarly: { value: 0 }, uEdge: { value: new THREE.Vector3(0, 1, 0) }, uPlantWind: { value: 0 }, uPlantHeight: { value: 1 } }

// The state of the plant's skin: 0 to 1 each.
export const stateUniforms = { uPlantWet: { value: 0 }, uPlantFrost: { value: 0 }, uPlantDew: { value: 0 } }

// Every vertex of a part goes through plantWorld, so that the same part stands as the plant, as the companion and as each neighbor.
export const plantVertexGlsl = /* glsl */ `
#ifdef PLANT_FIELD
in vec4 aPlace;
in vec4 aVary;
uniform float uPlantWind;
uniform float uPlantHeight;
uniform vec4 uHeadAt;
uniform float uHeadGrow;
uniform float uSquat;
uniform float uHang;
uniform float uWide;
uniform float uLate;
uniform float uEarly;
uniform vec3 uHeadAxis;
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
  // A short neighbor's head is nearly as large as the plant's own: the head and what touches it are drawn larger about the head's middle.
  vec3 q = local - uHeadAt.xyz;
  local = uHeadAt.xyz + q * mix(1.0, clamp(0.95 / aPlace.w, 1.0, 1.5), uHeadGrow * (1.0 - smoothstep(uHeadAt.w, 1.9 * uHeadAt.w, length(q))));
  // Late in the bloom every head has its own weight: it nods by its own angle and is its own size. The whole of aVary.w is the nod, the rest the size.
  if (uLate > 0.0 && uHeadAt.w > 0.0) {
    float atHead = uLate * (1.0 - smoothstep(uHeadAt.w, 1.9 * uHeadAt.w, length(q)));
    float nod = atHead * floor(aVary.w) * ${(1 / 64).toFixed(6)};
    vec3 k = normalize(cross(vec3(0.0, 1.0, 0.0), uHeadAxis) + vec3(1e-5, 0.0, 0.0));
    q = local - uHeadAt.xyz;
    q = q * cos(nod) + cross(k, q) * sin(nod) + k * (dot(k, q) * (1.0 - cos(nod)));
    local = uHeadAt.xyz + q * mix(1.0, 2.0 * fract(aVary.w), atHead);
  }
  // Before the bloom every bud is its own size: 32 steps above the other three in aVary.w.
  if (uEarly > 0.0 && uHeadAt.w > 0.0) {
    q = local - uHeadAt.xyz;
    local = uHeadAt.xyz + q * mix(1.0, mix(0.8, 2.6, floor(aVary.w / 32768.0) / 31.0), uEarly * (1.0 - smoothstep(uHeadAt.w, 1.9 * uHeadAt.w, length(q))));
  }
  vec3 p = local * aPlace.w;
  p.y = p.y * (1.0 - uSquat) - uHang * max(length(p.xz) - 0.03, 0.0) * (1.0 - 0.85 * smoothstep(0.6, 0.9, local.y / max(uHeadAt.y, 0.01)));
  p.xz *= 1.0 + uWide * smoothstep(0.02, 0.06, length(p.xz));
  // Before the bloom every neighbor has its own stalk, its own leaves and their own droop: 32 steps of each in aVary.w.
  if (uEarly > 0.0 && uHeadAt.w > 0.0) {
    float stalk = mix(0.75, 1.3, mod(aVary.w, 32.0) / 31.0);
    float leaf = mix(0.75, 1.6, mod(floor(aVary.w / 32.0), 32.0) / 31.0);
    float droop = mix(-0.15, 0.6, mod(floor(aVary.w / 1024.0), 32.0) / 31.0);
    float reach = length(p.xz);
    p.y = p.y * mix(1.0, stalk, uEarly) - uEarly * droop * max(reach - 0.03, 0.0) * (1.0 - 0.85 * smoothstep(0.6, 0.9, local.y / max(uHeadAt.y, 0.01)));
    p.xz *= mix(1.0, leaf, uEarly * smoothstep(0.02, 0.06, reach));
  }
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
uniform float uClosed;
uniform float uDeep;
uniform vec3 uEdge;
uniform float uHang;
uniform float uLate;
uniform float uMoon;
#endif

// How much of the sun reaches a point, 0 to 1. offsetDir is the surface normal on the lit side.
float plantSun(vec3 world, vec3 offsetDir) {
#ifdef PLANT_FIELD
  // The low sun reaches the tops of the field, and comes far down in the lanes that happen to lie open toward it.
  vec2 toSun = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  float along = dot(world.xz, toSun);
  float across = world.x * toSun.y - world.z * toSun.x;
  float streak = valueNoise(vec2(along * 0.11, across * 0.8));
  // A picture of a plant is drawn without shadows, and so as a plant outside a lane.
  float lane = uShadowOn * smoothstep(0.64, 0.78, valueNoise(vec2(along * 0.07 + 31.0, across * 1.15 + 7.0)));
  // Late in the bloom the sun is lower still and finds more lanes.
  if (uLate > 0.0) lane = max(lane, uLate * uShadowOn * smoothstep(0.48, 0.68, valueNoise(vec2(along * 0.07 + 31.0, across * 1.15 + 7.0))));
  // One gap toward the sun lights three neighbors of the second row.
  lane = max(lane, uShadowOn * (1.0 - smoothstep(0.3, 0.55, length(world.xz - vec2(0.1, -2.42)))));
  // While the leaves of the young crop hang, they shut most of its lanes.
  lane *= 1.0 - 1.3 * uHang;
  float under = max(uCanopy * (1.07 + 0.12 * streak) - world.y, 0.0) / max(uCanopy, 0.05);
  float closed = uClosed;
  // The tops stand in the long grazing shade of the crop toward the sun: over a third of the sun is left there, and all of it in an open lane.
  float top = mix(0.38, 1.0, lane * smoothstep(0.05, 0.35, under));
  // Below the tops the sun in a lane comes through the leaves in flecks: a piece of a stalk, the edge of a leaf.
  float fleck = smoothstep(0.5, 0.68, valueNoise(vec2(world.y * 6.0 + across * 2.3, along * 1.7 + world.y * 2.0)));
  // Out in the body of the field the grazing sun gets into the upper crop in thin shafts that lie along its rays: a head, an edge, a stretch of stalk is lit.
  float shaft = smoothstep(0.6, 0.78, valueNoise(vec2(across * 5.0 + 3.0, world.y * 7.0 + along * 0.5))) * (1.0 - smoothstep(0.2, 0.45, under)) * smoothstep(9.0, 18.0, length(world.xz));
  float lit = max(mix(1.0, top, closed) * exp(-mix(1.0, mix(12.0, 0.5, lane), closed) * under / (0.6 + uSunDir.y)) * mix(1.0, fleck, closed * smoothstep(0.1, 0.4, under)), closed * shaft);
  // Late in the bloom the lens is over the crop and the sun lower still: it lies along the tops and reaches twice as far down among the leaves.
  if (uLate > 0.0) lit = max(lit, mix(1.0, top + 0.6 * uLate * (1.0 - top), closed) * exp(-mix(1.0, mix(12.0 - 6.0 * uLate, 0.5, lane), closed) * under / (0.6 + uSunDir.y)) * mix(1.0, fleck, closed * smoothstep(0.1, 0.4, under)));
  // The moon stands a quarter of the way up the sky: the tops are in its light, and it dies off down among the leaves.
  if (uMoon > 0.0) lit = mix(lit, exp(-2.5 * under), uMoon);
  return lit;
#else
  return sunShadow(world, offsetDir, uShadowTexelM * 2.5);
#endif
}

// How much of the sky a point sees, 0 to 1.
float plantSky(vec3 world) {
#ifdef PLANT_FIELD
  // The sky comes from above whatever the sun does: a closed crop keeps most of it down to mid height and under half at the floor.
  float under = max(uCanopy * 1.04 - world.y, 0.0) / max(uCanopy, 0.05);
  float closed = uClosed;
  // A crop in bloom stands taller and closer still, and keeps less of the sky.
  float deep = uDeep;
  float sky = mix(mix(1.0, 0.8 - 0.36 * deep, closed), mix(0.8, 0.3 - 0.25 * deep, closed), smoothstep(0.25 - 0.2 * deep, 1.0 - 0.4 * deep, under));
  // The front of the crop stands open to the sky on its own side, from the ground up.
  return max(sky, 0.5 * deep * (1.0 - smoothstep(0.3, 2.2, -dot(world.xz, uEdge.xy) - uEdge.z)));
#else
  return 1.0;
#endif
}

#ifdef PLANT_FIELD
// Inside the crop the neighbors hide the horizon away from the sun: there the fill keeps its strength and takes the color of the sky overhead.
vec3 cropAmbient(vec3 n) {
  vec3 sky = skyAmbient(n);
  vec3 over = uSkyZenith * (dot(sky, vec3(0.3, 0.6, 0.1)) / max(dot(uSkyZenith, vec3(0.3, 0.6, 0.1)), 1e-4));
  float away = 0.5 - 0.5 * dot(n.xz, uSunDir.xz) * inversesqrt(max(dot(n.xz, n.xz) * dot(uSunDir.xz, uSunDir.xz), 1e-4));
  vec3 fill = mix(sky, over * mix(0.55, 2.2, smoothstep(-0.1, 0.9, n.y)), mix(0.6, 1.0, away) * uClosed);
  // Under the moon a neighbor's leaves get the sky the plant's own get, no more.
  if (uMoon > 0.0) fill = mix(fill, sky, uMoon);
  return fill;
}
#define skyAmbient(n) cropAmbient(n)
#endif

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
