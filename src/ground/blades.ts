import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { stream } from '../core/random.ts'
import { beadLook } from './crumbs.ts'
import { cropLight } from './light.ts'
import { groundStates, soilHeight } from './soil.ts'

// The grass close to the plant, where the dawn lens sees single blades: each blade is a folded ribbon with a mid line, and carries beads of dew that are small balls of their own.
// A clump stands at x, z in meters from the plant. Its blades lean every way, or within headingRad where the lens should see their faces. Its blades are born between bornS and take growS to grow; a clump born before the film stands from its first frame. Where beadsSeen is given, only that many of each blade's beads are made.
// The first stands at the left edge of the dawn's opening frames, in front of the plant: two short blades, since the lens draws back and brings it toward the middle of the frame. The second stands between the plant and the sun, low at the frame's edge in the first frame, and grows through the dawn no faster than the seedling. The rest are sprouts on the left.
export interface Clump { x: number; z: number; blades: number; heightM: [number, number]; widthM: [number, number]; spreadM: number; lean: [number, number]; bornS: [number, number]; growS: number; beads: number; headingRad?: [number, number]; beadsSeen?: number }
// Where `drops` is given the dew is drops, not balls: only `share` of them are kept, most are small, each lies on the blade with a flat foot and sags down it, and a tip's drop hangs under the tip as a tear. The blades then bow sideways and their edges run unevenly.
export interface BeadSizes { tipM: [number, number]; leastM: number; moreM: number; drops?: { share: number; tipShare: number; flat: number; sag: number; bowM: number; uneven: number } }
export const beadSizes: BeadSizes = { tipM: [0.0005, 0.0008], leastM: 0.0002, moreM: 0.0009, drops: { share: 0.4, tipShare: 0, flat: 0.55, sag: 0.45, bowM: 0.1, uneven: 0.12 } }
export const clumps: Clump[] = [
  { x: -0.032, z: 0.06, blades: 2, heightM: [0.02, 0.027], widthM: [0.0015, 0.002], spreadM: 0.004, lean: [0.08, 0.3], bornS: [-100, -100], growS: 1, beads: 2, headingRad: [-2.0, -1.1] },
  { x: 0.046, z: -0.07, blades: 14, heightM: [0.04, 0.09], widthM: [0.0028, 0.0046], spreadM: 0.016, lean: [0.08, 0.45], bornS: [-2.5, -0.5], growS: 9.5, beads: 44 },
  { x: -0.15, z: -0.06, blades: 3, heightM: [0.01, 0.018], widthM: [0.0014, 0.002], spreadM: 0.004, lean: [0.1, 0.5], bornS: [2, 3.2], growS: 3, beads: 3 },
  { x: -0.138, z: -0.036, blades: 2, heightM: [0.008, 0.014], widthM: [0.0013, 0.0018], spreadM: 0.003, lean: [0.1, 0.5], bornS: [2.4, 3.4], growS: 3, beads: 2 },
  { x: -0.105, z: -0.02, blades: 3, heightM: [0.012, 0.02], widthM: [0.0014, 0.002], spreadM: 0.004, lean: [0.1, 0.5], bornS: [1.6, 2.8], growS: 3.5, beads: 5 },
  { x: -0.12, z: -0.11, blades: 3, heightM: [0.012, 0.022], widthM: [0.0015, 0.0021], spreadM: 0.005, lean: [0.1, 0.5], bornS: [2, 3.2], growS: 3.5, beads: 5 },
  { x: -0.075, z: -0.16, blades: 2, heightM: [0.01, 0.018], widthM: [0.0014, 0.002], spreadM: 0.004, lean: [0.1, 0.5], bornS: [2.4, 3.6], growS: 3.5, beads: 4 },
]
// The blades that stand by the mound in the dawn only, beaded and lit from behind: left and right of it in the plane of focus, and one soft before the lens.
export const clumpsDawn: Clump[] = [
  { x: -0.035, z: -0.012, blades: 3, heightM: [0.024, 0.036], widthM: [0.0016, 0.0022], spreadM: 0.005, lean: [0.08, 0.35], bornS: [-100, -100], growS: 1, beads: 9, headingRad: [-2.0, -1.1] },
  { x: 0.031, z: -0.015, blades: 2, heightM: [0.022, 0.032], widthM: [0.0016, 0.0022], spreadM: 0.004, lean: [0.08, 0.3], bornS: [-100, -100], growS: 1, beads: 6, headingRad: [-2.0, -1.1] },
  { x: -0.026, z: 0.06, blades: 2, heightM: [0.02, 0.028], widthM: [0.0015, 0.002], spreadM: 0.004, lean: [0.08, 0.3], bornS: [-100, -100], growS: 1, beads: 4, headingRad: [-2.0, -1.1], beadsSeen: 0 },
]

const ROWS = 16
// Every blade also moves in the air on its own.
const GUST = '1.3'
const FOLD = 0.35
const DROOP_BEADS = 12

export function blades(clumps: Clump[], bead: BeadSizes): THREE.Mesh {
  const random = stream('ground blades')
  const loose = stream('ground blades drops')
  const drops = bead.drops
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
  const down = new THREE.Vector3()
  const out = new THREE.Vector3()
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
      const droop = (tipBead ? 0.16 : 0.05) + 0.012 * Math.min(clump.beads, DROOP_BEADS)
      const bow = drops ? loose.range(-drops.bowM, drops.bowM) : 0
      const turn = drops ? loose.range(0.6, 1.5) : 0
      const edges = drops ? [loose.range(0, 6.28), loose.range(0, 6.28), loose.range(0, 6.28), loose.range(0, 6.28)] : [0, 0, 0, 0]
      const spine = (t: number, out: THREE.Vector3): THREE.Vector3 => {
        const reach = lean * Math.pow(t, 1.7) + droop * t * t * t
        const aside = bow * t * Math.sin(turn * 3.1416 * t)
        return out.set(rx + height * (hx * reach - hz * aside), height * (t - 0.28 * lean * t * t - 0.5 * droop * t * t * t), rz + height * (hz * reach + hx * aside))
      }
      const ragged = (t: number, a: number): number => (drops ? 1 + drops.uneven * (Math.sin(t * 19 + edges[a < 0 ? 0 : 1]) + 0.5 * Math.sin(t * 43 + edges[a < 0 ? 2 : 3])) * Math.abs(a) : 1)
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
          const w = half * ragged(t, a)
          const px = c.x + side.x * w * a + face.x * w * FOLD * Math.abs(a)
          const py = c.y + side.y * w * a + face.y * w * FOLD * Math.abs(a)
          const pz = c.z + side.z * w * a + face.z * w * FOLD * Math.abs(a)
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
        if (k >= (clump.beadsSeen ?? count)) continue
        if (drops) {
          if (loose.next() > (tip ? drops.tipShare : drops.share)) continue
          if (tip) {
            const r = size
            const hy = c.y - 0.75 * r
            for (let v = 0; v < dirs.length; v += 3) {
              const dy = dirs[v + 1]
              const neck = dy > 0 ? 1 - 0.8 * dy * dy : 1
              const tall = dy > 0 ? 1.6 : 1
              n.set(dirs[v], dy > 0 ? dy * 0.45 : dy, dirs[v + 2]).normalize()
              push(c.x + dirs[v] * r * neck, hy + dy * r * tall, c.z + dirs[v + 2] * r * neck, n.x, n.y, n.z, c.x, hy, c.z, 2, t, 0, own)
            }
          } else {
            const r = Math.min(bead.leastM + bead.moreM * Math.pow((size - bead.leastM) / bead.moreM, 1.5), 0.8 * half)
            const fit = Math.max(0, 1 - (0.9 * r) / half)
            const at = Math.max(-fit, Math.min(fit, across))
            const rise = half * FOLD * Math.abs(at)
            out.copy(face).multiplyScalar(upper)
            down.set(0, -1, 0).addScaledVector(out, out.y)
            const slope = down.length()
            if (slope > 1e-4) down.multiplyScalar(1 / slope)
            const sag = drops.sag * slope * (0.4 + 0.6 * Math.min(1, r / bead.moreM))
            const cx = c.x + side.x * half * at + face.x * rise
            const cy = c.y + side.y * half * at + face.y * rise
            const cz = c.z + side.z * half * at + face.z * rise
            for (let v = 0; v < dirs.length; v += 3) {
              const up = Math.max(0, dirs[v] * out.x + dirs[v + 1] * out.y + dirs[v + 2] * out.z)
              const fx = dirs[v] - out.x * (dirs[v] * out.x + dirs[v + 1] * out.y + dirs[v + 2] * out.z)
              const fy = dirs[v + 1] - out.y * (dirs[v] * out.x + dirs[v + 1] * out.y + dirs[v + 2] * out.z)
              const fz = dirs[v + 2] - out.z * (dirs[v] * out.x + dirs[v + 1] * out.y + dirs[v + 2] * out.z)
              const along = fx * down.x + fy * down.y + fz * down.z
              const lean = sag * (up + 0.5 * Math.max(0, along))
              const h = up * drops.flat + 0.04
              n.set(fx * drops.flat + out.x * up + down.x * sag * 0.5, fy * drops.flat + out.y * up + down.y * sag * 0.5, fz * drops.flat + out.z * up + down.z * sag * 0.5).normalize()
              push(cx + (fx + down.x * lean + out.x * h) * r, cy + (fy + down.y * lean + out.y * h) * r, cz + (fz + down.z * lean + out.z * h) * r, n.x, n.y, n.z, cx, cy, cz, 2, t, 0, own)
            }
          }
          for (let f = 0; f < faces.length; f++) index.push(start + faces[f])
          continue
        }
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
uniform vec4 uAir;
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
  float own = aAlong.z * 6.2832;
  vec2 sway = vec2(sin(uReal * 1.7 + aRoot.x * 190.0), cos(uReal * 1.3 + aRoot.z * 170.0));
  vec2 gust = vec2(sin(uReal * 3.3 + own * 3.0) + 0.6 * sin(uReal * 5.9 + own * 7.0), cos(uReal * 2.7 + own * 5.0) + 0.6 * cos(uReal * 4.9 + own * 11.0));
  world.xz += (sway + ${GUST} * gust) * mix(0.6, 2.2, uAir.x) * (0.03 * t * t * grown * length(aCenter.xyz - aRoot.xyz));
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
  {
    float fine = saturate(1.0 - fwidth(vAlong.y) * 5.0);
    float vein = mix(0.5, 0.5 + 0.5 * cos(vAlong.y * 28.3), fine) * (1.0 - rib);
    float mottle = valueNoise(vec2(t * 13.0 + vAlong.z * 40.0, vAlong.y * 1.5 + vAlong.z * 90.0));
    albedo *= mix(0.84, 1.06, vein) * mix(0.8, 1.12, mottle);
    through = albedo * vec3(0.45, 0.55, 0.3) * (0.07 + 0.4 * edge) * mix(0.7, 1.2, vein) * (1.0 - 0.6 * rib) * max(-ndl, 0.0);
    color = (albedo * max(ndl, 0.0) + through) * uSunColor * lit + albedo * groundAmbient(n) * deep * 0.45;
  }
  vec3 hv = normalize(v + uSunDir);
  color += uSunColor * pow(max(dot(n, hv), 0.0), 40.0) * (0.05 + 0.25 * saturate(uWet + uDew)) * lit;
  outColor = finish(color, vWorld, vDepth, -1.0);
}
`
