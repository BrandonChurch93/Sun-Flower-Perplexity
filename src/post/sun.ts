import type * as THREE from 'three'
import { cocScalePx, type CameraPose } from '../core/lens.ts'

// Where the main light sits in the picture: x from the left and y from the bottom as shares of the frame (it may lie outside it), and how much it counts, 0 when it is behind the camera or far off frame. With it comes the blur circle of things at infinity, in pixels, which is what the sky carries.
export interface SunInFrame { x: number; y: number; weight: number; farCircle: number }

export function sunInFrame(pose: CameraPose, toSun: THREE.Vector3, gateMm: number, width: number, height: number): SunInFrame {
  const aspect = width / height
  const farCircle = Math.min(cocScalePx(pose, gateMm, width) / pose.focusM, 2048)
  const depth = toSun.dot(pose.forward)
  if (depth < 0.05) return { x: 0.5, y: 0.5, weight: 0, farCircle }
  const scale = pose.focalMm / gateMm
  const x = 0.5 + (toSun.dot(pose.right) / depth) * scale
  const y = 0.5 + (toSun.dot(pose.up) / depth) * scale * aspect
  const off = Math.hypot((x - 0.5) * aspect, y - 0.5) / Math.hypot(0.5 * aspect, 0.5)
  const t = Math.min(1, Math.max(0, (2.2 - off) / 1.0))
  return { x, y, weight: t * t * (3 - 2 * t), farCircle }
}

// The sun's disc as a share of the frame width, as the golden sky draws it at the shot's lens.
export const sunDisc = 0.0095

// How much of the sun shows and where the showing part sits: readings on four rings from half the disc's radius to two and a half of it, so the glow hard by the disc counts when a leaf hides the disc itself. Red is their mean, green and blue the offset of their center of light from the disc's center, in frame widths.
export const sunReadFragment = /* glsl */ `
uniform sampler2D tHot;
uniform vec2 uSunAt;
uniform float uAspect;
layout(location = 0) out vec4 outColor;
void main() {
  float sum = dot(texture(tHot, uSunAt).rgb, vec3(0.2126, 0.7152, 0.0722));
  vec2 at = vec2(0.0);
  for (int i = 0; i < 36; i++) {
    int ring = i < 6 ? 0 : i < 12 ? 1 : i < 24 ? 2 : 3;
    float a = float(i) * (ring < 2 ? 1.0471976 : 0.5235988) + 0.4 * float(ring);
    vec2 o = vec2(cos(a), sin(a)) * (ring == 0 ? 0.5 : ring == 1 ? 1.0 : ring == 2 ? 1.75 : 2.5) * ${sunDisc};
    float l = dot(texture(tHot, uSunAt + vec2(o.x, o.y * uAspect)).rgb, vec3(0.2126, 0.7152, 0.0722));
    sum += l;
    at += l * o;
  }
  outColor = vec4(sum / 37.0, at / max(sum, 1e-6), 1.0);
}
`
