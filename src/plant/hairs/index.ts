import * as THREE from 'three'
import { makePartSurface, partMesh, type PartOptions } from '../part.ts'
import { shared, type Surface } from '../../core/shading.ts'

// `real` turns true once this folder holds the plant's hairs at their real quality.
export const real = true

// See-through things are drawn in the order of these numbers: the hairs of the plant after the far things of a world (under 20) and before its air (40 and over).
export const HAIR_ORDER = 20

// A hair wider than this many pixels is drawn as a ribbon turned to the camera. Thinner, it is a one pixel line that carries its true share of light.
const RIBBON_FROM_PX = 0.45
// Hairs to a row of the texture that holds them, four texels each.
const ROW = 512
// A hair whose blur circle is wider than this many pixels shares its place: fewer are drawn and each stands for several.
const THIN_FROM_PX = 10
const THIN_LEAST = 0.12
const THIN_EASE = 0.15
const REGATHER_M = 0.03

// The strand: where a point of it lies, which way it runs there, how thick it is, and the light it sends to the eye.
// A hair is a clear fiber. Sunlight goes through it and leaves in a cone about the fiber, strongest straight on (the lobe called TT), with a weak mirror of the sun on its near side (R) and next to nothing scattered evenly.
const strand = /* glsl */ `
uniform sampler2D uHairs;
out vec3 vWorld;
out float vDepth;
out vec3 vSun;
out vec3 vSky;
out float vSkyY;
uniform vec3 uHairColor;
uniform float uHairWidth;

const float STRAND_GAIN = 3.14159;
const float TT_SPREAD = 0.34;
const float TT_TURN = 2.6;
const float R_SPREAD = 0.16;
const float EVEN = 0.035;

struct Strand {
  vec3 world;
  vec3 along;
  vec3 toEye;
  float depth;
  float width;
  float pixel;
  float share;
};

vec4 hairRoot;
vec3 hairDir;
vec3 hairBend;
float hairOwn;
float hairShare;

// Four texels a hair: its root and length, its root at the close of the shutter and its own number, its direction and how many hairs it stands for, its direction at the close.
void readHair(int k) {
  ivec2 at = ivec2((k & 511) * 4, k >> 9);
  vec4 a = texelFetch(uHairs, at, 0);
  vec4 b = texelFetch(uHairs, at + ivec2(1, 0), 0);
  vec4 c = texelFetch(uHairs, at + ivec2(2, 0), 0);
  vec4 d = texelFetch(uHairs, at + ivec2(3, 0), 0);
  hairRoot = vec4(mix(a.xyz, b.xyz, uShutter), a.w);
  hairDir = normalize(mix(c.xyz, d.xyz, uShutter));
  hairOwn = b.w;
  hairShare = c.w;
  float h1 = fract(hairOwn * 13.37 + 0.21);
  float h2 = fract(hairOwn * 47.13 + 0.67);
  vec3 ref = abs(hairDir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 e1 = normalize(cross(hairDir, ref));
  vec3 e2 = cross(hairDir, e1);
  float turn = h1 * 6.2832;
  // The place for the skin states: wet hairs lean together and carry beads (uPlantWet), frost grows crystals along them (uPlantFrost), dew sits on them as beads (uPlantDew).
  hairBend = (e1 * cos(turn) + e2 * sin(turn)) * (0.06 + 0.3 * h2 * h2) + vec3(0.0, -0.05, 0.0);
}

vec3 hairPoint(float t) {
  return hairRoot.xyz + (hairDir * t + hairBend * (t * t)) * hairRoot.w;
}

float lobe(float s, float spread) {
  return exp(-0.5 * s * s / (spread * spread)) / (2.5066 * spread);
}

vec3 scatter(vec3 along, vec3 toEye, vec3 toSun) {
  float sinI = dot(toSun, along);
  float sinO = dot(toEye, along);
  float cosI = sqrt(max(1.0 - sinI * sinI, 0.0));
  float cosO = sqrt(max(1.0 - sinO * sinO, 0.0));
  float round = dot(toSun - sinI * along, toEye - sinO * along) / max(cosI * cosO, 1e-4);
  float between = 0.5 * (1.0 + cosI * cosO + sinI * sinO);
  float glance = sqrt(saturate(0.5 + 0.5 * dot(toSun, toEye)));
  float mirror = 0.04 + 0.96 * pow(1.0 - glance, 5.0);
  float through = lobe(sinI + sinO, TT_SPREAD) * 0.64 * exp(-TT_TURN * (1.0 + round)) * (1.0 - mirror) * (1.0 - mirror);
  float back = lobe(sinI + sinO, R_SPREAD) * 0.25 * sqrt(saturate(0.5 + 0.5 * round)) * mirror;
  return (uHairColor * through + vec3(back)) * (cosI / max(between, 0.2)) + uHairColor * (EVEN * cosI);
}

Strand strandAt(float t) {
  float h1 = fract(hairOwn * 13.37 + 0.21);
  float h3 = fract(hairOwn * 91.71 + 0.43);
  Strand s;
  s.world = plantWorld(hairPoint(t));
  s.along = plantDirection(normalize(hairDir + hairBend * (2.0 * t)));
  s.toEye = normalize(uCamPos - s.world);
  vec4 view = viewMatrix * vec4(s.world, 1.0);
  s.depth = -view.z;
  s.pixel = s.depth * 2.0 / (projectionMatrix[1][1] * uSize.y);
  s.width = uHairWidth * plantSize() * (0.5 + h3) * mix(1.0, 0.1, pow(t, 0.7 + 0.9 * h1));
  s.share = hairShare;
  float reach = length(s.world - uCamPos);
  float fog = exp(-uFogDensity * exp(-uFogFalloff * max(uCamPos.y, 0.0)) * reach);
  vWorld = s.world;
  vDepth = s.depth;
  vSun = uSunColor * scatter(s.along, s.toEye, uSunDir) * (STRAND_GAIN * fog);
  vSky = uHairColor * (0.1 * fog);
  vSkyY = normalize(s.toEye + vec3(0.0, 0.6, 0.0)).y;
  return s;
}
`

const lineVertex = /* glsl */ `
out float vCover;
${strand}
void main() {
  readHair(gl_VertexID / 3);
  int j = gl_VertexID % 3;
  Strand s = strandAt(0.5 * float(j));
  vec4 here = projectionMatrix * viewMatrix * vec4(s.world, 1.0);
  vec4 there = projectionMatrix * viewMatrix * vec4(plantWorld(hairPoint(j == 0 ? 1.0 : 0.0)), 1.0);
  vec2 run = abs((there.xy / max(there.w, 1e-5) - here.xy / max(here.w, 1e-5)) * uSize);
  // A one pixel line lights one pixel for each step along its longer side, so a slanted line needs more of each pixel to carry the same light.
  float slant = length(run) / max(max(run.x, run.y), 1e-5);
  vCover = s.width / s.pixel * slant * s.share;
  gl_Position = here;
}
`

const ribbonVertex = /* glsl */ `
out float vAcross;
out float vHalf;
out float vShare;
${strand}
void main() {
  readHair(gl_VertexID / 10);
  int j = gl_VertexID % 10;
  Strand s = strandAt(0.25 * float(j >> 1));
  vec3 side = normalize(cross(s.along, s.toEye));
  float halfPx = 0.5 * s.width / s.pixel;
  vAcross = (float(j & 1) * 2.0 - 1.0) * (halfPx + 0.75);
  vHalf = halfPx;
  vShare = s.share;
  vec3 world = s.world + side * (vAcross * s.pixel);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
in vec3 vSun;
in vec3 vSky;
in float vSkyY;
#ifdef RIBBON
in float vAcross;
in float vHalf;
in float vShare;
#else
in float vCover;
#endif
void main() {
#ifdef RIBBON
  float x = abs(vAcross);
  float cover = max(0.0, min(vHalf, x + 0.5) - max(-vHalf, x - 0.5)) * vShare;
#else
  float cover = vCover;
#endif
  vec3 color = (vSun * plantSun(vWorld, uSunDir) + vSky * skyAmbient(vec3(0.0, vSkyY, 0.0)) * plantSky(vWorld)) * cover;
  // Light is added to what is behind, as a clear fiber does. The blur circle is the smaller of the hair's own and the one behind it, and only where the hair shows, so the lens does not smear a sharp bright hair into a soft background.
  float shows = dot(color, vec3(0.3, 0.6, 0.1));
  outColor = vec4(color, shows > 0.012 ? cocOf(vDepth) : 4096.0);
}
`

// Fine hairs. Far from the lens each is a line a pixel wide that adds its true share of light; close to it each is a thin ribbon turned to the camera. The part that wears them gives each hair its root and its direction at both ends of the shutter.
export class HairSet {
  readonly surface: Surface
  // The two forms of the hairs. One of them is drawn in any sample. A part that wears hairs adds all of them to its own meshes.
  readonly meshes: THREE.Mesh[]
  private readonly roots: [Float32Array, Float32Array]
  private readonly leans: [Float32Array, Float32Array]
  private readonly lines = new THREE.BufferGeometry()
  private readonly ribbons = new THREE.BufferGeometry()
  private readonly data: Float32Array
  private readonly texture: THREE.DataTexture
  private shown: number
  private stale = true
  private kept = 0
  private nearest = 1
  private longest = 0
  private readonly eye = new THREE.Vector3()
  private readonly seen = new THREE.Vector3()
  private readonly clip = new THREE.Matrix4()

  constructor(options: PartOptions, readonly count: number, name: string, color: [number, number, number] = [0.9, 0.95, 0.8], private readonly widthM = 0.00004) {
    if (options.places) throw new Error('hairs are worn by the plant and the companion only')
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
    // The vertices carry nothing: a vertex knows its hair and its place on it from its number.
    const lineIndex = new Uint32Array(count * 6)
    const ribbonIndex = new Uint32Array(count * 36)
    for (let k = 0; k < count; k++) {
      const v = k * 3
      lineIndex.set([v, v + 2], k * 2)
      lineIndex.set([v, v + 1, v + 1, v + 2], count * 2 + k * 4)
      const w = k * 10
      const band = (a: number, b: number) => [w + a * 2, w + a * 2 + 1, w + b * 2, w + a * 2 + 1, w + b * 2 + 1, w + b * 2]
      ribbonIndex.set([...band(0, 2), ...band(2, 4)], k * 12)
      ribbonIndex.set([...band(0, 1), ...band(1, 2), ...band(2, 3), ...band(3, 4)], count * 12 + k * 24)
    }
    this.lines.setIndex(new THREE.BufferAttribute(lineIndex, 1))
    this.ribbons.setIndex(new THREE.BufferAttribute(ribbonIndex, 1))
    const own = { uHairColor: { value: new THREE.Vector3(...color) }, uHairWidth: { value: widthM }, uHairs: { value: this.texture } }
    const make = (label: string, vertex: string, define: string): Surface => {
      const surface = makePartSurface(options, { name: label, vertex, fragment: `${define}${fragment}`, side: THREE.DoubleSide, transparent: true, additive: true, castShadow: false, uniforms: own })
      surface.main.blendEquationAlpha = THREE.MinEquation
      surface.main.blendSrcAlpha = THREE.OneFactor
      surface.main.blendDstAlpha = THREE.OneFactor
      return surface
    }
    this.surface = make(name, lineVertex, '')
    const close = make(`${name} close`, ribbonVertex, '#define RIBBON 1\n')
    const far = new THREE.LineSegments(this.lines, this.surface.main)
    far.frustumCulled = false
    far.matrixAutoUpdate = false
    const near = partMesh(this.ribbons, close)
    far.renderOrder = HAIR_ORDER
    near.renderOrder = HAIR_ORDER + 1
    far.onBeforeRender = (_renderer, _scene, camera) => this.choose(camera, far, false)
    near.onBeforeRender = (_renderer, _scene, camera) => this.choose(camera, near, true)
    this.meshes = [far as unknown as THREE.Mesh, near]
  }

  // The hairs this frame can show, packed for the shader. A hair outside the picture is left out, and of the hairs far out of focus a share is left out and the rest stand for them.
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
    let nearest = Infinity
    let longest = 0
    for (let i = 0; i < this.shown; i++) {
      const o = i * 4
      const length = ra[o + 3]
      if (!(length > 0)) continue
      const x = ra[o]
      const y = ra[o + 1]
      const z = ra[o + 2]
      const w = e[3] * x + e[7] * y + e[11] * z + e[15]
      const long = length * size
      if (w < long) continue
      const coc = cocScale * Math.abs(1 / w - 1 / focus)
      const reach = w * (1.04 + (2 * coc) / height) + long * 4
      if (Math.abs(e[0] * x + e[4] * y + e[8] * z + e[12]) > reach || Math.abs(e[1] * x + e[5] * y + e[9] * z + e[13]) > reach) continue
      const own = la[o + 3]
      let share = 1
      if (coc > THIN_FROM_PX) {
        const keep = Math.max(THIN_FROM_PX / coc, THIN_LEAST) * (1 + THIN_EASE)
        const h = (own * 151.37 + 0.11) % 1
        const s = Math.min(1, (keep - h) / THIN_EASE)
        if (s <= 0) continue
        share = s / (keep <= 1 ? keep - 0.5 * THIN_EASE : 1 - ((1 + THIN_EASE - keep) * (1 + THIN_EASE - keep)) / (2 * THIN_EASE))
      }
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
      out[q + 7] = own
      out[q + 8] = la[o] / la2
      out[q + 9] = la[o + 1] / la2
      out[q + 10] = la[o + 2] / la2
      out[q + 11] = share
      out[q + 12] = lb[o] / lb2
      out[q + 13] = lb[o + 1] / lb2
      out[q + 14] = lb[o + 2] / lb2
      out[q + 15] = 0
      n++
      if (w < nearest) nearest = w
      if (long > longest) longest = long
    }
    this.kept = n
    this.nearest = nearest
    this.longest = longest
    this.texture.needsUpdate = true
    this.stale = false
    this.eye.setFromMatrixPosition(camera.matrixWorld)
  }

  // Which form is drawn in this sample and in how many steps, from how large the nearest hairs stand in the picture.
  private choose(camera: THREE.Camera, object: THREE.Object3D, ribbon: boolean): void {
    // The samples of one frame differ by the width of the lens. A camera farther than that from where the hairs were gathered is another view.
    if (this.stale || this.seen.setFromMatrixPosition(camera.matrixWorld).distanceTo(this.eye) > REGATHER_M) this.gather(camera, object)
    const geometry = ribbon ? this.ribbons : this.lines
    const m = object.matrixWorld.elements
    const size = Math.hypot(m[0], m[1], m[2])
    const pixel = (this.nearest * 2) / (camera.projectionMatrix.elements[5] * shared.uSize.value.y)
    const close = (this.widthM * 1.5 * size) / pixel > RIBBON_FROM_PX
    if (this.kept === 0 || close !== ribbon || shared.uDiag.value >= 4) {
      geometry.setDrawRange(0, 0)
      return
    }
    const lengthPx = this.longest / pixel
    if (ribbon) {
      if (lengthPx < 12) geometry.setDrawRange(0, this.kept * 12)
      else geometry.setDrawRange(this.count * 12, this.kept * 24)
    } else if (lengthPx < 5) geometry.setDrawRange(0, this.kept * 2)
    else geometry.setDrawRange(this.count * 2, this.kept * 4)
  }

  // Four numbers a hair: where it is rooted (x, y, z in the plant's own space, meters) and how long it is.
  root(slot: 0 | 1): Float32Array {
    return this.roots[slot]
  }

  // Four numbers a hair: the direction it grows in, and a number from 0 to 1 that is its own.
  lean(slot: 0 | 1): Float32Array {
    return this.leans[slot]
  }

  // How many of the hairs are drawn. They are packed for the shader when the first sample of the frame is drawn, once the camera is known.
  finish(shown = this.count): void {
    this.shown = Math.max(0, Math.min(shown, this.count))
    this.stale = true
  }
}

export function createHairs(options: PartOptions, count: number, name: string, color?: [number, number, number], widthM?: number): HairSet | null {
  return options.places ? null : new HairSet(options, count, name, color, widthM)
}
