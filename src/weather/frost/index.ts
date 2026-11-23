import * as THREE from 'three'
import { fieldUniforms, makePartSurface, partMesh, stateUniforms, type PartOptions } from '../../plant/part.ts'
import { shared, type Surface } from '../../core/shading.ts'
import { windToward } from '../../plant/wind.ts'
import { ball } from '../../plant/hairs/index.ts'
import { config } from '../../config.ts'

// Crystals are see-through at their edges and are drawn after the bodies they grow on and before the hairs (20).
export const CRYSTAL_ORDER = 18

const ROW = 512
const NEEDLES = 5
const REGATHER_M = 0.03
const SHUTTER_SECONDS = config.film.shutterDegrees / 360 / config.film.fps
const fract = (x: number): number => x - Math.floor(x)

// A crystal of hoarfrost is a few flat needles of ice. Each needle is one facet: matt white from most sides, a hard flash from the one side where it mirrors the sun.
const crystal = /* glsl */ `
uniform sampler2D uCrystals;
uniform float uPlantFrost;
uniform float uPlantDew;
uniform float uPlantHeight;
uniform float uMelts;
uniform float uDewToo;
out vec3 vWorld;
out vec3 vLitAt;
out float vDepth;
out vec3 vSun;
out vec3 vSky;
out float vAcross;
out float vHalf;
out float vFade;
out vec3 vBall;
out vec3 vRight;
out vec3 vUp;

const vec3 ICE = vec3(0.93, 0.96, 1.0);
const vec3 ICE_SHADE = vec3(0.86, 0.93, 1.06);
const float MATT = 0.15;
const float THROUGH = 0.2;
const float GLINT = 22.0;
const float GLINT_SHARP = 700.0;
const float SKY = 1.6;
const vec3 AIR_FROM = vec3(${(-windToward.x).toFixed(4)}, 0.0, ${(-windToward.z).toFixed(4)});
// Of the crystals that melt, the share whose water is seen as a bead, and of those the share that take the water of their neighbors, grow heavy and fall.
const float BEAD_SHARE = 0.34;
const float HEAVY_SHARE = 0.07;
// And the share that stay where they formed, as the dew of the morning: many fine and a few big.
const float STAY_SHARE = 0.45;
const float BIG_SHARE = 0.08;
// The film seconds one whole thaw takes, for the fall of a drop.
const float THAW_S = 4.5;
const float NEEDLE_PX = 0.7;
const float NEEDLE_LEAST = 0.2;
const float TUFT_MOST_M = 0.0034;
const float SPIKE_MOST_M = 0.0022;
const float SPIKE_LEAST = 0.3;
const float SPIKE_MOST = 0.8;
const float PATCH_M = 0.035;
const float PATCH_LEAST = 0.4;
const float PATCH_MOST = 1.0;

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
  // The wearer's number says what the crystal is: 0 to 1 the set chooses, 1 to 2 a low tuft, 2 to 3 a spike.
  float chosen = floor(b.w);
  float own = b.w - chosen;
  float n = float(needle);
  vec3 grow = plantDirection(normalize(mix(c.xyz, d.xyz, uShutter)));
  bool spike = chosen > 1.5 || (chosen < 0.5 && hash(own, 4.0) > 0.74);
  float h5 = hash(own, 5.0);
  grow = normalize(grow + AIR_FROM * 0.3 + (vec3(hash(own, 1.0), hash(own, 2.0), hash(own, 3.0)) - 0.5) * (spike ? 1.8 : 2.2));
  // Frost does not lie evenly: it stands thick on one stretch of an edge and thin on the next, most of it short and a little of it long.
  vec3 where = a.xyz * (6.2832 / PATCH_M);
  float lush = saturate(0.5 + 0.9 * sin(where.x + 1.7 * sin(where.z * 0.61 + 0.4)) * sin(where.y * 0.83 + 1.3 * sin(where.x * 0.47 + 2.1)));
  float size = min(a.w * (spike ? 0.7 + 1.4 * h5 * h5 : 0.3 + 0.8 * h5 * h5 * (0.5 + lush)), (spike ? SPIKE_MOST_M * (0.3 + hash(own, 23.0) * hash(own, 23.0)) : TUFT_MOST_M * (0.4 + 1.2 * hash(own, 23.0) * hash(own, 23.0)))) * plantSize();
  // The dew comes up with the thaw and never with the freeze, so it tells the two apart. Freezing, each crystal starts at its own moment and grows. Thawing, the frost dial falls slowly and then all at once.
  bool thawing = uMelts > 0.5 && uPlantDew > 0.0;
  float gone = 1.0 - uPlantFrost;
  float thaw = thawing ? (gone < 0.4 ? gone * 1.875 : 0.75 + (gone - 0.4) * 0.4167) : 0.0;
  float born = 0.45 * hash(own, 24.0);
  size *= thawing ? 1.0 : uMelts > 0.5 ? smoothstep(born, born + 0.55, uPlantFrost) : uPlantFrost;
  // A crystal the sun reaches goes first, and so does one high on the plant.
  float sunward = 0.5 + 0.5 * dot(grow, uSunDir);
  float turn6 = 0.42 * hash(own, 6.0) + 0.26 * (1.0 - sunward) + 0.1 * (1.0 - saturate(root.y / max(uPlantHeight, 0.05)));
  float melt = smoothstep(turn6, turn6 + 0.2, thaw);
  size *= 1.0 - 0.85 * melt;

  vec3 ref = abs(grow.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 e1 = normalize(cross(grow, ref));
  vec3 e2 = cross(grow, e1);
  float turn = 6.2832 * hash(own, 7.0 + n);
  vec3 aside = e1 * cos(turn) + e2 * sin(turn);
  bool feather = spike && hash(own, 8.0) < 0.5;
  float many = 2.0 + floor(3.99 * hash(own, 9.0));
  vec3 foot = root;
  vec3 axis = grow;
  float reach = size;
  float wide = 0.09 * size;
  if (feather) {
    vec3 flat0 = e1 * cos(6.2832 * hash(own, 10.0)) + e2 * sin(6.2832 * hash(own, 10.0));
    if (needle > 0) {
      float along = 0.18 + 0.17 * n + 0.08 * hash(own, 11.0 + n);
      foot = root + grow * (size * along);
      axis = normalize(grow * (0.5 + 0.5 * hash(own, 12.0 + n)) + flat0 * (mod(n, 2.0) * 2.0 - 1.0));
      reach = size * (0.5 - 0.4 * along) * (0.7 + 0.6 * hash(own, 13.0 + n));
      wide = 0.06 * size;
    }
  } else {
    axis = normalize(grow + aside * (needle == 0 ? 0.0 : spike ? 0.35 + 0.5 * hash(own, 14.0 + n) : 0.3 + 0.6 * hash(own, 14.0 + n)));
    reach = n < many ? size * (needle == 0 ? 1.0 : spike ? 0.25 + 0.35 * hash(own, 15.0 + n) : 0.6 + 0.4 * hash(own, 15.0 + n)) : 0.0;
    wide = (spike ? 0.075 : 0.09) * size;
  }
  wide = max(wide, (needle == 0 ? 0.0002 : 0.00015) * plantSize());
  // A needle thinner than a pixel cannot be seen as a needle, and a row of them is a white band. There one crystal in a few is drawn, as wide as those it stands for together.
  float rootPx = -(viewMatrix * vec4(root, 1.0)).z * 2.0 / (projectionMatrix[1][1] * uSize.y);
  float thin = clamp(max((spike && !feather ? 0.075 : 0.09) * size, 0.0002 * plantSize()) / (NEEDLE_PX * rootPx), NEEDLE_LEAST, 1.0);
  float kept = thin * mix(spike ? SPIKE_LEAST : PATCH_LEAST, spike ? SPIKE_MOST : PATCH_MOST, lush);
  float stays = saturate((kept - hash(own, 22.0)) / (0.2 * kept));
  wide /= thin;

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
  vFade = (reach > 0.0 ? stays : 0.0) / stretch * (1.0 - melt);
  vec3 world = here + across * (vAcross * pixel);

  float face = 6.2832 * hash(own, 16.0 + n);
  vec3 f1 = normalize(cross(axis, abs(axis.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 facet = f1 * cos(face) + cross(axis, f1) * sin(face);
  vec3 mirror = normalize(toEye + uSunDir);
  float glint = pow(abs(dot(facet, mirror)), GLINT_SHARP);
  float behind = pow(saturate(-dot(toEye, uSunDir)), 3.0);
  float clear = 1.0 - 0.7 * melt;
  vSun = uSunColor * (ICE * (MATT * (0.1 + 0.9 * abs(dot(facet, uSunDir))) + THROUGH * behind) * clear + GLINT * glint);
  vSky = ICE * ICE_SHADE * (SKY * clear * (0.75 + 0.5 * hash(own, 17.0 + n)));
  vWorld = world;
  vLitAt = root + grow * (0.004 * plantSize());
  vDepth = depth;
  vBall = vec3(0.0);
  vRight = vec3(0.0);
  vUp = vec3(0.0);
  // The water of a melted crystal draws back into a bead where the crystal stood. The small beads run into the heavy ones, and a heavy one hangs, lets go and falls.
  float pick = hash(own, 19.0) / BEAD_SHARE;
  if (needle == 4 && melt > 0.0 && pick < 1.0) {
    bool heavy = pick < HEAVY_SHARE;
    bool stays = pick > 1.0 - STAY_SHARE;
    float h21 = hash(own, 21.0);
    float fed = smoothstep(turn6 + 0.2, turn6 + 0.45, thaw);
    float lets = 0.3 + 0.6 * turn6 + 0.1 * hash(own, 20.0);
    float fallen = heavy && thaw > lets ? (thaw - lets) * THAW_S + uShutter * ${SHUTTER_SECONDS.toFixed(6)} : 0.0;
    float radius = heavy ? (0.00055 + 0.0004 * h21) * (0.55 + 0.45 * fed) : stays ? (hash(own, 25.0) < BIG_SHARE ? 0.0005 + 0.0004 * h21 : 0.00014 + 0.0002 * h21) : (0.0002 + 0.00028 * h21) * (1.0 - fed);
    // A wearer that goes on wearing its set in the dew keeps the beads that stay. One that puts the set away with the frost loses them as the frost goes.
    radius *= plantSize() * melt * (stays ? mix(smoothstep(0.0, 0.15, uPlantFrost), smoothstep(0.0, 0.5, uPlantDew), uDewToo) : smoothstep(0.0, 0.15, uPlantFrost));
    float hangs = heavy ? smoothstep(lets - 0.2, lets, thaw) : 0.0;
    vec3 center = root - vec3(0.0, radius * (0.7 + 0.9 * hangs) + 4.905 * fallen * fallen, 0.0);
    if (center.y < 0.0) radius = 0.0;
    toEye = normalize(uCamPos - center);
    depth = -(viewMatrix * vec4(center, 1.0)).z;
    pixel = depth * 2.0 / (projectionMatrix[1][1] * uSize.y);
    vRight = normalize(cross(vec3(0.0, 1.0, 0.0), toEye));
    vUp = cross(toEye, vRight);
    float rPx = radius / pixel;
    float reachPx = max(rPx, 0.5) + 0.75;
    vAcross = side * reachPx;
    vBall = vec3((end * 2.0 - 1.0) * reachPx, rPx, 1.0);
    vHalf = 0.0;
    vFade = 1.0;
    world = center + (vRight * vAcross + vUp * vBall.x) * (radius > 0.0 ? pixel : 0.0);
    vWorld = center;
    vLitAt = center;
    vDepth = depth;
  }
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
in vec3 vBall;
in vec3 vRight;
in vec3 vUp;
${ball}
void main() {
  float x = abs(vAcross);
  float cover = saturate(max(0.0, min(vHalf, x + 0.5) - max(-vHalf, x - 0.5)) * vFade);
  float r = max(vBall.y, 0.5);
  if (vBall.z > 0.5) cover = saturate(r - length(vec2(vAcross, vBall.x)) + 0.5) * (vBall.y * vBall.y / (r * r));
#ifdef BLUR_CIRCLE
  outColor = vec4(0.0, 0.0, 0.0, cover > 0.2 ? cocOf(vDepth) : 4096.0);
#else
  if (cover < 0.004) discard;
  float sun = plantSun(vLitAt, uSunDir);
  vec3 color = vBall.z > 0.5 ? ballLight(vec2(vAcross, vBall.x) / r, vRight, vUp, vWorld, sun, 0.0, r) : vSun * sun + vSky * skyAmbient(vec3(0.0, 0.6, 0.0)) * plantSky(vWorld);
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

  constructor(options: PartOptions, readonly count: number, name: string, melts = true, private readonly dewToo = false) {
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
    const index = new Uint32Array(count * NEEDLES * 6)
    for (let k = 0; k < count * NEEDLES; k++) {
      const v = k * 4
      index.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], k * 6)
    }
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1))
    const uniforms = { uCrystals: { value: this.texture }, uPlantHeight: fieldUniforms.uPlantHeight, uMelts: { value: melts ? 1 : 0 }, uDewToo: { value: dewToo ? 1 : 0 } }
    this.surface = makePartSurface(options, { name, vertex: crystal, fragment, side: THREE.DoubleSide, transparent: true, castShadow: false, uniforms })
    const sharp = makePartSurface(options, { name: `${name} blur circle`, vertex: crystal, fragment: `#define BLUR_CIRCLE 1\n${fragment}`, side: THREE.DoubleSide, transparent: true, cocOnly: true, castShadow: false, uniforms })
    const drawn = partMesh(this.geometry, this.surface)
    const kept = partMesh(this.geometry, sharp)
    drawn.renderOrder = CRYSTAL_ORDER
    kept.renderOrder = CRYSTAL_ORDER + 1
    drawn.onBeforeRender = (_renderer, _scene, camera) => this.choose(camera, drawn)
    this.meshes = [drawn, kept]
  }

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
    // A wearer that has not yet said how long its ice is gets a fringe from here: most of the margin bare or short, a little of it long, and a spike where the wearer asks for one.
    let said = false
    for (let i = 0; i < this.shown && !said; i++) said = ra[i * 4 + 3] > 0
    let n = 0
    for (let i = 0; i < this.shown; i++) {
      const o = i * 4
      let length = ra[o + 3]
      if (!said) {
        const kind = la[o + 3]
        const h1 = fract(Math.sin(i * 12.9898 + 1.3) * 43758.5453)
        const h2 = fract(Math.sin(i * 78.233 + 2.1) * 24634.6345)
        const run = 0.5 + 0.5 * Math.sin(ra[o] * 410 + 1.7 * Math.sin(ra[o + 2] * 290)) * Math.sin(ra[o + 1] * 370 + 0.9)
        length = kind >= 2 ? 0.0028 : kind >= 1 ? (h2 > 0.62 || run < 0.3 * h1 + 0.16 ? 0 : (0.002 + 0.0016 * h1) * (0.6 + 2.2 * run * run)) : 0.0006 + 0.001 * h1
      }
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
    const worn = stateUniforms.uPlantFrost.value > 0 || (this.dewToo && stateUniforms.uPlantDew.value > 0)
    if (!worn || shared.uDiag.value >= 4) {
      this.geometry.setDrawRange(0, 0)
      return
    }
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

// A wearer whose crystals outlast the frost (the bud, the ground) passes melts as false. One that fills its set whenever there is frost or dew, and not in frost alone, passes dewToo as true and keeps the beads of the thaw as its dew.
export function createCrystals(options: PartOptions, count: number, name: string, melts = true, dewToo = false): CrystalSet | null {
  return options.places || count <= 0 ? null : new CrystalSet(options, count, name, melts, dewToo)
}
