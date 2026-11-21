import * as THREE from 'three'
import { makePartSurface, partMesh, type PartOptions } from '../part.ts'
import { shared, type Surface } from '../../core/shading.ts'

// `real` turns true once this folder holds the plant's hairs at their real quality.
export const real = true

// See-through things are drawn in the order of these numbers: the hairs of the plant after the far things of a world (under 20) and before its air (40 and over).
export const HAIR_ORDER = 20

// A hair wider than this many pixels is drawn as a ribbon turned to the camera. Thinner, it is a one pixel line that carries its true share of light.
const RIBBON_FROM_PX = 0.45
// How many hairs are looked at each sample to find how near the camera is to the coat.
const PROBES = 384

// The strand: where a point of it lies, which way it runs there, how thick it is, and the light it sends to the eye.
// A hair is a clear fiber. Sunlight goes through it and leaves in a cone about the fiber, strongest straight on (the lobe called TT), with a weak mirror of the sun on its near side (R) and next to nothing scattered evenly.
const strand = /* glsl */ `
in vec4 aRootA;
in vec4 aRootB;
in vec4 aLeanA;
in vec4 aLeanB;
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
  float keep;
};

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
  vec4 root = mix(aRootA, aRootB, uShutter);
  vec4 lean = mix(aLeanA, aLeanB, uShutter);
  float own = lean.w;
  float h1 = fract(own * 13.37 + 0.21);
  float h2 = fract(own * 47.13 + 0.67);
  float h3 = fract(own * 91.71 + 0.43);
  vec3 dir = lean.xyz / max(length(lean.xyz), 1e-6);
  vec3 ref = abs(dir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 e1 = normalize(cross(dir, ref));
  vec3 e2 = cross(dir, e1);
  float turn = h1 * 6.2832;
  vec3 bend = (e1 * cos(turn) + e2 * sin(turn)) * (0.06 + 0.3 * h2 * h2) + vec3(0.0, -0.05, 0.0);
  // The place for the skin states: wet hairs lean together and carry beads (uPlantWet), frost grows crystals along them (uPlantFrost), dew sits on them as beads (uPlantDew).
  Strand s;
  vec3 local = root.xyz + (dir * t + bend * (t * t)) * root.w;
  s.world = plantWorld(local);
  s.along = plantDirection(normalize(dir + bend * (2.0 * t)));
  s.toEye = normalize(uCamPos - s.world);
  vec4 view = viewMatrix * vec4(s.world, 1.0);
  s.depth = -view.z;
  s.pixel = s.depth * 2.0 / (projectionMatrix[1][1] * uSize.y);
  s.width = uHairWidth * plantSize() * (0.5 + h3) * mix(1.0, 0.1, pow(t, 0.7 + 0.9 * h1));
  s.keep = 1.0;
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
in float position;
out float vCover;
${strand}
void main() {
  Strand s = strandAt(position);
  vec4 root = mix(aRootA, aRootB, uShutter);
  vec4 lean = mix(aLeanA, aLeanB, uShutter);
  vec4 here = projectionMatrix * viewMatrix * vec4(s.world, 1.0);
  vec4 there = projectionMatrix * viewMatrix * vec4(plantWorld(root.xyz + lean.xyz / max(length(lean.xyz), 1e-6) * root.w * (position < 0.5 ? 1.0 : 0.0)), 1.0);
  vec2 run = abs((there.xy / max(there.w, 1e-5) - here.xy / max(here.w, 1e-5)) * uSize);
  // A one pixel line lights one pixel for each step along its longer side, so a slanted line needs more of each pixel to carry the same light.
  float slant = length(run) / max(max(run.x, run.y), 1e-5);
  vCover = s.width / s.pixel * slant * s.keep;
  gl_Position = here;
}
`

const ribbonVertex = /* glsl */ `
in vec2 position;
out float vAcross;
out float vHalf;
${strand}
void main() {
  Strand s = strandAt(position.y);
  vec3 side = normalize(cross(s.along, s.toEye));
  float halfPx = 0.5 * s.width / s.pixel;
  vAcross = position.x * (halfPx + 0.75);
  vHalf = halfPx;
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
#else
in float vCover;
#endif
void main() {
  if (uDiag >= 4) discard;
#ifdef RIBBON
  float x = abs(vAcross);
  float cover = max(0.0, min(vHalf, x + 0.5) - max(-vHalf, x - 0.5));
#else
  float cover = vCover;
#endif
  vec3 color = (vSun * plantSun(vWorld, uSunDir) + vSky * skyAmbient(vec3(0.0, vSkyY, 0.0)) * plantSky(vWorld)) * cover;
  // Light is added to what is behind, as a clear fiber does. The blur circle is the smaller of the hair's own and the one behind it, and only where the hair shows, so the lens does not smear a sharp bright hair into a soft background.
  float shows = dot(color, vec3(0.3, 0.6, 0.1));
  outColor = vec4(color, shows > 0.012 ? cocOf(vDepth) : 4096.0);
}
`

function lineShape(): { position: Float32Array; index: number[]; ranges: [number, number][] } {
  return {
    position: new Float32Array([0, 1, 0.5, 0.25, 0.75]),
    index: [0, 1, 0, 2, 2, 1, 0, 3, 3, 2, 2, 4, 4, 1],
    ranges: [
      [0, 2],
      [2, 4],
      [6, 8],
    ],
  }
}

function ribbonShape(): { position: Float32Array; index: number[]; ranges: [number, number][] } {
  const stops = [0, 0.25, 0.5, 0.75, 1]
  const position = new Float32Array(stops.flatMap((t) => [-1, t, 1, t]))
  const band = (a: number, b: number) => [a * 2, a * 2 + 1, b * 2, a * 2 + 1, b * 2 + 1, b * 2]
  const index = [...band(0, 4), ...band(0, 2), ...band(2, 4), ...band(0, 1), ...band(1, 2), ...band(2, 3), ...band(3, 4)]
  return {
    position,
    index,
    ranges: [
      [0, 6],
      [6, 12],
      [18, 24],
    ],
  }
}

// Fine hairs. Far from the lens each is a line a pixel wide that adds its true share of light; close to it each is a thin ribbon turned to the camera. The part that wears them gives each hair its root and its direction at both ends of the shutter.
export class HairSet {
  readonly surface: Surface
  // The two forms of the hairs. One of them is drawn in any sample. A part that wears hairs adds all of them to its own meshes.
  readonly meshes: THREE.Mesh[]
  private readonly roots: [THREE.InstancedBufferAttribute, THREE.InstancedBufferAttribute]
  private readonly leans: [THREE.InstancedBufferAttribute, THREE.InstancedBufferAttribute]
  private readonly lines: THREE.InstancedBufferGeometry
  private readonly ribbons: THREE.InstancedBufferGeometry
  private readonly lineRanges: [number, number][]
  private readonly ribbonRanges: [number, number][]
  private readonly probes: Float32Array
  private probed = 0
  private shown: number
  private readonly eye = new THREE.Vector3()
  private readonly inverse = new THREE.Matrix4()

  constructor(options: PartOptions, readonly count: number, name: string, color: [number, number, number] = [0.9, 0.95, 0.8], private readonly widthM = 0.00004) {
    if (options.places) throw new Error('hairs are worn by the plant and the companion only')
    this.shown = count
    this.probes = new Float32Array(Math.min(PROBES, Math.max(count, 1)) * 4)
    const each = () => new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.roots = [each(), each()]
    this.leans = [each(), each()]
    const build = (shape: { position: Float32Array; index: number[] }, size: number) => {
      const geometry = new THREE.InstancedBufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(shape.position, size))
      geometry.setIndex(shape.index)
      geometry.setAttribute('aRootA', this.roots[0])
      geometry.setAttribute('aRootB', this.roots[1])
      geometry.setAttribute('aLeanA', this.leans[0])
      geometry.setAttribute('aLeanB', this.leans[1])
      geometry.instanceCount = count
      return geometry
    }
    const line = lineShape()
    const ribbon = ribbonShape()
    this.lines = build(line, 1)
    this.ribbons = build(ribbon, 2)
    this.lineRanges = line.ranges
    this.ribbonRanges = ribbon.ranges
    const own = { uHairColor: { value: new THREE.Vector3(...color) }, uHairWidth: { value: widthM } }
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

  // Which form is drawn in this sample and in how many steps, from how large the nearest hairs stand in the picture.
  private choose(camera: THREE.Camera, object: THREE.Object3D, ribbon: boolean): void {
    const geometry = ribbon ? this.ribbons : this.lines
    const m = object.matrixWorld.elements
    const size = Math.hypot(m[0], m[1], m[2])
    this.eye.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(this.inverse.copy(object.matrixWorld).invert())
    let nearest = Infinity
    let longest = 0
    const p = this.probes
    for (let i = 0; i < this.probed; i++) {
      const d = Math.hypot(p[i * 4] - this.eye.x, p[i * 4 + 1] - this.eye.y, p[i * 4 + 2] - this.eye.z)
      if (d < nearest) nearest = d
      if (p[i * 4 + 3] > longest) longest = p[i * 4 + 3]
    }
    if (!(nearest < Infinity) || longest <= 0) {
      geometry.instanceCount = 0
      return
    }
    const pixel = (Math.max(nearest * size, 1e-4) * 2) / (camera.projectionMatrix.elements[5] * shared.uSize.value.y)
    const close = (this.widthM * 1.5 * size) / pixel > RIBBON_FROM_PX
    const lengthPx = (longest * size) / pixel
    if (close !== ribbon) {
      geometry.instanceCount = 0
      return
    }
    const ranges = ribbon ? this.ribbonRanges : this.lineRanges
    const range = ranges[ribbon ? (lengthPx < 10 ? 0 : lengthPx < 40 ? 1 : 2) : lengthPx < 6 ? 0 : lengthPx < 24 ? 1 : 2]
    geometry.setDrawRange(range[0], range[1])
    geometry.instanceCount = this.shown
  }

  // Four numbers a hair: where it is rooted (x, y, z in the plant's own space, meters) and how long it is.
  root(slot: 0 | 1): Float32Array {
    return this.roots[slot].array as Float32Array
  }

  // Four numbers a hair: the direction it grows in, and a number from 0 to 1 that is its own.
  lean(slot: 0 | 1): Float32Array {
    return this.leans[slot].array as Float32Array
  }

  // How many of the hairs are drawn, and the buffers sent again.
  finish(shown = this.count): void {
    this.shown = Math.max(0, Math.min(shown, this.count))
    const root = this.roots[0].array as Float32Array
    const most = this.probes.length / 4
    const step = Math.max(1, Math.floor(this.shown / most))
    let n = 0
    for (let i = 0; i < this.shown && n < most; i += step) {
      if (!(root[i * 4 + 3] > 0)) continue
      this.probes.set(root.subarray(i * 4, i * 4 + 4), n * 4)
      n++
    }
    this.probed = n
    for (const a of [...this.roots, ...this.leans]) a.needsUpdate = true
  }
}

export function createHairs(options: PartOptions, count: number, name: string, color?: [number, number, number], widthM?: number): HairSet | null {
  return options.places ? null : new HairSet(options, count, name, color, widthM)
}
