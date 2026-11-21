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

function discTaps(rings: number): { count: number; glsl: string } {
  const taps: string[] = []
  for (let j = 1; j <= rings; j++) {
    const n = 6 * j
    const r = j / (rings + 0.5)
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.37 * j) / n) * 2 * Math.PI
      taps.push(`vec3(${(Math.cos(a) * r).toFixed(5)}, ${(Math.sin(a) * r).toFixed(5)}, ${r.toFixed(5)})`)
    }
  }
  return { count: taps.length, glsl: `const vec3 TAPS[${taps.length}] = vec3[${taps.length}](${taps.join(', ')});` }
}

// Each pixel gathers the neighbors whose own blur circle reaches it. A sharp neighbor reaches nobody, so the head never bleeds into the field behind it, and a sharp pixel gathers nothing.
export function fillFragment(rings: number): string {
  const taps = discTaps(rings)
  const outer = (rings - 0.5) / (rings + 0.5)
  return /* glsl */ `${glslCommon}
uniform sampler2D tFrame;
uniform float uSpread;
uniform float uEdge;
uniform float uSeed;
layout(location = 0) out vec4 outColor;
${taps.glsl}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 top = ivec2(uSize) - 1;
  vec4 c = texelFetch(tFrame, p, 0);
  float radius = c.a * uSpread;
  if (radius < 0.6) { outColor = c; return; }
  mat2 turn = mat2(radius, 0.0, 0.0, radius);
  if (radius > 7.0) {
    // Past this size the taps stand pixels apart: turning them per pixel trades their pattern for fine noise the next pass smooths.
    float a = hash31(vec3(gl_FragCoord.xy, uSeed)) * 6.2831853 * smoothstep(7.0, 12.0, radius);
    float cs = cos(a) * radius;
    float sn = sin(a) * radius;
    turn = mat2(cs, sn, -sn, cs);
  }
  vec3 sum = c.rgb;
  float total = 1.0;
  for (int i = 0; i < ${taps.count}; i++) {
    vec3 t = TAPS[i];
    ivec2 q = clamp(p + ivec2(round(turn * t.xy)), ivec2(0), top);
    vec4 s = texelFetch(tFrame, q, 0);
    float w = saturate(s.a * uSpread - t.z * radius + 1.0) * (t.z > ${outer.toFixed(4)} ? 1.0 + uEdge : 1.0);
    sum += s.rgb * w;
    total += w;
  }
  outColor = vec4(sum / total, c.a);
}
`
}
