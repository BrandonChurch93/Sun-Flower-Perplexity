import { config } from '../config.ts'
import { world as dawn } from '../worlds/dawn/index.ts'
import { grassCover, stemFoot, turfCover } from './cover.ts'
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
const SUNWAY = (dawn.sun.azimuthDeg * Math.PI) / 180
export const sunWayDir = { x: Math.sin(SUNWAY), z: Math.cos(SUNWAY) }
export const sunWayRise = Math.tan((dawn.sun.elevationDeg * Math.PI) / 180)

export const emergence = { riseS: 2.3, liftM: 0.0075, radiusM: 0.025, cracks: 5 }
// The hole the stem leaves: it opens over these seconds to this radius and depth, and the dome that stood there before is this high. Inside flatM the bare soil carries no relief of the map, only the break. Toward the dawn lens and toward its sun the plates lift this much less, so the hole is seen and lit.
export const hole = { fromS: 0.1, toS: 1.5, radiusM: 0.0085, depthM: 0.0035, domeM: 0.002, flatM: 0.02, wayOpen: 0.7 }

// The furrow the rain fills beside the plant, a shallow hollow where its water gathers. Along the field's own axes (across the rows, and away from the field), in meters from the plant: its middle lies leftM to the left of the plant and drifts by slope for each meter away from the lens, winding by windM, from fromM toward the lens to toM behind the plant, where it closes round.
// halfM is half the width of the standing water at each of the places atM along it, and the shore wanders by wanderM. The floor lies depthM under the mean ground and rises over easeM beyond the water's edge; the banks stand bankM over the ground and stay off the plant within clearM. Until fromS the furrow has only the share before of its depth, and all of it by toS.
export const furrow = { leftM: 0.1, slope: 0.18, fromM: -0.75, toM: 0.25, atM: [-0.6, -0.3, 0, 0.25], halfM: [0.055, 0.05, 0.04, 0.02], depthM: 0.0155, bankM: 0.006, easeM: 0.05, wanderM: 0.012, windM: 0.015, before: 0.25, fromS: 8.5, toS: 13, clearM: 0.03 }
// How far along the floor's slope a level is met, from 0 at the floor to 1 at the mean ground.
// From the golden hour on the furrow is the deep cut it was when that unit was judged, with banks as high as it is deep and a floor that starts 0.3 of the way out.
export const furrowKept = { depthM: 0.03, bankM: 0.03, flat: 0.3 }
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
  if (r > e.radiusM * 1.7) return 0
  const rise = step(-0.8, e.riseS, time) * (1 - 0.3 * step(e.riseS, e.riseS + 5, time))
  const a = Math.atan2(z, x)
  const s = (a * e.cracks) / 6.2832 + 0.07 * Math.sin(r * 420 + a * 2) + 0.05 * Math.sin(r * 1300)
  const id = ((Math.floor(s) % e.cracks) + e.cracks) % e.cracks
  const f = s - Math.floor(s)
  const reach = 1 - step(e.radiusM * 0.25, e.radiusM * (1.1 + 0.5 * hash11(id + 11)), r)
  const toCrack = ((Math.min(f, 1 - f) * 6.2832) / e.cracks) * r
  const crack = (1 - step(0, 0.0003 + 0.0016 * rise * reach, toCrack)) * reach * rise
  const open = step(hole.fromS, hole.toS, time)
  const radius = hole.radiusM * (0.18 + 0.82 * open)
  const gap = 1 - step(0.3 * radius, radius, r)
  const along = x * laneDir.x + z * laneDir.z
  const across = Math.abs(x * laneDir.z - z * laneDir.x)
  const way = Math.max(step(0.002, 0.012, along) * (1 - step(0.012, 0.03, across)), step(0.004, 0.016, x * sunWayDir.x + z * sunWayDir.z))
  const plate = (0.5 + 0.5 * hash11(id + 3)) * reach * (1 - 0.75 * gap) * (1 - hole.wayOpen * way)
  return e.liftM * rise * (plate - 0.6 * crack * plate) + hole.domeM * (1 - open) * (1 - step(0.003, 0.008, r)) - hole.depthM * open * (1 - step(0.25 * hole.radiusM, hole.radiusM, r))
}

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
  return (1.0 - smoothstep(0.012 + 0.1 * along, 0.03 + 0.22 * along, across)) * smoothstep(0.0, 0.03, along);
}
uniform vec2 uSunWay;
float sunWay(vec2 p) {
  float along = dot(p, uSunWay);
  float across = abs(p.x * uSunWay.y - p.y * uSunWay.x);
  return (1.0 - smoothstep(0.02 + 0.15 * along, 0.05 + 0.35 * along, across)) * smoothstep(0.01, 0.05, along);
}
uniform vec4 uFurrow;
uniform vec4 uFurrowAxes;
uniform vec4 uFurrowAt;
uniform vec4 uFurrowHalf;
uniform vec4 uFurrowShape;
uniform vec4 uFurrowShore;
uniform vec3 uFurrowTime;
uniform vec4 uFurrowWas;
uniform vec3 uFurrowKept;
// The height the furrow adds: under the mean ground along its middle, a little over it on its banks.
float furrow(vec2 p) {
  float a = dot(p, uFurrowAxes.xy);
  float d = -dot(p, uFurrowAxes.zw);
  float dc = clamp(d, uFurrow.z, uFurrow.w);
  float side = a + uFurrow.x - uFurrow.y * dc - uFurrowShape.z * sin(dc * 13.0 + 1.0);
  vec3 part = saturate((vec3(dc) - uFurrowAt.xyz) / (uFurrowAt.yzw - uFurrowAt.xyz));
  if (uTime >= uFurrowKept.x) {
    float was = uFurrowWas.x + dot(part, uFurrowWas.yzw - uFurrowWas.xyz);
    float x = length(vec2(side, d - dc)) / was;
    if (x > 2.0) return 0.0;
    float full = mix(uFurrowTime.z, 1.0, smoothstep(uFurrowTime.x, uFurrowTime.y, uTime));
    float floorWas = 1.0 - smoothstep(0.3, 1.0, x);
    float bankWas = smoothstep(0.75, 1.2, x) * (1.0 - smoothstep(1.2, 2.0, x)) * smoothstep(uFurrowShape.w, uFurrowShape.w * 2.0, length(p)) * (1.0 - lane(p));
    return full * (bankWas * uFurrowKept.z - floorWas * uFurrowKept.y);
  }
  float wide = uFurrowHalf.x + dot(part, uFurrowHalf.yzw - uFurrowHalf.xyz);
  wide += uFurrowShore.z * (sin(d * 47.0 + side * 31.0) + 0.6 * sin(d * 83.0 - side * 59.0 + 2.1)) * smoothstep(0.0, 0.02, wide - 0.015);
  float s = length(vec2(side, d - dc));
  if (s > wide + uFurrowShore.w) return 0.0;
  float cut = mix(uFurrowTime.z, 1.0, smoothstep(uFurrowTime.x, uFurrowTime.y, uTime));
  float bed = 1.0 - smoothstep(wide - uFurrowShore.x, wide + uFurrowShore.y, s);
  float bank = smoothstep(wide, wide + uFurrowShore.y, s) * (1.0 - smoothstep(wide + uFurrowShore.y, wide + uFurrowShore.w, s)) * smoothstep(uFurrowShape.w, uFurrowShape.w * 2.0, length(p)) * (1.0 - lane(p));
  return cut * (bank * uFurrowShape.y - bed * uFurrowShape.x);
}
float clodShape(float c) {
  return smoothstep(0.3, 0.62, c) - 0.5;
}
uniform vec4 uEmerge;
uniform vec4 uHole;
uniform vec3 uDome;
// x is the height the breaking soil adds, y how deep inside a crack the point is, from 0 to 1.
vec2 emerge(vec2 p) {
  float r = length(p);
  if (r > uEmerge.z * 1.7) return vec2(0.0);
  float rise = smoothstep(-0.8, uEmerge.x, uTime) * (1.0 - 0.3 * smoothstep(uEmerge.x, uEmerge.x + 5.0, uTime));
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
  return vec2(h, max(crack, 0.5 * gap * gap * rise));
}
float soilHeight(vec2 p, float lod) {
  float fine = textureLod(tData, p * uTiles.x, lod).a - 0.55;
  float mid = textureLod(tData, TURN_M * p * uRelief.z * 3.7 + vec2(0.71, 0.33), lod + 1.9).a - 0.55;
  float clod = clodShape(textureLod(tData, TURN_C * p * uRelief.z + vec2(0.5, 0.2), max(lod - 1.6, 0.0)).a);
  float foot = 1.0 - smoothstep(uDome.y, uDome.y * 1.7, length(p));
  return (fine * uRelief.x + mid * uRelief.x * 0.3 + clod * uRelief.y) * nearFade(p) * (1.0 - 0.4 * lane(p)) * (1.0 - 0.85 * sunWay(p)) * (1.0 - foot) + emerge(p).x + furrow(p) * nearFade(p);
}
`

// With its gloss gone, damp soil under dew takes this much more of the cool sky as plain light.
export const dampFill = [1, 1.12, 1.1]
const MATT_EASE_S = 3.5
export const dewShade = [0.6, 0.54, 1.18]
// The states of the ground, shared with whatever lies on it: where water stands and where frost settles.
// Water stands below waterLevel, in meters from the mean ground, and that level climbs as the ground gets wetter. Frost takes the high open soil first.
export const waterLevelsM = [-0.03, -0.0075]
export const groundStates = /* glsl */ `
uniform vec2 uWater;
uniform float uCast;
float waterLevel(float wet) {
  return mix(uWater.x, uWater.y, wet);
}
float pooled(float heightM, float wet) {
  return wet * smoothstep(0.0, 0.003, waterLevel(wet) - heightM);
}
vec3 dampened(vec3 albedo, float damp) {
  float luma = dot(albedo, vec3(0.3, 0.6, 0.1));
  return mix(albedo, mix(albedo, vec3(luma) * vec3(0.85, 1.1, 1.0), 0.9) * mix(0.3, 0.07, damp * damp * damp * damp), damp);
}
// Until the bloom the soil is damp and matt: 1 at first, eased to 0 over the last ${MATT_EASE_S} s before the bloom.
uniform float uKeptS;
float soilMatt() {
  return 1.0 - smoothstep(uKeptS - ${MATT_EASE_S.toFixed(1)}, uKeptS, uTime);
}
// The stem stands in its own shade: the soil round its foot is dark, in a ring that widens as the stem thickens.
float footShade(vec2 p, float dull) {
  float reach = mix(0.006, 0.014, smoothstep(2.0, 20.0, uTime));
  return 1.0 - 0.7 * dull * exp(-dot(p, p) / (reach * reach));
}
float sheen(float wet, float dew) {
  return max(wet * wet, 0.35 * dew);
}
// The sky's light on a face. When the sun is low its glow fills only its own side of the horizon, so faces turned away from it get the cool sky overhead.
vec3 groundAmbient(vec3 n) {
  float away = saturate(0.6 - dot(n.xz, normalize(uSunDir.xz + vec2(1e-5, 0.0)))) * (1.0 - smoothstep(0.1, 0.45, uSunDir.y));
  return mix(skyAmbient(n), skyAmbient(vec3(0.0, 1.0, 0.0)) * vec3(0.9, 1.45, 0.9) * 1.3, 0.95 * away);
}
// Under a low sun, soil standing proud of the ground is open to the whole bright sky, and what lies low between the lumps sees little of it.
vec3 proud(float heightM, float dew) {
  return mix(vec3(1.0), mix(vec3(0.85), mix(vec3(2.1, 1.65, 1.8), vec3(1.6, 1.35, 1.5), dew), smoothstep(-0.002, 0.012, heightM)), 1.0 - smoothstep(0.1, 0.45, uSunDir.y));
}
// Moist grains along a rim throw the sun at the lens when it stands behind them. A grain is half a millimeter across, and from far off about three pixels, so damp soil keeps its glints at any distance.
float grains(vec3 world, float share) {
  float l = log2(max(sqrt(length(dFdx(world)) * length(dFdy(world))) * 3.0, 0.0005));
  vec3 a = world * exp2(-floor(l));
  vec3 b = a * 0.5;
  float fine = step(1.0 - share, hash31(floor(a))) * smoothstep(0.42, 0.15, length(fract(a) - 0.5));
  float coarse = step(1.0 - share, hash31(floor(b))) * smoothstep(0.42, 0.15, length(fract(b) - 0.5));
  return mix(fine, coarse, fract(l));
}
float sparkle(vec3 world, vec3 v, vec3 n) {
  float skim = 1.0 - max(dot(n, v), 0.0);
  return grains(world, 0.38) * skim * skim * smoothstep(0.3, -0.5, dot(v, uSunDir)) * (1.0 - smoothstep(0.1, 0.45, uSunDir.y));
}
// Wet grains each mirror the bright sky low over the horizon.
vec3 wetGlints(vec3 world, vec3 v, vec3 n, float wet) {
  float skim = 1.0 - max(dot(n, v), 0.0);
  return uSkyHorizon * (grains(world + 0.37, 0.16) * wet * wet * (0.15 + 0.85 * skim) * mix(0.9, 0.5, smoothstep(0.3, 1.0, wet)));
}
// A wet shoulder mirrors the sky it faces as one soft sheen, strongest where the lens skims it.
vec3 wetSheen(vec3 v, vec3 n, float wet) {
  float skim = 1.0 - max(dot(n, v), 0.0);
  return skyAmbient(reflect(-v, n)) * (smoothstep(0.3, 1.0, wet) * (0.03 + 0.97 * skim * skim * skim) * 0.09);
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
  return uSunColor * (low * dew * pow(toSun, 48.0) * pow(skim, 16.0) * far * 0.1);
}
// Until the film lets the ground cast shadows, a low sun's glints are held back, as most of the soil would lie in the shade of its own crumbs.
float selfShade() {
  return mix(1.0, 0.3, (1.0 - uCast) * (1.0 - smoothstep(0.05, 0.5, uSunDir.y)));
}
float frosted(float h, float under) {
  return smoothstep(0.45, 0.8, h) * (1.0 - 0.7 * under);
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
  albedo *= 1.0 - 0.35 * broken.y;
  vec2 boxed = abs(vec2(dot(p, uRight), -dot(p, uToward)) - uWaterBox.xy);
  float pool = pooled(vWorld.y, uWet) * fade * smoothstep(0.92, 1.0, max(boxed.x, boxed.y) / uWaterBox.z);
#else
  vec2 uvB = TURN_B * p * (uTiles.x * 0.73) + vec2(0.37, 0.61);
  vec4 cB = texture(tColor, uvB);
  vec4 dB = texture(tData, uvB);
  float w = saturate((valueNoise(p * 1.9 + 31.0) - 0.5) * 3.5 + 0.5 + (dB.a - dA.a) * 1.2) * smoothstep(1.0, 1.7, r);
  vec3 albedo = mix(cA.rgb, cB.rgb, w);
  float h = mix(dA.a, dB.a, w);
  float rough = mix(dA.b, dB.b, w);
  vec2 g = mix(dA.rg * 2.0 - 1.0, (dB.rg * 2.0 - 1.0) * TURN_B, w);
  vec3 wide = texture(tColor, TURN_W * p * uTiles.y + vec2(0.13, 0.77)).rgb;
  float tone = dot(wide, vec3(0.3, 0.6, 0.1)) * uTiles.z;
  float big = 0.6 * valueNoise(p * 0.13 + 7.0) + 0.4 * valueNoise(p * 0.037 + 3.0);
  albedo *= mix(1.0, mix(0.7, 1.25, saturate(tone * 0.5)), smoothstep(1.0, 2.0, r)) * mix(0.82, 1.16, big);

  float along = dot(p, uRight);
  float rowAmt = smoothstep(0.6, 1.3, d);
  float phase = 6.2832 * ((d - uRows.y) / uRows.x + (valueNoise(vec2(along * 0.7, d * 0.4)) - 0.5) * 0.14);
  float ridge = 0.5 + 0.5 * cos(phase);
  float slope = uRows.z * 3.1416 / uRows.x * sin(phase) * rowAmt;
  float clod = mix(1.0, mix(0.45, 1.15, ridge), rowAmt);
  albedo *= mix(1.0, mix(0.74, 1.07, ridge), rowAmt);
  vec2 tilt = g * 1.6 * clod - uToward * slope;
  vec4 litter = texture(tLitter, TURN_W * p * uLitter + vec2(0.21, 0.43));
  albedo = mix(albedo, litter.rgb, litter.a * smoothstep(0.7, 1.6, d) * mix(0.45, 1.0, uCover) * mix(1.0, 0.7, ridge));
  float pool = pooled((h - 0.55) * uRelief.x * 0.6 + 0.03 * (valueNoise(p * 2.3 + 5.0) - 0.34) - 0.004 * (1.0 - ridge) * rowAmt, uWet);
#endif

  vec3 n = normalize(vec3(tilt.x * (1.0 - 0.9 * pool), 1.0, tilt.y * (1.0 - 0.9 * pool)));
  float thatch = grassMask(p, uToward) * grassSeason() * smoothstep(0.12, 0.5, 0.55 * patchy(p * 4.3 + vec2(3.0, 1.0)) + 0.45 * h);
  float under = uCover * smoothstep(0.9, 1.7, d);
  float foot = 1.0;
  if (fieldOn()) {
    vec2 tf = turf(p);
    float near = stemNear(p) + 0.03 * (valueNoise(p * 31.0) - 0.5);
    thatch = smoothstep(-3.5, -2.9, dot(p, uToward)) * grassSeason() * (1.0 - 0.6 * tf.y) * smoothstep(${stemFoot.bareM.toFixed(2)}, ${(0.5 * (stemFoot.bareM + stemFoot.fullM)).toFixed(3)}, near) * smoothstep(0.05, 0.45, 0.5 * tf.x + 0.5 * h);
    foot = 1.0 - 0.6 * exp(-near * near / ${(stemFoot.shadeM * stemFoot.shadeM).toFixed(4)});
  }
  albedo = dampened(albedo, damp);
  float luma = dot(albedo, vec3(0.3, 0.6, 0.1));
  albedo = mix(albedo, (fieldOn() ? vec3(0.045, 0.052, 0.036) : vec3(0.03, 0.045, 0.016)) * (0.5 + 3.0 * luma * uTiles.z * 0.33), 0.92 * thatch);
  albedo = mix(albedo, vec3(0.75, 0.8, 0.85), uFrost * frosted(h, under));
  albedo *= 1.0 - 0.45 * pool;

  float low = 1.0 - smoothstep(0.05, 0.5, uSunDir.y);
  float ndl = max(dot(n, uSunDir), 0.0);
  float lit = lowSun(sunShadow(vWorld, n, uShadowTexelM * 1.5), 1.0, vWorld.y) * cropLight(p, d);
  vec4 sc = uShadowMatrix * vec4(vWorld, 1.0);
  float mapped = uCast * uShadowOn * smoothstep(0.0, 0.04, min(min(sc.x, sc.y), min(1.0 - sc.x, 1.0 - sc.y)));
  lit *= mix(1.0, smoothstep(0.38, 0.72, h), low * (1.0 - mapped));
  lit *= mix(1.0, smoothstep(0.4, 0.72, h), low * mapped * soilMatt());
  float open = (0.35 + 0.65 * h) * mix(1.0, 0.72 + 0.28 * ridge, rowAmt);
#ifdef NEAR
  open *= mix(1.0, 0.45 + 0.55 * lump, fade) * (1.0 - 0.55 * broken.y);
#endif
  float dull = soilMatt();
  float atFoot = footShade(p, dull);
  open *= atFoot;
  lit *= atFoot;
#ifdef NEAR
  lit *= 1.0 - 0.9 * broken.y * dull;
#endif
  open *= 1.0 - 0.35 * thatch;
  open = mix(open, 0.14 + 0.86 * open, uDew);
  lit *= 1.0 - 0.5 * thatch;
  if (fieldOn()) {
    float patchLit = fieldPatch(p, d) * (1.0 - 0.5 * thatch);
    ndl = mix(ndl, max(ndl, 0.15), thatch * step(lit, patchLit));
    lit = max(lit, patchLit);
    open *= foot * edgeShade(d);
    lit *= foot * edgeShade(d);
  }
  vec3 shade = mix(vec3(1.0), vec3(0.6, 0.57, 0.42), under);
#ifdef NEAR
  shade *= mix(vec3(1.0), proud(vWorld.y, uDew), fade);
#endif
  vec3 color = albedo * (uSunColor * ndl * lit * (1.0 - 0.97 * under) + groundAmbient(n) * open * shade * mix(vec3(1.0), DEW_SHADE, uDew) * mix(vec3(1.0), DAMP_FILL, dull * uDew));

  vec3 v = normalize(uCamPos - vWorld);
  vec3 hv = normalize(v + uSunDir);
  float gloss = sheen(uWet, uDew) * (1.3 - rough) * (1.0 - pool) / (1.0 + 0.7 * max(density - 1.0, 0.0));
  color += uSunColor * pow(max(dot(n, hv), 0.0), mix(24.0, 160.0, uWet)) * gloss * glare(v, hv) * lit * selfShade() * mix(1.0, 0.3, dull);
  float graze = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  color += groundAmbient(reflect(-v, n)) * (0.03 + graze) * mix(selfShade(), 1.0, uDew) * gloss * mix(0.35, 0.1, uWet) * open * (1.0 - 0.8 * under) * mix(1.0, 0.45, dull);
  color += (skyAmbient(reflect(-v, n)) * (0.02 + 0.22 * graze) + uSunColor * pow(max(dot(n, hv), 0.0), 300.0) * 2.0 * lit) * pool * (1.0 - thatch) * (1.0 - 0.8 * under);

  color += sunGlow(vWorld, v, n, uDew) * open * (1.0 - thatch) * (1.0 - 0.8 * under);
#ifdef NEAR
  color += (wetGlints(vWorld, v, n, uWet) * mix(1.0, 0.35, dull) + wetSheen(v, n, uWet) * smoothstep(0.5, 0.85, h)) * open * fade * (1.0 - pool) * (1.0 - thatch);
#endif
  outColor = finish(color, vWorld, vDepth, density);
}
`
