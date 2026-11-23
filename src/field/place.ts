import * as THREE from 'three'
import { config } from '../config.ts'
import { gustGlsl, windWay } from '../v2/wind.ts'
import { LEAN_GUST, LEAN_STEADY, PLACE, STIFF_LEAF, SHARE_LOW, SIZE_KNEE, companionPlace, faceAt, faceToward, lateLeafCode, lateLean, leafShort, leafSpin, ownOf, right, settleOf, thinOrder, toward, windOf } from './layout.ts'

// What a neighbor carries for good, six texels of four numbers each, in a texture made once when the field is built.
const ROWS = 6
const WIDE = 1024
// At the low quality the simpler plants thin out from here to there.
export const THIN_M = [12, 30]
// From the crane the first rows behind the plant and its companion stand a shade darker, so that the two stand clear of them.
const BEHIND = { fromM: 3.5, toM: 6.5, nearM: 2.5, wideM: 4.5 }

const BUD_T = config.growth.bud
const OPEN_T = config.growth.open

// The same for every kind of neighbor in one frame.
export const fieldPlaceUniforms = {
  // How far ahead the plant is, how far the rows lag, how uneven they stand, how far the laggards are behind.
  uFieldStature: { value: new THREE.Vector4(1, 0, 0, 0) },
  // The share of the plant the tallest stands at, how even they are, how much shorter the far ones, the plant's height.
  uFieldStand: { value: new THREE.Vector4(1, 1, 0, 1) },
  // How far the late bloom has come, how much of the young crop's own ways is left, how stiff the leaves, how dark the rows behind the pair.
  uFieldPhase: { value: new THREE.Vector4(0, 0, 0, 0) },
  // The film second, the wind on the stems, the wind on the leaves, whether the crop is young.
  uFieldAir: { value: new THREE.Vector4(0, 0, 0, 0) },
  // Where the lens stands on the ground and which way it looks along it.
  uFieldLens: { value: new THREE.Vector4(0, 0, 0, -1) },
  // The lens's right on the ground, how fast the frame widens with depth, the room a neighbor is given at its edge.
  uFieldGate: { value: new THREE.Vector4(1, 0, 1, 0.9) },
}

export interface KindUniforms {
  uFieldData: { value: THREE.DataTexture }
  // The kind's clock, its height at that clock, whether it opens early, which way its head points in its own frame.
  uFieldKind: { value: THREE.Vector4 }
  // How far ahead the kind is, what its size is multiplied by, the farthest it is drawn, the share of it that is drawn far off.
  uFieldDraw: { value: THREE.Vector4 }
  // 1 for the leaves, which stay where they stand while the head turns.
  uFieldLeaf: { value: number }
}

// The numbers of every neighbor of one kind, in the order of its list.
export function kindData(places: Float32Array): THREE.DataTexture {
  const count = places.length / PLACE
  const high = Math.max(1, Math.ceil(count / WIDE)) * ROWS
  const data = new Float32Array(WIDE * high * 4)
  const pair = companionPlace()
  const mid = 0.5 * (pair.x * right.x + pair.z * right.z)
  const fade = (a: number, b: number, x: number): number => THREE.MathUtils.smoothstep(x, a, b)
  for (let k = 0; k < count; k++) {
    const x = places[k * PLACE]
    const z = places[k * PLACE + 1]
    const id = places[k * PLACE + 7]
    const reach = Math.hypot(x, z)
    const own = ownOf(id)
    const lean = lateLean(id)
    const along = -(x * toward.x + z * toward.z)
    const across = x * right.x + z * right.z - mid
    const behind = (1 - fade(BEHIND.fromM, BEHIND.toM, along)) * (1 - fade(BEHIND.nearM, BEHIND.wideM, Math.abs(across)))
    const rows = [
      [own.tall, own.young, own.nod, own.head],
      [own.stalk, own.leaf, own.droop, own.bud],
      [own.leanX, own.leanZ, faceToward(id), leafSpin(id)],
      [faceAt(id, reach), settleOf(id), lean.x, lean.z],
      [lateLeafCode(id), leafShort(id), windOf(id, 0), windOf(id, 1)],
      [windOf(id, 2), behind, thinOrder(id), 0],
    ]
    const col = k % WIDE
    const row = Math.floor(k / WIDE) * ROWS
    for (let r = 0; r < ROWS; r++) data.set(rows[r], ((row + r) * WIDE + col) * 4)
  }
  const texture = new THREE.DataTexture(data, WIDE, high, THREE.RGBAFormat, THREE.FloatType)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

// The list a kind is drawn from, written once: where each neighbor stands, its turn, its size, its lean, its tone and its number in the list.
export function kindList(places: Float32Array): Float32Array {
  const list = new Float32Array(places)
  for (let k = 0; k < list.length / PLACE; k++) list[k * PLACE + 7] = k
  return list
}

const f = (v: number, digits = 4): string => v.toFixed(digits)

// Where a neighbor stands in this frame, worked out for each vertex from what it carries for good and the frame's few numbers.
export const fieldPlaceGlsl = /* glsl */ `
uniform sampler2D uFieldData;
uniform vec4 uFieldKind;
uniform vec4 uFieldDraw;
uniform float uFieldLeaf;
uniform vec4 uFieldStature;
uniform vec4 uFieldStand;
uniform vec4 uFieldPhase;
uniform vec4 uFieldAir;
uniform vec4 uFieldLens;
uniform vec4 uFieldGate;
${gustGlsl.replace(/gustPulse/g, 'fieldGustPulse').replace(/gustAt/g, 'fieldGust')}
float fieldSoftMin(float a, float b) { return -log(exp(-${f(SIZE_KNEE, 1)} * a) + exp(-${f(SIZE_KNEE, 1)} * b)) / ${f(SIZE_KNEE, 1)}; }
float fieldSteps(float v, float from, float to) { return clamp(floor((v - from) / (to - from) * 31.0 + 0.5), 0.0, 31.0); }
vec2 fieldSpun(vec2 lean, float turn) {
  float c = cos(turn);
  float s = sin(turn);
  return vec2(c * lean.x - s * lean.y, c * lean.y + s * lean.x);
}
Place fieldPlace() {
  vec2 at = aPlace.xy;
  float reach = length(at);
  int k = int(aVary.w + 0.5);
  ivec2 cell = ivec2(k % ${WIDE}, (k / ${WIDE}) * ${ROWS});
  vec4 last = texelFetch(uFieldData, cell + ivec2(0, 5), 0);
  // A neighbor that stands wholly to one side of the frame or behind the lens is drawn as nothing, at its own foot.
  vec2 off = at - uFieldLens.xy;
  float depth = dot(off, uFieldLens.zw);
  float side = abs(dot(off, uFieldGate.xy));
  float room = uFieldGate.w;
  if (depth < -room || side > max(depth, 0.0) * uFieldGate.z + room * (1.0 + uFieldGate.z) || reach > uFieldDraw.z || last.z > 1.0 - (1.0 - uFieldDraw.w) * smoothstep(${f(THIN_M[0], 1)}, ${f(THIN_M[1], 1)}, reach)) return Place(vec4(at, 0.0, 0.0), vec4(0.0));
  vec4 own = texelFetch(uFieldData, cell, 0);
  vec4 young = texelFetch(uFieldData, cell + ivec2(0, 1), 0);
  vec4 ways = texelFetch(uFieldData, cell + ivec2(0, 2), 0);
  vec4 late = texelFetch(uFieldData, cell + ivec2(0, 3), 0);
  vec4 more = texelFetch(uFieldData, cell + ivec2(0, 4), 0);
  float tone = aVary.z;
  // Its size: what it has of its own, held back while the crop is young.
  float a = (0.9 + 0.1 * tone - uFieldStature.y * (1.0 - smoothstep(0.25, 0.55, tone))) / aPlace.w;
  float size = aPlace.w * (fieldSoftMin(a, uFieldDraw.x) - fieldSoftMin(a, 1.0) + 1.0) * (1.0 + uFieldStature.z * (own.x - 1.0)) * (1.0 + uFieldStature.w * (own.y - 1.0));
  if (uFieldAir.w > 0.0) size *= uFieldStand.x * pow(max(size * uFieldKind.y / uFieldStand.w, ${f(SHARE_LOW)}), uFieldStand.y - 1.0) * (1.0 - uFieldStand.z * smoothstep(2.0, 9.0, reach));
  size *= uFieldDraw.y;
  // Its head comes round to its side as it opens. The leaves stay where they stand.
  float round = uFieldKind.z > 0.0 ? 1.0 : smoothstep(${f(BUD_T - 1.5)} + 2.0 * late.y, ${f(OPEN_T - 1.5)} + 2.0 * late.y, uFieldKind.x);
  float way = ways.z - uFieldKind.w - aPlace.z;
  way -= 6.2831853 * floor(way / 6.2831853 + 0.5);
  float turn = aPlace.z;
  vec2 lean = aVary.xy;
  if (uFieldLeaf < 0.5 && round > 0.0) {
    turn += round * way;
    lean = fieldSpun(lean, round * way);
  }
  lean += uFieldPhase.y * ways.xy;
  // The wind: it is pushed over as the front strikes, shakes while it is held, and its head and its leaves turn with it, each its own way.
  vec2 push = uFieldPhase.x * late.zw;
  float nod = 0.0;
  float spin = uFieldLeaf > 0.5 ? ways.w : 0.0;
  if (uFieldAir.y > 0.0 || uFieldAir.z > 0.0) {
    float seconds = uFieldAir.x;
    float g = fieldGust(at, seconds - 0.25 * more.z);
    float shake = sin(6.2831853 * (seconds / (0.9 + 0.8 * more.w) + last.x));
    float quick = sin(6.2831853 * (seconds / (0.31 + 0.2 * last.x) + more.z));
    float over = uFieldAir.y * (0.7 + 0.6 * more.w) * (${f(LEAN_STEADY)} + ${f(LEAN_GUST)} * g + 0.045 * shake * (0.35 + g));
    push += fieldSpun(vec2(${f(windWay.x, 6)}, ${f(windWay.z, 6)}), (last.x - 0.5) * 0.5 + 0.25 * shake * g) * over;
    nod = uFieldAir.y * (0.3 * g + 0.06 * shake);
    spin += uFieldLeaf > 0.5 ? uFieldAir.z * (more.w < 0.5 ? -1.0 : 1.0) * (0.75 * g + 0.15 * quick * (0.4 + g)) : uFieldAir.y * (more.z < 0.5 ? -1.0 : 1.0) * (0.6 * g + 0.12 * shake);
  }
  if (spin != 0.0) {
    turn += spin;
    lean = fieldSpun(lean, spin);
  }
  if (push.x != 0.0 || push.y != 0.0) lean += fieldSpun(push, turn);
  // What its own shape needs, as one number: before the bloom its stalk, its leaves, their droop and its bud, after it the nod and the size of its head.
  float code;
  if (uFieldPhase.y > 0.0) {
    float stiff = uFieldPhase.z;
    code = fieldSteps(young.x, 0.75, 1.3) + 32.0 * fieldSteps(young.y + stiff * ${f(STIFF_LEAF)}, 0.75, 1.6) + 1024.0 * fieldSteps(young.z - stiff * 0.67 * (young.z + 0.15), -0.15, 0.6) + 32768.0 * fieldSteps(young.w, 0.8, 2.6);
  } else {
    float face = uFieldPhase.x > 0.0 ? late.x : 0.0;
    code = max(0.0, floor((own.z + nod - face * 0.7 * max(own.z - 0.2, 0.0)) * 64.0 + 0.5)) + (own.w + face * 0.6 * (1.15 - own.w)) * 0.5;
  }
  if (uFieldLeaf > 0.5 && uFieldPhase.x > 0.0) {
    code = more.x;
    // Late in the bloom the stalk has gone on past its last leaves.
    if (uFieldDraw.y == 1.0) size *= 1.0 - uFieldPhase.x * more.y;
  }
  return Place(vec4(at, turn, size), vec4(lean, tone - uFieldPhase.w * last.y, code));
}
`
