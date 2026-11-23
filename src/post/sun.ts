import type * as THREE from 'three'
import { cocScalePx, type CameraPose } from '../core/lens.ts'

// Where the sun sits in the picture: x from the left and y from the bottom as shares of the frame (it may lie outside it), and how much it counts, 0 when it is behind the camera or far off frame. With it comes the blur circle of things at infinity, in pixels, which is what the sky carries, and the radius of the sun's own disc at this lens as a share of the frame width.
export interface SunInFrame { x: number; y: number; weight: number; farCircle: number; disc?: number }

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
  return { x, y, weight: t * t * (3 - 2 * t), farCircle, disc }
}

// The sun's disc as a share of the frame width at the bloom's lens.
export const sunDisc = 0.0095

// How far outside the frame a point lies, in frame heights. 0 inside.
export function outside(x: number, y: number, aspect: number): number {
  return Math.hypot(Math.max(0, -x, x - 1) * aspect, Math.max(0, -y, y - 1))
}

// How much of the sun's disc reaches the lens, and where the showing part sits. Thirty six readings over a patch a few discs wide give the light that stands out above the sky round it: that is the disc, whatever colour the air is. Red is the share that shows, 0 to 1, against what an uncovered disc would give; green and blue are the offset of the showing light from the disc's centre, in frame widths.
// A disc that has left the frame cannot be read. It counts as open where the frame's edge nearest to it is open sky.
export const sunReadFragment = /* glsl */ `
uniform sampler2D tHot;
uniform sampler2D tRaw;
uniform vec2 uSunAt;
uniform float uAspect;
uniform float uPatch;
uniform float uExpect;
uniform float uFar;
layout(location = 0) out vec4 outColor;
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float inFrame(vec2 uv) { return step(0.0, min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y))); }
float openAt(vec2 uv) {
  float a = texture(tRaw, clamp(uv, 0.002, 0.998)).a;
  return uFar > 0.0 ? 1.0 - smoothstep(0.001, 0.003, abs(a / uFar - 1.0)) : 0.0;
}
void main() {
  float inner = 0.0;
  float innerN = 0.0;
  float outer = 0.0;
  float outerN = 0.0;
  vec2 at = vec2(0.0);
  for (int i = 0; i < 48; i++) {
    bool ring = i >= 36;
    // Sunflower spacing fills the patch evenly; the last twelve stand on a ring outside it and read the sky.
    float k = (float(i) + 0.5) / 36.0;
    float a = ring ? float(i - 36) * 0.5235988 : float(i) * 2.3999632;
    vec2 o = vec2(cos(a), sin(a)) * (ring ? 1.9 : sqrt(k)) * uPatch;
    vec2 uv = uSunAt + vec2(o.x, o.y * uAspect);
    float w = inFrame(uv);
    float l = lum(texture(tHot, uv).rgb) * w;
    if (ring) { outer += l; outerN += w; } else { inner += l; innerN += w; at += l * o; }
  }
  float sky = outer / max(outerN, 1.0);
  float excess = max(inner - sky * innerN, 0.0) / 36.0;
  float read = excess / (excess + 0.06 * uExpect + 1e-5);
  vec2 edge = clamp(uSunAt, 0.0, 1.0);
  vec2 along = abs(uSunAt.x - edge.x) > abs(uSunAt.y - edge.y) * uAspect ? vec2(0.0, uAspect) : vec2(1.0, 0.0);
  float open = (openAt(edge) + openAt(edge + along * uPatch) + openAt(edge - along * uPatch) + openAt(edge + 2.0 * along * uPatch) + openAt(edge - 2.0 * along * uPatch)) / 5.0;
  float known = smoothstep(0.0, 0.6, innerN / 36.0);
  outColor = vec4(mix(open, read, known), known * at / max(inner, 1e-6), 1.0);
}
`
