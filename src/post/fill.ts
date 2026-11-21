import { glslCommon } from '../core/shading.ts'

export const maxFillPx = 96

// The radius over which each pixel is spread, with the sharp zone grown by one pixel so the soft edge pixels of a sharp thing keep their own color.
export const reachFragment = /* glsl */ `${glslCommon}
uniform sampler2D tFrame;
uniform float uRadiusScale;
layout(location = 0) out vec4 outColor;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 top = ivec2(uSize) - 1;
  vec4 c = texelFetch(tFrame, p, 0);
  float a = c.a;
  a = min(a, texelFetch(tFrame, min(p + ivec2(1, 0), top), 0).a);
  a = min(a, texelFetch(tFrame, max(p - ivec2(1, 0), ivec2(0)), 0).a);
  a = min(a, texelFetch(tFrame, min(p + ivec2(0, 1), top), 0).a);
  a = min(a, texelFetch(tFrame, max(p - ivec2(0, 1), ivec2(0)), 0).a);
  outColor = vec4(max(c.rgb, 0.0), min(max(a, 0.0) * uRadiusScale, ${maxFillPx.toFixed(1)}));
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
