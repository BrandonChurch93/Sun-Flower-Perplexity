import { glslCommon } from '../core/shading.ts'

export const maxFillPx = 96

export const skyness = /* glsl */ `
uniform float uFar;
// The sky arrives already blurred, with exactly the circle of infinity in alpha: it has no copies to join. The frame holds that circle in sixteen bits, which is good to one part in two thousand, so land is told from sky up to about a thousand times the focus distance and no further.
float sky(float a) {
  return uFar > 0.0 ? 1.0 - smoothstep(0.0006, 0.0012, abs(a / uFar - 1.0)) : 0.0;
}
`

// The radius over which each pixel is spread, with the sharp zone grown by one pixel so the soft edge pixels of a sharp thing keep their own color.
export const reachFragment = /* glsl */ `${glslCommon}
uniform sampler2D tFrame;
uniform sampler2D tNear;
uniform float uRadiusScale;
uniform float uSpecks;
uniform float uSkyHold;
uniform float uExposure;
uniform float uDiscScale;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
${skyness}
float circle(ivec2 q, float near) {
  float a = texelFetch(tFrame, q, 0).a;
  return a * max(1.0 - sky(a), near);
}
#define RING(o) { vec3 n = texelFetch(tFrame, clamp(p + o, ivec2(0), top), 0).rgb; ring = max(ring, max(n.r, max(n.g, n.b))); }
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
  // A lone pixel far brighter than everything round it is a sampling accident, not a light: no lens draws a point one pixel wide. In focus it is held to twice its brightest neighbor, so it neither sits as a hard dot nor blooms.
  vec3 rgb = max(c.rgb, 0.0);
  float most = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    if (i == 0 && j == 0) continue;
    vec3 n = texelFetch(tFrame, clamp(p + ivec2(i, j), ivec2(0), top), 0).rgb;
    most = max(most, max(n.r, max(n.g, n.b)));
  }
  float ring = 0.0;
  RING(ivec2(3, 0)) RING(ivec2(-3, 0)) RING(ivec2(0, 3)) RING(ivec2(0, -3)) RING(ivec2(2, 2)) RING(ivec2(-2, 2)) RING(ivec2(2, -2)) RING(ivec2(-2, -2))
  float own = max(rgb.r, max(rgb.g, rgb.b));
  float wide = max(a, 0.0) * uRadiusScale;
  float blurred = smoothstep(2.0, 4.0, wide);
  // Out of focus a small light far over its surround and over white is a glint, and its disc is drawn after the blur: what stands over the surround is taken out here, if the disc it makes is bright enough to be seen. A fainter one stays and is blurred with the rest.
  float limit = max(3.0 * ring, 2.0 / uExposure);
  float size = clamp(uDiscScale * c.a, 1.5, ${maxFillPx.toFixed(1)});
  float seen = smoothstep(0.004, 0.016, (own - limit) * uExposure / (3.14159265 * size * size));
  float land = mix(mix(min(1.0, (2.0 * most + 0.02) / max(own, 1e-6)), 1.0, blurred), min(1.0, limit / max(own, 1e-6)), blurred * seen);
  // The sky arrives blurred: with specks in the air a lone bright pixel of it is a light and stays.
  float air = mix(min(1.0, (2.0 * most + 0.02) / max(own, 1e-6)), 1.0, uSpecks * smoothstep(1.5, 3.0, c.a));
  rgb *= mix(land, air, sky(c.a));
  float reach = min(wide, ${maxFillPx.toFixed(1)});
  // A held sky pixel carries its reach with the sign turned: the fill reads that as a place that gathers but is never gathered. Only pure sky is held: one lens sample of a far hill in the pixel and it is the first step of that hill's edge, which has to be smoothed.
  outColor = vec4(rgb, uSkyHold > 0.5 && uFar > 0.0 && abs(c.a / uFar - 1.0) < 0.0002 ? -reach : reach);
}
`

export function discTaps(rings: number): [number, number, number][] {
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

// Rings close round the pixel, read only for what stands in front: a thing blurred less than the pixel reaches it from near by, where the rings of the disc hardly look.
const INNER = [0.05, 0.08, 0.125, 0.19]

// Each pixel gathers the neighbors whose own blur circle reaches it. A sharp neighbor reaches nobody, so the head never bleeds into the field behind it, and a sharp pixel gathers nothing.
// With `front` a neighbor blurred less than the pixel is taken as standing before it: it covers the pixel by the share of its own small circle that the tap stands for, so that the soft edge of a nearer thing is as deep on the far side of its outline as on the near side.
export function fillFragment(rings: number, front = false): string {
  const outer = (rings - 0.5) / (rings + 0.5)
  const first = 1 / (rings + 0.5)
  const bounds = [0, ...INNER.map((r, i) => Math.sqrt(r * (INNER[i + 1] ?? first)))]
  const disc = discTaps(rings)
  const share = (r: number): number => {
    const j = Math.round(r * (rings + 0.5))
    const lo = j === 1 ? bounds[bounds.length - 1] : (j - 0.5) / (rings + 0.5)
    const hi = Math.min(1, (j + 0.5) / (rings + 0.5))
    return (hi * hi - lo * lo) / (6 * j)
  }
  // Written out tap by tap: the software rasterizer runs straight code several times faster than a loop over a table.
  const taps = disc.map(([x, y, r]) => `  TAP(vec2(${x.toFixed(5)}, ${y.toFixed(5)}), ${r.toFixed(5)}, ${r > outer ? 'rim' : '1.0'}, ${front ? share(r).toFixed(5) : '0.0'})`).join('\n')
  const inner = !front
    ? ''
    : INNER.flatMap((r, i) =>
        Array.from({ length: 6 }, (_, k) => {
          const a = ((k + 0.5 * i) / 6) * 2 * Math.PI
          return `  NEAR(vec2(${(Math.cos(a) * r).toFixed(5)}, ${(Math.sin(a) * r).toFixed(5)}), ${r.toFixed(5)}, ${((bounds[i + 1] ** 2 - bounds[i] ** 2) / 6).toFixed(6)})`
        }),
      ).join('\n')
  return /* glsl */ `${glslCommon}
uniform sampler2D tFrame;
uniform float uSpread;
uniform float uEdge;
uniform float uSeed;
uniform float uTurn;
layout(location = 0) out vec4 outColor;
#define COVER(color, reach, w, area) { float e = w * area * min(radius * radius / max(reach * reach, 0.25), 144.0) * (1.0 - smoothstep(0.6, 0.9, reach / radius)); before += vec4(color, reach) * e; cover += e; }
#define TAP(o, len, gain, area) { vec4 s = texelFetch(tFrame, clamp(p + ivec2(round(turn * o)), ivec2(0), top), 0); float reach = abs(s.a) * uSpread; float w = saturate(reach - len * radius + 1.0); vec3 color = s.a < 0.0 ? (held ? c.rgb : min(s.rgb, 2.0 * c.rgb + 0.004)) : s.rgb; sum += color * (w * gain); total += w * gain; ${front ? 'COVER(color, reach, w, area)' : ''} }
#define NEAR(o, len, area) { vec4 s = texelFetch(tFrame, clamp(p + ivec2(round(turn * o)), ivec2(0), top), 0); float reach = abs(s.a) * uSpread; float w = s.a < 0.0 ? 0.0 : saturate(reach - len * radius + 1.0); COVER(s.rgb, reach, w, area) }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 top = ivec2(uSize) - 1;
  vec4 c = texelFetch(tFrame, p, 0);
  float radius = abs(c.a) * uSpread;
  // A held sky pixel keeps its own color for the sky's share, and its neighbors take the sky from it without its points of light.
  bool held = c.a < 0.0;
  if (radius < 0.6) { outColor = c; return; }
  mat2 turn = mat2(radius, 0.0, 0.0, radius);
  if (radius > 2.5 && uTurn > 0.0) {
    // Past this size the taps stand more than a pixel apart, and a small light would be drawn as a lattice of its copies: turning them per pixel trades the lattice for fine noise the next pass smooths.
    float a = hash31(vec3(gl_FragCoord.xy, uSeed)) * 6.2831853 * smoothstep(2.5, 5.0, radius) * uTurn;
    float cs = cos(a) * radius;
    float sn = sin(a) * radius;
    turn = mat2(cs, sn, -sn, cs);
  }
  vec3 sum = c.rgb;
  float total = 1.0;
  float rim = 1.0 + uEdge;
  vec4 before = vec4(0.0);
  float cover = 0.0;
${taps}
${inner}
  vec4 result = vec4(sum / total, radius);
  // Where a nearer thing covers the pixel the pixel is from now on as blurred as that thing, so the rounds that follow smooth it no wider.
  if (cover > 0.0) result = mix(result, before / cover, min(cover, 1.0));
  outColor = vec4(result.rgb, (held ? -1.0 : 1.0) * result.a / uSpread);
}
`
}
