import { config } from '../config.ts'
import { sunAzimuthAt } from '../v2/sun.ts'
import { clodClearM, clodGlsl, clodSlopeMost } from './clods.ts'
import { grassCover, stemFoot, turfCover } from './cover.ts'
import { reliefRadiusM } from './geometry.ts'
import { cropLight } from './light.ts'

// The soil's tile is the scan's own size on the ground. Its mean color and the depth of its relief come from the recipe.
export const soilTileM = 1.3
export const soilMeanLuma = 0.1413
export const soilMean = [0.2, 0.1261, 0.0603]
export const soilReliefM = 0.0249
export const clodReliefM = 0.016
export const clodScale = 3.2
export const detailScale = 13
export const litterTileM = 2.9
export const ridgeHeightM = 0.07

// The plant breaking the surface: the soil round the stem lifts over riseS seconds into plates of this height and reach, split by this many cracks.
// The way to the camera of the dawn shots, which stays low over the soil: nothing in it stands taller than a crumb.
const LANE = (config.camera.keys[0].azimuthDeg * Math.PI) / 180
export const laneDir = { x: Math.sin(LANE), z: Math.cos(LANE) }

// The way to the sun of the dawn, which stands a few degrees over the soil: the ground lies low along it, so its light reaches the plant's foot.
const SUNWAY = (sunAzimuthAt(0) * Math.PI) / 180
export const sunWayDir = { x: Math.sin(SUNWAY), z: Math.cos(SUNWAY) }
export const sunWayRise = Math.tan(Math.PI / 180)

// Marks on the plant's own clock. Through the first days the soil keeps the look of the first dawn; the stem thickens and pushes the soil round its foot; the damp crust dries out before the bud; the turf closes before the crane.
export const soilClock = { firstDays: [6, 8.75], thickens: [8, 20], footFrom: 2, crust: [config.growth.bud - 7, config.growth.bud - 3.5], turf: [config.growth.bud + 1.5, config.growth.crane] }
export const MATT_EASE_S = soilClock.crust[1] - soilClock.crust[0]
export const emergence = { riseS: 2.3, liftM: 0.0075, radiusM: 0.025, cracks: 5 }
// The seed heaves hardest as the film opens: this share of the lift comes in a first push that starts leadS before the film and is spent after pushS, the rest eases over the whole rise from restLeadS before the film.
export const heave = { push: 0.3, leadS: 0.05, pushS: 0.45, restLeadS: 0.8 }
export const heaveAt = (time: number): number => {
  const v = 1 - Math.min(1, Math.max(0, (time + heave.leadS) / (heave.pushS + heave.leadS)))
  return heave.push * (1 - v * v) + (1 - heave.push) * step(-heave.restLeadS, emergence.riseS, time)
}
// The one cleft the seed opens over itself as the film starts, in the loose crumbs only: the land under them does not move. It runs toward the lens and a little toward the sun (turn, as a slope), so the lens looks along it and the sun skims its left lip: this long each way from its middle, which lies aheadM toward the lens, the crumbs this far aside to each lip at the first frame and at openS, winding by windM. The sun reaches lipM into its left lip. Only the crumbs within reachM of it (none beyond two and a half times that) stand aside, and the cleft widens at one even speed, so the bed beside it lies still. To the left of the stem, where the seed coat comes up, it widens into a bay bayM deep and bayLenM long each way, clear from the first frame. The crumbs within footM of the stem (fully out at three times that) fall back in from footS, those of the bay between bayFromS and bayToS when the seed coat has left the ground, the others one by one from fillS, and at shutS the cleft is gone.
export const crack = { halfLenM: 0.024, aheadM: 0.006, turn: 0.07, fromM: 0.003, toM: 0.0058, openS: 0.4, windM: 0.0012, lipM: 0.006, footM: 0.004, footS: 0.3, fillS: 0.5, shutS: 1.3, fallS: 0.2, reachM: 0.004, bayM: 0.008, bayLenM: 0.006, bayFromS: 0.85, bayToS: 1.1 }
// The hole the stem leaves: it opens over these seconds to this radius and depth, and the dome that stood there before is this high. Inside flatM the bare soil carries no relief of the map, only the break. Toward the dawn lens and toward its sun the plates lift this much less, so the hole is seen and lit.
export const hole = { fromS: 0.1, toS: 1.5, radiusM: 0.0085, depthM: 0.0035, domeM: 0.002, flatM: 0.02, wayOpen: 0.7 }

// The furrow the rain fills beside the plant, a shallow hollow where its water gathers. Along the field's own axes (across the rows, and away from the field), in meters from the plant: its middle lies leftM to the left of the plant and drifts by slope for each meter away from the lens, winding by windM, from fromM toward the lens to toM behind the plant, where it closes round.
// halfM is half the width of the standing water at each of the places atM along it, and the shore wanders by wanderM. The floor lies depthM under the mean ground and rises over easeM beyond the water's edge; the banks stand bankM over the ground and stay off the plant within clearM. Until fromS the furrow has only the share before of its depth, and all of it by toS.
export const furrow = { leftM: 0.1, slope: 0.18, fromM: -0.75, toM: 0.25, atM: [-0.6, -0.3, 0, 0.25], halfM: [0.055, 0.05, 0.04, 0.02], depthM: 0.0155, bankM: 0.006, easeM: 0.05, wanderM: 0.012, windM: 0.015, clearM: 0.03 }
// As the stem thickens in the rain it heaps the mud round its foot: this high at the stem, reaching this far, risen while the furrow is cut and settled again before the bloom.
export const collar = { heightM: 0.004, reachM: 0.013, fromS: 8.5, toS: 13 }
const collarAt = (x: number, z: number, time: number): number => {
  const k = step(collar.fromS, collar.toS, time) * (1 - step(soilClock.crust[0], soilClock.crust[1], time))
  if (k <= 0) return 0
  const a = Math.atan2(z, x)
  const reach = collar.reachM * (1 + 0.25 * Math.sin(a * 3 + 1.3) + 0.15 * Math.sin(a * 7 + 4))
  return k * collar.heightM * Math.exp(-(x * x + z * z) / (reach * reach))
}
// How far along the floor's slope a level is met, from 0 at the floor to 1 at the mean ground.
export const furrowShare = (levelM: number, depthM: number = furrow.depthM): number => {
  const want = 1 - Math.min(1, Math.max(0, -levelM / depthM))
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const u = (lo + hi) / 2
    if (u * u * (3 - 2 * u) < want) lo = u
    else hi = u
  }
  return lo
}

function hashU(x: number): number {
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d)
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b)
  x ^= x >>> 16
  return x >>> 0
}
const bits = new Float32Array(1)
const asInt = new Uint32Array(bits.buffer)
function hash11(p: number): number {
  bits[0] = p
  return hashU(asInt[0]) / 4294967296
}
const step = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// The height of the bare soil round the stem, in meters, with the plant at the origin: what the shader below draws within hole.flatM of the stem. Farther out the map adds its relief, which this does not know, and the loose crumbs lie on top of it everywhere.
export function soilHeightAt(x: number, z: number, time: number): number {
  const e = emergence
  const r = Math.hypot(x, z)
  const heap = collarAt(x, z, time)
  if (r > e.radiusM * 1.7) return heap
  const rise = heaveAt(time) * (1 - 0.3 * step(e.riseS, e.riseS + 5, time))
  const a = Math.atan2(z, x)
  const s = (a * e.cracks) / 6.2832 + 0.07 * Math.sin(r * 420 + a * 2) + 0.05 * Math.sin(r * 1300)
  const id = ((Math.floor(s) % e.cracks) + e.cracks) % e.cracks
  const f = s - Math.floor(s)
  const reach = 1 - step(e.radiusM * 0.25, e.radiusM * (1.1 + 0.5 * hash11(id + 11)), r)
  const toCrack = ((Math.min(f, 1 - f) * 6.2832) / e.cracks) * r
  const crackIn = (1 - step(0, 0.0003 + 0.0016 * rise * reach, toCrack)) * reach * rise
  const open = step(hole.fromS, hole.toS, time)
  const radius = hole.radiusM * (0.18 + 0.82 * open)
  const gap = 1 - step(0.3 * radius, radius, r)
  const along = x * laneDir.x + z * laneDir.z
  const across = Math.abs(x * laneDir.z - z * laneDir.x)
  const way = Math.max(step(0.002, 0.012, along) * (1 - step(0.012, 0.03, across)), step(0.004, 0.016, x * sunWayDir.x + z * sunWayDir.z))
  const plate = (0.5 + 0.5 * hash11(id + 3)) * reach * (1 - 0.75 * gap) * (1 - hole.wayOpen * way)
  return e.liftM * rise * (plate - 0.6 * crackIn * plate) + hole.domeM * (1 - open) * (1 - step(0.003, 0.008, r)) - hole.depthM * open * (1 - step(0.25 * hole.radiusM, hole.radiusM, r)) + heap
}

export const crackShape = /* glsl */ `uniform vec4 uCrack;
uniform vec4 uCrackCut;
uniform vec4 uCrackWay;
float crackLine(vec2 p) {
  float s = dot(p, uLane);
  return p.x * uLane.y - p.y * uLane.x + uCrackWay.y * s - uCrackCut.y * (sin(s * 310.0) + 0.4 * sin(s * 890.0));
}
float crackSpan(vec2 p) {
  if (uTime >= uCrackCut.z) return 0.0;
  return 1.0 - smoothstep(0.35 * uCrack.x, uCrack.x, abs(dot(p, uLane) - uCrackWay.x));
}
uniform vec4 uCrackBay;
float crackBay(vec2 p, float line) {
  float s = dot(p, uLane) / uCrackBay.y;
  return line < 0.0 ? exp(-s * s) : 0.0;
}
float crackOpen() {
  return uCrack.y + (uCrack.z - uCrack.y) * clamp(uTime / max(uCrack.w, 1e-4), 0.0, 1.0);
}
float crackFill(vec2 p, float seed, float bay) {
  float from = mix(uCrackWay.z, uCrackWay.w + (uCrackCut.z - uCrackWay.w - ${crack.fallS}) * seed, smoothstep(uCrackCut.x, 3.0 * uCrackCut.x, length(p)));
  from = mix(from, uCrackBay.z + (uCrackBay.w - uCrackBay.z) * seed, smoothstep(0.2, 0.5, bay));
  return smoothstep(from, from + ${crack.fallS}, uTime);
}
float cracked(vec2 p) {
  float line = crackLine(p);
  float bay = crackBay(p, line);
  float h = (crackOpen() + uCrackBay.x * bay) * crackSpan(p) * (1.0 - crackFill(p, 0.6, bay));
  return h <= 0.0 ? 0.0 : 1.0 - smoothstep(0.5 * h, h + 0.0005, abs(line));
}`

// The height of the near ground, shared by its surface and by everything that sits on it.
export const soilHeight = /* glsl */ `
uniform sampler2D tData;
uniform vec3 uTiles;
uniform vec4 uNear;
uniform vec4 uRelief;
uniform vec2 uLane;
const mat2 TURN_C = mat2(0.891, 0.454, -0.454, 0.891);
const mat2 TURN_M = mat2(0.208, 0.978, -0.978, 0.208);
float nearFade(vec2 p) {
  return 1.0 - smoothstep(uNear.x, uNear.y, length(p));
}
float soilLod(vec2 p) {
  return max(0.0, log2(length(p) * uNear.z / uNear.w));
}
float lane(vec2 p) {
  float along = dot(p, uLane);
  float across = abs(p.x * uLane.y - p.y * uLane.x);
  return (1.0 - smoothstep(0.012 + 0.1 * along, 0.03 + 0.22 * along, across)) * smoothstep(0.0, 0.03, along) * (1.0 - smoothstep(0.35, 0.7, along));
}
uniform vec2 uSunWay;
float sunWay(vec2 p) {
  float along = dot(p, uSunWay);
  float across = abs(p.x * uSunWay.y - p.y * uSunWay.x);
  return (1.0 - smoothstep(0.02 + 0.15 * along, 0.05 + 0.35 * along, across)) * smoothstep(0.01, 0.05, along) * (1.0 - smoothstep(0.45, 0.9, along));
}
uniform vec4 uFurrow;
uniform vec4 uFurrowAxes;
uniform vec4 uFurrowAt;
uniform vec4 uFurrowHalf;
uniform vec4 uFurrowShape;
uniform vec4 uFurrowShore;
// The height the furrow adds: under the mean ground along its middle, a little over it on its banks.
float furrow(vec2 p) {
  float a = dot(p, uFurrowAxes.xy);
  float d = -dot(p, uFurrowAxes.zw);
  float dc = clamp(d, uFurrow.z, uFurrow.w);
  float side = a + uFurrow.x - uFurrow.y * dc - uFurrowShape.z * sin(dc * 13.0 + 1.0);
  vec3 part = saturate((vec3(dc) - uFurrowAt.xyz) / (uFurrowAt.yzw - uFurrowAt.xyz));
  float wide = uFurrowHalf.x + dot(part, uFurrowHalf.yzw - uFurrowHalf.xyz);
  wide += uFurrowShore.z * (sin(d * 47.0 + side * 31.0) + 0.6 * sin(d * 83.0 - side * 59.0 + 2.1)) * smoothstep(0.0, 0.02, wide - 0.015);
  float s = length(vec2(side, d - dc));
  if (s > wide + uFurrowShore.w) return 0.0;
  float bed = 1.0 - smoothstep(wide - uFurrowShore.x, wide + uFurrowShore.y, s);
  float bank = smoothstep(wide, wide + uFurrowShore.y, s) * (1.0 - smoothstep(wide + uFurrowShore.y, wide + uFurrowShore.w, s)) * smoothstep(uFurrowShape.w, uFurrowShape.w * 2.0, length(p)) * (1.0 - lane(p));
  return bank * uFurrowShape.y - bed * uFurrowShape.x;
}
float clodShape(float c) {
  return smoothstep(0.3, 0.62, c) - 0.5;
}
uniform vec4 uEmerge;
uniform vec4 uHole;
uniform vec3 uDome;
float heaved() {
  float a = 1.0 - clamp((uTime + ${heave.leadS}) / ${heave.pushS + heave.leadS}, 0.0, 1.0);
  return ${heave.push} * (1.0 - a * a) + ${1 - heave.push} * smoothstep(-${heave.restLeadS}, uEmerge.x, uTime);
}
${crackShape}
// x is the height the breaking soil adds, y how deep inside a crack the point is, from 0 to 1.
vec2 emerge(vec2 p) {
  float r = length(p);
  if (r > uEmerge.z * 1.7) return vec2(0.0);
  float rise = heaved() * (1.0 - 0.3 * smoothstep(uEmerge.x, uEmerge.x + 5.0, uTime));
  float a = atan(p.y, p.x);
  float s = a * uEmerge.w / 6.2832 + 0.07 * sin(r * 420.0 + a * 2.0) + 0.05 * sin(r * 1300.0);
  float id = mod(floor(s), uEmerge.w);
  float f = fract(s);
  float reach = 1.0 - smoothstep(uEmerge.z * 0.25, uEmerge.z * (1.1 + 0.5 * hash11(id + 11.0)), r);
  float toCrack = min(f, 1.0 - f) * 6.2832 / uEmerge.w * r;
  float crack = (1.0 - smoothstep(0.0, 0.0003 + 0.0016 * rise * reach, toCrack)) * reach * rise;
  float open = smoothstep(uHole.x, uHole.y, uTime);
  float radius = uHole.z * (0.18 + 0.82 * open);
  float gap = 1.0 - smoothstep(0.3 * radius, radius, r);
  float way = max(smoothstep(0.002, 0.012, dot(p, uLane)) * (1.0 - smoothstep(0.012, 0.03, abs(p.x * uLane.y - p.y * uLane.x))), smoothstep(0.004, 0.016, dot(p, uSunWay)));
  float plate = (0.5 + 0.5 * hash11(id + 3.0)) * reach * (1.0 - 0.75 * gap) * (1.0 - uDome.z * way);
  float h = uEmerge.y * rise * (plate - 0.6 * crack * plate) + uDome.x * (1.0 - open) * (1.0 - smoothstep(0.003, 0.008, r)) - uHole.w * open * (1.0 - smoothstep(0.25 * uHole.z, uHole.z, r));
  float cut = cracked(p);
  return vec2(h, max(max(crack, 0.5 * gap * gap * rise), cut));
}
float collar(vec2 p) {
  float k = smoothstep(${collar.fromS.toFixed(1)}, ${collar.toS.toFixed(1)}, uTime) * (1.0 - smoothstep(${soilClock.crust[0].toFixed(1)}, ${soilClock.crust[1].toFixed(1)}, uTime));
  if (k <= 0.0) return 0.0;
  float a = atan(p.y, p.x);
  float reach = ${collar.reachM} * (1.0 + 0.25 * sin(a * 3.0 + 1.3) + 0.15 * sin(a * 7.0 + 4.0));
  return k * ${collar.heightM} * exp(-dot(p, p) / (reach * reach));
}
${clodGlsl}
uniform float uClodLod;
// Where the clods stand: not on the stem's own ground, low along the way to the first lens and the first sun, and worn down in the furrow's bed.
float clodStand(vec2 p) {
  float r = length(p);
  return smoothstep(${clodClearM[0]}, ${clodClearM[1]}, r) * (1.0 - 0.6 * lane(p) * (1.0 - smoothstep(0.2, 0.45, r))) * (1.0 - 0.85 * sunWay(p) * (1.0 - smoothstep(0.3, 0.7, r)));
}
float soilHeight(vec2 p, float lod) {
  float fine = textureLod(tData, p * uTiles.x, lod).a - 0.55;
  float mid = textureLod(tData, TURN_M * p * uRelief.z * 3.7 + vec2(0.71, 0.33), lod + 1.9).a - 0.55;
  float clod = clodShape(textureLod(tData, TURN_C * p * uRelief.z + vec2(0.5, 0.2), max(lod - 1.6, 0.0)).a);
  float foot = 1.0 - smoothstep(uDome.y, uDome.y * 1.7, length(p));
  float dug = furrow(p);
  float lumps = clodRise(p, max(lod + uClodLod, 0.0)) * clodStand(p) * (1.0 - 0.7 * saturate(-dug / uFurrowShape.x));
  return (fine * uRelief.x + mid * uRelief.x * 0.3 + clod * uRelief.y + lumps) * nearFade(p) * (1.0 - 0.4 * lane(p)) * (1.0 - 0.85 * sunWay(p)) * (1.0 - foot) + emerge(p).x + dug * nearFade(p) + collar(p);
}
`

// With its gloss gone, damp soil under dew takes this much more of the cool sky as plain light.
export const dampFill = [1, 1.12, 1.1]
export const dayEarth = [0.22, 0.22, 0.22]
export const humus = [0.88, 1.04, 1.7]
export const cropFar = [0.05, 0.04, 0.012]
export const dawnSky = [0.85, 0.78, 0.66]
export const dewShade = [0.6, 0.54, 1.18]
// The states of the ground, shared with whatever lies on it: where water stands and where frost settles.
// Water stands below waterLevel, in meters from the mean ground, and that level climbs as the ground gets wetter. Frost takes the high open soil first.
export const waterLevelsM = [-0.03, -0.0075]
export const groundStates = /* glsl */ `
uniform vec2 uWater;
uniform float uCast;
// Where the true sun stands over the horizon, as a direction on the ground, and how low it is: 1 at the horizon, 0 from 27 degrees up and in the night. It follows the sun under the horizon, so nothing steps when the light changes hands.
uniform vec3 uLowSun;
// The air: wind, lightning, the sun bursting through, cold.
uniform vec4 uAir;
float waterLevel(float wet) {
  return mix(uWater.x, uWater.y, wet);
}
float pooled(float heightM, float wet) {
  return wet * smoothstep(0.0, 0.003, waterLevel(wet) - heightM);
}
uniform float uDay;
const vec3 DAY_EARTH = vec3(${dayEarth.join(', ')});
const vec3 HUMUS = vec3(${humus.join(', ')});
const vec3 CROP_FAR = vec3(${cropFar.join(', ')});
vec3 dampened(vec3 base, float damp) {
  vec3 albedo = base * HUMUS * mix(vec3(1.0), DAY_EARTH, max(uDay, 0.7 * smoothstep(${soilClock.crust[0].toFixed(1)}, ${soilClock.crust[1].toFixed(1)}, uTime)) * (1.0 - smoothstep(0.1, 0.8, damp)));
  float luma = dot(albedo, vec3(0.3, 0.6, 0.1));
  return mix(albedo, mix(albedo, vec3(luma) * vec3(0.85, 1.1, 1.0), 0.9) * mix(0.3, 0.07, damp * damp * damp * damp), damp);
}
// The young plant stands in damp matt soil, which crusts and dries as the bud nears.
float soilMatt() {
  return 1.0 - smoothstep(${soilClock.crust[0].toFixed(1)}, ${soilClock.crust[1].toFixed(1)}, uTime);
}
// The dawn alone: under its dew the soil gives back less of the sky and less of its blue, so it stays a warm black beside the sun's own light.
float dawnOnly() {
  return 1.0 - smoothstep(${soilClock.firstDays[0].toFixed(2)}, ${soilClock.firstDays[1].toFixed(2)}, uTime);
}
const vec3 DAWN_SKY = vec3(${dawnSky.join(', ')});
// The stem stands in its own shade: the soil round its foot is dark, in a ring that widens as the stem thickens.
float footShade(vec2 p, float dull) {
  float reach = mix(0.006, 0.014, smoothstep(${soilClock.footFrom.toFixed(1)}, ${soilClock.thickens[1].toFixed(1)}, uTime));
  return 1.0 - 0.7 * dull * exp(-dot(p, p) / (reach * reach));
}
float sheen(float wet, float dew) {
  return max(wet * wet, 0.35 * dew);
}
// The sky's light on a face. When the sun is low its glow fills only its own side of the horizon, so faces turned away from it get the cool sky overhead.
uniform float uBlueHour;
vec3 groundAmbient(vec3 n) {
  float away = saturate(0.6 - dot(n.xz, uLowSun.xy)) * uLowSun.z;
  return mix(mix(skyAmbient(n), skyAmbient(vec3(0.0, 1.0, 0.0)) * vec3(1.1, 1.5, 2.1), 0.8 * uBlueHour), skyAmbient(vec3(0.0, 1.0, 0.0)) * mix(vec3(0.9, 1.45, 0.9), vec3(0.66, 1.1, 1.32), uAir.w) * 1.3, 0.95 * away);
}
// Under a low sun, soil standing proud of the ground is open to the whole bright sky, and what lies low between the lumps sees little of it.
uniform float uDusk;
uniform float uMirror;
vec3 proud(float heightM, float dew) {
  return mix(vec3(1.0), mix(vec3(0.85), mix(mix(vec3(2.1, 1.65, 1.8), vec3(1.6, 1.35, 1.5), dew), vec3(0.95, 1.05, 1.3), uDusk), smoothstep(-0.002, 0.012, heightM)), uLowSun.z);
}
// Moist grains along a rim throw the sun at the lens when it stands behind them. A grain is half a millimeter across, and from far off about three pixels, so damp soil keeps its glints at any distance.
float grains(vec3 world, float share) {
  float l = log2(max(sqrt(length(dFdx(world)) * length(dFdy(world))) * 3.0, 0.0005));
  vec3 a = world * exp2(-floor(l));
  vec3 b = a * 0.5;
  float ha = hash31(floor(a));
  float hb = hash31(floor(b));
  float fine = step(1.0 - share, ha) * smoothstep(0.42, 0.15, length(fract(a) - 0.5 - 0.3 * (fract(ha * vec3(13.7, 57.3, 91.1)) - 0.5)));
  float coarse = step(1.0 - share, hb) * smoothstep(0.42, 0.15, length(fract(b) - 0.5 - 0.3 * (fract(hb * vec3(13.7, 57.3, 91.1)) - 0.5)));
  return mix(fine, coarse, fract(l));
}
float sparkle(vec3 world, vec3 v, vec3 n) {
  float skim = 1.0 - max(dot(n, v), 0.0);
  return grains(world, 0.38) * skim * skim * smoothstep(0.3, -0.5, dot(v, uSunDir)) * uLowSun.z;
}
// The sky as it draws itself, for whatever shows its mirror image.
vec3 skyImage(vec3 d) {
  return mix(uAirHorizon, uAirZenith, smoothstep(0.1, 1.0, d.y));
}
// Before the sun is up, dewy soil is a dark mirror of the dusk above it: this is all that tells one crumb from the next.
vec3 duskSheen(vec3 world, vec3 v, vec3 n) {
  float skim = 1.0 - saturate(dot(n, v));
  return mix(skyImage(reflect(-v, n)), uAirZenith, 0.7) * (uDusk * uDew * (0.02 + 0.17 * skim * skim) * smoothstep(-0.2, 0.3, n.y) * (0.25 + 2.5 * grains(world + 0.3, 0.12)));
}
// Before sunrise and after sunset the glow on the horizon is the only light with a direction: faces turned to it take its colour, edges seen against it rim, and dew points throw it at the lens.
vec3 afterglow() {
  float most = max(max(uSkyHorizonSun.r, uSkyHorizonSun.g), max(uSkyHorizonSun.b, 1e-3));
  return uSkyHorizonSun * (min(most, 2.0) / most * uDusk * (1.0 - uAir.w));
}
vec3 duskGlow(vec3 world, vec3 v, vec3 n, vec3 albedo, float edge) {
  vec3 l = normalize(vec3(uLowSun.x, 0.22, uLowSun.y));
  float facing = smoothstep(0.1, 0.7, dot(n, l));
  float lying = smoothstep(0.0, 0.6, dot(n, l));
  float skim = 1.0 - saturate(dot(n, v));
  float rim = smoothstep(-0.2, 0.5, dot(n, l)) * skim * skim * skim * saturate(0.4 - dot(v, l)) * edge;
  float points = grains(world + 0.53, 0.05) * pow(saturate(dot(reflect(-v, n), l)), 16.0) * uDew;
  float round = exp(-dot(world.xz, world.xz) / 0.05);
  return afterglow() * (albedo * (mix(0.3, 0.03, uDew) * lying + 0.12 * facing * round * edge) + (0.08 * rim + 0.6 * points) * round);
}
// Wet grains each mirror the bright sky low over the horizon.
vec3 wetGlints(vec3 world, vec3 v, vec3 n, float wet) {
  float skim = 1.0 - max(dot(n, v), 0.0);
  return uAirHorizon * (grains(world + 0.37, 0.16) * wet * wet * (0.15 + 0.85 * skim) * mix(0.9, 0.5, smoothstep(0.3, 1.0, wet)));
}
// A wet shoulder mirrors the sky it faces as one soft sheen, strongest where the lens skims it.
vec3 wetSheen(vec3 v, vec3 n, float wet) {
  float skim = 1.0 - max(dot(n, v), 0.0);
  return skyImage(reflect(-v, n)) * (smoothstep(0.3, 1.0, wet) * (0.03 + 0.97 * skim * skim * skim) * 0.09);
}
// How strongly a damp surface throws the sun back: several times more when the light skims it toward the lens.
float glare(vec3 v, vec3 hv) {
  float skim = 1.0 - saturate(dot(v, hv));
  return 0.8 + 5.5 * skim * skim * skim * skim;
}
// With the sun lower than about a degree and a half the far field hides it from all the low soil, and the shadow map cannot tell one crumb from the next: then the sun reaches only the upper side of what stands up out of the ground.
float lowSun(float mapped, float up, float heightM) {
  float low = 1.0 - smoothstep(0.02, 0.035, uSunDir.y);
  return mix(mapped, smoothstep(0.05, 0.7, up) * smoothstep(-0.003, 0.006, heightM), low);
}
// Damp soil seen low against a low sun mirrors the glow of the sky round it. From close the crumbs each face their own way and break the mirror; farther off they run together into one warm sheen.
vec3 sunGlow(vec3 world, vec3 v, vec3 n, float dew) {
  float low = 1.0 - smoothstep(0.02, 0.035, uSunDir.y);
  vec3 r = reflect(-v, n);
  float toSun = saturate(dot(normalize(r.xz + vec2(1e-5, 0.0)), normalize(uSunDir.xz + vec2(1e-5, 0.0))));
  float skim = 1.0 - max(v.y, 0.0);
  float far = smoothstep(0.14, 0.5, length(uCamPos - world));
  return uAirSun * (low * dew * pow(toSun, 48.0) * pow(skim, 16.0) * far * 0.1);
}
// Until the film lets the ground cast shadows, a low sun's glints are held back, as most of the soil would lie in the shade of its own crumbs.
float selfShade() {
  return mix(1.0, 0.3, (1.0 - uCast) * uLowSun.z);
}
float frosted(float h, float under) {
  return smoothstep(0.45, 0.8, h) * (1.0 - 0.7 * under);
}
// Hoar frost melts first where the sun lies on it: what is left of it on a face that takes this much sun.
float frostKept(float frost, float sunny) {
  float from = 0.7 * sunny;
  return smoothstep(from, from + 0.3, frost);
}
const vec3 FROST_WHITE = vec3(0.6, 0.62, 0.66);
// The lightning's light on the ground at its full strength, and how many times brighter the wet soil throws the sun back when it bursts through the deck.
const vec3 FLASH_LIGHT = vec3(1.6, 1.9, 2.6);
uniform vec3 uFlashAt;
const float WET_MIRROR = 0.8;
vec3 wetSky(vec3 v, vec3 n) {
  vec3 r = reflect(-v, n);
  return skyImage(r) * (WET_MIRROR * (0.03 + 0.97 * pow(1.0 - saturate(dot(n, v)), 3.0)) * smoothstep(-0.05, 0.2, r.y));
}
// What water adds to a soaked face: the sky it mirrors, the sun thrown at the lens, and the lightning. Only where water lies as a film (lying, 0 to 1: the low places) is it one mirror; on the crumbs' tops it is single wet grains.
vec3 wetAnswer(vec3 world, vec3 v, vec3 n, float soaked, float lit, float lying) {
  vec3 r = reflect(-v, n);
  float fres = 0.03 + 0.97 * pow(1.0 - saturate(dot(n, v)), 3.0);
  vec3 sky = wetSky(v, n) * (0.9 * lying + 2.2 * grains(world + 0.11, 0.1));
  vec3 hs = normalize(v + uSunDir);
  float off = 1.0 - saturate(dot(n, hs));
  vec3 sun = uAirSun * uMirror * ((2.0 * exp(-off / 0.006) + 0.1 * exp(-off / 0.1) + 1.5 * grains(world + 0.37, 0.3 * exp(-off / 0.05))) * lit);
  vec3 hf = normalize(v + uFlashAt);
  vec3 flash = FLASH_LIGHT * (uAir.y * ((0.8 * pow(saturate(dot(n, hf)), 30.0) + 0.16 * fres) * (lying + 1.5 * grains(world + 0.11, 0.1))));
  return (sky + sun + flash) * soaked;
}
// The lightning is in the key, and soil faces must stay dark under it: this much of the key reaches a soaked face while it strikes.
float underFlash(float soaked) {
  return 1.0 - 0.8 * uAir.y * soaked;
}
// The low sun's own warm light as single frost crystals throw it at the lens, at a strength that does not depend on how bright the sky draws its glow.
vec3 warmGlint() {
  float most = max(max(uSkyHorizonSun.r, uSkyHorizonSun.g), max(uSkyHorizonSun.b, 1e-3));
  return uSkyHorizonSun * (min(most, 1.6) / most) * vec3(1.15, 0.95, 0.7);
}
// Frozen soil is darker and greyer than the same soil thawed.
vec3 frozen(vec3 albedo, float frost) {
  return mix(albedo, dot(albedo, vec3(0.3, 0.6, 0.1)) * vec3(0.5, 0.74, 0.9), 0.9 * smoothstep(0.0, 0.3, frost));
}
// The hoar grows as crystals on what stands up into the air, never as a coat: the share of white on a place that offers this much of an edge.
float rimed(vec3 world, float sits, float frost, float sunny) {
  return smoothstep(0.0, 0.3, frost) * frostKept(frost, sunny) * smoothstep(0.38, 1.0, sits * (0.45 + 1.1 * grains(world + 3.1, 0.6)));
}
// Under the crystals the soil itself is dusted pale wherever it lies open to the sky, thinner than the hoar and gone sooner as the frost dial falls.
float dusted(vec3 world, float lies, float frost, float sunny) {
  float pixel = sqrt(length(dFdx(world)) * length(dFdy(world)));
  float fine = mix(0.6 * valueNoise(world.xz * 610.0 + world.y * 300.0) + 0.4 * valueNoise(world.zx * 1700.0), 0.5, smoothstep(0.0004, 0.002, pixel));
  return 0.2 * smoothstep(0.25, 0.9, frost) * frostKept(frost, sunny) * smoothstep(0.04, 0.4, lies) * (0.45 + 1.1 * fine * fine);
}
// The crystals each face their own way, and one that throws the sun at the lens flares and dies as the light or the lens moves.
float frostSpark(vec3 world, vec3 n, vec3 v, vec3 l) {
  float size = log2(max(sqrt(length(dFdx(world)) * length(dFdy(world))) * 2.6, 0.0004));
  float whole = floor(size);
  vec3 hv = normalize(v + l);
  float lit = 0.0;
  for (int k = 0; k < 2; k++) {
    float scale = exp2(-(whole + float(k)));
    vec3 cell = floor(world * scale);
    vec3 own = vec3(hash31(cell), hash31(cell + 17.3), hash31(cell + 41.7));
    vec3 facet = normalize(n + 1.3 * (own - 0.5));
    float glint = pow(max(dot(facet, hv), 0.0), 220.0) * smoothstep(0.5, 0.15, length(fract(world * scale) - 0.5));
    glint *= smoothstep(0.25, 0.9, 0.5 + 0.5 * sin(uReal * (1.5 + 5.0 * own.y) + own.z * 40.0));
    lit += glint * (k == 0 ? 1.0 - fract(size) : fract(size));
  }
  return lit;
}
`
// The shadows the clods throw on each other and on the soil between them, found by walking toward the light over the clod map.
// uMarch is the number of steps and how much longer each is than the last.
export const clodShadow = /* glsl */ `
uniform vec2 uMarch;
float clodShade(vec2 p, float h0, float stand, float lodPix) {
  float along = length(uSunDir.xz);
  if (stand <= 0.02 || along < 0.02) return 1.0;
  vec2 dir = uSunDir.xz / along;
  float rise = uSunDir.y / along / (uClods.y * stand);
  float s = 0.0035;
  float shade = 0.0;
  for (int i = 0; i < 16; i++) {
    if (float(i) >= uMarch.x) break;
    float hq = textureLod(tClods, clodUv(p + dir * s), max(lodPix, log2(s * 0.28 * uClods.z))).a;
    shade = max(shade, smoothstep(0.0, 0.05, hq - h0 - s * rise));
    s *= uMarch.y;
  }
  return 1.0 - shade * smoothstep(0.02, 0.2, stand);
}
`

export const soilVertex = /* glsl */ `
in vec3 position;
out vec3 vWorld;
out float vDepth;
#ifdef NEAR
${soilHeight}
#endif
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
#ifdef NEAR
  world.y += soilHeight(world.xz, soilLod(world.xz));
#endif
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

export const soilFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
uniform sampler2D tColor;
uniform sampler2D tLitter;
uniform vec2 uColorSize;
uniform float uWet;
uniform float uFrost;
uniform float uDew;
uniform float uCover;
uniform vec2 uToward;
uniform vec2 uRight;
uniform vec3 uRows;
uniform vec3 uWaterBox;
uniform float uLitter;
uniform vec2 uScales;
uniform vec3 uMeanInv;
${soilHeight}
${groundStates}
${clodShadow}
${cropLight}
${grassCover}
${turfCover}

const vec3 DAMP_FILL = vec3(${dampFill.join(', ')});
const vec3 DEW_SHADE = vec3(${dewShade.join(', ')});
const mat2 TURN_B = mat2(0.788, 0.616, -0.616, 0.788);
const mat2 TURN_W = mat2(0.454, -0.891, 0.891, 0.454);

void main() {
  vec2 p = vWorld.xz;
  float r = length(p);
  float d = -dot(p, uToward);
  vec2 uvA = p * uTiles.x;
  vec4 cA = texture(tColor, uvA);
  vec4 dA = texture(tData, uvA);
  float density = texelDensity(uvA, uColorSize);
  float damp = saturate(uWet + 0.3 * uDew);

#ifdef NEAR
  vec3 albedo = cA.rgb;
  float h = dA.a;
  float rough = dA.b;
  vec2 g = dA.rg * 2.0 - 1.0;
  float fade = nearFade(p);
  vec4 dC = texture(tData, TURN_C * p * uRelief.z + vec2(0.5, 0.2));
  float ct = saturate((dC.a - 0.3) / 0.32);
  vec4 dM = texture(tData, TURN_M * p * uRelief.z * 3.7 + vec2(0.71, 0.33));
  g = g * mix(1.6, uRelief.x * uRelief.w, fade)
    + (dC.rg * 2.0 - 1.0) * TURN_C * (uRelief.y * uRelief.w * uScales.y * 6.0 * ct * (1.0 - ct) / 0.32) * fade
    + (dM.rg * 2.0 - 1.0) * TURN_M * (0.3 * 3.7 * uScales.y) * fade;
  float lump = mix(0.5, smoothstep(0.3, 0.62, dC.a), fade);
  h = mix(h, 0.6 * h + 0.4 * dM.a, fade);
  vec2 uvD = TURN_B * p * (uTiles.x * uScales.x) + vec2(0.37, 0.61);
  float close = 1.0 - smoothstep(1.3, 2.6, density);
  vec4 cD = texture(tColor, uvD);
  vec4 dD = texture(tData, uvD);
  albedo *= mix(vec3(1.0), cD.rgb * uMeanInv, 0.9 * close);
  g += ((dD.rg * 2.0 - 1.0) * TURN_B) * 2.1 * close;
  h += (dD.a - 0.55) * 0.7 * close;
  density = mix(density, texelDensity(uvD, uColorSize), step(0.5, close));
  float big = 0.6 * valueNoise(p * 0.13 + 7.0) + 0.4 * valueNoise(p * 0.037 + 3.0);
  albedo *= mix(0.82, 1.16, big) * mix(0.7, 1.1, lump);
  float rowAmt = 0.0;
  float ridge = 1.0;
  vec2 broken = emerge(p);
  vec2 tilt = g - vec2(emerge(p + vec2(0.0003, 0.0)).x - broken.x, emerge(p + vec2(0.0, 0.0003)).x - broken.x) / 0.0003;
  float heaped = collar(p);
  tilt -= vec2(collar(p + vec2(0.0003, 0.0)) - heaped, collar(p + vec2(0.0, 0.0003)) - heaped) / 0.0003;
  albedo *= 1.0 - 0.2 * broken.y;
  vec2 boxed = abs(vec2(dot(p, uRight), -dot(p, uToward)) - uWaterBox.xy);
  float pool = pooled(vWorld.y, uWet) * fade * smoothstep(0.92, 1.0, max(boxed.x, boxed.y) / uWaterBox.z);
  float top = fade * smoothstep(0.45, 0.8, lump);
  float stand = clodStand(p) * (1.0 - 0.7 * saturate(-furrow(p) / uFurrowShape.x)) * (1.0 - 0.4 * lane(p)) * (1.0 - 0.85 * sunWay(p));
#else
  vec2 uvB = TURN_B * p * (uTiles.x * 0.73) + vec2(0.37, 0.61);
  vec4 cB = texture(tColor, uvB);
  vec4 dB = texture(tData, uvB);
  float beyond = smoothstep(${reliefRadiusM.toFixed(2)}, ${(reliefRadiusM + 0.9).toFixed(2)}, r);
  float w = saturate((valueNoise(p * 1.9 + 31.0) - 0.5) * 3.5 + 0.5 + (dB.a - dA.a) * 1.2) * beyond;
  vec3 albedo = mix(cA.rgb, cB.rgb, w);
  float h = mix(dA.a, dB.a, w);
  float rough = mix(dA.b, dB.b, w);
  vec2 g = mix(dA.rg * 2.0 - 1.0, (dB.rg * 2.0 - 1.0) * TURN_B, w);
  vec3 wide = texture(tColor, TURN_W * p * uTiles.y + vec2(0.13, 0.77)).rgb;
  float tone = dot(wide, vec3(0.3, 0.6, 0.1)) * uTiles.z;
  float big = 0.6 * valueNoise(p * 0.13 + 7.0) + 0.4 * valueNoise(p * 0.037 + 3.0);
  albedo *= mix(1.0, mix(0.7, 1.25, saturate(tone * 0.5)), beyond) * mix(0.82, 1.16, big);

  float along = dot(p, uRight);
  float rowAmt = smoothstep(uRows.y - 0.3, uRows.y + 0.4, d) * beyond;
  float phase = 6.2832 * (along / uRows.x + 0.5 + (valueNoise(vec2(along * 0.4, d * 0.7)) - 0.5) * 0.14);
  float ridge = 0.5 + 0.5 * cos(phase);
  float slope = uRows.z * 3.1416 / uRows.x * sin(phase) * rowAmt;
  float clod = mix(1.0, mix(0.45, 1.15, ridge), rowAmt);
  albedo *= mix(1.0, mix(0.74, 1.07, ridge), rowAmt);
  vec2 tilt = g * 1.6 * clod + uRight * slope;
  vec4 litter = texture(tLitter, TURN_W * p * uLitter + vec2(0.21, 0.43));
  albedo = mix(albedo, litter.rgb, litter.a * smoothstep(0.7, 1.6, d) * beyond * mix(0.45, 1.0, uCover) * mix(1.0, 0.7, ridge));
  float pool = pooled((h - 0.55) * uRelief.x * 0.6 + 0.03 * (valueNoise(p * 2.3 + 5.0) - 0.34) - 0.004 * (1.0 - ridge) * rowAmt, uWet) * beyond;
  float stand = 1.0;
  float top = 0.0;
#endif
  float grazing = 1.0 - smoothstep(0.02, 0.2, normalize(uCamPos - vWorld).y);
  pool *= 1.0 - grazing * (1.0 - 0.3 * smoothstep(0.35, 0.6, valueNoise(p * 19.0 + 9.0)));
  vec2 uvL = clodUv(p);
  vec4 lumpy = texture(tClods, uvL);
  float lodPix = log2(max(max(length(dFdx(uvL)), length(dFdy(uvL))) * uClods.z / uClods.x, 1.0));
  vec2 sleek = 0.3 * tilt - ((textureLod(tClods, uvL, lodPix + 1.5).rg * 2.0 - 1.0) * ${(0.8 * clodSlopeMost).toFixed(1)}) * TURN_L * stand;
  tilt -= ((lumpy.rg * 2.0 - 1.0) * ${clodSlopeMost.toFixed(1)}) * TURN_L * stand;
  float hollow = mix(1.0, smoothstep(-0.1, 0.7, lumpy.b) * (0.3 + 0.7 * smoothstep(0.0, 0.45, lumpy.a)), stand);
  float crest = mix(smoothstep(0.45, 0.8, h), smoothstep(0.3, 0.75, lumpy.a) * smoothstep(0.4, 0.8, lumpy.b), stand * (1.0 - smoothstep(0.0, 3.0, lodPix)));

  vec3 n = normalize(vec3(tilt.x * (1.0 - 0.9 * pool), 1.0, tilt.y * (1.0 - 0.9 * pool)));
  float thatch = grassMask(p, uToward) * grassSeason() * smoothstep(0.12, 0.5, 0.55 * patchy(p * 4.3 + vec2(3.0, 1.0)) + 0.45 * h);
  float under = uCover * smoothstep(0.9, 1.7, d);
  float foot = 1.0;
  float field = fieldOn();
  if (field > 0.0) {
    vec2 tf = turf(p);
    float near = stemNear(p) + 0.03 * (valueNoise(p * 31.0) - 0.5);
    thatch = mix(thatch, smoothstep(-3.5, -2.9, dot(p, uToward)) * grassSeason() * (1.0 - 0.6 * tf.y) * smoothstep(${stemFoot.bareM.toFixed(2)}, ${(0.5 * (stemFoot.bareM + stemFoot.fullM)).toFixed(3)}, near) * smoothstep(0.05, 0.45, 0.5 * tf.x + 0.5 * h), field);
    foot = 1.0 - 0.6 * field * exp(-near * near / ${(stemFoot.shadeM * stemFoot.shadeM).toFixed(4)});
  }
  albedo = dampened(albedo, damp);
#ifndef NEAR
  albedo = mix(albedo, CROP_FAR, uCover * smoothstep(110.0, 200.0, r + 50.0 * (valueNoise(p * 0.02) - 0.5)));
#endif
  float luma = dot(albedo, vec3(0.3, 0.6, 0.1));
  albedo = mix(albedo, mix(vec3(0.03, 0.045, 0.016), vec3(0.045, 0.052, 0.036), field) * (0.5 + 3.0 * luma * uTiles.z * 0.33), 0.92 * thatch);
  albedo *= 1.0 - 0.45 * pool;

  float low = 1.0 - smoothstep(0.05, 0.5, uSunDir.y);
  float ndl = max(dot(n, uSunDir), 0.0);
  float lit = lowSun(sunShadow(vWorld, n, uShadowTexelM * 1.5), 1.0, vWorld.y) * cropLight(p, d) * clodShade(p, lumpy.a + 0.03, stand, lodPix);
  vec4 sc = uShadowMatrix * vec4(vWorld, 1.0);
  float mapped = uCast * uShadowOn * smoothstep(0.0, 0.04, min(min(sc.x, sc.y), min(1.0 - sc.x, 1.0 - sc.y)));
  lit *= mix(1.0, smoothstep(0.38, 0.72, h), low * (1.0 - mapped));
  lit *= mix(1.0, smoothstep(0.4, 0.72, h), low * mapped * soilMatt());
  float sunny = uDay * (1.0 - smoothstep(0.1, 0.8, uWet));
  lit *= mix(1.0, smoothstep(0.3, 0.58, h) * mix(1.0, smoothstep(0.06, 0.38, lumpy.a), stand * (1.0 - smoothstep(0.0, 3.0, lodPix))), 0.9 * sunny);
  albedo *= 1.0 + 0.45 * crest * sunny;
  float open = (0.35 + 0.65 * h) * mix(1.0, 0.72 + 0.28 * ridge, rowAmt) * hollow;
#ifdef NEAR
  open *= mix(1.0, 0.45 + 0.55 * lump, fade) * (1.0 - 0.3 * broken.y);
#endif
  float dull = soilMatt() * (1.0 - uWet);
  float atFoot = footShade(p, dull);
  open *= atFoot;
  lit *= atFoot;
#ifdef NEAR
  lit *= 1.0 - 0.9 * broken.y * dull;
#endif
  open *= 1.0 - 0.35 * thatch;
  open = mix(open, 0.14 + 0.86 * open, uDew);
  lit *= 1.0 - 0.5 * thatch;
  if (field > 0.0) {
    float patchLit = fieldPatch(p, d) * (1.0 - 0.5 * thatch);
    ndl = mix(ndl, max(ndl, 0.15), thatch * smoothstep(0.0, 0.05, patchLit - lit));
    lit = max(lit, patchLit);
    open *= foot * edgeShade(d);
    lit *= foot * edgeShade(d);
  }
  vec3 shade = mix(vec3(1.0), vec3(0.6, 0.57, 0.42), under);
#ifdef NEAR
  shade *= mix(vec3(1.0), proud(vWorld.y, uDew), fade);
#endif
  float kept = frostKept(uFrost, lit * saturate(ndl * 1.8));
  float brow = pow(1.0 - saturate(dot(n, normalize(uCamPos - vWorld))), 2.0) * smoothstep(0.0, 0.5, n.y) * mix(0.3, 1.0, stand);
  float sits = saturate(0.6 * crest + 0.35 * smoothstep(0.5, 0.85, h) * hollow + 0.3 * top + 0.5 * smoothstep(0.006, 0.03, vWorld.y) + 0.7 * brow - 0.1) * (0.3 + 0.7 * smoothstep(0.1, 0.6, n.y)) * (1.0 - 0.7 * under) * (1.0 - 0.5 * thatch) * (1.0 - pool);
  float lies = saturate(sits + 0.22 * hollow * smoothstep(0.08, 0.45, mix(h, lumpy.a, stand)) * (1.0 - 0.7 * under) * (1.0 - pool)) * (1.0 - 0.4 * saturate(2.0 * dot(n.xz, uLowSun.xy)));
  float rime = max(rimed(vWorld, sits, uFrost, lit * saturate(ndl * 1.8)), dusted(vWorld, lies, uFrost, lit * saturate(ndl * 1.8)));
  float thaw = smoothstep(0.0, 0.3, uFrost) * (1.0 - kept) * sits;
  albedo = frozen(albedo, uFrost) * (1.0 - 0.5 * thaw);
  albedo = mix(albedo, FROST_WHITE, 0.85 * rime);
  open = mix(open, max(open, 0.85), rime);
  vec3 color = albedo * (uSunColor * ndl * lit * (1.0 - 0.97 * under) * (1.0 - 0.8 * uDusk * uDew) * underFlash(smoothstep(0.1, 0.8, uWet)) + groundAmbient(n) * open * shade * mix(vec3(1.0), DEW_SHADE, uDew) * mix(vec3(1.0), DAMP_FILL, dull * uDew) * mix(vec3(1.0), DAWN_SKY, dawnOnly() * uDew * (1.0 - uBlueHour)));

  vec3 v = normalize(uCamPos - vWorld);
  vec3 hv = normalize(v + uSunDir);
  float gloss = sheen(max(uWet, 0.8 * thaw), uDew) * (1.0 - rime) * (1.3 - rough) * (1.0 - pool) / (1.0 + 0.7 * max(density - 1.0, 0.0));
  color += uSunColor * pow(max(dot(n, hv), 0.0), mix(24.0, 160.0, uWet)) * gloss * glare(v, hv) * lit * selfShade() * mix(1.0, 0.3, dull) * uMirror * underFlash(1.0);
  float graze = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  color += groundAmbient(reflect(-v, n)) * (0.03 + graze) * mix(selfShade(), 1.0, uDew) * gloss * mix(0.35, 0.1, uWet) * open * (1.0 - 0.8 * under) * mix(1.0, 0.45, dull);
  color += (skyImage(reflect(-v, n)) * (0.02 + 0.22 * graze) + uAirSun * pow(max(dot(n, hv), 0.0), 300.0) * 2.0 * lit * uMirror) * pool * (1.0 - thatch) * (1.0 - 0.8 * under);

  color += sunGlow(vWorld, v, n, uDew) * open * (1.0 - thatch) * (1.0 - 0.8 * under);
#ifdef NEAR
  color += (wetGlints(vWorld, v, n, uWet) * mix(1.0, 0.35, dull) + wetSheen(v, n, uWet) * smoothstep(0.5, 0.85, h)) * open * fade * (1.0 - pool) * (1.0 - thatch);
#endif
  color += duskSheen(vWorld, v, n) * open * (1.0 - thatch) * mix(0.3, 1.0, stand);
  color += duskGlow(vWorld, v, n, albedo, 0.6 * crest * stand) * (0.3 + 0.7 * open) * (1.0 - 0.6 * under);
  float soaked = max(smoothstep(0.1, 0.8, uWet), pool);
  vec3 film = normalize(vec3(sleek.x, 1.0, sleek.y));
  color *= 1.0 - 0.72 * soaked * (1.0 - pool);
  float seen = smoothstep(0.02, 0.2, v.y);
  float lying = max(pool, stand * (1.0 - smoothstep(0.1, 0.4, lumpy.a)) * seen);
  float edged = smoothstep(0.06, 0.4, length(n.xz - film.xz)) * (1.0 - lying);
  color += (wetAnswer(vWorld, v, normalize(mix(n, film, 0.5 * lying)), soaked, lit, lying) * mix(0.4, 1.0, stand) * mix(0.2, 1.0, max(seen, pool)) + wetSky(v, n) * (1.6 * soaked * edged * mix(0.3, 1.0, seen)) + wetSky(v, film) * pool + wetSky(v, film) * (max(0.3 * uDew - soaked, 0.0) * (1.0 - pool) * stand * (0.04 + 1.5 * grains(vWorld + 0.11, 0.22)))) * hollow * (1.0 - thatch) * (1.0 - 0.6 * under);
  vec3 over = groundAmbient(vec3(0.0, 1.0, 0.0));
  float toSun = pow(saturate(dot(normalize(-v.xz), uLowSun.xy)), 160.0) * uLowSun.z;
  color += FROST_WHITE * rime * rime * (mix(over, vec3(dot(over, vec3(0.3, 0.6, 0.1))), 0.6) * 1.0 * hollow + uSunColor * lit * (0.2 + 0.6 * pow(saturate(-dot(v, uSunDir)), 2.0)));
  color += (uSunColor * lit * 7.0 * frostSpark(vWorld, n, v, uSunDir) + uSkyHorizonSun * 1.2 * frostSpark(vWorld + 0.5, n, v, normalize(vec3(uLowSun.x, 0.3, uLowSun.y)))) * rime * (1.0 + 5.0 * toSun);
  color += warmGlint() * (toSun * smoothstep(0.0, 0.3, uFrost) * frostKept(uFrost, 0.4) * 2.0 * grains(vWorld + 1.7, 0.1) * (0.3 + 0.7 * crest) * hollow * (1.0 - thatch));
  outColor = finish(color, vWorld, vDepth, density);
}
`
