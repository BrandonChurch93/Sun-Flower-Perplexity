import * as THREE from 'three'
import { config } from '../../../config.ts'
import type { Surface } from '../../../core/shading.ts'
import { makePartSurface, partMesh, stateUniforms, type PartOptions } from '../../part.ts'

// Beads of water on the skin: rain that sits, swells, runs to the tip and falls, and dew that stays where it formed.
export const real = true

export const BEAD_ORDER = 19

const vertex = /* glsl */ `
in vec2 aCorner;
in vec4 aSeatA;
in vec4 aSeatB;
in vec4 aRestA;
in vec4 aRestB;
in vec3 aTint;
out vec3 vWorld;
out vec3 vMiddle;
out vec3 vBase;
out vec3 vUp;
out vec3 vTint;
out float vRadius;
out float vHang;
out float vDepth;
void main() {
  vec4 seat = mix(aSeatA, aSeatB, uShutter);
  vec4 rest = mix(aRestA, aRestB, uShutter);
  float r = seat.w * plantSize();
  vec3 base = plantWorld(seat.xyz);
  vec3 up = plantDirection(normalize(rest.xyz + vec3(0.0, 1e-6, 0.0)));
  float hang = saturate(rest.w);
  // A bead that sits is a ball sunk half its radius into the down; one that hangs is whole and under its hold.
  vec3 middle = base + mix(up * (0.5 * r), vec3(0.0, -0.9 * r, 0.0), hang);
  vec3 toEye = normalize(uCamPos - middle);
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toEye) + vec3(1e-6, 0.0, 0.0));
  vec3 rise = cross(toEye, side);
  vec3 world = middle + (side * aCorner.x + rise * aCorner.y) * (1.05 * r) + toEye * r;
  vec4 view = viewMatrix * vec4(world, 1.0);
  vWorld = world;
  vMiddle = middle;
  vBase = base;
  vUp = up;
  vTint = aTint;
  vRadius = r;
  vHang = hang;
  vDepth = -view.z;
  gl_Position = r > 0.0 ? projectionMatrix * view : vec4(2.0, 2.0, 2.0, 1.0);
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vMiddle;
in vec3 vBase;
in vec3 vUp;
in vec3 vTint;
in float vRadius;
in float vHang;
in float vDepth;

// The sky as a bead mirrors it: the dome, and the bright band low over the horizon that gives a bead its window.
vec3 beadSky(vec3 d) {
  float band = exp(-(d.y - 0.12) * (d.y - 0.12) * 22.0);
  return skyAmbient(d) + uSkyHorizon * (2.0 * band);
}

void main() {
  vec3 ray = normalize(vWorld - uCamPos);
  vec3 from = uCamPos - vMiddle;
  float b = dot(from, ray);
  float c = dot(from, from) - vRadius * vRadius;
  float under = b * b - c;
  if (under < 0.0) discard;
  vec3 p = uCamPos + ray * (-b - sqrt(under));
  if (vHang < 0.5 && dot(p - vBase, vUp) < 0.0) discard;
  vec3 n = normalize(p - vMiddle);
  vec3 view = -ray;
  float ndv = saturate(dot(n, view));
  float f = 1.0 - ndv;
  float f2 = f * f;
  float fresnel = 0.02 + 0.98 * f2 * f2 * f;
  vec3 mirror = reflect(ray, n);
  float sun = sunShadow(vMiddle + vUp * vRadius, vUp, uShadowTexelM * 2.5);
  float aim = saturate(dot(mirror, uSunDir));
  float glint = aim * aim;
  glint *= glint;
  glint *= glint;
  glint *= glint;
  glint *= glint;
  glint *= glint;
  glint *= glint * glint;
  vec3 sky = beadSky(mirror);

  // The light that enters a bead is gathered on its far side: bright where the ball turns away from the light, dark where it faces it.
  vec3 lightAbove = vec3(0.0, 1.0, 0.0);
  float farSun = saturate(0.5 - 0.5 * dot(n, uSunDir) / max(ndv, 0.35));
  float farSky = saturate(0.5 - 0.5 * dot(n, lightAbove) / max(ndv, 0.35));
  farSun *= farSun;
  farSky *= farSky;
  vec3 lit = uSunColor * (sun * (0.15 + 3.2 * farSun * farSun)) + skyAmbient(lightAbove) * (0.3 + 2.4 * farSky);
  vec3 body = vTint * lit * (0.55 + 0.45 * ndv);
  // The far edge of the ball shows the bright side of the sky through it.
  body += beadSky(-mirror) * (0.25 * f2);

  vec3 color = body * (1.0 - fresnel) + sky * fresnel + uSunColor * (sun * 40.0 * glint);
  outColor = finish(color, p, vDepth, -1.0);
}
`

// Small clear beads. The part that wears them gives each bead its seat on the skin at both ends of the shutter, as it gives a hair its root.
export class BeadSet {
  readonly surface: Surface
  // A part that wears beads adds these to its own meshes.
  readonly meshes: THREE.Mesh[]
  private readonly seats: [Float32Array, Float32Array]
  private readonly rests: [Float32Array, Float32Array]
  private readonly tints: Float32Array
  private readonly geometry = new THREE.InstancedBufferGeometry()
  private readonly sent: THREE.InstancedBufferAttribute[]

  constructor(options: PartOptions, readonly count: number, name: string) {
    if (options.places) throw new Error('beads are worn by the plant and the companion only')
    this.seats = [new Float32Array(count * 4), new Float32Array(count * 4)]
    this.rests = [new Float32Array(count * 4), new Float32Array(count * 4)]
    this.tints = new Float32Array(count * 3)
    const dynamic = (data: Float32Array, size: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(data, size)
      a.setUsage(THREE.DynamicDrawUsage)
      return a
    }
    this.sent = [dynamic(this.seats[0], 4), dynamic(this.seats[1], 4), dynamic(this.rests[0], 4), dynamic(this.rests[1], 4), dynamic(this.tints, 3)]
    this.geometry.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2))
    this.geometry.setIndex([0, 1, 2, 0, 2, 3])
    const names = ['aSeatA', 'aSeatB', 'aRestA', 'aRestB', 'aTint']
    names.forEach((n, i) => this.geometry.setAttribute(n, this.sent[i]))
    this.geometry.instanceCount = 0
    this.surface = makePartSurface(options, { name, vertex, fragment, side: THREE.DoubleSide, castShadow: false })
    const mesh = partMesh(this.geometry, this.surface)
    mesh.renderOrder = BEAD_ORDER
    this.meshes = [mesh]
  }

  // Four numbers a bead: where it touches the skin (x, y, z in the plant's own space, meters) and its radius in meters. Radius 0 is no bead.
  seat(slot: 0 | 1): Float32Array {
    return this.seats[slot]
  }

  // Four numbers a bead: the skin's normal there on the side the bead sits, and how it hangs: 0 sitting on a face to 1 hanging free under a tip.
  rest(slot: 0 | 1): Float32Array {
    return this.rests[slot]
  }

  // Three numbers a bead: the color of the skin under it, which is seen through the water.
  tint(): Float32Array {
    return this.tints
  }

  // How many of the beads are drawn. Called once a frame after both fills.
  finish(shown = this.count): void {
    this.geometry.instanceCount = Math.max(0, Math.min(shown, this.count))
    for (const a of this.sent) a.needsUpdate = true
  }
}

export function createBeads(options: PartOptions, count: number, name: string): BeadSet | null {
  return options.places ? null : new BeadSet(options, count, name)
}

export interface Bead {
  // Where the bead is now, in the part's own two coordinates: 0 at the foot to 1 at the tip, and -1 to 1 from margin to margin over the midrib.
  along: number
  across: number
  radiusM: number
  // 0 sitting on a face to 1 hanging free under the tip.
  hang: number
  // How far it has fallen from the tip, in meters.
  fallM: number
}

const G = 9.81
const SIT = 0.6
const RUN = 0.82
const HANG = 0.9

function own2(own: number, k: number): number {
  const x = Math.sin(own * k + k * 0.37) * 43758.5453
  return x - Math.floor(x)
}

// What reacts to the weather reacts after the cut: the time a bead knows is the time since its world began.
function sinceCut(time: number): number {
  let start = 0
  for (const s of config.segments) if (s.start <= time) start = s.start
  return time - start
}

// Where a bead is at a film time, in closed form. `own` is the bead's own number from 0 to 1; `along` and `across` are where it forms.
export function beadAt(own: number, along: number, across: number, time: number, out: Bead): Bead {
  out.along = along
  out.across = across
  out.radiusM = 0
  out.hang = 0
  out.fallM = 0
  const wet = stateUniforms.uPlantWet.value
  const dew = stateUniforms.uPlantDew.value
  if (wet > 0) {
    const period = 3 + 4 * own2(own, 127.1)
    const t = sinceCut(time) - (0.3 + 2.5 * own2(own, 311.7))
    if (t < 0) return out
    const turn = t / period
    const p = turn - Math.floor(turn)
    const full = (0.001 + 0.0012 * own2(own + Math.floor(turn) * 0.618, 74.7)) * wet
    if (p < SIT) {
      out.radiusM = full * Math.cbrt(0.08 + (0.92 * p) / SIT)
    } else if (p < RUN) {
      const q = (p - SIT) / (RUN - SIT)
      const e = q * q
      out.along = along + (1 - along) * e
      out.across = across * (1 - 0.85 * Math.sqrt(e))
      out.radiusM = full * (1 + 0.3 * e)
    } else {
      const q = Math.min(1, (p - RUN) / (HANG - RUN))
      out.along = 1
      out.across = across * 0.15
      out.hang = q * q * (3 - 2 * q)
      out.radiusM = full * (1.3 + 0.1 * q)
      if (p >= HANG) {
        const fall = (p - HANG) * period
        out.fallM = 0.5 * G * fall * fall
        out.radiusM = full * 1.25
      }
    }
  } else if (dew > 0) {
    out.radiusM = (own > 0.85 ? 0.0006 + 0.004 * (own - 0.85) : 0.00015 + 0.0003 * own2(own, 127.1)) * dew
  }
  return out
}
