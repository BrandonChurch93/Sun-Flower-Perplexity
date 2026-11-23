import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { stream } from '../core/random.ts'
import { huskLengthM, huskRest } from '../plant/growth.ts'
import { cropLight } from './light.ts'
import { crack, crackShape, dampFill, groundStates, laneDir, soilClock, soilHeight, sunWayDir, sunWayRise } from './soil.ts'

export { laneDir }

// Loose soil on the near ground. Far from the plant: crumbs a few millimeters across, a share of them stones, and clods up to a few centimeters.
// Round the plant, where the dawn lens is a finger's width away: grains under a millimeter, aggregates of a few millimeters and masses over a centimeter, each aggregate and mass built of smaller crumbs stuck to it.
// `beside` is the share of a scatter laid in a band across the way to the camera at the plant's own distance, where the dawn lens is sharp. `frontM` is the largest size between that band and the lens, so the band is seen over it.
// `rugged` is how broken a lump's own outline is, from 0 for a ball; a large lump with no crumbs of its own is kept round, or it reads as a stone. `cover` is how much of a lump's upper side its own crumbs hide, and `childM` their sizes. `beads` is the share of lumps and crumbs that carry a bead of dew.
export interface Scatter { count: number; detail: number; minM: number; maxM: number; skew: number; innerM: number; outerM: number; spread: number; stones: number; sink: number; beside?: number; frontM?: number; cover?: number; childM?: [number, number]; beads?: number; flat?: number; rugged?: number; finer?: boolean }
export const crumbScatter: Scatter = { count: 3500, detail: 1, minM: 0.001, maxM: 0.0045, skew: 2.2, innerM: 0.1, outerM: 0.9, spread: 1.4, stones: 0.03, sink: 0.38 }
export const clodScatter: Scatter = { count: 200, detail: 3, minM: 0.005, maxM: 0.01, skew: 1.8, innerM: 0.2, outerM: 0.9, spread: 1.3, stones: 0, sink: 0.45, rugged: 0.4 }
export const grainScatter: Scatter = { count: 4200, detail: 2, minM: 0.0003, maxM: 0.0011, skew: 1.6, innerM: 0.004, outerM: 0.13, spread: 1.25, stones: 0.04, sink: 0.3, beside: 0.25, beads: 0.3 }
// The lumps round the stem and their crumbs are built of finer faces, so no flat face shows where the lens is sharp.
export const lumpScatter: Scatter = { finer: true, count: 520, detail: 3, minM: 0.0012, maxM: 0.0036, skew: 1.5, innerM: 0.007, outerM: 0.13, spread: 1.3, stones: 0, sink: 0.45, beside: 0.3, frontM: 0.0026, cover: 0.5, childM: [0.0004, 0.001], beads: 0.25 }
// The grains and lumps round the stem are drawn while the lens is within the first of these distances of the plant's foot, and shrink to nothing by the second.
export const fineReachM = [1.2, 1.5]
// A film of dew on a crumb gives back more of the sky that lights it, and most of its blue.
export const dewFill = [0.6, 0.62, 1.38]
export const massScatter: Scatter = { finer: true, count: 11, detail: 5, minM: 0.005, maxM: 0.009, skew: 1, innerM: 0.012, outerM: 0.032, spread: 1, stones: 0, sink: 0.4, frontM: 0.0045, cover: 1.5, childM: [0.0004, 0.002], beads: 0.3, flat: 1.1 }


const LANE_CRUMB_M = 0.0022
// Where the husk comes to rest it lies on the soil itself: no loose lump larger than a lane crumb within reach of it, and full size only from twice that reach.
const HUSK_REACH = 0.6

export function lane(x: number, z: number, padM = 0): number {
  const along = x * laneDir.x + z * laneDir.z
  const across = Math.max(0, Math.abs(x * laneDir.z - z * laneDir.x) - padM)
  const step = (a: number, b: number, v: number): number => Math.min(1, Math.max(0, (v - a) / (b - a)))
  return (1 - step(0.012 + 0.1 * along, 0.03 + 0.22 * along, across)) * step(0, 0.03, along)
}

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function grain3(x: number, y: number, z: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  let fx = x - ix
  let fy = y - iy
  let fz = z - iz
  fx = fx * fx * (3 - 2 * fx)
  fy = fy * fy * (3 - 2 * fy)
  fz = fz * fz * (3 - 2 * fz)
  const mix = (a: number, b: number, t: number): number => a + (b - a) * t
  return mix(
    mix(mix(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx), mix(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx), fy),
    mix(mix(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx), mix(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx), fy),
    fz,
  )
}

// How far the surface of a lump stands from its center along the direction d, as a share of its radius: broad knobs with four sizes of grain on them. A stone is nearly a plain ball.
export function lumpAt(x: number, y: number, z: number, seed: number, stone: number): number {
  const qx = x * 2.3 + seed
  const qy = y * 2.3 + seed
  const qz = z * 2.3 + seed
  const knob = 0.5 + 0.2 * Math.sin(qx + 1.7 * Math.sin(qz)) + 0.17 * Math.sin(qy * 1.3 + 1.9 * Math.sin(qx)) + 0.13 * Math.sin(qz * 1.9 + qy)
  const s2 = seed * 1.7
  const s3 = seed * 2.3
  const s4 = seed * 3.1
  const rough =
    0.4 * grain3(x * 2.9 + seed, y * 2.9 + seed, z * 2.9 + seed) +
    0.34 * (1 - Math.abs(2 * grain3(x * 5.3 + s2, y * 5.3 + s2, z * 5.3 + s2) - 1)) +
    0.2 * grain3(x * 14 + s3, y * 14 + s3, z * 14 + s3) +
    0.13 * grain3(x * 31 + s4, y * 31 + s4, z * 31 + s4)
  return 0.5 + (stone ? 0.14 : 0.5) * knob + (stone ? 0.06 : 0.55) * (rough - 0.5)
}

interface Ball { dirs: Float32Array; faces: ArrayLike<number>; per: number }

const balls = new Map<number, Ball>()
function ballOf(detail: number): Ball {
  const known = balls.get(detail)
  if (known) return known
  const ball = new THREE.IcosahedronGeometry(1, detail)
  ball.deleteAttribute('normal')
  ball.deleteAttribute('uv')
  const unit = mergeVertices(ball, 1e-4)
  const dirs = unit.getAttribute('position').array as Float32Array
  const made = { dirs, faces: unit.getIndex()!.array, per: dirs.length / 3 }
  balls.set(detail, made)
  return made
}

const turn = new THREE.Quaternion()
const axis = new THREE.Vector3()
const basis = new THREE.Matrix4()
const v = new THREE.Vector3()
const t1 = new THREE.Vector3()
const t2 = new THREE.Vector3()
const d1 = new THREE.Vector3()
const d2 = new THREE.Vector3()
const lean = new THREE.Vector3(0.31, 0.83, 0.46)

// One rounded shape of a lump: where it sits from the lump's foot, its size along its own three axes, how it is turned, and what it is. Kind 0 is soil, 1 a stone, 2 a bead of dew.
interface Blob { x: number; y: number; z: number; ox: number; oy: number; oz: number; sx: number; sy: number; sz: number; e: number[]; radius: number; whole: number; shade: number; tone: number; kind: number; rugged: number; detail: number }

const detailOf = (radius: number, most: number, finer = false): number => Math.min(most, radius < (finer ? 0.0003 : 0.00045) ? 1 : radius < (finer ? 0.0007 : 0.0016) ? 2 : radius < 0.004 ? 3 : 5)

// Every crumb is shaped here, once, so that drawing one costs no noise: each vertex carries its offset from the foot of its lump, its normal and the direction it had on the plain ball.
export function scatter(name: string, s: Scatter): THREE.Mesh {
  const random = stream(name)
  const blobs: Blob[] = []
  const spin = (): number[] => {
    axis.set(random.next() - 0.5, random.next() - 0.5, random.next() - 0.5).normalize()
    turn.setFromAxisAngle(axis, random.next() * Math.PI * 2)
    return basis.makeRotationFromQuaternion(turn).elements.slice(0, 11)
  }
  for (let i = 0; i < s.count; i++) {
    let r = s.innerM + (s.outerM - s.innerM) * Math.pow(random.next(), s.spread)
    let a = random.next() * Math.PI * 2
    if (s.beside !== undefined && random.next() < s.beside) {
      const across = (random.next() < 0.5 ? -1 : 1) * (0.006 + 0.07 * Math.pow(random.next(), 1.3))
      const along = -0.002 + 0.012 * (random.next() - 0.5)
      const bx = along * laneDir.x + across * laneDir.z
      const bz = along * laneDir.z - across * laneDir.x
      r = Math.hypot(bx, bz)
      a = Math.atan2(bz, bx)
    }
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const open = 1 - lane(x, z, 0.8 * s.maxM)
    const ahead = x * laneDir.x + z * laneDir.z
    const front = Math.min(1, Math.max(0, (ahead - 0.008) / 0.022)) * Math.min(1, Math.max(0, (0.3 - ahead) / 0.1))
    const low = s.frontM === undefined ? s.maxM : s.maxM + (s.frontM - s.maxM) * front
    const sunward = x * sunWayDir.x + z * sunWayDir.z
    const aside = Math.abs(x * sunWayDir.z - z * sunWayDir.x)
    const lit = (s.flat !== undefined && sunward > 0.008) || (sunward > 0.022 && sunward < 0.7 && aside < 0.02 + 0.35 * sunward) ? Math.max(LANE_CRUMB_M, 0.35 * sunWayRise * sunward) : s.maxM
    const husk = Math.min(1, Math.max(0, Math.hypot(x - huskRest.x, z - huskRest.z) / (HUSK_REACH * huskLengthM) - 1))
    const radius = Math.min(s.minM + (s.maxM - s.minM) * Math.pow(random.next(), s.skew), LANE_CRUMB_M + (s.maxM - LANE_CRUMB_M) * open, low, lit, LANE_CRUMB_M + (s.maxM - LANE_CRUMB_M) * husk)
    const e = spin()
    const sx = radius * (0.7 + 0.7 * random.next())
    const sy = radius * (0.45 + 0.4 * random.next()) * (s.flat ?? 1)
    const sz = radius * (0.7 + 0.7 * random.next())
    const y = radius * (0.55 - s.sink)
    const shade = random.next() * 97
    const tone = random.next()
    const stone = random.next() < s.stones ? 1 : 0
    blobs.push({ x, y, z, ox: 0, oy: 0, oz: 0, sx, sy, sz, e, radius, whole: radius, shade, tone, kind: stone, rugged: s.rugged ?? (s.cover ? 0.85 : 1), detail: detailOf(radius, s.detail, s.finer) })
    const on = (wx: number, wy: number, wz: number, sink: number): [number, number, number] => {
      const lx = e[0] * wx + e[1] * wy + e[2] * wz
      const ly = e[4] * wx + e[5] * wy + e[6] * wz
      const lz = e[8] * wx + e[9] * wy + e[10] * wz
      const lump = (1 + (s.cover ? 0.85 : 1) * (lumpAt(lx, ly, lz, shade, stone) - 1)) * sink
      const px = lx * lump * sx
      const py = ly * lump * sy
      const pz = lz * lump * sz
      return [e[0] * px + e[4] * py + e[8] * pz, e[1] * px + e[5] * py + e[9] * pz, e[2] * px + e[6] * py + e[10] * pz]
    }
    const up = (lowest: number): [number, number, number] => {
      const wy = lowest + (1 - lowest) * random.next()
      const wa = random.next() * Math.PI * 2
      const wr = Math.sqrt(1 - wy * wy)
      return [wr * Math.cos(wa), wy, wr * Math.sin(wa)]
    }
    const bead = (cx: number, cy: number, cz: number, host: number): void => {
      const size = Math.min(0.00012 + 0.00026 * Math.pow(random.next(), 2), 0.45 * host)
      const [wx, wy, wz] = up(0.35)
      const bx = cx + wx * host * 0.75
      const by = cy + wy * host * 0.6 + size * 0.5
      const bz = cz + wz * host * 0.75
      blobs.push({ x, y, z, ox: bx, oy: by, oz: bz, sx: size, sy: size * 0.85, sz: size, e: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], radius: size, whole: radius, shade: random.next() * 97, tone: random.next(), kind: 2, rugged: 0, detail: 1 })
    }
    if (s.cover && s.childM && radius > 2 * s.childM[0]) {
      const most = Math.min(s.childM[1], 0.45 * radius)
      const mean = 0.5 * (s.childM[0] + most)
      const n = Math.round((s.cover * 2.6 * radius * radius) / (mean * mean))
      for (let c = 0; c < n; c++) {
        const [wx, wy, wz] = up(-0.35)
        const [ox, oy, oz] = on(wx, wy, wz, 0.9)
        const size = s.childM[0] + (most - s.childM[0]) * Math.pow(random.next(), 2)
        const ce = spin()
        blobs.push({ x, y, z, ox, oy, oz, sx: size * (0.75 + 0.6 * random.next()), sy: size * (0.6 + 0.5 * random.next()), sz: size * (0.75 + 0.6 * random.next()), e: ce, radius: size, whole: radius, shade: shade + 3.7 * (c + 1), tone: Math.min(1, Math.max(0, tone + 0.5 * (random.next() - 0.5))), kind: random.next() < 0.03 ? 1 : 0, rugged: 1, detail: detailOf(size, s.finer ? 3 : 2, s.finer) })
        if (s.beads && wy > 0.2 && random.next() < s.beads) bead(ox, oy, oz, size)
      }
    } else if (s.beads && stone === 0 && random.next() < s.beads) bead(0, 0, 0, Math.min(sx, sy, sz))
  }
  let total = 0
  let faces = 0
  for (const b of blobs) {
    const ball = ballOf(b.detail)
    total += ball.per
    faces += ball.faces.length
  }
  const position = new Float32Array(total * 3)
  const normal = new Float32Array(total * 3)
  const round = new Float32Array(total * 3)
  const center = new Float32Array(total * 4)
  const seed = new Float32Array(total * 4)
  const index = new Uint32Array(faces)
  let base = 0
  let face = 0
  for (const b of blobs) {
    const ball = ballOf(b.detail)
    const e = b.e
    const stone = b.kind === 1 ? 1 : 0
    for (let k = 0; k < ball.per; k++) {
      const px = ball.dirs[k * 3]
      const py = ball.dirs[k * 3 + 1]
      const pz = ball.dirs[k * 3 + 2]
      const o = (base + k) * 3
      let lump = 1
      if (b.kind === 2) v.set(px, py, pz)
      else {
        lump = 1 + b.rugged * (lumpAt(px, py, pz, b.shade, stone) - 1)
        v.set(px, py, pz)
        t1.crossVectors(v, lean).normalize()
        t2.crossVectors(v, t1)
        d1.copy(v).addScaledVector(t1, 0.07).normalize()
        d2.copy(v).addScaledVector(t2, 0.07).normalize()
        d1.multiplyScalar(1 + b.rugged * (lumpAt(d1.x, d1.y, d1.z, b.shade, stone) - 1)).addScaledVector(v, -lump)
        d2.multiplyScalar(1 + b.rugged * (lumpAt(d2.x, d2.y, d2.z, b.shade, stone) - 1)).addScaledVector(v, -lump)
        v.crossVectors(d1, d2).normalize()
      }
      const lx = px * lump * b.sx
      const ly = py * lump * b.sy
      const lz = pz * lump * b.sz
      position[o] = b.ox + e[0] * lx + e[4] * ly + e[8] * lz
      position[o + 1] = b.oy + e[1] * lx + e[5] * ly + e[9] * lz
      position[o + 2] = b.oz + e[2] * lx + e[6] * ly + e[10] * lz
      const nx = v.x / b.sx
      const ny = v.y / b.sy
      const nz = v.z / b.sz
      v.set(e[0] * nx + e[4] * ny + e[8] * nz, e[1] * nx + e[5] * ny + e[9] * nz, e[2] * nx + e[6] * ny + e[10] * nz).normalize()
      normal[o] = v.x
      normal[o + 1] = v.y
      normal[o + 2] = v.z
      if (b.kind === 2) v.set(b.ox, b.oy, b.oz)
      else {
        v.set(e[0] * px * b.sx + e[4] * py * b.sy + e[8] * pz * b.sz, e[1] * px * b.sx + e[5] * py * b.sy + e[9] * pz * b.sz, e[2] * px * b.sx + e[6] * py * b.sy + e[10] * pz * b.sz).normalize()
        const reach = Math.hypot(b.ox, b.oy, b.oz)
        if (reach > 0) v.multiplyScalar(0.5).add(t1.set(b.ox, b.oy, b.oz).multiplyScalar(0.8 / reach)).normalize()
      }
      round[o] = v.x
      round[o + 1] = v.y
      round[o + 2] = v.z
      const q = (base + k) * 4
      center[q] = b.x
      center[q + 1] = b.y
      center[q + 2] = b.z
      center[q + 3] = b.whole
      seed[q] = b.shade
      seed[q + 1] = b.tone
      seed[q + 2] = b.kind
      seed[q + 3] = b.radius
    }
    for (let k = 0; k < ball.faces.length; k++) index[face + k] = base + ball.faces[k]
    base += ball.per
    face += ball.faces.length
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('aNormal', new THREE.BufferAttribute(normal, 3))
  geometry.setAttribute('aRound', new THREE.BufferAttribute(round, 3))
  geometry.setAttribute('aCenter', new THREE.BufferAttribute(center, 4))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), s.outerM + 0.1)
  return new THREE.Mesh(geometry)
}

// A bead of dew: a small ball of water that shows the sky upside down through itself, mirrors it at its rim, throws the sun back from one point and glows where the sun behind it comes through.
// The large lumps round the seedling stand at this share of their size through the dawn and swell to full as the stem thickens in the rain.
const MASS_YOUNG = 0.62

export const beadLook = /* glsl */ `
vec3 beadSky(vec3 d, float open) {
  return mix(uAirHorizon, uAirZenith, sqrt(saturate(d.y))) + uAirSun * open * 0.25 * pow(max(dot(d, uSunDir), 0.0), 40.0);
}
vec3 beadColor(vec3 nb, vec3 v, float shadow) {
  float facing = max(dot(nb, v), 0.0);
  vec3 through = normalize(-v - 1.2 * (nb - facing * v));
  vec3 back = reflect(-v, nb);
  float skim = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  vec3 below = skyAmbient(vec3(0.0, 1.0, 0.0)) * 0.04;
  vec3 drop = mix(below, beadSky(through, shadow), smoothstep(-0.05, 0.12, through.y)) * (1.0 - skim) * 0.9;
  drop += mix(below, beadSky(back, shadow), smoothstep(-0.05, 0.12, back.y)) * skim;
  drop += uSunColor * shadow * (pow(max(dot(nb, normalize(v + uSunDir)), 0.0), 140.0) * 9.0 + pow(max(dot(through, uSunDir), 0.0), 90.0) * 3.0 + pow(max(dot(through, uSunDir), 0.0), 24.0) * 0.5);
  return drop;
}
`

export const crumbVertex = /* glsl */ `
in vec3 position;
in vec3 aNormal;
in vec3 aRound;
in vec4 aCenter;
uniform float uDew;
uniform float uWet;
uniform float uFine;
in vec4 aSeed;
out vec3 vWorld;
out float vDepth;
out vec3 vBall;
out vec3 vNormal;
out vec4 vSeed;
${soilHeight}
void main() {
  vec4 place = modelMatrix * vec4(aCenter.xyz, 1.0);
  vec2 c = place.xz;
  float seen = aSeed.w * projectionMatrix[1][1] * uSize.y / max((projectionMatrix * viewMatrix * place).w, 1e-4);
  float bead = step(1.5, aSeed.z);
  float keep = uFine * smoothstep(0.35, 0.8, seen) * nearFade(c * 1.04) * (1.0 - bead);
  vSeed = aSeed;
  if (keep <= 0.0) {
    vWorld = place.xyz;
    vDepth = 1.0;
    vBall = vec3(0.0, 1.0, 0.0);
    vNormal = vBall;
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  float r = length(c);
  vec2 out2 = c / max(r, 1e-4);
  float own = dot(aCenter.xz, vec2(1731.0, 977.0));
  float mass = smoothstep(0.0036, 0.0046, aCenter.w);
  float first = hash11(own);
  float start = 0.02 + 1.3 * first * first;
  float near = 1.0 - smoothstep(uEmerge.z * 0.7, uEmerge.z * 1.7, r);
  float go = smoothstep(start, start + 0.6, uTime) * near * (1.0 - mass);
  float heave = heaved() * near * mass;
  float thin = 1.0 - smoothstep(${soilClock.thickens[0].toFixed(1)}, ${soilClock.thickens[1].toFixed(1)}, uTime);
  float angle = go * (1.0 + 2.6 * hash11(own + 5.0)) + heave * (mix(0.25, 0.35, thin) + mix(0.3, 0.4, thin) * hash11(own + 7.0));
  vec3 axis = vec3(out2.y, 0.0, -out2.x);
  mat3 m = mat3(modelMatrix);
  float young = mass * (1.0 - smoothstep(0.035, 0.05, r)) * thin;
  vec3 rel = m * mix(position * keep, aRound + (position - aRound) * keep, bead) * mix(1.0, ${MASS_YOUNG}, young);
  vec3 ball = m * mix(aRound, aNormal, bead);
  vec3 normal = m * aNormal;
  rel = rel * cos(angle) + cross(axis, rel) * sin(angle) + axis * dot(axis, rel) * (1.0 - cos(angle));
  ball = ball * cos(angle) + cross(axis, ball) * sin(angle) + axis * dot(axis, ball) * (1.0 - cos(angle));
  normal = normal * cos(angle) + cross(axis, normal) * sin(angle) + axis * dot(axis, normal) * (1.0 - cos(angle));
  c += out2 * (go * (0.003 + 0.007 * hash11(own + 9.0)) + heave * mix(0.002, 0.005 + 0.004 * (1.0 - smoothstep(0.004, 0.016, r)), thin));
  float span = crackSpan(c);
  if (span > 0.0) {
    float d = crackLine(c);
    float bay = crackBay(c, d);
    float edge = span * (crackOpen() + uCrackBay.x * bay + 0.6 * aCenter.w) * (1.0 - crackFill(c, hash11(own + 13.0), bay));
    c += vec2(uLane.y, -uLane.x) * ((sign(d) * sqrt(d * d + edge * edge) - d) * (1.0 - smoothstep(${crack.reachM} + uCrackBay.x * bay, ${2.5 * crack.reachM} + 2.0 * uCrackBay.x * bay, abs(d))));
  }
  vec4 world = vec4(c.x + rel.x, place.y + soilHeight(c, soilLod(c)) + rel.y, c.y + rel.z, 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  vBall = normalize(ball);
  vNormal = normalize(normal);
  gl_Position = projectionMatrix * view;
}
`

export const crumbFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
in vec3 vBall;
in vec3 vNormal;
in vec4 vSeed;
uniform sampler2D tColor;
uniform sampler2D tData;
uniform vec2 uColorSize;
uniform vec3 uTiles;
uniform vec2 uScales;
uniform float uWet;
uniform float uFrost;
uniform float uDew;
uniform vec2 uToward;
uniform vec2 uLane;
${groundStates}
${crackShape}
${cropLight}
const mat2 TURN_K = mat2(0.616, 0.788, -0.788, 0.616);
const vec3 DAMP_FILL = vec3(${dampFill.join(', ')});
const vec3 DEW_FILL = vec3(${dewFill.join(', ')});
// At dawn the sun skims over each lump's crest: its rough upper side toward the sun takes the light this far round, at this strength.
const vec2 CREST = vec2(0.55, 1.4);
const float CREST_TOP = 0.7;
// How much of the sun the crack's left lip takes where it turns to the gap.
const float CRACK_LIP = 0.8;
// The dew on a lit crest throws the sun back in small hard points: the share of the grains that carry a drop, and how bright it is.
const vec2 DEW_GLINT = vec2(0.1, 0.5);
${beadLook}
void main() {
  vec3 v = normalize(uCamPos - vWorld);
  vec2 p = vWorld.xz;
  if (vSeed.z > 1.5) {
    vec3 nb = normalize(vNormal);
    float shadow = lowSun(sunShadow(vWorld, nb, uShadowTexelM * 1.5), 1.0, vWorld.y) * cropLight(p, -dot(p, uToward));
    vec3 drop = beadColor(nb, v, shadow);
    outColor = finish(drop, vWorld, vDepth, 1.0);
    return;
  }
  vec3 side = abs(normalize(vNormal));
  vec2 lay = side.y > 0.62 ? vWorld.xz : (side.x > side.z ? vWorld.zy : vWorld.xy);
  vec2 uv = TURN_K * lay * (uTiles.x * uScales.x) + vec2(vSeed.x * 0.37, vSeed.x * 0.61);
  vec4 cD = texture(tColor, uv);
  vec4 dD = texture(tData, uv);
  vec4 grit = texture(tData, TURN_K * uv * 3.3 + vec2(0.17, 0.59));
  vec2 g = dD.rg * 2.0 - 1.0 + (grit.rg * 2.0 - 1.0) * TURN_K * 0.9;
  vec3 smoothN = normalize(vNormal);
  smoothN *= sign(dot(smoothN, v) + 0.35);
  float dull = soilMatt();
  vec4 pores = texture(tData, TURN_K * uv * 8.7 + vec2(0.43, 0.11));
  float pore = dull * (1.0 - vSeed.z) * smoothstep(0.5, 0.25, pores.a);
  g += (pores.rg * 2.0 - 1.0) * 0.5 * dull;
  vec3 n = normalize(smoothN + vec3(g.x, 0.0, g.y) * mix(mix(0.9, mix(0.45, 0.5, dull), uDew), 0.25, vSeed.z));
  vec3 albedo = cD.rgb * mix(0.62, 1.12, vSeed.y) * (1.0 - 0.45 * pore);
  float luma = dot(albedo, vec3(0.3, 0.6, 0.1));
  albedo = mix(albedo, (0.25 + 1.5 * luma) * mix(vec3(0.24, 0.22, 0.19), vec3(0.36, 0.29, 0.22), vSeed.y), vSeed.z);
  float damp = saturate(uWet + 0.3 * uDew) * mix(1.0, 0.6, vSeed.z);
  albedo = dampened(albedo, damp);

  float lit = lowSun(sunShadow(vWorld, n, uShadowTexelM * 1.5), vBall.y, vWorld.y) * cropLight(p, -dot(p, uToward));
  float open = (mix(0.25, 0.4, uDew) + mix(0.75, 0.5, uDew) * saturate(0.5 + 0.5 * vBall.y)) * (mix(0.15, 0.32, uDew) + 1.15 * smoothstep(0.25, 0.8, dD.a)) * (0.45 + grit.a) * (1.0 - 0.5 * pore);
  float foot = footShade(p, dull);
  open *= foot;
  lit *= foot * mix(1.0, smoothstep(-0.5, 0.2, dot(vBall, uSunDir)), dull * (1.0 - smoothstep(0.02, 0.035, uSunDir.y)));
  vec3 toSky = normalize(mix(n, smoothN, 0.6 * dull));
  float wrap = mix(0.25, 0.2, uDew) * (1.0 - 0.8 * dull * uDew);
  vec3 toSun = normalize(mix(n, smoothN, 0.85 * dull * uDew));
  float sunOn = saturate((dot(toSun, uSunDir) + wrap) / (1.0 + wrap));
  vec3 ball = normalize(vBall);
  float crest = saturate((dot(ball, uSunDir) + CREST.x + CREST_TOP * max(ball.y, 0.0)) / (1.0 + CREST.x)) * smoothstep(0.4, 0.8, dD.a) * (0.45 + grit.a);
  float dawn = dawnOnly() * uDew;
  float span = crackSpan(p);
  if (span > 0.0) {
    float d = -crackLine(p) - (crackOpen() + uCrackBay.x * crackBay(p, -1.0)) * span;
    float lip = span * (1.0 - smoothstep(uCrackWay.w, uCrackCut.z, uTime)) * (1.0 - smoothstep(0.0, uCrackCut.w, d)) * step(-0.001, d) * smoothstep(-0.3, 0.4, dot(ball.xz, vec2(uLane.y, -uLane.x)));
    lit = max(lit, lip * foot * smoothstep(-0.002, 0.004, vWorld.y));
    sunOn = max(sunOn, CRACK_LIP * lip * (0.45 + grit.a));
  }
  sunOn = mix(sunOn, max(sunOn, CREST.y * crest), dawn);
  sunOn *= 1.0 - 0.8 * uDusk * uDew;
  float sits = saturate(0.55 * smoothstep(0.0, 0.7, n.y) + 0.6 * smoothstep(0.1, 0.8, ball.y)) * smoothstep(0.3, 0.62, dD.a);
  float rime = max(rimed(vWorld, sits, uFrost, lit * sunOn), dusted(vWorld, sits, uFrost, lit * sunOn)) * (1.0 - vSeed.z);
  albedo = mix(frozen(albedo, uFrost), FROST_WHITE, 0.92 * rime);
  open = mix(open, max(open, 0.85), rime);
  vec3 color = albedo * (uSunColor * sunOn * lit * underFlash(uWet) + groundAmbient(toSky) * open * proud(vWorld.y, uDew) * mix(vec3(1.0), DEW_FILL, uDew) * mix(vec3(1.0), DAMP_FILL, dull * uDew) * mix(vec3(1.0), DAWN_SKY, dawn * (1.0 - uBlueHour)));
  vec3 hv = normalize(v + uSunDir);
  float gloss = mix(sheen(uWet, uDew), 0.25 + 0.75 * damp, vSeed.z) * (1.3 - dD.b);
  color += uSunColor * pow(max(dot(n, hv), 0.0), mix(24.0, 160.0, uWet)) * underFlash(1.0) * gloss * glare(v, hv) * lit * selfShade() * mix(0.3, 1.0, uWet) * mix(1.0, 0.68, uDew) * mix(1.0, 0.3, dull);
  color += groundAmbient(reflect(-v, n)) * selfShade() * (0.03 + pow(1.0 - max(dot(n, v), 0.0), 5.0)) * gloss * mix(0.08, 0.1, uWet) * open * mix(1.0, 0.25, dull);
  color += (wetGlints(vWorld, v, n, uWet) * mix(1.0, 0.35, dull) + wetSheen(v, normalize(smoothN + 0.35 * (n - smoothN)), uWet) * smoothstep(0.4, 0.85, dD.a)) * open;
  color += uSunColor * (grains(vWorld + 0.37, DEW_GLINT.x) * DEW_GLINT.y * dawn * lit);
  color += duskSheen(vWorld, v, n) * (0.3 + 0.7 * open);
  color += duskGlow(vWorld, v, ball, albedo, 1.0) * (0.3 + 0.7 * open);
  color += wetAnswer(vWorld, v, normalize(smoothN + 0.35 * (n - smoothN)), uWet * uWet, lit, 0.0) * (0.3 + 0.7 * open);
  color += FROST_WHITE * rime * rime * (groundAmbient(vec3(0.0, 1.0, 0.0)) * 0.4 + uSunColor * lit * (0.2 + 0.6 * pow(saturate(-dot(v, uSunDir)), 2.0)));
  color += (uSunColor * lit * 7.0 * frostSpark(vWorld, n, v, uSunDir) + uSkyHorizonSun * 1.2 * frostSpark(vWorld + 0.5, n, v, normalize(vec3(uLowSun.x, 0.3, uLowSun.y)))) * rime;
  outColor = finish(color, vWorld, vDepth, texelDensity(uv, uColorSize));
}
`
