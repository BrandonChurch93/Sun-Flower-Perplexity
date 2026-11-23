import * as THREE from 'three'
import { config } from '../../config.ts'
import { smoothstep } from '../../core/curves.ts'
import { makeSurface } from '../../core/shading.ts'
import type { Moment, Part, View } from '../../v2/api.ts'
import { DRIFT } from '../mist/veil.ts'

// The breath of the cold: a few grains of ice adrift in the air near the lens. Each is far smaller than a pixel and out of focus, so what is seen is its blur circle, faint, and brighter for a moment when a face of it turns the sun to the eye.
const MOST = 56
const SHUTTER_SECONDS = config.film.shutterDegrees / 360 / config.film.fps
const BOX = { x: 1.1, y: 0.5, z: 1.1 }
const AHEAD_M = 0.5
const SINK_M_PER_S = 0.012

const vertex = /* glsl */ `
in vec4 aOwn;
uniform vec3 uMiddle;
uniform float uCold;
out vec2 vAt;
out vec3 vLight;
const vec3 BOX = vec3(${BOX.x.toFixed(3)}, ${BOX.y.toFixed(3)}, ${BOX.z.toFixed(3)});
const vec3 DRIFT = vec3(${(DRIFT.x * 0.6).toFixed(5)}, ${(-SINK_M_PER_S).toFixed(5)}, ${(DRIFT.z * 0.6).toFixed(5)});
void main() {
  float t = uReal + uShutter * ${SHUTTER_SECONDS.toFixed(6)};
  float own = aOwn.w;
  int corner = gl_VertexID & 3;
  vec2 side = vec2(float(corner & 1), float(corner >> 1)) * 2.0 - 1.0;
  // Each grain keeps its place in the air: the box that holds them moves with the lens and a grain that leaves one side of it comes in at the other, faint at both.
  vec3 free = aOwn.xyz * BOX + DRIFT * t + 0.012 * vec3(sin(0.5 * t + 31.0 * own), sin(0.37 * t + 17.0 * own), cos(0.43 * t + 23.0 * own));
  vec3 cell = fract((free - uMiddle) / BOX + 0.5);
  vec3 world = uMiddle + (cell - 0.5) * BOX;
  vec3 border = smoothstep(vec3(0.0), vec3(0.12), cell) * (1.0 - smoothstep(vec3(0.88), vec3(1.0), cell));
  vec4 view = viewMatrix * vec4(world, 1.0);
  float depth = -view.z;
  float pixel = depth * 2.0 / (projectionMatrix[1][1] * uSize.y);
  float grainPx = (0.00016 + 0.00028 * own * own) / max(pixel, 1e-6);
  float radius = 0.5 * min(uCocScale * abs(1.0 / max(depth, 1e-4) - 1.0 / uFocusM), 2048.0) + grainPx + 0.75;
  // A circle too wide is a grain too near the glass to be seen at all.
  float seen = border.x * border.y * border.z * smoothstep(0.1, 0.2, depth) * (1.0 - smoothstep(0.012, 0.03, radius / uSize.y));
  vec3 toEye = normalize(uCamPos - world);
  // A grain tumbles slowly, and one face in a few throws the sun at the eye for a moment.
  float turn = sin(t * (0.5 + 0.9 * fract(own * 7.13)) + 40.0 * own);
  float flash = pow(turn * turn, 24.0);
  float against = pow(saturate(dot(-toEye, uSunDir)), 4.0);
  vec3 light = (uSkyZenith + uSkyHorizon) * 1.5 + uSunColor * (2.0 + 14.0 * against + 60.0 * flash);
  vLight = light * (uCold * seen * grainPx * grainPx / (radius * radius));
  vAt = side;
  view.xy += side * (radius * pixel);
  gl_Position = seen * uCold > 0.0 ? projectionMatrix * view : vec4(2.0, 2.0, 2.0, 1.0);
}
`

const fragment = /* glsl */ `
in vec2 vAt;
in vec3 vLight;
void main() {
  if (uDiag > 1) discard;
  float disc = 1.0 - smoothstep(0.7, 1.0, length(vAt));
  if (disc <= 0.0) discard;
  outColor = vec4(vLight * disc, 1.0);
}
`

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

class IceInAir implements Part {
  readonly objects: THREE.Object3D[]
  private readonly mesh: THREE.Mesh
  private readonly geometry = new THREE.BufferGeometry()
  private readonly middle = new THREE.Vector3()
  private readonly cold = { value: 0 }

  constructor() {
    const own = new Float32Array(MOST * 4 * 4)
    const index = new Uint16Array(MOST * 6)
    for (let i = 0; i < MOST; i++) {
      for (let c = 0; c < 4; c++) own.set([hash(i * 4 + 1), hash(i * 4 + 2), hash(i * 4 + 3), hash(i * 4 + 4)], (i * 4 + c) * 4)
      index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6)
    }
    this.geometry.setAttribute('aOwn', new THREE.BufferAttribute(own, 4))
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1))
    const surface = makeSurface({ name: 'ice in the air', vertex, fragment, uniforms: { uMiddle: { value: this.middle }, uCold: this.cold }, side: THREE.DoubleSide, transparent: true, additive: true, depthWrite: false })
    this.mesh = new THREE.Mesh(this.geometry, surface.main)
    this.mesh.frustumCulled = false
    this.mesh.matrixAutoUpdate = false
    this.mesh.visible = false
    this.mesh.renderOrder = 70
    this.objects = [this.mesh]
  }

  prepare(now: Moment, _later: Moment, view: View): void {
    const d = now.dials
    // Ice hangs in the air only while it freezes: in the cold, with frost standing, and not in rain.
    const cold = smoothstep(0.5, 1, d.cold) * smoothstep(0.2, 0.8, d.frost) * (1 - d.rain)
    this.cold.value = cold
    this.mesh.visible = cold > 0.001
    if (!this.mesh.visible) return
    const count = view.quality === 'film' ? MOST : view.quality === 'high' ? 40 : 24
    this.geometry.setDrawRange(0, count * 6)
    this.middle.copy(view.pose.position).addScaledVector(view.pose.forward, AHEAD_M)
  }
}

export function make(): Part[] {
  return [new IceInAir()]
}
