import * as THREE from 'three'
import { stream } from '../core/random.ts'
import { right, toward } from '../field/layout.ts'
import { grassMask, grassTimes, patchy, patchyCover, stemFoot, turfCover } from './cover.ts'
import { lane } from './crumbs.ts'
import { cropLight, fieldGate } from './light.ts'
import { groundStates, soilHeight, sunWayDir } from './soil.ts'

const TUFTS = 14000
const BLADES = 7
const HALF_WIDTH_M = 6.5
const FRONT_M = 1.5
const BACK_M = -1.8
const PIONEERS = 0.045
const WEEDS = 0.14

function tuft(): THREE.BufferGeometry {
  const random = stream('ground tuft')
  const cuts = [0, 0.35, 0.7]
  const position: number[] = []
  const side: number[] = []
  const normal: number[] = []
  const along: number[] = []
  const index: number[] = []
  const at = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const across = new THREE.Vector3()
  const face = new THREE.Vector3()
  for (let b = 0; b < BLADES; b++) {
    const turn = ((b + random.range(-0.35, 0.35)) / BLADES) * Math.PI * 2
    const dx = Math.cos(turn)
    const dz = Math.sin(turn)
    const length = b === 0 ? 1 : random.range(0.55, 1)
    const lean = random.range(0.12, 0.7)
    const offset = random.range(0.02, 0.14)
    const twist = random.range(-0.6, 0.6)
    const seed = random.next()
    const first = position.length / 3
    const point = (t: number, sign: number): void => {
      const out = offset + lean * length * Math.pow(t, 1.5)
      const up = length * (t - 0.3 * lean * t * t)
      at.set(dx * out, up, dz * out)
      tangent.set(dx * lean * length * 1.5 * Math.sqrt(t), length * (1 - 0.6 * lean * t), dz * lean * length * 1.5 * Math.sqrt(t)).normalize()
      across.set(-dz, 0, dx).applyAxisAngle(tangent, twist)
      face.crossVectors(across, tangent).normalize()
      const half = 0.03 * (1 - Math.pow(t, 1.6)) * sign
      position.push(at.x, at.y, at.z)
      side.push(across.x * half, across.y * half, across.z * half)
      normal.push(face.x, face.y, face.z)
      along.push(t, seed, sign)
    }
    for (const t of cuts) {
      point(t, -1)
      point(t, 1)
    }
    point(1, 0)
    for (let k = 0; k < cuts.length - 1; k++) {
      const q = first + k * 2
      index.push(q, q + 1, q + 3, q, q + 3, q + 2)
    }
    const q = first + (cuts.length - 1) * 2
    index.push(q, q + 1, q + 2)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3))
  geometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 3))
  geometry.setIndex(index)
  return geometry
}

// The tufts in cells of this size, each drawn only when the lens or the shadow map can see it.
const CELL_M = 1.6

// No tuft that stands during the dawn may stand between the lens and the dawn's sun: out of focus it is a dark post under the sun's ball. The lens looks past the plant offM to its right, and the way is kept clear from fromM behind the plant, halfM wide and wider by spread for each meter.
const SUN_CLEAR = { untilS: 8, offM: 0.02, fromM: 0.05, halfM: 0.03, spread: 0.07 }
function underSun(x: number, z: number): boolean {
  const along = x * sunWayDir.x + z * sunWayDir.z
  const across = z * sunWayDir.x - x * sunWayDir.z
  return along > SUN_CLEAR.fromM && Math.abs(across - SUN_CLEAR.offM) < SUN_CLEAR.halfM + SUN_CLEAR.spread * along
}

type Cells = Map<string, { matrices: THREE.Matrix4[]; seeds: number[] }>
function meshes(geometry: THREE.BufferGeometry, cells: Cells): THREE.InstancedMesh[] {
  return Array.from(cells.values()).map((cell) => {
    const shape = geometry.clone()
    const mesh = new THREE.InstancedMesh(shape, undefined, cell.matrices.length)
    cell.matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
    shape.setAttribute('aTuft', new THREE.InstancedBufferAttribute(new Float32Array(cell.seeds), 4))
    mesh.computeBoundingSphere()
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.1
    return mesh
  })
}

// What the field shot adds: weeds under the crop's front, so that no bare strip lies between the turf and the crop, low broad tufts that mat the turf, and tall thin stalks that stand over it and take the low sun from behind.
const FIELD_TUFTS = 14000
const UNDER = { share: 0.4, fromM: 1.2, toM: 3.4 }
const STALKS = { fromM: -1.5, toM: 1.6, chance: 0.3 }
export function fieldTufts(): THREE.InstancedMesh[] {
  const random = stream('ground grass field')
  const cells: Cells = new Map()
  const turn = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const size = new THREE.Vector3()
  const at = new THREE.Vector3()
  for (let i = 0; i < FIELD_TUFTS; i++) {
    const under = random.next() < UNDER.share
    const u = random.range(-HALF_WIDTH_M, HALF_WIDTH_M)
    const d = under ? random.range(UNDER.fromM, UNDER.toM) : random.range(STALKS.fromM, STALKS.toM)
    const chance = random.next()
    const tall = random.next()
    const wide = random.next()
    const spin = random.next() * Math.PI * 2
    const tone = random.next()
    const seed = random.next()
    const x = -toward.x * d + right.x * u
    const z = -toward.z * d + right.z * u
    const clump = patchy(x * 4.3 + 3, z * 4.3 + 1)
    const stand = patchy(x * 1.9 + 11, z * 1.9 + 5)
    const stalk = !under && chance < STALKS.chance * stand * stand
    const height = (under ? 0.05 + 0.12 * tall : stalk ? 0.16 + 0.18 * tall : 0.035 + 0.05 * tall) * (0.6 + 0.6 * clump)
    const girth = under ? 0.8 + 0.5 * wide : stalk ? 0.2 + 0.16 * wide : 1.3 + 0.7 * wide
    turn.setFromAxisAngle(up, spin)
    size.set(height * girth, height, height * girth)
    at.set(x, -0.002, z)
    const key = `${Math.floor(u / CELL_M)} ${Math.floor(d / CELL_M)}`
    const cell = cells.get(key) ?? { matrices: [], seeds: [] }
    cells.set(key, cell)
    cell.matrices.push(new THREE.Matrix4().compose(at, turn, size))
    cell.seeds.push(-100, tone, under ? 1 : stalk ? 1.9 : 1.6, seed)
  }
  return meshes(tuft(), cells)
}

export function tufts(): THREE.InstancedMesh[] {
  const random = stream('ground grass')
  const geometry = tuft()
  const cells: Cells = new Map()
  const turn = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const size = new THREE.Vector3()
  const at = new THREE.Vector3()
  const t = grassTimes
  for (let i = 0; i < TUFTS; i++) {
    const u = random.range(-HALF_WIDTH_M, HALF_WIDTH_M)
    const c = random.range(BACK_M, FRONT_M)
    const x = toward.x * c + right.x * u
    const z = toward.z * c + right.z * u
    const clump = patchy(x * 4.3 + 3, z * 4.3 + 1)
    const chance = random.next()
    const early = random.next() < PIONEERS
    const weed = random.next() < WEEDS
    const tall = random.next()
    const wide = random.range(0.8, 1.3)
    const spin = random.next() * Math.PI * 2
    const birth = random.next()
    const tone = random.next()
    const seed = random.next()
    const inLane = lane(x, z)
    const r = Math.hypot(x, z)
    if (chance > grassMask(x, z) * (0.5 + 0.5 * clump) || r < 0.035) continue
    if (early && (inLane > 0.02 || r < 0.06)) continue
    const height = early ? (seed < 0.22 && r > 0.1 ? 0.045 + 0.04 * tall : 0.012 + 0.03 * tall) : (0.045 + 0.1 * tall) * (0.6 + 0.6 * clump) * (weed ? 0.45 : seed > 0.93 ? 1.8 : 1)
    const first = early ? -100 : Math.max(t.firstS + (t.lastS - t.firstS) * Math.pow(birth, 0.8), inLane > 0.02 ? t.laneS + 8 * birth : 0)
    const born = first < SUN_CLEAR.untilS && underSun(x, z) ? SUN_CLEAR.untilS : first
    turn.setFromAxisAngle(up, spin)
    size.set(height * wide, height, height * wide)
    at.set(x, -0.002, z)
    const key = `${Math.floor(u / CELL_M)} ${Math.floor(c / CELL_M)}`
    const cell = cells.get(key) ?? { matrices: [], seeds: [] }
    cells.set(key, cell)
    cell.matrices.push(new THREE.Matrix4().compose(at, turn, size))
    cell.seeds.push(born, tone, weed ? 2.6 : early ? 1.5 : 1, seed)
  }
  return meshes(geometry, cells)
}

export const grassVertex = /* glsl */ `
in vec3 position;
in vec3 aSide;
in vec3 normal;
in vec3 aAlong;
in mat4 instanceMatrix;
in vec4 aTuft;
out vec3 vWorld;
out float vDepth;
out vec3 vNormal;
out vec3 vAlong;
out vec4 vTuft;
out vec3 vField;
uniform vec4 uGrassTimes;
${soilHeight}
${fieldGate}
${turfCover}
${patchyCover}
void main() {
  float grown = smoothstep(aTuft.x, aTuft.x + uGrassTimes.z, uTime);
  mat4 place = modelMatrix * instanceMatrix;
  vec2 c = place[3].xz;
  float tall = length(place[1].xyz);
  float seen = tall * projectionMatrix[1][1] * uSize.y / max((projectionMatrix * viewMatrix * place[3]).w, 1e-4);
  float thin = max(1.0, 1.4 / max(seen * 0.03 * aTuft.z, 1e-3));
  vec3 local = (position * vec3(1.0, mix(0.25, 1.0, grown), 1.0) + aSide * aTuft.z * min(thin, 4.0)) * step(0.001, grown) * mix(0.4, 1.0, grown);
  vField = vec3(0.0);
  if (fieldOn()) {
    vec2 tf = turf(c);
    float near = stemNear(c);
    float chosen = fract(aTuft.w * 7.31);
    float rough = mix(0.4, 1.2, tf.x) * mix(0.75, 1.25, chosen) / (0.6 + 0.6 * patchy(c * 4.3 + vec2(3.0, 1.0)));
    rough *= step(tf.y, 0.1 + 0.9 * chosen) * smoothstep(${stemFoot.bareM.toFixed(2)}, ${stemFoot.fullM.toFixed(2)}, near);
    local *= rough;
    tall *= rough;
    vField = vec3(1.0, tf.x, near);
  }
  vec4 world = place * vec4(local, 1.0);
  world.y += soilHeight(c, soilLod(c));
  float bend = aAlong.x * aAlong.x * tall;
  world.xz += vec2(sin(uTime * 1.7 + aTuft.w * 6.28 + aAlong.y * 2.0), cos(uTime * 1.3 + aTuft.w * 4.1)) * 0.035 * bend;
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  vNormal = mat3(place) * normal;
  vAlong = aAlong;
  vTuft = aTuft;
  gl_Position = projectionMatrix * view;
}
`

export const grassFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
in vec3 vNormal;
in vec3 vAlong;
in vec4 vTuft;
in vec3 vField;
uniform float uWet;
uniform float uFrost;
uniform float uDew;
uniform vec2 uToward;
${groundStates}
${cropLight}
void main() {
  vec3 v = normalize(uCamPos - vWorld);
  vec3 n = normalize(vNormal);
  n *= sign(dot(n, v) + 1e-6);
  float t = vAlong.x;
  float weed = step(2.0, vTuft.z);
  vec3 albedo = mix(vec3(0.03, 0.046, 0.018), mix(vec3(0.075, 0.12, 0.036), vec3(0.11, 0.14, 0.045), vTuft.y), t);
  albedo = mix(albedo, albedo * vec3(0.85, 1.05, 1.25), weed);
  albedo = mix(albedo, vec3(0.2, 0.16, 0.06), smoothstep(0.55, 1.0, t) * step(0.72, vAlong.y) * (1.0 - weed));
  albedo *= 0.86 + 0.14 * cos(vAlong.z * 7.0);
  float shut = 1.0;
  if (vField.x > 0.5) {
    float chosen = fract(vTuft.w * 13.7);
    float dry = step(0.6 + 0.32 * vField.y, chosen) * (1.0 - weed);
    albedo *= vec3(1.5, 0.8, 2.4) * mix(0.65, 1.15, fract(vTuft.w * 29.3));
    albedo = mix(albedo, mix(vec3(0.05, 0.043, 0.03), vec3(0.19, 0.155, 0.09), t), dry);
    shut = 1.0 - 0.55 * exp(-vField.z * vField.z / ${(stemFoot.shadeM * stemFoot.shadeM).toFixed(4)});
  }
  albedo *= mix(1.0, 0.75, saturate(uWet + 0.5 * uDew));
  float rained = smoothstep(0.3, 1.0, uWet);
  albedo *= mix(vec3(1.0), vec3(1.7, 2.1, 1.5), rained);
  albedo = mix(albedo, vec3(0.75, 0.8, 0.85), uFrost * 0.75 * smoothstep(0.15, 0.8, t));
  vec2 p = vWorld.xz;
  float deep = mix(0.3, 1.0, smoothstep(0.0, 0.6, t));
  float lit = lowSun(sunShadow(vWorld, n, uShadowTexelM * 1.5), 1.0, vWorld.y) * cropLight(p, -dot(p, uToward)) * deep;
  if (vField.x > 0.5) lit = max(lit, fieldPatch(p, -dot(p, uToward)) * deep);
  float ndl = dot(n, uSunDir);
  vec3 through = albedo * (vField.x > 0.5 ? vec3(1.7, 2.1, 2.2) : vec3(2.6, 1.25, 0.45)) * 0.7 * max(-ndl, 0.0);
  vec3 color = (albedo * max(ndl, 0.0) + through) * uSunColor * lit + albedo * groundAmbient(n) * deep;
  if (vField.x > 0.5) color *= shut;
  vec3 hv = normalize(v + uSunDir);
  color += uSunColor * pow(max(dot(n, hv), 0.0), 30.0) * (0.06 + 0.3 * saturate(uWet + uDew)) * lit;
  color += skyAmbient(reflect(-v, n)) * (0.05 * rained * deep);
  float bead = step(0.9, hash31(floor(vWorld * 700.0))) * uDew * (1.0 - smoothstep(0.25, 0.9, vDepth));
  color += bead * (uSunColor * 1.2 * lit + skyAmbient(vec3(0.0, 1.0, 0.0)) * 0.4);
  outColor = finish(color, vWorld, vDepth, -1.0);
}
`
