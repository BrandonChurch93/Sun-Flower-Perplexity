import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { stream } from '../core/random.ts'
import { beadLook } from './crumbs.ts'
import { cropLight } from './light.ts'
import { groundStates, soilHeight } from './soil.ts'

// The grass close to the plant, where the dawn lens sees single blades: each blade is a folded ribbon with a mid line, and carries beads of dew that are small balls of their own.
// A clump stands at x, z in meters from the plant. Its blades lean every way, or within headingRad where the lens should see their faces. Its blades are born between bornS and take growS to grow; a clump born before the film stands from its first frame.
// The first stands at the left edge of the dawn's opening frames, in front of the plant. The second comes up between the plant and the sun while the lens pulls back. The rest are sprouts on the left.
export interface Clump { x: number; z: number; blades: number; heightM: [number, number]; widthM: [number, number]; spreadM: number; lean: [number, number]; bornS: [number, number]; growS: number; beads: number; headingRad?: [number, number] }
export interface BeadSizes { tipM: [number, number]; leastM: number; moreM: number }
export const beadSizes: BeadSizes = { tipM: [0.0006, 0.0009], leastM: 0.00025, moreM: 0.0006 }
export const beadSizesKept: BeadSizes = { tipM: [0.00045, 0.0007], leastM: 0.00016, moreM: 0.0004 }
export const clumpsKept: Clump[] = [
  { x: -0.042, z: 0.034, blades: 3, heightM: [0.034, 0.048], widthM: [0.0016, 0.0022], spreadM: 0.004, lean: [0.08, 0.3], bornS: [-100, -100], growS: 1, beads: 8, headingRad: [-2.0, -1.1] },
  { x: 0.042, z: -0.075, blades: 8, heightM: [0.045, 0.075], widthM: [0.002, 0.0032], spreadM: 0.011, lean: [0.12, 0.55], bornS: [1.2, 2.6], growS: 3.4, beads: 12 },
  { x: -0.109, z: -0.06, blades: 3, heightM: [0.01, 0.018], widthM: [0.0014, 0.002], spreadM: 0.004, lean: [0.1, 0.5], bornS: [2, 3.2], growS: 3, beads: 3 },
  { x: -0.088, z: -0.04, blades: 2, heightM: [0.008, 0.014], widthM: [0.0013, 0.0018], spreadM: 0.003, lean: [0.1, 0.5], bornS: [2.4, 3.4], growS: 3, beads: 2 },
]
export const clumps: Clump[] = [
  { x: -0.042, z: 0.034, blades: 3, heightM: [0.036, 0.048], widthM: [0.0022, 0.003], spreadM: 0.005, lean: [0.08, 0.3], bornS: [-100, -100], growS: 1, beads: 8, headingRad: [-2.0, -1.1] },
  { x: 0.046, z: -0.07, blades: 6, heightM: [0.05, 0.09], widthM: [0.0035, 0.005], spreadM: 0.012, lean: [0.12, 0.55], bornS: [1.2, 2.6], growS: 3.4, beads: 10 },
  { x: -0.15, z: -0.06, blades: 3, heightM: [0.01, 0.018], widthM: [0.0014, 0.002], spreadM: 0.004, lean: [0.1, 0.5], bornS: [2, 3.2], growS: 3, beads: 3 },
  { x: -0.138, z: -0.036, blades: 2, heightM: [0.008, 0.014], widthM: [0.0013, 0.0018], spreadM: 0.003, lean: [0.1, 0.5], bornS: [2.4, 3.4], growS: 3, beads: 2 },
]

const ROWS = 16
const FOLD = 0.35

export function blades(clumps: Clump[], bead: BeadSizes): THREE.Mesh {
  const random = stream('ground blades')
  const ball = mergeVertices(new THREE.IcosahedronGeometry(1, 2).deleteAttribute('normal').deleteAttribute('uv'), 1e-4)
  const dirs = ball.getAttribute('position').array as Float32Array
  const faces = ball.getIndex()!.array
  const position: number[] = []
  const normal: number[] = []
  const root: number[] = []
  const center: number[] = []
  const along: number[] = []
  const index: number[] = []
  const c = new THREE.Vector3()
  const ahead = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const side = new THREE.Vector3()
  const face = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (const clump of clumps) {
    for (let b = 0; b < clump.blades; b++) {
      const place = random.next() * Math.PI * 2
      const away = clump.spreadM * Math.sqrt(random.next())
      const rx = clump.x + Math.cos(place) * away
      const rz = clump.z + Math.sin(place) * away
      const spun = place + random.range(-0.9, 0.9)
      const heading = clump.headingRad ? clump.headingRad[0] + (clump.headingRad[1] - clump.headingRad[0]) * random.next() : spun
      const hx = Math.cos(heading)
      const hz = Math.sin(heading)
      const height = random.range(clump.heightM[0], clump.heightM[1])
      const width = random.range(clump.widthM[0], clump.widthM[1])
      const lean = random.range(clump.lean[0], clump.lean[1])
      const twist = random.range(-0.9, 0.9)
      const seed = random.next()
      const born = random.range(clump.bornS[0], clump.bornS[1])
      const tipBead = random.next() < 0.45
      const droop = (tipBead ? 0.16 : 0.05) + 0.012 * clump.beads
      const spine = (t: number, out: THREE.Vector3): THREE.Vector3 => out.set(rx + hx * height * (lean * Math.pow(t, 1.7) + droop * t * t * t), height * (t - 0.28 * lean * t * t - 0.5 * droop * t * t * t), rz + hz * height * (lean * Math.pow(t, 1.7) + droop * t * t * t))
      const frame = (t: number): number => {
        spine(t, c)
        spine(Math.min(1, t + 0.01), ahead)
        tangent.copy(ahead).sub(spine(Math.max(0, t - 0.01), n)).normalize()
        spine(t, c)
        side.set(-hz, 0, hx).applyAxisAngle(tangent, twist * t)
        face.crossVectors(side, tangent).normalize()
        return 0.5 * width * (1 - Math.pow(t, 2.5)) * (0.7 + 0.3 * Math.min(1, t / 0.12))
      }
      const push = (px: number, py: number, pz: number, nx: number, ny: number, nz: number, cx: number, cy: number, cz: number, kind: number, t: number, a: number, own: number): void => {
        position.push(px, py, pz)
        normal.push(nx, ny, nz)
        root.push(rx, 0, rz, born)
        center.push(cx, cy, cz, kind)
        along.push(t, a, own, clump.growS)
      }
      const first = position.length / 3
      for (let r = 0; r <= ROWS; r++) {
        const t = r / ROWS
        const half = frame(t)
        for (const a of [-1, 0, 1]) {
          const px = c.x + side.x * half * a + face.x * half * FOLD * Math.abs(a)
          const py = c.y + side.y * half * a + face.y * half * FOLD * Math.abs(a)
          const pz = c.z + side.z * half * a + face.z * half * FOLD * Math.abs(a)
          n.copy(face).addScaledVector(side, -FOLD * a).normalize()
          push(px, py, pz, n.x, n.y, n.z, px, py, pz, 0, t, a, seed)
        }
      }
      for (let r = 0; r < ROWS; r++) {
        const q = first + r * 3
        index.push(q, q + 1, q + 4, q, q + 4, q + 3, q + 1, q + 2, q + 5, q + 1, q + 5, q + 4)
      }
      const count = Math.round(clump.beads * (0.6 + 0.8 * random.next())) + (tipBead ? 1 : 0)
      for (let k = 0; k < count; k++) {
        const tip = tipBead && k === 0
        const t = tip ? 0.985 : 0.12 + 0.84 * Math.pow(random.next(), 0.8)
        const half = frame(t)
        const size = tip ? random.range(bead.tipM[0], bead.tipM[1]) : bead.leastM + bead.moreM * Math.pow(random.next(), 2)
        const across = tip ? 0 : random.range(-0.75, 0.75)
        const upper = face.y >= 0 ? 1 : -1
        const lift = tip ? -0.7 * size : upper * (0.75 * size + half * FOLD * Math.abs(across))
        const bx = c.x + side.x * half * across + face.x * lift
        const by = c.y + side.y * half * across + face.y * lift
        const bz = c.z + side.z * half * across + face.z * lift
        const start = position.length / 3
        const own = random.next()
        for (let v = 0; v < dirs.length; v += 3) push(bx + dirs[v] * size, by + dirs[v + 1] * size * 0.9, bz + dirs[v + 2] * size, dirs[v], dirs[v + 1], dirs[v + 2], bx, by, bz, 2, t, 0, own)
        for (let f = 0; f < faces.length; f++) index.push(start + faces[f])
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
  geometry.setAttribute('aNormal', new THREE.Float32BufferAttribute(normal, 3))
  geometry.setAttribute('aRoot', new THREE.Float32BufferAttribute(root, 4))
  geometry.setAttribute('aCenter', new THREE.Float32BufferAttribute(center, 4))
  geometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 4))
  geometry.setIndex(index)
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.3)
  return new THREE.Mesh(geometry)
}

export const bladeVertex = /* glsl */ `
in vec3 position;
in vec3 aNormal;
in vec4 aRoot;
in vec4 aCenter;
in vec4 aAlong;
uniform float uDew;
uniform float uWet;
out vec3 vWorld;
out float vDepth;
out vec3 vNormal;
out vec4 vAlong;
out float vKind;
${soilHeight}
void main() {
  float grown = smoothstep(aRoot.w, aRoot.w + aAlong.w, uTime);
  float bead = step(1.5, aCenter.w);
  float held = mix(1.0, smoothstep(0.85, 1.0, grown) * smoothstep(0.0, 0.4, uDew) * (1.0 - smoothstep(0.4, 0.8, uWet)), bead);
  vAlong = aAlong;
  vKind = aCenter.w;
  vNormal = mat3(modelMatrix) * aNormal;
  if (grown * held <= 0.0) {
    vWorld = aRoot.xyz;
    vDepth = 1.0;
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vec3 local = aRoot.xyz + (aCenter.xyz - aRoot.xyz) * grown + (position - aCenter.xyz) * grown * held;
  vec4 world = modelMatrix * vec4(local, 1.0);
  vec2 c = (modelMatrix * vec4(aRoot.xyz, 1.0)).xz;
  world.y += soilHeight(c, soilLod(c)) - 0.001;
  float t = aAlong.x;
  world.xz += vec2(sin(uTime * 1.7 + aRoot.x * 190.0), cos(uTime * 1.3 + aRoot.z * 170.0)) * (0.03 * t * t * grown * length(aCenter.xyz - aRoot.xyz));
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

export const bladeFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
in vec3 vNormal;
in vec4 vAlong;
in float vKind;
uniform float uWet;
uniform float uFrost;
uniform float uDew;
uniform float uKeptS;
uniform vec2 uToward;
${groundStates}
${cropLight}
${beadLook}
void main() {
  vec3 v = normalize(uCamPos - vWorld);
  vec2 p = vWorld.xz;
  vec3 n = normalize(vNormal);
  if (vKind > 1.5) {
    float shadow = lowSun(sunShadow(vWorld, n, uShadowTexelM * 1.5), 1.0, vWorld.y) * cropLight(p, -dot(p, uToward));
    outColor = finish(beadColor(n, v, shadow), vWorld, vDepth, -1.0);
    return;
  }
  n *= sign(dot(n, v) + 1e-6);
  float t = vAlong.x;
  float a = abs(vAlong.y);
  float rib = 1.0 - smoothstep(0.0, 0.16, a);
  float edge = smoothstep(0.8, 1.0, a);
  vec3 albedo = mix(vec3(0.035, 0.06, 0.02), mix(vec3(0.07, 0.125, 0.035), vec3(0.1, 0.15, 0.045), vAlong.z), smoothstep(0.0, 0.5, t));
  albedo = mix(albedo, albedo * vec3(1.3, 1.22, 1.05), 0.6 * rib);
  albedo = mix(albedo, vec3(0.2, 0.17, 0.07), smoothstep(0.88, 1.0, t) * step(0.6, vAlong.z));
  albedo *= mix(1.0, 0.75, saturate(uWet + 0.5 * uDew));
  albedo = mix(albedo, vec3(0.75, 0.8, 0.85), uFrost * 0.75 * smoothstep(0.1, 0.7, t));
  float deep = mix(0.35, 1.0, smoothstep(0.0, 0.3, t));
  float lit = lowSun(sunShadow(vWorld, n, uShadowTexelM * 1.5), 1.0, vWorld.y) * cropLight(p, -dot(p, uToward));
  float ndl = dot(n, uSunDir);
  vec3 through = albedo * vec3(2.4, 2.0, 0.5) * (0.55 + 0.45 * edge) * (1.0 - 0.4 * rib) * max(-ndl, 0.0);
  vec3 color = (albedo * max(ndl, 0.0) + through) * uSunColor * lit + albedo * groundAmbient(n) * deep;
  if (uTime < uKeptS) {
    through = albedo * vec3(0.6, 0.8, 0.4) * (0.06 + 0.9 * edge) * (1.0 - 0.6 * rib) * max(-ndl, 0.0);
    color = (albedo * max(ndl, 0.0) + through) * uSunColor * lit + albedo * groundAmbient(n) * deep * 0.6;
  }
  vec3 hv = normalize(v + uSunDir);
  color += uSunColor * pow(max(dot(n, hv), 0.0), 40.0) * (0.05 + 0.25 * saturate(uWet + uDew)) * lit;
  outColor = finish(color, vWorld, vDepth, -1.0);
}
`
