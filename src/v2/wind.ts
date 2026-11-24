// The wind of the film, one for everything that bends: the plant, its companion, the field, the grass, the rain.
// A gust crosses the land as a wave: a front that strikes, holds and lets go, one every few seconds, travelling toward azimuth 42, the way the clouds go.
// It runs on the film second, so it keeps moving in a hold. How hard it blows is `dials.wind`.
import { barTime } from './clock.ts'

const RAD = Math.PI / 180
export const WIND_TOWARD_DEG = 42
export const windWay = { x: Math.sin(WIND_TOWARD_DEG * RAD), z: Math.cos(WIND_TOWARD_DEG * RAD) }
const WAVE_M = 27
const WAVE_SPEED = 7.5
const RIPPLE_M = 8.5
const RIPPLE_SPEED = 5

const pulse = (f: number): number => {
  const x = f - Math.floor(f)
  const rise = Math.min(1, x / 0.12)
  const out = Math.min(1, Math.max(0, (1 - x) / 0.25))
  return rise * rise * (3 - 2 * rise) * Math.exp(-3.2 * Math.max(x - 0.12, 0)) * out * out * (3 - 2 * out)
}

// How hard that front pushes at a place in meters and a film second, 0 to about 1.
export function frontAt(x: number, z: number, seconds: number): number {
  const along = x * windWay.x + z * windWay.z
  const across = z * windWay.x - x * windWay.z
  const front = (along - WAVE_SPEED * seconds) / WAVE_M + 0.22 * Math.sin(across * 0.045 + 1.3) + 0.1 * Math.sin(across * 0.13 - seconds * 0.21)
  return 0.85 * pulse(-front) + 0.15 * (0.5 + 0.5 * Math.sin((2 * Math.PI * (along - RIPPLE_SPEED * seconds)) / RIPPLE_M + across * 0.4))
}

// The last shot looks out over the whole field, and one front for all of it shows as rows that sway as one. From bar 65 the air there is what it is over a real crop:
// gusts of many sizes, each a patch with a bowed front, a way of its own to push, a strength and a short life, that travel downwind past one another with lulls between.
// A plant is a spring with a weight on it. A patch strikes it, it gives, and it swings back on its own note and round its own two axes, so its head draws a loop no neighbor draws.
// Everything is still a closed form of the place and the film second.
export const PATCHY_FROM_S = barTime(65)
export const PATCHY_BY_S = barTime(66.75)
export function patchyAt(seconds: number): number {
  const x = Math.min(1, Math.max(0, (seconds - PATCHY_FROM_S) / (PATCHY_BY_S - PATCHY_FROM_S)))
  return x * x * (3 - 2 * x)
}

// The sizes of gust: how far off the wind's way each travels in radians, how fast in meters a second, how long and wide its ground is in meters, how hard its strongest pushes, and how many of them back a plant still feels.
const SIZES = [
  { turn: -0.1, speed: 7.5, long: 42, wide: 26, strength: 3.65, back: 1 },
  { turn: 0.16, speed: 6.4, long: 23, wide: 15, strength: 3.25, back: 2 },
  { turn: -0.3, speed: 5.4, long: 12.5, wide: 8.5, strength: 2.5, back: 3 },
  { turn: 0.26, speed: 4.6, long: 6.5, wide: 4.5, strength: 2.1, back: 3 },
]
// Of the grounds, the share with no gust on them, and how weak the weakest gust is beside the strongest.
const EMPTY = 0.2
const WEAKEST = 0.2
// A gust rises in this many seconds and lets go over this share of the time its ground takes to pass.
const RISE_S = [0.3, 0.8]
const HOLD = [0.2, 0.6]
// It pushes up to this far off its way in radians, its front bows by this share of its ground and lies this far askew.
const SWERVE = 0.5
const BOW = [0.05, 0.2]
const SKEW = 0.15
// It lives over this many meters of its way out of each stretch this long, and comes and goes over this share of a stretch.
const TRAVEL_M = [55, 105]
const ALIVE = 0.75
const EDGE = 0.12
// The last gust a plant still feels dies away over this many seconds.
const FADES_S = 1.2
// A plant's own note in turns a second, how fast its swing dies as a share of critical, and how far apart its two axes ring.
const NOTE_HZ = [0.5, 0.85]
const DAMPING = [0.08, 0.18]
const SPLIT = [0.04, 0.13]
// Its first axis lies within this many radians of the wind's way.
const AXIS_OFF = 0.6
// It never stands still: it swings this far on its own in the calmest air, as a share of a full gust, and this much more for each gust that lies on it. Across the wind it swings this share as far.
const OWN_CALM = 0.044
const OWN_GUST = 0.098
const OWN_ACROSS = 0.6
// That swing is the small eddies no neighbor shares, heard through the plant's note: five tones round it, each this far off as a share of the note and this strong, so it swells and fades and never repeats.
const OWN_TONES = [
  [-0.33, 0.5],
  [-0.15, 0.8],
  [0, 1],
  [0.19, 0.75],
  [0.41, 0.45],
]
// Where each tone starts, from the plant's three numbers, along the wind and across it.
const OWN_STARTS = [
  [
    [0, 0, 3.1],
    [5.3, 0, 0],
    [0, 7.7, 0],
    [4.3, 0, 4.3],
    [6.1, 6.1, 0],
  ],
  [
    [9.1, 0, 0],
    [0, 3.7, 0],
    [0, 0, 5.9],
    [0, 8.3, 8.3],
    [2.9, 0, 2.9],
  ],
]
// No stalk bends further than this many gusts, and no gust pushes harder than this many.
const MOST = 1
// A head is heavy: it comes this many seconds after its stalk.
const HEAD_LATE_S = 0.15

const mix3 = (a: number, b: number, c: number): number => {
  let h = (Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca6b) ^ Math.imul(c, 0xc2b2ae35)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0
  return (h ^ (h >>> 15)) >>> 0
}
const turned = (h: number): number => (Math.imul(h, 747796405) + 2891336453) >>> 0
const share = (h: number): number => (h >>> 8) / 16777216
const lerp = (ends: number[], t: number): number => ends[0] + (ends[1] - ends[0]) * t
const eased = (from: number, to: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)))
  return t * t * (3 - 2 * t)
}
const held = (x: number): number => x / Math.sqrt(1 + (x * x) / (MOST * MOST))

// One gust as it reaches a place: how hard, how many seconds since its front passed, which way it pushes, and how fast it lets go and rises.
interface Puff { amp: number; since: number; x: number; z: number; goes: number; rises: number }
const puff: Puff = { amp: 0, since: 0, x: 0, z: 0, goes: 0, rises: 0 }
function puffAt(j: number, i: number, x: number, z: number, seconds: number): boolean {
  const size = SIZES[j]
  const wx = Math.cos(size.turn) * windWay.x - Math.sin(size.turn) * windWay.z
  const wz = Math.sin(size.turn) * windWay.x + Math.cos(size.turn) * windWay.z
  const along = x * wx + z * wz
  const across = z * wx - x * wz
  const moved = (along - size.speed * seconds) / size.long
  const first = Math.floor(moved)
  const cell = first + i + 1024
  const row = across / size.wide + share(turned(mix3(j + 1, cell, 7)))
  const lane = Math.floor(row)
  let h = turned(mix3(cell * 4 + j, lane + 1024, 13))
  const stretch = lerp(TRAVEL_M, share(h))
  h = turned(h)
  const way = (along + share(h) * stretch) / stretch
  const life = Math.floor(way)
  h = turned(mix3(h, life + 1024, 29))
  const r1 = share(h)
  const r2 = share((h = turned(h)))
  const r3 = share((h = turned(h)))
  const r4 = share((h = turned(h)))
  const r5 = share((h = turned(h)))
  const r6 = share((h = turned(h)))
  const r7 = share((h = turned(h)))
  const r8 = share((h = turned(h)))
  if (r1 < EMPTY) return false
  const middle = 0.3 + 0.4 * r3
  const v = (row - lane - middle) / (Math.min(middle, 1 - middle) * (0.75 + 0.25 * r4))
  if (Math.abs(v) >= 1) return false
  const since = (size.long * (i + 0.6 + 0.2 * r5 - lerp(BOW, r6) * v * v + SKEW * (2 * r7 - 1) * v - (moved - first))) / size.speed
  if (since <= 0) return false
  const alive = way - life
  const amp = size.strength * (WEAKEST + (1 - WEAKEST) * r2 * Math.sqrt(r2)) * (1 - v * v) * (1 - v * v) * eased(0, EDGE, alive) * (1 - eased(ALIVE - EDGE, ALIVE, alive)) * eased(0, FADES_S, ((size.back + 0.25) * size.long) / size.speed - since)
  if (amp <= 0) return false
  const off = SWERVE * (r8 - 0.5)
  puff.amp = amp
  puff.since = since
  puff.x = Math.cos(off) * wx - Math.sin(off) * wz
  puff.z = Math.sin(off) * wx + Math.cos(off) * wz
  puff.goes = size.speed / (lerp(HOLD, (r2 + r6) % 1) * size.long)
  puff.rises = puff.goes + 1 / lerp(RISE_S, r4)
  return true
}

// How hard the gusts push at a place, 0 to about 1.
function patchesAt(x: number, z: number, seconds: number): number {
  let sum = 0
  for (let j = 0; j < SIZES.length; j++) for (let i = 0; i <= SIZES[j].back; i++) if (puffAt(j, i, x, z, seconds)) sum += puff.amp * (Math.exp(-puff.goes * puff.since) - Math.exp(-puff.rises * puff.since))
  return held(sum)
}

// What those gusts do to one plant that has three numbers of its own, each 0 to 1: how far its top is carried, level with the ground and in gusts, how hard the air pushes on it now, and how far its head has come along the wind.
export interface Bent { x: number; z: number; push: number; head: number }
const bent: Bent = { x: 0, z: 0, push: 0, head: 0 }
export function bentBy(a: number, b: number, c: number, x: number, z: number, seconds: number): Bent {
  const damp = lerp(DAMPING, b)
  const w1 = 2 * Math.PI * lerp(NOTE_HZ, a)
  const w2 = w1 * (1 + lerp(SPLIT, Math.abs(2 * c - 1)) * (c < 0.5 ? -1 : 1))
  const turn = Math.atan2(windWay.z, windWay.x) + AXIS_OFF * (2 * ((a * 7.31 + c * 3.17) % 1) - 1)
  const ex = Math.cos(turn)
  const ez = Math.sin(turn)
  const ring = Math.sqrt(1 - damp * damp)
  let x1 = 0
  let x2 = 0
  let v1 = 0
  let v2 = 0
  let push = 0
  for (let j = 0; j < SIZES.length; j++) {
    for (let i = 0; i <= SIZES[j].back; i++) {
      if (!puffAt(j, i, x, z, seconds)) continue
      const t = puff.since
      const goes = Math.exp(-puff.goes * t)
      const rises = Math.exp(-puff.rises * t)
      push += puff.amp * (goes - rises)
      for (let axis = 0; axis < 2; axis++) {
        const w = axis === 0 ? w1 : w2
        const dies = damp * w
        const wd = w * ring
        const e = Math.exp(-dies * t)
        const co = e * Math.cos(wd * t)
        const si = e * Math.sin(wd * t)
        const k1 = (w * w) / ((puff.goes - dies) * (puff.goes - dies) + wd * wd)
        const k2 = (w * w) / ((puff.rises - dies) * (puff.rises - dies) + wd * wd)
        const at = k1 * (goes - co - ((dies - puff.goes) / wd) * si) - k2 * (rises - co - ((dies - puff.rises) / wd) * si)
        const rate = k1 * (-puff.goes * goes + puff.goes * co + ((w * w - dies * puff.goes) / wd) * si) - k2 * (-puff.rises * rises + puff.rises * co + ((w * w - dies * puff.rises) / wd) * si)
        const f = puff.amp * (axis === 0 ? puff.x * ex + puff.z * ez : puff.z * ex - puff.x * ez)
        if (axis === 0) {
          x1 += f * at
          v1 += f * rate
        } else {
          x2 += f * at
          v2 += f * rate
        }
      }
    }
  }
  const k = 0.6 + 0.8 * b
  const own = OWN_CALM + OWN_GUST * push
  for (let i = 0; i < OWN_TONES.length; i++) {
    const [off, loud] = OWN_TONES[i]
    const s1 = OWN_STARTS[0][i]
    const s2 = OWN_STARTS[1][i]
    x1 += own * loud * Math.sin(w1 * (1 + off * k) * seconds + 2 * Math.PI * (a * s1[0] + b * s1[1] + c * s1[2]))
    x2 += own * OWN_ACROSS * loud * Math.sin(w2 * (1 - off * k) * seconds + 2 * Math.PI * (a * s2[0] + b * s2[1] + c * s2[2]))
  }
  const px = x1 * ex - x2 * ez
  const pz = x1 * ez + x2 * ex
  const most = 1 / Math.sqrt(1 + (px * px + pz * pz) / (MOST * MOST))
  bent.x = px * most
  bent.z = pz * most
  bent.push = held(push)
  bent.head = (bent.x - HEAD_LATE_S * most * (v1 * ex - v2 * ez)) * windWay.x + (bent.z - HEAD_LATE_S * most * (v1 * ez + v2 * ex)) * windWay.z
  return bent
}

// How hard the air pushes at a place in meters and a film second, 0 to about 1: the one front, and in the last shot the gusts.
export function gustAt(x: number, z: number, seconds: number): number {
  const patchy = patchyAt(seconds)
  if (patchy <= 0) return frontAt(x, z, seconds)
  const patches = patchesAt(x, z, seconds)
  if (patchy >= 1) return patches
  const front = frontAt(x, z, seconds)
  return front + (patches - front) * patchy
}

const g = (x: number, digits = 4): string => x.toFixed(digits)
const range = (ends: number[], t: string): string => `mix(${g(ends[0])}, ${g(ends[1])}, ${t})`
const puffCalls = (then: string): string =>
  SIZES.map((size, j) => {
    const wx = Math.cos(size.turn) * windWay.x - Math.sin(size.turn) * windWay.z
    const wz = Math.sin(size.turn) * windWay.x + Math.cos(size.turn) * windWay.z
    return Array.from({ length: size.back + 1 }, (_, i) => `  if (windPuff(at, seconds, ${j}u, ${i}.0, vec2(${g(wx, 6)}, ${g(wz, 6)}), vec4(${g(size.speed)}, ${g(size.long)}, ${g(size.wide)}, ${g(size.strength)}), ${g(((size.back + 0.25) * size.long) / size.speed)}, hit, way)) ${then}`).join('\n')
  }).join('\n')

// When the gusts of the last shot have come in, 0 to 1, for a shader: this, the second, and a closing bracket.
export const PATCHY_GLSL = `smoothstep(${g(PATCHY_FROM_S, 5)}, ${g(PATCHY_BY_S, 5)}, `

// The one front for a shader, as `gustAt(place, seconds)`.
export const frontGlsl = /* glsl */ `
float gustPulse(float f) {
  float x = fract(f);
  return smoothstep(0.0, 0.12, x) * exp(-3.2 * max(x - 0.12, 0.0)) * smoothstep(0.0, 0.25, 1.0 - x);
}
float gustAt(vec2 at, float seconds) {
  float along = at.x * ${windWay.x.toFixed(4)} + at.y * ${windWay.z.toFixed(4)};
  float across = at.y * ${windWay.x.toFixed(4)} - at.x * ${windWay.z.toFixed(4)};
  float front = (along - ${WAVE_SPEED.toFixed(2)} * seconds) / ${WAVE_M.toFixed(2)} + 0.22 * sin(across * 0.045 + 1.3) + 0.1 * sin(across * 0.13 - seconds * 0.21);
  return 0.85 * gustPulse(-front) + 0.15 * (0.5 + 0.5 * sin(6.2831853 * (along - ${RIPPLE_SPEED.toFixed(2)} * seconds) / ${RIPPLE_M.toFixed(2)} + across * 0.4));
}
`

// The wind of the whole film for a shader, as `gustAt(place, seconds)`: that front as `gustAtFront`, and from bar 65 the gusts.
// What those gusts do to one plant is `windBent(place, seconds, its three numbers)`: how far its top is carried in x and y, how hard the air pushes in z, how far its head has come along the wind in w.
export const gustGlsl = /* glsl */ `${frontGlsl.replace(/gustAt/g, 'gustAtFront')}
highp uint windMix3(highp uint a, highp uint b, highp uint c) {
  highp uint h = (a * 0x9E3779B1u) ^ (b * 0x85EBCA6Bu) ^ (c * 0xC2B2AE35u);
  h = (h ^ (h >> 15)) * 0x2C1B3C6Du;
  h = (h ^ (h >> 12)) * 0x297A2D39u;
  return h ^ (h >> 15);
}
highp uint windTurned(highp uint h) { return h * 747796405u + 2891336453u; }
highp float windShare(highp uint h) { return float(h >> 8) * ${(1 / 16777216).toExponential(8)}; }
highp float windHeld(highp float x) { return x * inversesqrt(1.0 + x * x * ${g(1 / (MOST * MOST), 6)}); }
// One gust as it reaches a place: how hard in hit.x, the seconds since its front passed in hit.y, how fast it lets go and rises in hit.zw, and which way it pushes.
bool windPuff(highp vec2 at, highp float seconds, highp uint j, highp float i, highp vec2 w, highp vec4 size, highp float lasts, out highp vec4 hit, out highp vec2 way) {
  highp float along = dot(at, w);
  highp float across = at.y * w.x - at.x * w.y;
  highp float moved = (along - size.x * seconds) / size.y;
  highp float first = floor(moved);
  highp uint cell = uint(int(first + i) + 1024);
  highp float row = across / size.z + windShare(windTurned(windMix3(j + 1u, cell, 7u)));
  highp float lane = floor(row);
  highp uint h = windTurned(windMix3(cell * 4u + j, uint(int(lane) + 1024), 13u));
  highp float stretch = ${range(TRAVEL_M, 'windShare(h)')};
  h = windTurned(h);
  highp float travel = (along + windShare(h) * stretch) / stretch;
  highp float life = floor(travel);
  h = windTurned(windMix3(h, uint(int(life) + 1024), 29u));
  highp float r1 = windShare(h);
  h = windTurned(h);
  highp float r2 = windShare(h);
  h = windTurned(h);
  highp float r3 = windShare(h);
  h = windTurned(h);
  highp float r4 = windShare(h);
  h = windTurned(h);
  highp float r5 = windShare(h);
  h = windTurned(h);
  highp float r6 = windShare(h);
  h = windTurned(h);
  highp float r7 = windShare(h);
  h = windTurned(h);
  highp float r8 = windShare(h);
  if (r1 < ${g(EMPTY)}) return false;
  highp float middle = 0.3 + 0.4 * r3;
  highp float v = (row - lane - middle) / (min(middle, 1.0 - middle) * (0.75 + 0.25 * r4));
  if (abs(v) >= 1.0) return false;
  highp float since = size.y * (i + 0.6 + 0.2 * r5 - ${range(BOW, 'r6')} * v * v + ${g(SKEW)} * (2.0 * r7 - 1.0) * v - (moved - first)) / size.x;
  if (since <= 0.0) return false;
  highp float alive = travel - life;
  highp float amp = size.w * (${g(WEAKEST)} + ${g(1 - WEAKEST)} * r2 * sqrt(r2)) * (1.0 - v * v) * (1.0 - v * v) * smoothstep(0.0, ${g(EDGE)}, alive) * (1.0 - smoothstep(${g(ALIVE - EDGE)}, ${g(ALIVE)}, alive)) * smoothstep(0.0, ${g(FADES_S)}, lasts - since);
  if (amp <= 0.0) return false;
  highp float off = ${g(SWERVE)} * (r8 - 0.5);
  way = vec2(cos(off) * w.x - sin(off) * w.y, sin(off) * w.x + cos(off) * w.y);
  highp float goes = size.x / (${range(HOLD, 'fract(r2 + r6)')} * size.y);
  hit = vec4(amp, since, goes, goes + 1.0 / ${range(RISE_S, 'r4')});
  return true;
}
float windPatches(highp vec2 at, highp float seconds) {
  highp float sum = 0.0;
  highp vec4 hit;
  highp vec2 way;
${puffCalls('sum += hit.x * (exp(-hit.z * hit.y) - exp(-hit.w * hit.y));')}
  return windHeld(sum);
}
// A plant struck by one gust: it gives along each of its two axes and rings there on its own note.
void windStruck(highp vec4 hit, highp vec2 way, highp vec2 e, highp vec2 w, highp vec2 dies, highp vec2 wd, inout highp vec2 x, inout highp vec2 v, inout highp float push) {
  highp float goes = exp(-hit.z * hit.y);
  highp float rises = exp(-hit.w * hit.y);
  push += hit.x * (goes - rises);
  highp vec2 en = exp(-dies * hit.y);
  highp vec2 co = en * cos(wd * hit.y);
  highp vec2 si = en * sin(wd * hit.y);
  highp vec2 k1 = w * w / ((hit.z - dies) * (hit.z - dies) + wd * wd);
  highp vec2 k2 = w * w / ((hit.w - dies) * (hit.w - dies) + wd * wd);
  highp vec2 f = hit.x * vec2(dot(way, e), way.y * e.x - way.x * e.y);
  x += f * (k1 * (goes - co - (dies - hit.z) / wd * si) - k2 * (rises - co - (dies - hit.w) / wd * si));
  v += f * (k1 * (-hit.z * goes + hit.z * co + (w * w - dies * hit.z) / wd * si) - k2 * (-hit.w * rises + hit.w * co + (w * w - dies * hit.w) / wd * si));
}
vec4 windBent(highp vec2 at, highp float seconds, highp vec3 own) {
  highp float damp = ${range(DAMPING, 'own.y')};
  highp float w1 = 6.2831853 * ${range(NOTE_HZ, 'own.x')};
  highp float w2 = w1 * (1.0 + ${range(SPLIT, 'abs(2.0 * own.z - 1.0)')} * (own.z < 0.5 ? -1.0 : 1.0));
  highp float turn = ${g(Math.atan2(windWay.z, windWay.x), 6)} + ${g(AXIS_OFF)} * (2.0 * fract(own.x * 7.31 + own.z * 3.17) - 1.0);
  highp vec2 e = vec2(cos(turn), sin(turn));
  highp vec2 w = vec2(w1, w2);
  highp vec2 dies = damp * w;
  highp vec2 wd = sqrt(1.0 - damp * damp) * w;
  highp vec2 x = vec2(0.0);
  highp vec2 v = vec2(0.0);
  highp float push = 0.0;
  highp vec4 hit;
  highp vec2 way;
${puffCalls('windStruck(hit, way, e, w, dies, wd, x, v, push);')}
  highp float k = 0.6 + 0.8 * own.y;
  highp float swing = ${g(OWN_CALM)} + ${g(OWN_GUST)} * push;
${OWN_TONES.map(([off, loud], i) => `  x += swing * ${g(loud)} * vec2(sin(w1 * (1.0 + ${g(off)} * k) * seconds + 6.2831853 * dot(own, vec3(${OWN_STARTS[0][i].map((n) => g(n, 1)).join(', ')}))), ${g(OWN_ACROSS)} * sin(w2 * (1.0 - ${g(off)} * k) * seconds + 6.2831853 * dot(own, vec3(${OWN_STARTS[1][i].map((n) => g(n, 1)).join(', ')}))));`).join('\n')}
  highp vec2 top = vec2(x.x * e.x - x.y * e.y, x.x * e.y + x.y * e.x);
  highp float most = inversesqrt(1.0 + dot(top, top) * ${g(1 / (MOST * MOST), 6)});
  top *= most;
  return vec4(top, windHeld(push), dot(top - ${g(HEAD_LATE_S)} * most * vec2(v.x * e.x - v.y * e.y, v.x * e.y + v.y * e.x), vec2(${g(windWay.x, 6)}, ${g(windWay.z, 6)})));
}
float gustAt(vec2 at, float seconds) {
  float patchy = ${PATCHY_GLSL}seconds);
  if (patchy <= 0.0) return gustAtFront(at, seconds);
  float patches = windPatches(at, seconds);
  return patchy >= 1.0 ? patches : mix(gustAtFront(at, seconds), patches, patchy);
}
`
