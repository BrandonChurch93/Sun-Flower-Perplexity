import * as THREE from 'three'
import { config } from '../config.ts'
import type { Assets } from '../core/assets.ts'
import type { CameraPose } from '../core/lens.ts'
import { makeSurface, shared, type Surface } from '../core/shading.ts'
import { bodyRadius, headOpen, heightAt, leafCount, leafLength, rayLength, usePlant, type PlantInputs } from '../plant/growth.ts'
import { headAt } from '../plant/model.ts'
import { Plant } from '../plant/index.ts'
import { airUniforms } from '../place/air.ts'
import { fieldUniforms } from '../plant/part.ts'
import type { Quality } from '../v2/api.ts'
import { now } from '../v2/now.ts'
import { Shaped, leavesApart, placeTurned, send } from './turn.ts'
import { Keyed, keyGlsl, keyUniforms } from './keys.ts'
import { CANOPY_SIZE, LEAN_GUST, LEAN_STEADY, PLACE, carpetBandM, earlyAt, earlyCode, farVariants, fieldEast, fieldEndM, fieldFarM, fieldPicturesM, fieldWest, kindTime, lagAt, pictureCount, pictureFace, pictureTurns, plantAhead, right, settled, shortWay, sizeGlsl, toward } from './layout.ts'
import { gustGlsl, windWay } from '../v2/wind.ts'

const TILE_W = 64
const PICTURE_UNDER = 0.94
// How much of its light a far leaf keeps when nothing but the sky lights it.
const UNLIT = 0.3
// How much of the sky behind it the far crop takes by 220 m. Past its end the land carries the same crop on, so it does not fade into the sky there.
const FAR_AIR = 0.1
// How much of the pictures' top colour the carpet keeps once the low sun rims the tops.
const RIM_KEEP = [0.34, 0.46, 0.46]
// The dark between the rows of the carpet: its colour as a share of the leaves' in the pictures, how much of the light it takes where the carpet starts and far off,
// and the share of a row's width it holds once the rows are too close to part.
const DARK = 0.06
// How much of the rim the leaves of a far picture keep, seen from over the crop.
const RIM_FAR = [0.48, 0.64, 0.66]
const GAP_DEEP = 0.9
const GAP_FAR = 0.35
const GAP_MEAN = 0.5
// The radius of a head with its rays, in meters.
const HEAD_R_M = 0.15
// A head in the air stands out of the crop round it by this power of what the air leaves of it.
const HEAD_AIR = 3
// The rays of a head that stands clear, over the colour of the heads in the pictures.
const HEAD_RAYS = [3.5, 3.3, 1.2]
const TILE_H = 128
// Where the dark layer under the far plants begins, and over how many meters it comes in.
const UNDER_FROM_M = 3
const UNDER_BAND_M = 6
// The dark layers, as shares of the height of the tops.
const UNDER_LEVELS = [0.5, 0.68, 0.84]
// From where the pictures differ in size and tilt, where the head sits in a picture, and how much green and blue a far ray keeps.
const HEADS_FROM_M = 16
const HEAD_AT = 0.9
const RAY_DEEP = [0.82, 0.25]
const LEAF_SKY = 1.2
const HEAD_GROWS = 0.35
// How far the head of each picture nods, in radians, and its size beside the size of its kind.
const PICTURE_NODS = [0.25, 0.45, 0.3, 0.7, 0.35, 0.2, 0.55, 0.4]
const PICTURE_HEADS = [1.05, 0.95, 1.1, 0.9, 1.0, 1.15, 0.95, 1.05]
const EARLY_CODE = earlyCode({ turn: 0, tall: 1, head: 1, nod: 0, low: 0, young: 1, stalk: 1, leaf: 1.1, droop: 0.2, bud: 1.4, leanX: 0, leanZ: 0 })
// The carpet comes in under the last of the real plants, so there is crop under every picture.
const CARPET_FROM_M = fieldFarM - 8

// Far off the crop goes by degrees into the sky behind the land, through the same air as the land past it, and at its far end all the way: it ends in no line.
const farAirGlsl = /* glsl */ `
uniform float uAir;
uniform float uAirToSun;
uniform float uAirRain;
uniform float uMist;
uniform float uMistTopM;
uniform vec3 uTrueSun;
float farAirOn(vec3 world) {
  vec3 v = world - uCamPos;
  float d = length(v);
  float k = v.y / uMistTopM;
  float mist = uMist * exp(-max(uCamPos.y, 0.0) / uMistTopM) * d * (abs(k) > 1e-3 ? (1.0 - exp(-k)) / k : 1.0);
  float land = 1.0 - exp(-d * uAir - mist);
  float own = ${FAR_AIR.toFixed(2)} * smoothstep(40.0, 220.0, d);
  // Near, the crop has the air its neighbors have. The land's own air comes in toward the far end, where the crop meets the land.
  return max(land * smoothstep(100.0, 290.0, length(world.xz)), own);
}
vec3 farAir(vec3 color, vec3 world) {
  vec3 v = world - uCamPos;
  float toSun = pow(saturate(0.5 + 0.5 * dot(normalize(v.xz + vec2(1e-6)), normalize(uTrueSun.xz + vec2(1e-6)))), 6.0) * uAirToSun;
  vec3 behind = mix(mix(uAirHorizon, uSkyHorizonSun, toSun), uFogColor + uFogSunTint * toSun, uAirRain);
  return mix(color, behind, farAirOn(world));
}
`

const pictureVertex = /* glsl */ `
in vec2 aCorner;
in vec4 aPlace;
in vec4 aVary;
out vec2 vUv;
out vec3 vWorld;
out float vDepth;
out float vTone;
uniform vec3 uRight;
uniform vec2 uTile;
uniform vec2 uCrop;
uniform float uOpen;
uniform float uCount;
uniform float uWind;
uniform float uAhead;
uniform float uStand;
uniform float uSquat;
uniform float uFarthest;
${gustGlsl}
${sizeGlsl}
void main() {
  float across = aCorner.x;
  float size = sizeAt(aPlace.w, aVary.z, uAhead) * uStand;
  // Far off, over a grown field, only the head and the leaves beside it clear the rows in front.
  float v = mix(1.0 - mix(uCrop.x, uCrop.y, smoothstep(35.0, 66.0, length(aPlace.xy - uCamPos.xz))), 1.0, aCorner.y);
  // Far off no two heads are the same: each picture is drawn larger or smaller about its head, tipped to one side, and half of them the other way round.
  float away = smoothstep(${HEADS_FROM_M.toFixed(1)}, ${(HEADS_FROM_M + 30).toFixed(1)}, length(aPlace.xy - uCamPos.xz));
  float draw = fract(aVary.w * 0.6180339);
  // An open head is nearly as large as the plant's own: the picture of a short neighbor is drawn larger about its head.
  float scale = mix(1.0, 0.55 + 0.7 * fract(aPlace.z), away) * (1.0 + ${HEAD_GROWS.toFixed(2)} * uOpen);
  float tip = (fract(draw * 7.0) - 0.5) * 0.9 * away;
  float flip = fract(draw * 13.0) < 0.5 ? -1.0 : 1.0;
  float top = ${HEAD_AT.toFixed(2)} * uTile.y * size * (1.0 - uSquat);
  vec2 off = vec2(across * uTile.x * size, v * uTile.y * size * (1.0 - uSquat) - top) * scale;
  off = vec2(cos(tip) * off.x - sin(tip) * off.y, sin(tip) * off.x + cos(tip) * off.y);
  float h = top + off.y;
  vec3 world = vec3(aPlace.x, h, aPlace.y) + uRight * off.x;
  world.xz += aVary.xy * h;
  // The lean a real neighbor takes under the gust, so the wave crosses the pictures as it crosses the rows.
  float blow = uWind * (0.7 + 0.6 * fract(draw * 29.0)) * (${LEAN_STEADY.toFixed(3)} + ${LEAN_GUST.toFixed(3)} * gustAt(aPlace.xy, uReal - 0.25 * fract(draw * 17.0)));
  world.xz += vec2(${windWay.x.toFixed(4)}, ${windWay.z.toFixed(4)}) * (blow * h);
  if (length(aPlace.xy) > uFarthest) world.y = -1000.0;
  vec4 view = viewMatrix * vec4(world, 1.0);
  float inset = 0.5 / ${TILE_W.toFixed(1)};
  vUv = vec2((floor(aPlace.z) + clamp(across * flip + 0.5, inset, 1.0 - inset)) / uCount, v);
  vWorld = world;
  vDepth = -view.z;
  vTone = 0.78 + 0.44 * aVary.z;
  gl_Position = projectionMatrix * view;
}
`

const pictureFragment = /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
in float vDepth;
in float vTone;
uniform sampler2D uAtlas;
uniform float uLate;
uniform float uMoon;
uniform float uCover;
${farAirGlsl}
void main() {
  vec4 t = texture(uAtlas, vUv);
  float cover = 1.0 - t.a;
  // Far off a head is a few pixels of a small picture: it is kept on less of its cover, so it does not thin away to nothing.
  if (cover < mix(0.42, 0.14, smoothstep(40.0, 90.0, vDepth))) discard;
  vec3 color = t.rgb / cover;
  // At this distance a head is the color of light through its rays: deeper than the lemon of a ray seen near.
  float ray = smoothstep(1.0, 1.25, color.r / max(color.g, 1e-4));
  color.gb *= mix(vec2(1.0), vec2(${RAY_DEEP[0].toFixed(2)}, ${RAY_DEEP[1].toFixed(2)}), ray);
  // From over the crop the eye looks down on leaves the low sun only grazes: far off, where no dark shows between the tops, they keep less of its rim than the heads do.
  color *= mix(vec3(1.0), vec3(${RIM_FAR.map((v) => v.toFixed(2)).join(', ')}), smoothstep(0.6, 0.95, uLate) * (1.0 - uMoon) * uCover * smoothstep(36.0, 60.0, vDepth));
  // With no sun or moon on it the crop is dark between its heads, as the real rows before it are.
  color *= mix(mix(${UNLIT.toFixed(2)}, 1.0, ray), 1.0, smoothstep(0.0, 0.6, dot(uSunColor, vec3(0.3, 0.6, 0.1))));
  if (uDiag == 7) {
    outColor = vec4(color, cocOf(vDepth));
    return;
  }
  outColor = finish(farAir(color * vTone, vWorld), vWorld, vDepth, -1.0);
}
`

const sheetVertex = /* glsl */ `
in vec3 position;
out vec3 vWorld;
out float vDepth;
out vec3 vTop;
out vec3 vMid;
out vec3 vHead;
uniform sampler2D uAtlas;
uniform float uHeight;
// The colour of the heads in the pictures, as the frame's light leaves them.
vec3 heads() {
  vec4 sum = vec4(0.0);
  for (int i = 0; i < ${pictureCount}; i++) sum += textureLod(uAtlas, vec2((float(i) + 0.5) / ${pictureCount.toFixed(1)}, ${HEAD_AT.toFixed(2)}), 3.0);
  return sum.rgb / max(${pictureCount.toFixed(1)} - sum.a, 0.02);
}
vec3 band(float v) {
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 4; i++) sum += textureLod(uAtlas, vec2((float(i) + 0.5) * 0.25, v), 5.0);
  return sum.rgb / max(4.0 - sum.a, 0.02);
}
void main() {
  vec4 world = vec4(position.x, uHeight, position.z, 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  vTop = band(0.875);
  vMid = band(0.625);
  vHead = heads();
  gl_Position = projectionMatrix * view;
}
`

const sheetFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
in vec3 vTop;
in vec3 vMid;
in vec3 vHead;
uniform vec2 uToward;
uniform float uOpen;
uniform vec2 uStart;
uniform float uCover;
uniform float uAbove;
uniform float uLevel;
uniform float uThrough;
uniform float uHeight;
uniform float uWind;
uniform vec4 uWedge;
uniform vec2 uEnd;
uniform float uLate;
uniform float uMoon;
${gustGlsl}
${farAirGlsl}
// The heads of the far crop. Near, one disc to a plant. Farther off a plant is smaller than a pixel and the eye sees the heads that stand clear,
// one to every few plants: the cells double in size as they shrink on the screen, each way on its own, and one size fades into the next.
float headsAt(vec2 f, float headPx, out float tone) {
  vec2 across = max(fwidth(f), vec2(1e-5));
  vec2 fx = dFdx(f);
  vec2 fy = dFdy(f);
  float det = fx.x * fy.y - fx.y * fy.x;
  float inv = 1.0 / (abs(det) > 1e-10 ? det : 1e-10);
  vec2 lod = max(log2(across * 2.4), vec2(0.0));
  vec2 lo = floor(lod);
  vec2 t = smoothstep(0.4, 1.0, lod - lo);
  float sum = 0.0;
  tone = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 up = vec2(float(i & 1), float(i >> 1));
    vec2 size = exp2(lo + up);
    vec2 g = f / size;
    vec2 c = floor(g) + size * 31.0;
    vec2 o = fract(g) - 0.5 - 0.3 * (vec2(hash21(c + 3.0), hash21(c + 9.0)) - 0.5);
    float first = 1.0 - step(1.5, size.x * size.y);
    // A head stands upright: it is a round dot on the screen, however flat and however askew its place on the ground is seen,
    // as large as a head is at that distance or as its place leaves room for, and fainter once it is smaller than a pixel.
    vec2 a = vec2(fy.y, -fx.y) * (size.x * inv);
    vec2 b = vec2(-fy.x, fx.x) * (size.y * inv);
    vec2 s = a * o.x + b * o.y;
    float room = abs(a.x * b.y - a.y * b.x) / (2.0 * max(length(a), length(b)));
    float r = min(headPx, 0.75 * room);
    float w = mix(1.0 - t.x, t.x, up.x) * mix(1.0 - t.y, t.y, up.y);
    float d = (1.0 - smoothstep(0.5 * r, r, length(s))) * min(1.0, r * r / 0.4) * step(hash21(c + 5.0), mix(0.55, 0.8, first));
    sum += w * d;
    tone += w * hash21(c + 13.0);
  }
  // Skimming the crop the eye meets head behind head in one pixel: they are an even share of it, and no one of them stands out.
  return sum / (max(across.x, 1.0) * max(across.y, 1.0));
}
void main() {
  float reach = smoothstep(uStart.x, uStart.x + uStart.y, length(vWorld.xz));
  // The wind carries a sheet as far as it carries a neighbor at the sheet's height, so the wave that crosses the rows crosses the sheets too.
  float gust = gustAt(vWorld.xz, uReal);
  float blow = uWind * (${LEAN_STEADY.toFixed(3)} + ${LEAN_GUST.toFixed(3)} * gust);
  vec2 at = vWorld.xz - vec2(${windWay.x.toFixed(4)}, ${windWay.z.toFixed(4)}) * (blow * uHeight);
  vec3 color;
  if (uLevel > 0.0) {
    // A layer of leaves under the tops: clumps with holes between them, fewer toward the front of the field, darker toward the edge of a clump.
    vec2 p = at + uLevel * 37.0;
    float clump = 0.25 * valueNoise(p * 3.1) + 0.35 * valueNoise(p * 7.7) + 0.4 * valueNoise(p * 17.0);
    // A layer ends in no straight line: it thins to nothing toward where it starts and toward the sides of the field.
    float alongL = -dot(at, uToward);
    float acrossL = at.x * uToward.y - at.y * uToward.x;
    float edge = min(uWedge.x + uWedge.y * alongL + acrossL, uWedge.z + uWedge.w * alongL - acrossL);
    float share = uCover * (0.95 - 0.22 * uLevel) * reach * smoothstep(0.0, 4.0, edge) * (1.0 - smoothstep(0.5, 1.0, uAbove));
    if (clump > share) discard;
    float inside = (share - clump) / max(share, 0.01);
    float lift = inside * uLevel / ${UNDER_LEVELS[UNDER_LEVELS.length - 1].toFixed(2)};
    // From high over the tops the layers are the dark between the plants and nothing else, and then they are gone under the real leaves.
    float low = 1.0 - smoothstep(0.0, 0.5, uAbove);
    color = vMid * mix(0.3, mix(0.45, 0.95, low), lift);
    // Seen from over the tops the upper leaves show the faces they turn to the sky.
    color += vec3(0.045, 0.09, 0.022) * skyAmbient(vec3(0.0, 1.0, 0.0)) * (${LEAF_SKY.toFixed(2)} * lift * lift * low);
    // The low sun comes through the upper leaves of a clump, green, and here and there a leaf catches it whole. Looking into the sun the eye meets the shaded side of every clump.
    float lit = smoothstep(0.6, 0.78, valueNoise(p * 9.0 + 5.0));
    float lee = mix(0.35, 1.0, smoothstep(1.0, 0.6, dot(normalize(vWorld.xz - uCamPos.xz), normalize(uSunDir.xz))));
    color += vec3(0.3, 0.5, 0.04) * uSunColor * ((0.02 + 0.88 * lit) * lee * inside * uLevel * low * uThrough * smoothstep(0.0, 0.1, uSunDir.y));
  } else {
    // The carpet: a share of the plants, each one whole, so it comes in plant by plant.
    float along = -dot(at, uToward);
    float across = at.x * uToward.y - at.y * uToward.x;
    vec2 cell = floor(vec2(across / ${config.field.rowSpacingM.toFixed(3)}, along / ${config.field.plantSpacingM.toFixed(3)}));
    // Near, the carpet comes in plant by plant. Its last rows and its sides fray in tongues, so no ruled line lies where the land takes over.
    float fine = clamp(1.0 - 0.6 * fwidth(along / ${config.field.plantSpacingM.toFixed(3)}), 0.0, 1.0);
    // The rows run away from the plant: the eye parts them as long as one is wider than a pixel or two.
    float lined = clamp(1.6 - 2.2 * fwidth(across / ${config.field.rowSpacingM.toFixed(3)}), 0.0, 1.0);
    float gone = length(vWorld.xz);
    float inside = min(uWedge.x + uWedge.y * along + across, uWedge.z + uWedge.w * along - across) / (6.0 + 0.08 * along);
    float lost = max(smoothstep(uEnd.x, uEnd.y, gone), 1.0 - smoothstep(0.0, 1.0, inside));
    float island = 0.6 * valueNoise(vWorld.xz * vec2(0.021, 0.017) + 3.7) + 0.4 * valueNoise(vWorld.xz * 0.067 + 11.0);
    // Where a plant is too small to come in on its own the carpet closes over one row before the next, a few plants at a time, so no line lies across the rows.
    float tongue = 0.6 * valueNoise(vec2(across * 1.43, along * 0.11) + 17.0) + 0.4 * valueNoise(vec2(across * 0.37, along * 0.31) + 29.0);
    float keep = mix(clamp(0.5 + 1.9 * (tongue - 0.5), 0.03, 0.97), hash21(cell), fine);
    if (uCover * reach < keep) discard;
    if (lost > 0.0 && island < lost * 1.15 - 0.05) discard;
    float grain = valueNoise(vec2(across, along) * 1.7);
    float patchy = 0.6 * valueNoise(at * 0.028) + 0.4 * valueNoise(at * 0.0093 + 5.0);
    // Past the last picture the crop keeps their look: tops in the light, one plant wide, over the dark between them, as far as the eye can part them.
    vec2 clumps = vec2(across * 2.2, along * 0.12);
    float parted = clamp(1.0 - 0.7 * max(fwidth(clumps.x), fwidth(clumps.y)), 0.0, 1.0);
    float tops = mix(0.42, smoothstep(0.25, 0.8, valueNoise(clumps + 7.0)), parted);
    // Between the rows the eye looks down into the dark, as deep as among the last plants before the carpet, until the rows draw together.
    float row = 0.5 - 0.5 * cos(6.2831853 * across / ${config.field.rowSpacingM.toFixed(3)});
    float rim = smoothstep(0.6, 0.95, uLate) * (1.0 - uMoon);
    float closed = smoothstep(${CARPET_FROM_M.toFixed(1)}, 200.0, gone);
    float gap = mix(${GAP_MEAN.toFixed(2)}, 1.0 - smoothstep(0.25, 0.8, row), lined) * mix(${GAP_DEEP.toFixed(2)}, ${GAP_FAR.toFixed(2)}, closed);
    float light = mix(tops, 0.3 + 0.55 * grain, fine) * (1.0 - gap);
    // Late in the bloom the low sun rims every top in the pictures. From over the crop the rows hide most of that light: the carpet takes less of it.
    color = mix(vMid * ${DARK.toFixed(2)}, vTop * 0.72 * mix(vec3(1.0), vec3(${RIM_KEEP.map((v) => v.toFixed(2)).join(', ')}), rim), light) * (0.74 + 0.52 * patchy);
    color *= mix(${UNLIT.toFixed(2)}, 1.0, smoothstep(0.0, 0.6, dot(uSunColor, vec3(0.3, 0.6, 0.1))));
    // The heads. Near, one to a plant. Far off the eye skims the crop and meets head behind head: they are a share of every pixel, larger the lower the eye.
    vec2 f = vec2(across / ${config.field.rowSpacingM.toFixed(3)}, along / ${config.field.plantSpacingM.toFixed(3)});
    float skim = 1.0 - smoothstep(0.02, 0.3, abs(normalize(vWorld - uCamPos).y));
    float share = mix(0.04, 0.26, skim) * (0.55 + 0.9 * valueNoise(vec2(across * 1.9, along * 0.22)));
    float tone;
    float disc = headsAt(f, ${HEAD_R_M.toFixed(2)} / max(length(dFdx(vWorld.xz)), 1e-5), tone);
    // The pictures give the head with its dark disc and the leaves round it: the petals alone are brighter, and brighter still with the low sun behind them.
    float into = smoothstep(0.2, 0.9, dot(normalize(vWorld.xz - uCamPos.xz), normalize(uSunDir.xz + vec2(1e-5, 0.0))));
    vec3 gold = vHead * vec3(1.25, 1.0, 0.55) * (1.6 + 0.8 * into * uThrough);
    color = mix(color, gold, uOpen * share * 0.4 * closed);
    // A head that stands clear is the colour of its rays, as the heads of the pictures before it are.
    color = mix(color, gold * vec3(${HEAD_RAYS.join(', ')}) * (0.8 + 0.5 * tone), uOpen * disc * pow(1.0 - farAirOn(vWorld), ${HEAD_AIR.toFixed(1)}));
    // Where a gust lies on the crop the leaves show their pale undersides.
    color *= 1.0 + 0.3 * uWind * (gust - 0.3);
    color = farAir(color, vWorld);
  }
  if (uDiag == 7) {
    outColor = vec4(color, cocOf(vDepth));
    return;
  }
  outColor = finish(color, vWorld, vDepth, -1.0);
}
`

function sheetGeometry(depths: number[]): THREE.BufferGeometry {
  const position: number[] = []
  const index: number[] = []
  depths.forEach((d, i) => {
    for (const across of [-fieldWest(d), fieldEast(d)]) position.push(-toward.x * d + right.x * across, 0, -toward.z * d + right.z * across)
    if (i > 0) {
      const a = (i - 1) * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(position), 3))
  geometry.setIndex(index)
  return geometry
}

function plain(geometry: THREE.BufferGeometry, surface: Surface): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, surface.main)
  mesh.frustumCulled = false
  mesh.matrixAutoUpdate = false
  return mesh
}

const maxLeaf = (time: number): number => {
  let reach = 0
  for (let i = 0; i < leafCount; i++) reach = Math.max(reach, leafLength(i, time))
  return reach
}

// Every picture is in one piece of geometry: a software rasterizer pays for each copy of a drawn shape, not for each triangle.
function quads(places: Float32Array): THREE.BufferGeometry {
  const count = places.length / PLACE
  const CORNER = 10
  const data = new Float32Array(count * 4 * CORNER)
  const index = new Uint32Array(count * 6)
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 4; c++) {
      const at = (i * 4 + c) * CORNER
      data.set(places.subarray(i * PLACE, i * PLACE + PLACE), at)
      data[at + 8] = (c % 2) - 0.5
      data[at + 9] = c >> 1
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6)
  }
  const corners = new THREE.InterleavedBuffer(data, CORNER)
  const quad = new THREE.BufferGeometry()
  quad.setAttribute('aPlace', new THREE.InterleavedBufferAttribute(corners, 4, 0))
  quad.setAttribute('aVary', new THREE.InterleavedBufferAttribute(corners, 4, 4))
  quad.setAttribute('aCorner', new THREE.InterleavedBufferAttribute(corners, 2, 8))
  quad.setIndex(new THREE.BufferAttribute(index, 1))
  return quad
}

// The far field. Pictures of the simpler plants, drawn once a frame from the plants themselves as the camera sees them, stand in rows
// past the last real plant. Past the pictures one carpet carries their color on. Under both lies the dark of the leaves.
// A plant of the pictures stands across the lens: its list says how far across, and where that is on the ground is worked out as it is drawn,
// so that a lens that turns writes no list.
const picturePlaceGlsl = /* glsl */ `
uniform vec3 uFarRight;
Place fieldPlace() { return Place(vec4(uFarRight.xz * aPlace.x, aPlace.zw), aVary); }
${keyGlsl}`

export class FarField {
  readonly count: number
  readonly pictures: THREE.Mesh
  readonly carpet: THREE.Mesh
  readonly under: THREE.Mesh[]
  readonly meshes: THREE.Mesh[]
  private readonly plants: Plant[] = []
  private readonly spots: THREE.InstancedInterleavedBuffer[] = []
  private readonly stills: THREE.InstancedInterleavedBuffer[] = []
  private readonly sent: Float32Array[] = []
  private readonly sentStill: Float32Array[] = []
  private readonly shaped: Shaped[] = []
  private readonly keyed: Keyed[] = []
  // How many shapes the last frame laid.
  laid = 0
  private readonly atlas: THREE.WebGLRenderTarget
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, 0, 0.1, 200)
  private readonly uniforms = {
    uAtlas: { value: null as THREE.Texture | null },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uTile: { value: new THREE.Vector2(1, 1) },
    uCrop: { value: new THREE.Vector2(1, 1) },
    uCount: { value: pictureCount },
    uWind: { value: 0 },
    uWedge: { value: new THREE.Vector4(fieldWest(0), fieldWest(1) - fieldWest(0), fieldEast(0), fieldEast(1) - fieldEast(0)) },
    uEnd: { value: new THREE.Vector2(fieldEndM[0], fieldEndM[1]) },
    uFarthest: { value: 1000 },
    uToward: { value: new THREE.Vector2(toward.x, toward.z) },
    uCover: { value: 0 },
    uOpen: { value: 0 },
    uAbove: { value: 0 },
    uAhead: { value: 1 },
    uStand: { value: 1 },
    uLag: { value: 0 },
    uThrough: { value: 1 },
    uSquat: fieldUniforms.uSquat,
    uLate: fieldUniforms.uLate,
    uMoon: fieldUniforms.uMoon,
    uAir: airUniforms.uAir,
    uAirToSun: airUniforms.uAirToSun,
    uAirRain: airUniforms.uAirRain,
    uMist: airUniforms.uMist,
    uMistTopM: airUniforms.uMistTopM,
    uTrueSun: airUniforms.uTrueSun,
  }
  private readonly carpetHeight = { value: 0 }
  private readonly underHeights = UNDER_LEVELS.map(() => ({ value: 0 }))
  private readonly eye = new THREE.Vector3()
  private readonly clear = new THREE.Color()
  private stale = false
  private time = 0
  private above = false
  private readonly local = farVariants.map(() => 0)

  constructor(places: Float32Array, turns: number[]) {
    this.atlas = new THREE.WebGLRenderTarget(TILE_W * pictureCount, TILE_H, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: true,
    })
    this.atlas.texture.colorSpace = THREE.NoColorSpace
    this.uniforms.uAtlas.value = this.atlas.texture
    farVariants.forEach((variant, i) => {
      const spot = new THREE.InstancedInterleavedBuffer(new Float32Array(pictureTurns * PLACE), PLACE)
      spot.setUsage(THREE.DynamicDrawUsage)
      const key = keyUniforms()
      const plant = new Plant({ detail: 'far', variant, places: spot, place: { glsl: picturePlaceGlsl, uniforms: { ...key, uFarRight: this.uniforms.uRight } } })
      this.keyed.push(new Keyed(plant, i, 'pictures', turns[i], key))
      plant.show(pictureTurns)
      this.spots.push(spot)
      this.stills.push(leavesApart(plant, pictureTurns))
      this.sent.push(new Float32Array(pictureTurns * PLACE).fill(Number.NaN))
      this.sentStill.push(new Float32Array(pictureTurns * PLACE).fill(Number.NaN))
      this.shaped.push(new Shaped())
      this.plants.push(plant)
      this.scene.add(...plant.meshes)
    })
    this.scene.matrixWorldAutoUpdate = false
    this.camera.matrixAutoUpdate = false

    const quad = quads(places)
    this.count = places.length / PLACE
    const picture = makeSurface({ name: 'field pictures', vertex: pictureVertex, fragment: pictureFragment, side: THREE.DoubleSide, castShadow: false, uniforms: this.uniforms })
    this.pictures = plain(quad, picture)

    const sheet = (level: number, height: { value: number }, startM: number, bandM: number, depths: number[]): THREE.Mesh => {
      const uniforms = { ...this.uniforms, uHeight: height, uLevel: { value: level }, uStart: { value: new THREE.Vector2(startM, bandM) } }
      return plain(sheetGeometry(depths), makeSurface({ name: level > 0 ? 'field leaf layer' : 'field carpet', vertex: sheetVertex, fragment: sheetFragment, side: THREE.DoubleSide, castShadow: false, uniforms }))
    }
    this.carpet = sheet(0, this.carpetHeight, CARPET_FROM_M, carpetBandM, [CARPET_FROM_M - 2, fieldEndM[1]])
    this.under = UNDER_LEVELS.map((level, i) => sheet(level, this.underHeights[i], UNDER_FROM_M, UNDER_BAND_M, [UNDER_FROM_M - 2.5, fieldFarM, fieldPicturesM]))

    // The pictures are made just before the first surface that reads them is drawn.
    this.pictures.onBeforeRender = (renderer) => this.draw(renderer as THREE.WebGLRenderer)
    // Solid surfaces all: the order only lets the nearer ones hide the sheets before the sheets are shaded.
    this.pictures.renderOrder = 10
    this.under.forEach((m, i) => (m.renderOrder = 12 - i))
    this.carpet.renderOrder = 13
    this.meshes = [this.pictures, ...this.under, this.carpet]
  }

  async load(assets: Assets): Promise<void> {
    for (const plant of this.plants) await plant.load(assets)
  }

  prepare(timeOpen: number, timeClose: number, open: PlantInputs, close: PlantInputs, felt: string, eyeHeightM: number, canopy: number, stand: number, played: boolean): void {
    this.time = timeOpen
    this.laid = 0
    this.plants.forEach((plant, i) => {
      const clock = kindTime(timeOpen, i, 'pictures')
      const keyed = this.keyed[i]
      if (played) {
        keyed.set(now.t, clock)
        this.shaped[i].forget()
        this.laid += keyed.laid
        this.local[i] = Math.atan2(keyed.axis.x, keyed.axis.z)
        return
      }
      const clockClose = kindTime(timeClose, i, 'pictures')
      if (this.shaped[i].again(clock, clockClose, felt)) {
        keyed.off()
        plant.prepare(clock, clockClose, open, close)
      }
      usePlant(plant.variant, null)
      const axis = headAt(clock, open).axis
      this.local[i] = Math.atan2(axis.x, axis.z)
      usePlant(0)
    })
    this.uniforms.uWind.value = now.dials.wind
    this.uniforms.uAhead.value = plantAhead(timeOpen)
    this.uniforms.uStand.value = stand
    this.uniforms.uLag.value = lagAt(timeOpen)
    // Moonlight does not glow green through a leaf; the sun does.
    this.uniforms.uThrough.value = (1 - now.night) * THREE.MathUtils.smoothstep(now.sunElevationDeg, -5, 0)
    this.uniforms.uOpen.value = headOpen(kindTime(timeOpen, 1, 'pictures'))
    const head = bodyRadius(timeOpen) + rayLength(0, timeOpen) + 0.14
    this.uniforms.uTile.value.set(2 * (0.03 + Math.max(maxLeaf(timeOpen) * 1.3, head)), Math.max(0.01, heightAt(timeOpen) * 1.04 + 0.005))
    // How far the eye stands over the tops, in heights of the tops. As it rises the leaf layers and the carpet come in and
    // the pictures are cut to the part that clears the rows in front, all by degrees, so no frame differs from the one before by a jump.
    const over = canopy > 0.06 ? (eyeHeightM - canopy) / canopy : 0
    const rise = THREE.MathUtils.smoothstep(over, 0.02, 0.27)
    this.uniforms.uCover.value = THREE.MathUtils.smoothstep(canopy, 0.06, 0.55) * rise
    this.uniforms.uAbove.value = THREE.MathUtils.smoothstep(over, 0.4, 1.0)
    this.carpetHeight.value = canopy * 0.92
    UNDER_LEVELS.forEach((level, i) => (this.underHeights[i].value = canopy * level))
    const grown = THREE.MathUtils.smoothstep(canopy, 0.3, 0.9)
    this.uniforms.uCrop.value.set(THREE.MathUtils.lerp(1, 0.46, THREE.MathUtils.smoothstep(over, 0.02, 0.5)), THREE.MathUtils.lerp(1, 0.3, grown * THREE.MathUtils.smoothstep(over, 0.02, 0.15)))
    this.above = rise > 0
    this.stale = true
  }

  // Lays the simpler plants side by side before a camera that looks the way the film's does.
  look(pose: CameraPose): void {
    const flat = Math.hypot(pose.forward.x, pose.forward.z) || 1
    const fx = pose.forward.x / flat
    const fz = pose.forward.z / flat
    const rx = -fz
    const rz = fx
    this.uniforms.uRight.value.set(rx, 0, rz)
    const tile = this.uniforms.uTile.value
    const early = earlyAt(this.time)
    this.spots.forEach((spot, i) => {
      const a = spot.array as Float32Array
      const still = this.stills[i]
      for (let j = 0; j < pictureTurns; j++) {
        const across = (i * pictureTurns + j - (pictureCount - 1) / 2) * tile.x
        const id = 1 + i * pictureTurns + j
        const base = 0.25 + (j === 0 ? -0.5 : 0.7)
        // The last number is what a neighbor's carries: before the bloom its stalk, leaves, droop and bud, after it the nod and the size of its head.
        const code = early > 0 ? EARLY_CODE : Math.round(PICTURE_NODS[i * pictureTurns + j] * 64) + 0.5 * PICTURE_HEADS[i * pictureTurns + j]
        placeTurned([across, 0, base, 1, 0, 0, 0.5, code], 0, a, still.array as Float32Array, j * PLACE, settled(kindTime(this.time, i, 'pictures'), id) * shortWay(pictureFace(i, j) - this.local[i] - base))
      }
      send(spot, this.sent[i], pictureTurns * PLACE)
      send(still, this.sentStill[i], pictureTurns * PLACE)
    })
    const cam = this.camera
    const half = (pictureCount * tile.x) / 2
    cam.left = -half
    cam.right = half
    cam.bottom = 0
    cam.top = tile.y
    cam.updateProjectionMatrix()
    const back = 80
    cam.matrix.makeBasis(new THREE.Vector3(rx, 0, rz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-fx, 0, -fz)).setPosition(-fx * back, 0, -fz * back)
    cam.matrixWorld.copy(cam.matrix)
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert()
    this.eye.set(-fx * back, pose.position.y, -fz * back)
  }

  // At the low quality the thinned pictures past the last full row are left out: the carpet stands for them.
  use(quality: Quality): void {
    this.uniforms.uFarthest.value = quality === 'low' ? fieldPicturesM : 1000
  }

  show(on: boolean): void {
    this.pictures.visible = on
    this.carpet.visible = on && this.above
    for (const m of this.under) m.visible = on && this.above
  }

  // The pictures: each simpler kind as the frame's camera sees it, under the frame's sun and sky, without the air between.
  private draw(renderer: THREE.WebGLRenderer): void {
    if (!this.stale) return
    this.stale = false
    const target = renderer.getRenderTarget()
    const alpha = renderer.getClearAlpha()
    renderer.getClearColor(this.clear)
    const keep = { x: shared.uCamPos.value.x, y: shared.uCamPos.value.y, z: shared.uCamPos.value.z, fog: shared.uFogDensity.value, coc: shared.uCocScale.value, shadow: shared.uShadowOn.value, wind: fieldUniforms.uPlantWind.value, canopy: fieldUniforms.uCanopy.value, edge: fieldUniforms.uEdge.value.z }
    shared.uCamPos.value.copy(this.eye)
    shared.uFogDensity.value = 0
    shared.uCocScale.value = 0
    shared.uShadowOn.value = 0
    fieldUniforms.uPlantWind.value = 0
    // The pictures are drawn of plants at full size and stand at a neighbor's: they are lit as the last real rows before them are, a little under the tops.
    fieldUniforms.uCanopy.value = keep.canopy / (CANOPY_SIZE * PICTURE_UNDER)
    fieldUniforms.uEdge.value.z = -1000
    renderer.setRenderTarget(this.atlas)
    renderer.setClearColor(0x000000, 1)
    renderer.clear(true, true, false)
    renderer.render(this.scene, this.camera)
    shared.uCamPos.value.set(keep.x, keep.y, keep.z)
    shared.uFogDensity.value = keep.fog
    shared.uCocScale.value = keep.coc
    shared.uShadowOn.value = keep.shadow
    fieldUniforms.uPlantWind.value = keep.wind
    fieldUniforms.uCanopy.value = keep.canopy
    fieldUniforms.uEdge.value.z = keep.edge
    renderer.setRenderTarget(target)
    renderer.setClearColor(this.clear, alpha)
  }
}
