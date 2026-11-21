import { glslCommon } from '../core/shading.ts'

export const maxFillPx = 96

export const skyness = /* glsl */ `
uniform float uFar;
// The sky arrives already blurred, with exactly the circle of infinity in alpha: it has no copies to join.
float sky(float a) {
  return uFar > 0.0 ? 1.0 - smoothstep(0.001, 0.003, abs(a / uFar - 1.0)) : 0.0;
}
`

// The radius over which each pixel is spread, with the sharp zone grown by one pixel so the soft edge pixels of a sharp thing keep their own color.
export const reachFragment = /* glsl */ `${glslCommon}
uniform sampler2D tFrame;
uniform sampler2D tNear;
uniform float uRadiusScale;
uniform float uSpecks;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
${skyness}
float circle(ivec2 q, float near) {
  float a = texelFetch(tFrame, q, 0).a;
  return a * max(1.0 - sky(a), near);
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 top = ivec2(uSize) - 1;
  vec4 c = texelFetch(tFrame, p, 0);
  float near = uFar > 0.0 ? texture(tNear, vUv).r : 1.0;
  float a = circle(p, near);
  a = min(a, circle(min(p + ivec2(1, 0), top), near));
  a = min(a, circle(max(p - ivec2(1, 0), ivec2(0)), near));
  a = min(a, circle(min(p + ivec2(0, 1), top), near));
  a = min(a, circle(max(p - ivec2(0, 1), ivec2(0)), near));
  // A lone pixel far brighter than everything round it is a sampling accident, not a light: no lens draws a point one pixel wide. It is held to twice its brightest neighbor, so it neither sits as a hard dot nor blooms.
  vec3 rgb = max(c.rgb, 0.0);
  float most = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    if (i == 0 && j == 0) continue;
    vec3 n = texelFetch(tFrame, clamp(p + ivec2(i, j), ivec2(0), top), 0).rgb;
    most = max(most, max(n.r, max(n.g, n.b)));
  }
  float own = max(rgb.r, max(rgb.g, rgb.b));
  // With specks in the air a lone bright pixel in a blurred area is one copy of a light, and the fill draws its disc from it.
  rgb *= mix(min(1.0, (2.0 * most + 0.02) / max(own, 1e-6)), 1.0, uSpecks * smoothstep(1.5, 3.0, c.a));
  outColor = vec4(rgb, min(max(a, 0.0) * uRadiusScale, ${maxFillPx.toFixed(1)}));
}
`

function discTaps(rings: number): [number, number, number][] {
  const taps: [number, number, number][] = []
  for (let j = 1; j <= rings; j++) {
    const n = 6 * j
    const r = j / (rings + 0.5)
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.37 * j) / n) * 2 * Math.PI
      taps.push([Math.cos(a) * r, Math.sin(a) * r, r])
    }
  }
  return taps
}

// Where blurred things stand close enough that their copies fall across the sky: there the sky is filled with them, as far as the horizon needs.
export function nearFragment(): string {
  const taps = discTaps(3)
    .map(([x, y, r]) => `  TAP(vec2(${x.toFixed(5)}, ${y.toFixed(5)}), ${r.toFixed(5)})`)
    .join('\n')
  return /* glsl */ `${glslCommon}
uniform sampler2D tFrame;
uniform float uRadiusScale;
uniform float uReach;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
${skyness}
float needs(vec2 at, ivec2 top) {
  float a = texelFetch(tFrame, clamp(ivec2(at), ivec2(0), top), 0).a;
  return (1.0 - sky(a)) * smoothstep(0.5, 1.5, a * uRadiusScale);
}
#define TAP(o, len) near = max(near, needs(center + o * uReach, top) * (1.0 - smoothstep(0.6, 1.0, len)));
void main() {
  ivec2 top = ivec2(uSize) - 1;
  vec2 center = vUv * uSize;
  float near = needs(center, top);
${taps}
  outColor = vec4(near);
}
`
}

// Each pixel gathers the neighbors whose own blur circle reaches it. A sharp neighbor reaches nobody, so the head never bleeds into the field behind it, and a sharp pixel gathers nothing.
export function fillFragment(rings: number): string {
  const outer = (rings - 0.5) / (rings + 0.5)
  // Written out tap by tap: the software rasterizer runs straight code several times faster than a loop over a table.
  const taps = discTaps(rings)
    .map(([x, y, r]) => `  TAP(vec2(${x.toFixed(5)}, ${y.toFixed(5)}), ${r.toFixed(5)}, ${r > outer ? 'rim' : '1.0'})`)
    .join('\n')
  return /* glsl */ `${glslCommon}
uniform sampler2D tFrame;
uniform float uSpread;
uniform float uEdge;
uniform float uSeed;
layout(location = 0) out vec4 outColor;
#define TAP(o, len, gain) { vec4 s = texelFetch(tFrame, clamp(p + ivec2(round(turn * o)), ivec2(0), top), 0); float w = saturate(s.a * uSpread - len * radius + 1.0) * gain; sum += s.rgb * w; total += w; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 top = ivec2(uSize) - 1;
  vec4 c = texelFetch(tFrame, p, 0);
  float radius = c.a * uSpread;
  if (radius < 0.6) { outColor = c; return; }
  mat2 turn = mat2(radius, 0.0, 0.0, radius);
  if (radius > 12.0) {
    // Past this size the taps stand pixels apart: turning them per pixel trades their pattern for fine noise the next pass smooths.
    float a = hash31(vec3(gl_FragCoord.xy, uSeed)) * 6.2831853 * smoothstep(12.0, 20.0, radius);
    float cs = cos(a) * radius;
    float sn = sin(a) * radius;
    turn = mat2(cs, sn, -sn, cs);
  }
  vec3 sum = c.rgb;
  float total = 1.0;
  float rim = 1.0 + uEdge;
${taps}
  outColor = vec4(sum / total, c.a);
}
`
}
