import * as THREE from 'three'
import { fieldUniforms, makePartSurface, partMesh, stateUniforms, type PartOptions } from '../../plant/part.ts'
import { shared, type Surface } from '../../core/shading.ts'
import { windToward } from '../../plant/wind.ts'

// Crystals are see-through at their edges and are drawn after the bodies they grow on and before the hairs (20).
export const CRYSTAL_ORDER = 18

const ROW = 512
const NEEDLES = 5
const REGATHER_M = 0.03

// A crystal of hoarfrost is a few flat needles of ice. Each needle is one facet: matt white from most sides, a hard flash from the one side where it mirrors the sun.
const crystal = /* glsl */ `
uniform sampler2D uCrystals;
uniform float uPlantFrost;
uniform float uPlantHeight;
out vec3 vWorld;
out vec3 vLitAt;
out float vDepth;
out vec3 vSun;
out vec3 vSky;
out float vAcross;
out float vHalf;
out float vFade;

const vec3 ICE = vec3(0.93, 0.96, 1.0);
// Ice in its own shade is lit by the sky alone and goes a little blue.
const vec3 ICE_SHADE = vec3(0.86, 0.93, 1.06);
const float MATT = 0.5;
const float THROUGH = 0.7;
const float GLINT = 22.0;
const float GLINT_SHARP = 700.0;
const float SKY = 0.8;
// Frost grows toward the side the air came from.
const vec3 AIR_FROM = vec3(${(-windToward.x).toFixed(4)}, 0.0, ${(-windToward.z).toFixed(4)});
const float MELT_FROM_S = 38.0;

float hash(float own, float n) {
  return fract(sin(own * 917.13 + n * 37.71 + 0.31) * 4375.85);
}

void main() {
  int k = gl_VertexID / 20;
  int j = gl_VertexID % 20;
  int needle = j >> 2;
  float side = float(j & 1) * 2.0 - 1.0;
  float end = float((j >> 1) & 1);
  ivec2 at = ivec2((k & 511) * 4, k >> 9);
  vec4 a = texelFetch(uCrystals, at, 0);
  vec4 b = texelFetch(uCrystals, at + ivec2(1, 0), 0);
  vec4 c = texelFetch(uCrystals, at + ivec2(2, 0), 0);
  vec4 d = texelFetch(uCrystals, at + ivec2(3, 0), 0);
  vec3 root = plantWorld(mix(a.xyz, b.xyz, uShutter));
  float own = b.w;
  float n = float(needle);
  vec3 grow = plantDirection(normalize(mix(c.xyz, d.xyz, uShutter)));
  grow = normalize(grow + AIR_FROM * 0.3 + (vec3(hash(own, 1.0), hash(own, 2.0), hash(own, 3.0)) - 0.5) * 0.7);
  // Most crystals are small and a few are large.
  float size = a.w * plantSize() * (0.35 + 1.65 * hash(own, 4.0) * hash(own, 5.0)) * uPlantFrost;
  // Late in the frost the crystals high on the plant start to give way: a few of them shrink and go clear.
  float high = smoothstep(0.55, 0.75, root.y / max(uPlantHeight, 0.05));
  float from = MELT_FROM_S + 6.0 * hash(own, 6.0);
  float melt = high * smoothstep(from, from + 1.5, uTime);
  size *= 1.0 - 0.75 * melt;

  vec3 ref = abs(grow.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 e1 = normalize(cross(grow, ref));
  vec3 e2 = cross(grow, e1);
  float turn = 6.2832 * hash(own, 7.0 + n);
  vec3 aside = e1 * cos(turn) + e2 * sin(turn);
  bool feather = hash(own, 8.0) < 0.4;
  float many = 2.0 + floor(3.99 * hash(own, 9.0));
  vec3 foot = root;
  vec3 axis = grow;
  float reach = size;
  float wide = 0.16 * size;
  if (feather) {
    // A feathered blade: a flat spine with barbs standing off it in its own plane, shorter toward the tip.
    vec3 flat0 = e1 * cos(6.2832 * hash(own, 10.0)) + e2 * sin(6.2832 * hash(own, 10.0));
    if (needle > 0) {
      float along = 0.18 + 0.17 * n + 0.08 * hash(own, 11.0 + n);
      foot = root + grow * (size * along);
      axis = normalize(grow * (0.5 + 0.5 * hash(own, 12.0 + n)) + flat0 * (mod(n, 2.0) * 2.0 - 1.0));
      reach = size * (0.5 - 0.4 * along) * (0.7 + 0.6 * hash(own, 13.0 + n));
      wide = 0.1 * size;
    }
  } else {
    // A cluster: two to five needles from one foot.
    axis = normalize(grow + aside * (needle == 0 ? 0.0 : 0.5 + 0.9 * hash(own, 14.0 + n)));
    reach = n < many ? size * (needle == 0 ? 1.0 : 0.35 + 0.6 * hash(own, 15.0 + n)) : 0.0;
    wide = 0.09 * size;
  }
  wide = max(wide, 0.00004 * plantSize());

  vec3 here = foot + axis * (reach * end);
  vec3 toEye = normalize(uCamPos - here);
  vec4 view = viewMatrix * vec4(here, 1.0);
  float depth = -view.z;
  float pixel = depth * 2.0 / (projectionMatrix[1][1] * uSize.y);
  vec3 across = normalize(cross(axis, toEye));
  // A needle shorter than a pixel and a half is drawn that long and that much fainter, so it does not blink.
  float longPx = reach * length(cross(axis, toEye)) / pixel;
  float stretch = max(1.0, 1.5 / max(longPx, 1e-3));
  here = foot + axis * (reach * (0.5 + (end - 0.5) * stretch));
  float halfPx = 0.5 * wide * (1.0 - 0.92 * end) / pixel;
  vAcross = side * (halfPx + 0.75);
  vHalf = halfPx;
  vFade = (reach > 0.0 ? 1.0 : 0.0) / stretch * (1.0 - 0.5 * melt);
  vec3 world = here + across * (vAcross * pixel);

  // The facet of a needle faces some way round its axis.
  float face = 6.2832 * hash(own, 16.0 + n);
  vec3 f1 = normalize(cross(axis, abs(axis.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 facet = f1 * cos(face) + cross(axis, f1) * sin(face);
  vec3 mirror = normalize(toEye + uSunDir);
  float glint = pow(abs(dot(facet, mirror)), GLINT_SHARP);
  float behind = pow(saturate(-dot(toEye, uSunDir)), 3.0);
  float clear = 1.0 - 0.6 * melt;
  vSun = uSunColor * (ICE * (MATT * (0.55 + 0.45 * abs(dot(facet, uSunDir))) + THROUGH * behind) * clear + GLINT * glint);
  vSky = ICE * ICE_SHADE * (SKY * clear);
  vWorld = world;
  vLitAt = root + grow * (0.004 * plantSize());
  vDepth = depth;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vLitAt;
in float vDepth;
in vec3 vSun;
in vec3 vSky;
in float vAcross;
in float vHalf;
in float vFade;
void main() {
  float x = abs(vAcross);
  float cover = saturate(max(0.0, min(vHalf, x + 0.5) - max(-vHalf, x - 0.5)) * vFade);
#ifdef BLUR_CIRCLE
  outColor = vec4(0.0, 0.0, 0.0, cover > 0.2 ? cocOf(vDepth) : 4096.0);
#else
  if (cover < 0.004) discard;
  vec3 color = vSun * plantSun(vLitAt, uSunDir) + vSky * skyAmbient(vec3(0.0, 0.6, 0.0)) * plantSky(vWorld);
  outColor = vec4(finish(color, vWorld, vDepth, -1.0).rgb, cover);
#endif
}
`

// Hoarfrost crystals. The part that wears them gives each crystal its root, the direction it stands in and its size at both ends of the shutter, as it does for its hairs. They exist only in a frosted world.
export class CrystalSet {
  readonly surface: Surface
  // A part that wears crystals adds both to its own meshes: one draws them, the other keeps them as sharp as they are.
  readonly meshes: THREE.Mesh[]
  private readonly roots: [Float32Array, Float32Array]
  private readonly leans: [Float32Array, Float32Array]
  private readonly geometry = new THREE.BufferGeometry()
  private readonly data: Float32Array
  private readonly texture: THREE.DataTexture
  private shown: number
  private stale = true
  private kept = 0
  private readonly eye = new THREE.Vector3()
  private readonly seen = new THREE.Vector3()
  private readonly clip = new THREE.Matrix4()

  constructor(options: PartOptions, readonly count: number, name: string) {
    if (options.places) throw new Error('crystals are worn by the plant, the companion and the ground only')
    this.shown = count
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
    // The vertices carry nothing: a vertex knows its crystal, its needle and its corner from its number.
    const index = new Uint32Array(count * NEEDLES * 6)
    for (let k = 0; k < count * NEEDLES; k++) {
      const v = k * 4
      index.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], k * 6)
    }
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1))
    const uniforms = { uCrystals: { value: this.texture }, uPlantHeight: fieldUniforms.uPlantHeight }
    this.surface = makePartSurface(options, { name, vertex: crystal, fragment, side: THREE.DoubleSide, transparent: true, castShadow: false, uniforms })
    const sharp = makePartSurface(options, { name: `${name} blur circle`, vertex: crystal, fragment: `#define BLUR_CIRCLE 1\n${fragment}`, side: THREE.DoubleSide, transparent: true, cocOnly: true, castShadow: false, uniforms })
    const drawn = partMesh(this.geometry, this.surface)
    const kept = partMesh(this.geometry, sharp)
    drawn.renderOrder = CRYSTAL_ORDER
    kept.renderOrder = CRYSTAL_ORDER + 1
    drawn.onBeforeRender = (_renderer, _scene, camera) => this.choose(camera, drawn)
    this.meshes = [drawn, kept]
  }

  // A crystal outside the picture is left out.
  private gather(camera: THREE.Camera, object: THREE.Object3D): void {
    const e = this.clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(object.matrixWorld).elements
    const m = object.matrixWorld.elements
    const size = Math.hypot(m[0], m[1], m[2])
    const [ra, rb] = this.roots
    const [la, lb] = this.leans
    const out = this.data
    const cocScale = shared.uCocScale.value
    const focus = shared.uFocusM.value
    const height = shared.uSize.value.y
    let n = 0
    for (let i = 0; i < this.shown; i++) {
      const o = i * 4
      const length = ra[o + 3]
      if (!(length > 0)) continue
      const x = ra[o]
      const y = ra[o + 1]
      const z = ra[o + 2]
      const w = e[3] * x + e[7] * y + e[11] * z + e[15]
      const long = length * size * 2
      if (w < long) continue
      const coc = cocScale * Math.abs(1 / w - 1 / focus)
      const reach = w * (1.04 + (2 * coc) / height) + long * 4
      if (Math.abs(e[0] * x + e[4] * y + e[8] * z + e[12]) > reach || Math.abs(e[1] * x + e[5] * y + e[9] * z + e[13]) > reach) continue
      const la2 = Math.hypot(la[o], la[o + 1], la[o + 2]) || 1
      const lb2 = Math.hypot(lb[o], lb[o + 1], lb[o + 2]) || 1
      const q = n * 16
      out[q] = x
      out[q + 1] = y
      out[q + 2] = z
      out[q + 3] = length
      out[q + 4] = rb[o]
      out[q + 5] = rb[o + 1]
      out[q + 6] = rb[o + 2]
      out[q + 7] = la[o + 3]
      out[q + 8] = la[o] / la2
      out[q + 9] = la[o + 1] / la2
      out[q + 10] = la[o + 2] / la2
      out[q + 11] = 0
      out[q + 12] = lb[o] / lb2
      out[q + 13] = lb[o + 1] / lb2
      out[q + 14] = lb[o + 2] / lb2
      out[q + 15] = 0
      n++
    }
    this.kept = n
    this.texture.needsUpdate = true
    this.stale = false
    this.eye.setFromMatrixPosition(camera.matrixWorld)
  }

  private choose(camera: THREE.Camera, object: THREE.Object3D): void {
    const frost = stateUniforms.uPlantFrost.value
    if (frost <= 0 || shared.uDiag.value >= 4) {
      this.geometry.setDrawRange(0, 0)
      return
    }
    // The samples of one frame differ by the width of the lens. A camera farther than that from where the crystals were gathered is another view.
    if (this.stale || this.seen.setFromMatrixPosition(camera.matrixWorld).distanceTo(this.eye) > REGATHER_M) this.gather(camera, object)
    this.geometry.setDrawRange(0, this.kept * NEEDLES * 6)
  }

  // How many crystals are in the picture, as last gathered.
  get inView(): number {
    return this.kept
  }

  // Four numbers a crystal: where it is rooted (x, y, z in the wearer's own space, meters) and how long it is (meters, 0 for none).
  root(slot: 0 | 1): Float32Array {
    return this.roots[slot]
  }

  // Four numbers a crystal: the direction it stands in, and a number from 0 to 1 that is its own.
  lean(slot: 0 | 1): Float32Array {
    return this.leans[slot]
  }

  // How many of the crystals are drawn. Call once a frame after both slots are filled.
  finish(shown = this.count): void {
    this.shown = Math.max(0, Math.min(shown, this.count))
    this.stale = true
  }
}

export function createCrystals(options: PartOptions, count: number, name: string): CrystalSet | null {
  return options.places || count <= 0 ? null : new CrystalSet(options, count, name)
}
