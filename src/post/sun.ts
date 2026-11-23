import type * as THREE from 'three'
import { config } from '../config.ts'
import { cocScalePx, type CameraPose } from '../core/lens.ts'
import { later, now, shutterSeconds } from '../v2/now.ts'

const clampTo = (v: number, most: number): number => Math.min(most, Math.max(-most, v))

// Where the sun sits in the picture: x from the left and y from the bottom as shares of the frame (it may lie outside it), and how much it counts, 0 when it is behind the camera or far off frame. With it comes the blur circle of things at infinity, in pixels, which is what the sky carries, the radius of the sun's own disc at this lens as a share of the frame width, and how far the sun moves in the frame from one frame to the next.
export interface SunInFrame { x: number; y: number; weight: number; farCircle: number; disc?: number; dx?: number; dy?: number }

// The sun's radius seen from the ground, in radians.
const SUN_RADIUS = 0.00465

export function sunInFrame(pose: CameraPose, toSun: THREE.Vector3, gateMm: number, width: number, height: number): SunInFrame {
  const aspect = width / height
  const farCircle = Math.min(cocScalePx(pose, gateMm, width) / pose.focusM, 2048)
  const scale = pose.focalMm / gateMm
  const disc = SUN_RADIUS * scale
  const depth = toSun.dot(pose.forward)
  if (depth < 0.05) return { x: 0.5, y: 0.5, weight: 0, farCircle, disc }
  const x = 0.5 + (toSun.dot(pose.right) / depth) * scale
  const y = 0.5 + (toSun.dot(pose.up) / depth) * scale * aspect
  const off = Math.hypot((x - 0.5) * aspect, y - 0.5) / Math.hypot(0.5 * aspect, 0.5)
  const t = Math.min(1, Math.max(0, (2.2 - off) / 1.0))
  const from = now.sun.dot(pose.forward)
  const to = later.sun.dot(pose.forward)
  let dx = 0
  let dy = 0
  if (from > 0.05 && to > 0.05) {
    const frames = 1 / (config.film.fps * shutterSeconds)
    dx = clampTo((later.sun.dot(pose.right) / to - now.sun.dot(pose.right) / from) * scale * frames, 0.5)
    dy = clampTo((later.sun.dot(pose.up) / to - now.sun.dot(pose.up) / from) * scale * aspect * frames, 0.5)
  }
  return { x, y, weight: t * t * (3 - 2 * t), farCircle, disc, dx, dy }
}

// The sun's disc as a share of the frame width at the bloom's lens.
export const sunDisc = 0.0095

// How far outside the frame a point lies, in frame heights. 0 inside.
export function outside(x: number, y: number, aspect: number): number {
  return Math.hypot(Math.max(0, -x, x - 1) * aspect, Math.max(0, -y, y - 1))
}

// How much of the sun's disc is in view, and where the showing part sits. Sixteen points over the disc are tested against what stands in front of the sky. Red is the share that is clear over the three frames round this one, along the way the sun moves in the frame: in the time lapse the disc crosses a tree line inside one frame, and this is what lets the glare swell and fade over three. Alpha is the share clear at this instant, for the disc's own core. Green and blue are the offset of the clear part from the disc's centre, in frame widths.
// A point that has left the frame is tested at the frame's edge nearest to it.
export const sunReadFragment = /* glsl */ `
uniform sampler2D tRaw;
uniform vec2 uSunAt;
uniform vec2 uTrack;
uniform float uAspect;
uniform float uPatch;
uniform float uFar;
layout(location = 0) out vec4 outColor;
float openAt(vec2 uv) {
  float a = texture(tRaw, clamp(uv, 0.002, 0.998)).a;
  return uFar > 0.0 ? 1.0 - smoothstep(0.0006, 0.0012, abs(a / uFar - 1.0)) : 0.0;
}
void main() {
  float clear = 0.0;
  float around = 0.0;
  float weights = 0.0;
  vec2 at = vec2(0.0);
  for (int i = 0; i < 16; i++) {
    float k = (float(i) + 0.5) / 16.0;
    float a = float(i) * 2.3999632;
    vec2 o = vec2(cos(a), sin(a)) * sqrt(k) * uPatch;
    vec2 p = uSunAt + vec2(o.x, o.y * uAspect);
    float here = openAt(p);
    clear += here;
    at += here * o;
    for (int j = -3; j <= 3; j++) {
      float t = float(j) * 0.5;
      float w = 1.0 - abs(t) * 0.5;
      around += w * (j == 0 ? here : openAt(p + uTrack * t));
      weights += w;
    }
  }
  outColor = vec4(around / weights, clear > 0.0 ? at / clear : vec2(0.0), clear / 16.0);
}
`
