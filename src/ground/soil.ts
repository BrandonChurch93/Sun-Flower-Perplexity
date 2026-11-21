import { grassCover } from './cover.ts'
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
export const emergence = { riseS: 2.3, liftM: 0.0075, radiusM: 0.025, cracks: 5 }

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
float clodShape(float c) {
  return smoothstep(0.3, 0.62, c) - 0.5;
}
uniform vec4 uEmerge;
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
  float hole = 1.0 - smoothstep(0.002, 0.009, r);
  float plate = (0.5 + 0.5 * hash11(id + 3.0)) * reach * (1.0 - 0.75 * hole);
  return vec2(uEmerge.y * rise * (plate - 0.6 * crack * plate) + 0.002 * (1.0 - smoothstep(0.003, 0.008, r)), max(crack, 0.5 * hole * hole * rise));
}
float soilHeight(vec2 p, float lod) {
  float fine = textureLod(tData, p * uTiles.x, lod).a - 0.55;
  float mid = textureLod(tData, TURN_M * p * uRelief.z * 3.7 + vec2(0.71, 0.33), lod + 1.9).a - 0.55;
  float clod = clodShape(textureLod(tData, TURN_C * p * uRelief.z + vec2(0.5, 0.2), max(lod - 1.6, 0.0)).a);
  float foot = 1.0 - smoothstep(0.004, 0.022, length(p));
  return (fine * uRelief.x + mid * uRelief.x * 0.3 + clod * uRelief.y) * nearFade(p) * (1.0 - 0.4 * lane(p)) * (1.0 - 0.85 * foot) + emerge(p).x;
}
`

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
float sheen(float wet, float dew) {
  return max(wet * wet, 0.65 * dew);
}
// The sky's light on a face. When the sun is low its glow fills only its own side of the horizon, so faces turned away from it get the cool sky overhead.
vec3 groundAmbient(vec3 n) {
  float away = saturate(0.6 - dot(n.xz, normalize(uSunDir.xz + vec2(1e-5, 0.0)))) * (1.0 - smoothstep(0.1, 0.45, uSunDir.y));
  return mix(skyAmbient(n), skyAmbient(vec3(0.0, 1.0, 0.0)) * vec3(0.9, 1.45, 0.9) * 1.3, 0.95 * away);
}
// Under a low sun, soil standing proud of the ground is open to the whole bright sky, and what lies low between the lumps sees little of it.
vec3 proud(float heightM) {
  return mix(vec3(1.0), mix(vec3(0.85), vec3(2.1, 1.65, 1.8), smoothstep(-0.002, 0.012, heightM)), 1.0 - smoothstep(0.1, 0.45, uSunDir.y));
}
// Moist grains along a rim throw the sun at the lens when it stands behind them.
float sparkle(vec3 world, vec3 v, vec3 n) {
  vec3 cell = world * 1900.0;
  float grain = step(0.62, hash31(floor(cell))) * smoothstep(0.42, 0.15, length(fract(cell) - 0.5)) * (1.0 - smoothstep(0.3, 1.0, length(fwidth(cell))));
  float skim = 1.0 - max(dot(n, v), 0.0);
  return grain * skim * skim * smoothstep(0.3, -0.5, dot(v, uSunDir));
}
// How strongly a damp surface throws the sun back: several times more when the light skims it toward the lens.
float glare(vec3 v, vec3 hv) {
  float skim = 1.0 - saturate(dot(v, hv));
  return 0.8 + 5.5 * skim * skim * skim * skim;
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
uniform float uLitter;
uniform vec2 uScales;
uniform vec3 uMeanInv;
${soilHeight}
${groundStates}
${cropLight}
${grassCover}

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
  float damp = saturate(uWet + 0.6 * uDew);

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
  float pool = pooled(vWorld.y, uWet) * fade;
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
  float pool = pooled((h - 0.55) * uRelief.x * 0.6 + 0.03 * (valueNoise(p * 2.3 + 5.0) - 0.54) - 0.004 * (1.0 - ridge) * rowAmt, uWet);
#endif

  vec3 n = normalize(vec3(tilt.x * (1.0 - 0.9 * pool), 1.0, tilt.y * (1.0 - 0.9 * pool)));
  float thatch = grassMask(p, uToward) * grassSeason() * smoothstep(0.12, 0.5, 0.55 * patchy(p * 4.3 + vec2(3.0, 1.0)) + 0.45 * h);
  float under = uCover * smoothstep(0.9, 1.7, d);
  albedo = dampened(albedo, damp);
  float luma = dot(albedo, vec3(0.3, 0.6, 0.1));
  albedo = mix(albedo, vec3(0.03, 0.045, 0.016) * (0.5 + 3.0 * luma * uTiles.z * 0.33), 0.92 * thatch);
  albedo = mix(albedo, vec3(0.75, 0.8, 0.85), uFrost * frosted(h, under));
  albedo *= 1.0 - 0.45 * pool;

  float low = 1.0 - smoothstep(0.05, 0.5, uSunDir.y);
  float ndl = max(dot(n, uSunDir), 0.0);
  float lit = sunShadow(vWorld, n, uShadowTexelM * 1.5) * cropLight(p, d);
  vec4 sc = uShadowMatrix * vec4(vWorld, 1.0);
  float mapped = uCast * uShadowOn * smoothstep(0.0, 0.04, min(min(sc.x, sc.y), min(1.0 - sc.x, 1.0 - sc.y)));
  lit *= mix(1.0, smoothstep(0.38, 0.72, h), low * (1.0 - mapped));
  float open = (0.35 + 0.65 * h) * mix(1.0, 0.72 + 0.28 * ridge, rowAmt);
#ifdef NEAR
  open *= mix(1.0, 0.45 + 0.55 * lump, fade) * (1.0 - 0.55 * broken.y);
#endif
  open *= 1.0 - 0.35 * thatch;
  lit *= 1.0 - 0.5 * thatch;
  vec3 shade = mix(vec3(1.0), vec3(0.6, 0.57, 0.42), under);
#ifdef NEAR
  shade *= mix(vec3(1.0), proud(vWorld.y), fade);
#endif
  vec3 color = albedo * (uSunColor * ndl * lit * (1.0 - 0.97 * under) + groundAmbient(n) * open * shade);

  vec3 v = normalize(uCamPos - vWorld);
  vec3 hv = normalize(v + uSunDir);
  float gloss = sheen(uWet, uDew) * (1.3 - rough) * (1.0 - pool) / (1.0 + 0.7 * max(density - 1.0, 0.0));
  color += uSunColor * pow(max(dot(n, hv), 0.0), mix(24.0, 160.0, uWet)) * gloss * glare(v, hv) * lit * selfShade();
  float graze = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  color += groundAmbient(reflect(-v, n)) * (0.03 + graze) * selfShade() * gloss * mix(0.35, 0.1, uWet) * open * (1.0 - 0.8 * under);
  color += (skyAmbient(reflect(-v, n)) * (0.02 + 0.22 * graze) + uSunColor * pow(max(dot(n, hv), 0.0), 300.0) * 2.0 * lit) * pool * (1.0 - thatch) * (1.0 - 0.8 * under);

#ifdef NEAR
  color += uSunColor * sparkle(vWorld, v, n) * lit * gloss * fade * 26.0;
  if (uDew > 0.0) {
    vec2 cell = p / 0.0021;
    vec2 id = floor(cell);
    float pick = hash21(id);
    vec2 at = fract(cell) - 0.5 - (vec2(hash21(id + 17.0), hash21(id + 43.0)) - 0.5) * 0.5;
    float size = 0.06 + 0.12 * hash21(id + 71.0);
    float sharp = 1.0 - smoothstep(0.25, 0.9, length(fwidth(cell)));
    float bead = step(0.9, pick) * step(0.5, h) * smoothstep(size, size * 0.7, length(at)) * uDew * sharp * fade;
    float spark = smoothstep(size * 0.45, size * 0.1, length(at + normalize(uSunDir.xz + 1e-5) * size * 0.4));
    color = mix(color, color * 0.55 + skyAmbient(vec3(0.0, 1.0, 0.0)) * 0.06, bead);
    color += bead * spark * (uSunColor * 2.0 * mix(0.2, 1.0, lit) + skyAmbient(vec3(0.0, 1.0, 0.0)) * 0.5);
  }
#endif
  outColor = finish(color, vWorld, vDepth, density);
}
`
