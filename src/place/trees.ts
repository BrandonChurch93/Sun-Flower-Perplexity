import * as THREE from 'three'
import { hash32, stream } from '../core/random.ts'
import { makeSurface } from '../core/shading.ts'
import { airGlsl, airUniforms, farDepth } from './air.ts'
import { FIELDS, cellAt, fieldEdge, fieldHash, fromFields, gateAt, isHome, landHill, noise2, soilAt, stripEdge, woodAt } from './land.ts'

// Trees, copses and hedges: each one a card that turns to the lens, cut out and lit by a crown drawn at load. One crown is some eighty balls of leaves on a trunk, seen from the side, kept as its surface direction, how deep each leaf sits in the crown, and where the sky shows through.
const CELL = 256
const COLS = 4
const ROWS = 2
const RAD = Math.PI / 180

interface CrownShape { centerY: number; rx: number; ry: number; trunkTop: number; trunkW: number; clumps: number; clumpR: [number, number]; flat: number; lean: number }

const SHAPES: CrownShape[] = [
  { centerY: 0.61, rx: 0.4, ry: 0.33, trunkTop: 0.36, trunkW: 0.028, clumps: 90, clumpR: [0.07, 0.115], flat: 0, lean: 0 },
  { centerY: 0.6, rx: 0.3, ry: 0.36, trunkTop: 0.3, trunkW: 0.024, clumps: 75, clumpR: [0.06, 0.1], flat: 0, lean: 0.03 },
  { centerY: 0.56, rx: 0.43, ry: 0.28, trunkTop: 0.34, trunkW: 0.03, clumps: 95, clumpR: [0.065, 0.11], flat: 0.2, lean: -0.04 },
  { centerY: 0.63, rx: 0.34, ry: 0.32, trunkTop: 0.38, trunkW: 0.024, clumps: 60, clumpR: [0.065, 0.12], flat: 0, lean: 0.07 },
  { centerY: 0.53, rx: 0.14, ry: 0.43, trunkTop: 0.14, trunkW: 0.02, clumps: 70, clumpR: [0.045, 0.075], flat: 0, lean: 0 },
  { centerY: 0.46, rx: 0.38, ry: 0.4, trunkTop: 0.12, trunkW: 0.03, clumps: 80, clumpR: [0.07, 0.12], flat: 0, lean: 0 },
  { centerY: 0.4, rx: 0.5, ry: 0.42, trunkTop: 0, trunkW: 0, clumps: 110, clumpR: [0.07, 0.13], flat: 0.5, lean: 0 },
  { centerY: 0.36, rx: 0.5, ry: 0.46, trunkTop: 0, trunkW: 0, clumps: 90, clumpR: [0.06, 0.14], flat: 0.35, lean: 0 },
]
const HEDGES = [6, 7]
const TALL = [0, 0, 1, 2, 2, 3, 5]
const POPLAR = 4

function drawCrown(shape: CrownShape, seed: number, data: Uint8Array, col: number, row: number): void {
  const rnd = stream(`place crown ${seed}`)
  const depth = new Float32Array(CELL * CELL).fill(-9)
  const nx = new Float32Array(CELL * CELL)
  const ny = new Float32Array(CELL * CELL)
  const rim = new Float32Array(CELL * CELL)
  const hedge = shape.trunkTop === 0
  if (!hedge) {
    for (let py = 0; py < shape.trunkTop * CELL + 6; py++) {
      const y = py / CELL
      const w = shape.trunkW * (1.5 - 0.7 * (y / shape.trunkTop))
      const cx = shape.lean * y
      for (let px = Math.floor((0.5 + cx - w) * CELL); px <= (0.5 + cx + w) * CELL; px++) {
        const x = px / CELL - 0.5 - cx
        const t = py * CELL + px
        depth[t] = -0.2
        nx[t] = (x / w) * 0.85
        ny[t] = 0
        rim[t] = 1
      }
    }
  }
  for (let c = 0; c < shape.clumps; c++) {
    // A point in the crown, nearer its skin than its heart.
    let x = 0
    let y = 0
    let z = 0
    for (let tries = 0; tries < 30; tries++) {
      x = rnd.range(-1, 1)
      y = rnd.range(-1, 1)
      z = rnd.range(-1, 1)
      const d = Math.hypot(x, y, z)
      if (d <= 1 && d > 0.35 * rnd.next()) break
    }
    if (y > 1 - shape.flat) y = 1 - shape.flat - 0.1 * rnd.next()
    const r = rnd.range(shape.clumpR[0], shape.clumpR[1]) * (1 - 0.3 * Math.hypot(x, y))
    let cx = x * (shape.rx - r * 0.7) + shape.lean * (shape.centerY + y * shape.ry)
    let cy = shape.centerY + y * (shape.ry - r * 0.6)
    if (hedge) cy = Math.max(cy, r * 0.5)
    cx = Math.min(0.47 - r, Math.max(-0.47 + r, cx))
    cy = Math.min(0.975 - r, cy)
    const cz = z * shape.rx
    const lobes = 3 + rnd.int(4)
    const phase = rnd.range(0, 6.28)
    const x0 = Math.max(0, Math.floor((0.5 + cx - r * 1.2) * CELL))
    const x1 = Math.min(CELL - 1, Math.ceil((0.5 + cx + r * 1.2) * CELL))
    const y0 = Math.max(0, Math.floor((cy - r * 1.2) * CELL))
    const y1 = Math.min(CELL - 1, Math.ceil((cy + r * 1.2) * CELL))
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = (px + 0.5) / CELL - 0.5 - cx
        const dy = (py + 0.5) / CELL - cy
        const rr = r * (0.84 + 0.16 * Math.sin(lobes * Math.atan2(dy, dx) + phase))
        const d2 = dx * dx + dy * dy
        if (d2 >= rr * rr) continue
        const dz = Math.sqrt(rr * rr - d2)
        const t = py * CELL + px
        if (cz + dz <= depth[t]) continue
        const edge = dz / rr
        // Leaves at the edge of a ball: some of them are missing.
        if (edge < 0.5 && (hash32(t * 31 + c * 7919 + seed) & 255) / 255 > 0.25 + 1.5 * edge) continue
        depth[t] = cz + dz
        const gx = (px + 0.5) / CELL - 0.5 - shape.lean * shape.centerY
        const gy = ((py + 0.5) / CELL - shape.centerY) * (shape.rx / shape.ry)
        const gl = Math.hypot(gx, gy, 1e-3) / shape.rx
        nx[t] = 0.5 * (dx / rr) + 0.5 * Math.min(1, gl) * (gx / (gl * shape.rx))
        ny[t] = 0.5 * (dy / rr) + 0.5 * Math.min(1, gl) * (gy / (gl * shape.rx))
        rim[t] = edge
      }
    }
  }
  for (let py = 0; py < CELL; py++) {
    for (let px = 0; px < CELL; px++) {
      const t = py * CELL + px
      const o = ((row * CELL + py) * COLS * CELL + col * CELL + px) * 4
      if (depth[t] < -8) {
        data[o] = 128
        data[o + 1] = 128
        data[o + 2] = 128
        data[o + 3] = 0
        continue
      }
      const len = Math.max(1, Math.hypot(nx[t], ny[t]))
      const deep = Math.min(1, Math.max(0, (depth[t] + shape.rx) / (2 * shape.rx)))
      const y = py / CELL
      const under = 0.55 + 0.45 * Math.min(1, Math.max(0, (y - (shape.centerY - shape.ry)) / (1.2 * shape.ry)))
      const open = (0.25 + 0.75 * Math.pow(deep, 0.8)) * under * (0.7 + 0.3 * rim[t])
      data[o] = Math.round(255 * (0.5 + 0.5 * (nx[t] / len)))
      data[o + 1] = Math.round(255 * (0.5 + 0.5 * (ny[t] / len)))
      data[o + 2] = Math.round(255 * Math.min(1, open))
      data[o + 3] = 255
    }
  }
}

export function crownAtlas(): THREE.DataTexture {
  const data = new Uint8Array(COLS * CELL * ROWS * CELL * 4)
  SHAPES.forEach((shape, i) => drawCrown(shape, i, data, i % COLS, Math.floor(i / COLS)))
  const texture = new THREE.DataTexture(data, COLS * CELL, ROWS * CELL, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.colorSpace = THREE.NoColorSpace
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

export const atlasMegabytes = (COLS * CELL * ROWS * CELL * 4 * 1.34) / 1048576

interface Tree { x: number; y: number; z: number; w: number; h: number; variant: number; flip: number; phase: number; tint: [number, number, number] }


// The bearings the lens can look along through the film, with a margin.
const SEEN = { fromDeg: 128, toDeg: 282 }
const HEDGE_FROM_M = 125
const TREES_FROM_M = 340
const BOUND_TREES_FROM_M = 230
const LINES_TO_M = 2500

function plant(): Tree[] {
  const rnd = stream('place trees')
  const trees: Tree[] = []
  const tint = (dark: number): [number, number, number] => {
    const k = (0.72 + 0.5 * rnd.next()) * dark
    const olive = 0.6 * rnd.next() * rnd.next()
    return [k * (0.03 + 0.022 * olive), k * (0.052 + 0.006 * olive), k * (0.017 - 0.003 * olive)]
  }
  // How tall a thing may stand at a point: under the sun's two gates the land stays low, and near the field nothing towers.
  const room = (x: number, z: number, soil: number): number => {
    const r = Math.hypot(x, z)
    const az = (Math.atan2(x, z) / RAD + 360) % 360
    const capDeg = 3.2 - 2.45 * gateAt(az)
    return r * Math.tan(capDeg * RAD) - Math.max(0, soil)
  }
  const seen = (x: number, z: number): boolean => {
    const az = (Math.atan2(x, z) / RAD + 360) % 360
    return az > SEEN.fromDeg && az < SEEN.toDeg
  }
  const tree = (x: number, z: number, tall: number, poplar: boolean): void => {
    const soil = soilAt(x, z)
    const allowed = room(x, z, soil)
    let h = tall
    if (allowed < 0.75 * h) {
      if (allowed < 2.2) return
      h = Math.max(allowed, 0.45 * tall)
      if (h > allowed * 1.25) return
    }
    const variant = poplar ? POPLAR : TALL[rnd.int(TALL.length)]
    trees.push({ x, y: soil - 0.25, z, w: h * (variant === 5 ? 0.95 : 1), h, variant, flip: rnd.next() < 0.5 ? -1 : 1, phase: rnd.next(), tint: tint(1) })
  }
  const hedge = (x: number, z: number): number => {
    const soil = soilAt(x, z)
    const r = Math.hypot(x, z)
    const h = Math.min(rnd.range(2.1, 3.5), r * Math.tan(1.15 * RAD), room(x, z, soil))
    if (h < 1.1) return 2.5
    const w = h * rnd.range(1.9, 2.5)
    trees.push({ x, y: soil - 0.15, z, w, h, variant: HEDGES[rnd.int(2)], flip: rnd.next() < 0.5 ? -1 : 1, phase: rnd.next(), tint: tint(0.9) })
    return w
  }
  const line = (kind: number, from: { u: number; v: number }, to: { u: number; v: number }, salt: number): void => {
    const length = Math.hypot(to.u - from.u, to.v - from.v)
    const poplars = kind < 0.05
    const trees_ = kind < 0.32
    const hedges = kind < 0.68
    let s = rnd.range(0, 4)
    let gap = 0
    while (s < length) {
      const k = s / length
      // No hedge runs through the sunflowers.
      const mu = from.u + (to.u - from.u) * k
      const mv = from.v + (to.v - from.v) * k
      const sideU = Math.abs(to.u - from.u) < 1 ? 6 : 0
      const sideV = sideU > 0 ? 0 : 6
      const one = cellAt(mu - sideU, mv - sideV)
      const other = cellAt(mu + sideU, mv + sideV)
      const homeOne = isHome(one.i, one.j)
      const homeOther = isHome(other.i, other.j)
      if (homeOne && homeOther) {
        s += 6
        continue
      }
      // Where the sunflowers end stands a hedge with trees in it, in runs with long gaps between them.
      const bound = homeOne !== homeOther
      const run = bound && noise2(mu / 140 + 3.3, mv / 140 + 8.1, 90) > 0.42
      const p = fromFields(from.u + (to.u - from.u) * k + rnd.range(-1.2, 1.2), from.v + (to.v - from.v) * k + rnd.range(-1.2, 1.2))
      const r = Math.hypot(p.x, p.z)
      const inSight = seen(p.x, p.z)
      const wooded = r > 400 && woodAt(p.x, p.z, landHill(p.x, p.z)) > 0.45
      if (r < HEDGE_FROM_M || r > LINES_TO_M || wooded || (!inSight && !trees_ && !bound)) {
        s += 6
        continue
      }
      if (!hedges && !bound) {
        s += 6
        continue
      }
      if (gap > 0) {
        gap -= 1
        s += 5
        continue
      }
      if (rnd.next() < 0.035) gap = 2 + rnd.int(5)
      if (bound ? run && r > BOUND_TREES_FROM_M : trees_ && r > TREES_FROM_M) {
        const young = !poplars && rnd.next() < 0.22
        const tall = poplars ? rnd.range(15, 21) : young ? rnd.range(5.5, 9) : rnd.range(9.5, 16.5) * (0.85 + 0.3 * fieldHash(salt, Math.floor(s / 90), 9))
        if (inSight || rnd.next() < 0.5) tree(p.x, p.z, tall, poplars)
        // Thorn and bramble at the foot of a tree line.
        if (inSight && !poplars && rnd.next() < 0.7) hedge(p.x, p.z)
        s += (poplars ? 0.3 : 0.5) * tall * rnd.range(0.55, 1.35)
      } else {
        const w = hedge(p.x, p.z)
        if (rnd.next() < 0.05 && r > TREES_FROM_M * 0.8) tree(p.x, p.z, rnd.range(6, 10), false)
        s += 0.42 * w
      }
    }
  }
  const strips = Math.ceil(LINES_TO_M / FIELDS.stripM) + 1
  const fields = Math.ceil(LINES_TO_M / FIELDS.lengthM) + 1
  const SEGMENT_M = 280
  for (let i = -strips; i <= strips; i++) {
    const u = stripEdge(i) * FIELDS.stripM
    for (let seg = Math.floor(-LINES_TO_M / SEGMENT_M); seg * SEGMENT_M < LINES_TO_M; seg++) {
      line(fieldHash(i, seg, 5), { u, v: seg * SEGMENT_M }, { u, v: (seg + 1) * SEGMENT_M }, i * 131 + seg)
    }
    for (let j = -fields; j <= fields; j++) {
      const v = fieldEdge(i, j) * FIELDS.lengthM
      line(0.05 + 1.15 * fieldHash(i, j, 6), { u, v }, { u: stripEdge(i + 1) * FIELDS.stripM, v }, i * 977 + j)
    }
  }
  // The woods: crowns stand out of the canopy along its edge and here and there on top, so that a wood ends in trees and not in a wall.
  const GRID_M = 15
  const reach = 2900
  const cells = Math.ceil(reach / GRID_M)
  for (let gz = -cells; gz <= cells; gz++) {
    for (let gx = -cells; gx <= cells; gx++) {
      const x = (gx + rnd.next()) * GRID_M
      const z = (gz + rnd.next()) * GRID_M
      const chance = rnd.next()
      const tall = rnd.range(13, 19.5)
      const r = Math.hypot(x, z)
      if (r < 450 || r > reach || !seen(x, z)) continue
      const wood = woodAt(x, z, landHill(x, z))
      if (wood < 0.36) continue
      if (chance > (wood < 0.62 ? 0.85 : 0.3) * (r > 1800 ? 0.6 : 1)) continue
      tree(x, z, tall, false)
    }
  }
  // Lone trees on the open land.
  for (let i = 0; i < 46; i++) {
    const az = rnd.range(SEEN.fromDeg, SEEN.toDeg) * RAD
    const r = rnd.range(380, 1700)
    const x = Math.sin(az) * r
    const z = Math.cos(az) * r
    const tall = rnd.range(9, 15)
    if (woodAt(x, z, landHill(x, z)) > 0.3) continue
    tree(x, z, tall, false)
  }
  return trees
}

const vertex = /* glsl */ `
in vec2 corner;
in vec4 aAt;
in vec4 aSize;
in vec3 aTint;
uniform float uLandWind;
out vec2 vUv;
out vec3 vWorld;
out vec3 vRight;
out vec3 vToward;
out vec3 vTint;
out vec2 vCard;
out float vDepth;
${farDepth}
void main() {
  vec3 toward = uCamPos - aAt.xyz;
  toward.y = 0.0;
  toward = normalize(toward);
  vec3 right = vec3(toward.z, 0.0, -toward.x);
  float sway = (sin(uReal * 1.7 + aAt.w * 6.2832) + 0.5 * sin(uReal * 2.9 + aAt.w * 17.0)) * (0.0015 + 0.012 * uLandWind) * aSize.y * corner.y * corner.y;
  vec3 world = aAt.xyz + right * (corner.x * aSize.x + sway) + vec3(0.0, corner.y * aSize.y, 0.0);
  float variant = floor(aSize.z + 0.5);
  vec2 cell = vec2(mod(variant, ${COLS}.0), floor(variant / ${COLS}.0));
  vec2 inCell = vec2(0.5 + corner.x * aSize.w, corner.y) * ${(1 - 4 / CELL).toFixed(5)} + ${(2 / CELL).toFixed(5)};
  vUv = (cell + inCell) / vec2(${COLS}.0, ${ROWS}.0);
  vec4 view = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * view;
  vWorld = world;
  vRight = right * aSize.w;
  vToward = toward;
  vTint = aTint;
  vCard = corner;
  vDepth = -view.z;
  farDepth(vDepth, 0.004);
}
`

const fragment = /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
in vec3 vRight;
in vec3 vToward;
in vec3 vTint;
in vec2 vCard;
in float vDepth;
uniform sampler2D tCrowns;
${airGlsl}
void main() {
  vec4 t = texture(tCrowns, vUv);
  if (t.a < 0.4) discard;
  vec2 b = t.rg * 2.0 - 1.0;
  vec3 n = normalize(vRight * b.x + vec3(0.0, b.y, 0.0) + vToward * sqrt(max(1.0 - dot(b, b), 0.0)));
  float open = t.b;
  float thin = 1.0 - smoothstep(0.5, 0.97, t.a);
  vec3 v = normalize(uCamPos - vWorld);
  vec3 albedo = vTint * (1.0 - 0.22 * uLandWet);
  albedo = mix(albedo, vec3(0.7, 0.76, 0.82), uLandFrost * 0.42 * smoothstep(-0.2, 0.7, n.y) * (0.5 + 0.5 * open));
  float ndl = max(dot(n, uSunDir), 0.0);
  float low = 1.0 - smoothstep(0.2, 0.55, uSunDir.y);
  float behind = pow(saturate(dot(-v, uSunDir)), 4.0) * low * uThrough;
  // Leaves let the low sun through: the crown's thin edge glows when the sun stands behind it.
  vec3 glow = vec3(1.5, 1.7, 0.7) * behind * (0.06 + 0.9 * thin);
  vec3 color = albedo * (uSunColor * (ndl * mix(1.0, open, 0.75) + glow) + skyAmbient(n) * open + flashLight(n));
  outColor = landFinish(color, vWorld, vDepth);
}
`

export interface Trees { mesh: THREE.Mesh; atlas: THREE.DataTexture; count: number }

export function makeTrees(): Trees {
  const list = plant()
  const count = list.length
  const at = new Float32Array(count * 4)
  const size = new Float32Array(count * 4)
  const tint = new Float32Array(count * 3)
  list.forEach((t, i) => {
    at.set([t.x, t.y, t.z, t.phase], i * 4)
    size.set([t.w, t.h, t.variant, t.flip], i * 4)
    tint.set(t.tint, i * 3)
  })
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 1]), 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.setAttribute('aAt', new THREE.InstancedBufferAttribute(at, 4))
  geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 4))
  geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3))
  geometry.instanceCount = count
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4000)
  const atlas = crownAtlas()
  const surface = makeSurface({ name: 'place trees', vertex, fragment, uniforms: { ...airUniforms, tCrowns: { value: atlas } }, side: THREE.DoubleSide, castShadow: false })
  const mesh = new THREE.Mesh(geometry, surface.main)
  mesh.frustumCulled = false
  mesh.matrixAutoUpdate = false
  mesh.name = 'place trees'
  return { mesh, atlas, count }
}
