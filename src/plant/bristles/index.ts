import * as THREE from 'three'
import { shared } from '../../core/shading.ts'
import { makePartSurface, partMesh, type PartOptions } from '../part.ts'
import { tissueGlsl } from '../surface/index.ts'

// The bristles of the young plant as shapes: each has a foot, a taper and a tip, and takes the light as a body does. They are drawn only for a lens close enough to tell one from the next; farther off the coat of hairs stands for them.
const ROW = 512
const SIDES = 5
const RINGS = 6
const VERTS = RINGS * SIDES + 1
// How many pixels a millimeter must cover, at 1080 lines, before a bristle is drawn, and where it stands at its full length.
export const BRISTLE_FROM_PX = 8
export const BRISTLE_FULL_PX = 16

// What the skin of a bristle reads. Whoever needs to change the list writes to the other owner first.
//   vWorld, vNormal, vDepth  the place in the world, the normal there, meters from the lens
//   vBristle  x along it from 0 at the foot to 1 at the tip, y its own number from 0 to 1, z its length in meters, w its radius there in meters
const vertex = /* glsl */ `
uniform sampler2D uBristles;
out vec3 vWorld;
out vec3 vNormal;
out float vDepth;
out vec4 vBristle;
const float FOOT_M = 0.00007;
const float RING_AT[${RINGS}] = float[${RINGS}](0.0, 0.07, 0.2, 0.45, 0.7, 0.9);
void main() {
  int k = gl_VertexID / ${VERTS};
  int j = gl_VertexID - k * ${VERTS};
  ivec2 at = ivec2((k & ${ROW - 1}) * 4, k / ${ROW});
  vec4 a = texelFetch(uBristles, at, 0);
  vec4 b = texelFetch(uBristles, at + ivec2(1, 0), 0);
  vec4 c = texelFetch(uBristles, at + ivec2(2, 0), 0);
  vec4 d = texelFetch(uBristles, at + ivec2(3, 0), 0);
  float m = plantBlend();
  vec3 root = mix(a.xyz, c.xyz, m);
  vec3 dir = normalize(mix(b.xyz, d.xyz, m) + vec3(0.0, 1e-6, 0.0));
  float own = b.w;
  vec4 seen = viewMatrix * vec4(plantWorld(root), 1.0);
  float pixel = -seen.z * 2.0 / (projectionMatrix[1][1] * uSize.y);
  float close = smoothstep(${BRISTLE_FROM_PX.toFixed(1)}, ${BRISTLE_FULL_PX.toFixed(1)}, 0.001 / pixel * (1080.0 / uSize.y));
  float len = mix(a.w, c.w, m) * close;
  int ring = j / ${SIDES};
  float t = ring >= ${RINGS} ? 1.0 : RING_AT[ring];
  vec3 ref = abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 e1 = normalize(cross(dir, ref));
  vec3 e2 = cross(dir, e1);
  // No two stand alike: each has its own slight curve.
  float turn = 6.2832 * fract(own * 13.37 + 0.21);
  vec3 bend = (e1 * cos(turn) + e2 * sin(turn)) * (0.06 + 0.22 * fract(own * 47.13 + 0.67));
  vec3 way = normalize(dir + bend * (2.0 * t));
  vec3 f1 = normalize(cross(way, ref));
  vec3 f2 = cross(way, f1);
  // A bristle stands on a swollen foot, sunk a little in the skin, and tapers to a point.
  float stout = FOOT_M * (0.7 + 0.6 * fract(own * 91.71 + 0.43)) * clamp(len / 0.0015, 0.5, 1.3);
  float radius = stout * (1.0 + 0.9 * exp(-14.0 * t)) * pow(1.0 - t, 0.7);
  radius = ring >= ${RINGS} ? 0.0 : max(radius, 0.5 * pixel * step(1e-6, len));
  float around = 6.2832 * (float(j - ring * ${SIDES}) / ${SIDES}.0 + own);
  vec3 out3 = f1 * cos(around) + f2 * sin(around);
  vec3 local = root - dir * (stout * (1.0 - t)) + (dir * t + bend * (t * t)) * len + out3 * radius;
  vec4 world = vec4(plantWorld(local), 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vNormal = plantDirection(normalize(out3 + way * 0.08));
  vDepth = -view.z;
  vBristle = vec4(t, own, len, radius);
  gl_Position = len > 0.0 ? projectionMatrix * view : vec4(2.0, 2.0, 2.0, 1.0);
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in float vDepth;
in vec4 vBristle;
${tissueGlsl}
void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  float foot = 1.0 - smoothstep(0.0, 0.14, vBristle.x);
  Tissue t;
  // Clear and near white, green and dark where it leaves the skin.
  t.albedo = mix(vec3(0.84, 0.87, 0.8), vec3(0.14, 0.2, 0.07), foot);
  t.through = vec3(0.9, 0.93, 0.84) * (1.0 - 0.6 * foot);
  t.face = face;
  t.normal = face;
  t.rough = 0.25;
  t.wax = 0.8;
  t.sheen = 1.0;
  t.occlusion = mix(0.55, 1.0, smoothstep(0.0, 0.3, vBristle.x));
  vec3 color = shadeTissueClear(t, vWorld, view, vec2(0.0), 0.0, 1.0);
  outColor = finish(color, vWorld, vDepth, -1.0);
}
`

export class BristleSet {
  readonly meshes: THREE.Mesh[]
  private readonly roots: [Float32Array, Float32Array]
  private readonly leans: [Float32Array, Float32Array]
  private readonly data: Float32Array
  private readonly texture: THREE.DataTexture
  private readonly geometry = new THREE.BufferGeometry()
  private readonly at = new THREE.Vector3()
  private readonly eye = new THREE.Vector3()
  // The middle of the bristles in the wearer's space, and how far the farthest stands from it.
  private readonly middle = new THREE.Vector3()
  private spread = 0
  private stale = false
  private shown = 0

  constructor(options: PartOptions, readonly count: number, name: string) {
    if (options.places) throw new Error('bristles are worn by the plant only')
    this.roots = [new Float32Array(count * 4), new Float32Array(count * 4)]
    this.leans = [new Float32Array(count * 4), new Float32Array(count * 4)]
    const rows = Math.max(1, Math.ceil(count / ROW))
    this.data = new Float32Array(ROW * 4 * rows * 4)
    this.texture = new THREE.DataTexture(this.data, ROW * 4, rows, THREE.RGBAFormat, THREE.FloatType)
    this.texture.colorSpace = THREE.NoColorSpace
    this.texture.minFilter = THREE.NearestFilter
    this.texture.magFilter = THREE.NearestFilter
    this.texture.generateMipmaps = false
    this.texture.needsUpdate = true
    // The vertices carry nothing: a vertex knows its bristle and its place on it from its number.
    const each = (RINGS - 1) * SIDES * 6 + SIDES * 3
    const index = new Uint32Array(count * each)
    for (let k = 0, o = 0; k < count; k++) {
      const v = k * VERTS
      for (let r = 0; r < RINGS - 1; r++) {
        for (let s = 0; s < SIDES; s++) {
          const a = v + r * SIDES + s
          const b = v + r * SIDES + ((s + 1) % SIDES)
          index.set([a, b, a + SIDES, b, b + SIDES, a + SIDES], o)
          o += 6
        }
      }
      for (let s = 0; s < SIDES; s++, o += 3) index.set([v + (RINGS - 1) * SIDES + s, v + (RINGS - 1) * SIDES + ((s + 1) % SIDES), v + VERTS - 1], o)
    }
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1))
    this.geometry.setDrawRange(0, 0)
    const surface = makePartSurface(options, { name, vertex, fragment, side: THREE.DoubleSide, castShadow: false, uniforms: { uBristles: { value: this.texture } } })
    const mesh = partMesh(this.geometry, surface)
    // Nothing is drawn for a lens too far off to show a bristle.
    mesh.onBeforeRender = (_renderer, _scene, camera) => {
      const reach = this.at.copy(this.middle).applyMatrix4(mesh.matrixWorld).distanceTo(this.eye.setFromMatrixPosition(camera.matrixWorld))
      const px = (0.001 * camera.projectionMatrix.elements[5] * 1080) / (2 * Math.max(reach - this.spread, 1e-3))
      this.geometry.setDrawRange(0, px > BRISTLE_FROM_PX && shared.uDiag.value < 4 ? this.shown * each : 0)
    }
    this.meshes = [mesh]
  }

  // Four numbers a bristle: where it is rooted (x, y, z in the wearer's own space, meters) and how long it is (meters, 0 for none).
  root(slot: 0 | 1): Float32Array {
    this.stale = true
    return this.roots[slot]
  }

  // Four numbers a bristle: the direction it stands in, and a number from 0 to 1 that is its own.
  lean(slot: 0 | 1): Float32Array {
    this.stale = true
    return this.leans[slot]
  }

  // How many of the bristles are drawn. Call once a frame after the slots are filled: what was not filled again is not sent again.
  finish(shown = this.count): void {
    this.shown = Math.max(0, Math.min(shown, this.count))
    if (!this.stale) return
    this.stale = false
    const [ra, rb] = this.roots
    const [la, lb] = this.leans
    const data = this.data
    for (let k = 0; k < this.count; k++) {
      const i = k * 4
      const o = k * 16
      data[o] = ra[i]
      data[o + 1] = ra[i + 1]
      data[o + 2] = ra[i + 2]
      data[o + 3] = ra[i + 3]
      data[o + 4] = la[i]
      data[o + 5] = la[i + 1]
      data[o + 6] = la[i + 2]
      data[o + 7] = la[i + 3]
      data[o + 8] = rb[i]
      data[o + 9] = rb[i + 1]
      data[o + 10] = rb[i + 2]
      data[o + 11] = rb[i + 3]
      data[o + 12] = lb[i]
      data[o + 13] = lb[i + 1]
      data[o + 14] = lb[i + 2]
      data[o + 15] = lb[i + 3]
    }
    this.texture.needsUpdate = true
    let n = 0
    this.middle.set(0, 0, 0)
    for (let k = 0; k < this.shown; k++) {
      if (ra[k * 4 + 3] <= 0) continue
      this.middle.x += ra[k * 4]
      this.middle.y += ra[k * 4 + 1]
      this.middle.z += ra[k * 4 + 2]
      n++
    }
    this.middle.divideScalar(Math.max(1, n))
    this.spread = 0
    for (let k = 0; k < this.shown; k++) if (ra[k * 4 + 3] > 0) this.spread = Math.max(this.spread, Math.hypot(ra[k * 4] - this.middle.x, ra[k * 4 + 1] - this.middle.y, ra[k * 4 + 2] - this.middle.z))
  }
}

export function createBristles(options: PartOptions, count: number, name: string): BristleSet | null {
  return options.places || count <= 0 ? null : new BristleSet(options, count, name)
}
