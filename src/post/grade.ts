import { glslCommon } from '../core/shading.ts'

export const gradeFragment = /* glsl */ `${glslCommon}
uniform sampler2D tFrame;
uniform sampler2D tBloom;
uniform sampler2D tFlare;
uniform float uBloom;
uniform float uFlare;
uniform float uExposure;
uniform vec3 uGain;
uniform vec3 uLift;
uniform float uContrast;
uniform float uToneM;
uniform float uToneNorm;
uniform float uKeep;
uniform float uSaturation;
uniform float uVignette;
uniform float uGrain;
uniform float uSeed;
uniform int uMode;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, 1e-6), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 curve(vec3 x) {
  vec3 t = pow(max(x, 0.0), vec3(uContrast));
  return t / (t + uToneM) * uToneNorm;
}
// Each channel rides the curve by itself, so a strong color pales toward white as it burns, the way film does. A blown
// highlight keeps a share of its own hue, and the top of the curve bends once more so nothing lands on a flat clipped patch.
vec3 tone(vec3 c) {
  float m = max(c.r, max(c.g, c.b));
  vec3 own = curve(c);
  float top = curve(vec3(m)).r;
  vec3 kept = top * c / max(m, 1e-6);
  vec3 y = mix(own, kept, uKeep * top * top);
  vec3 over = max(y - 0.82, 0.0);
  return min(y, 0.82) + 0.155 * (1.0 - exp(-over / 0.155));
}
vec3 three(vec3 p) {
  uint h = hashU(floatBitsToUint(p.x) ^ hashU(floatBitsToUint(p.y) ^ hashU(floatBitsToUint(p.z))));
  return vec3(float(h & 1023u), float((h >> 10) & 1023u), float((h >> 20) & 1023u)) * (1.0 / 1024.0);
}
vec3 tri3(vec2 p, float s) {
  return three(vec3(p, s)) + three(vec3(p + 31.0, s + 0.37)) - 1.0;
}
float clump(vec2 p, float s) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash31(vec3(i, s));
  float b = hash31(vec3(i + vec2(1.0, 0.0), s));
  float c = hash31(vec3(i + vec2(0.0, 1.0), s));
  float d = hash31(vec3(i + vec2(1.0, 1.0), s));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y) * 2.0 - 1.0;
}
void main() {
  vec4 f = texelFetch(tFrame, ivec2(gl_FragCoord.xy), 0);
  vec3 c = f.rgb;
  if (uMode == 2) { outColor = vec4(clamp(c, 0.0, 1.0), 1.0); return; }
  if (uMode == 3) { outColor = vec4(vec3(1.0 / (1.0 + max(c.r, 0.0))), 1.0); return; }
  if (uMode == 1) { outColor = vec4(toSrgb(clamp(c, 0.0, 1.0)), 1.0); return; }
  c = max(c, 0.0) * uExposure + texture(tBloom, vUv).rgb * uBloom + texture(tFlare, vUv).rgb * uFlare;
  c *= uGain;
  // The falloff of a lens wide open: the fourth power of the cosine of the field angle, scaled to reach uVignette in the corners.
  float aspect = uSize.x / uSize.y;
  vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
  float r2 = dot(q, q) / (0.25 * (aspect * aspect + 1.0));
  float fall = 1.0 / (1.0 + (inversesqrt(1.0 - uVignette) - 1.0) * r2);
  c *= fall * fall;
  c = tone(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, uSaturation), 0.0);
  c = c + uLift * (1.0 - c);
  c = toSrgb(clamp(c, 0.0, 1.0));
  // Grain: one part per pixel and one part in clumps two pixels wide, which is the part a video encoder keeps. Mostly in brightness, strongest in the middle tones.
  float mid = 1.0 - abs(2.0 * dot(c, vec3(0.2126, 0.7152, 0.0722)) - 1.0);
  vec3 fine = tri3(gl_FragCoord.xy, uSeed);
  float body = (fine.r + fine.g + fine.b) * 0.5774 + 0.5 * clump(gl_FragCoord.xy * 0.53 + 11.0, uSeed + 0.19);
  c += (vec3(body) + 0.22 * (fine - (fine.r + fine.g + fine.b) / 3.0) * 1.5) * (uGrain * (0.35 + 0.65 * mid));
  c += tri3(gl_FragCoord.xy + 113.0, uSeed + 0.71) / 255.0;
  outColor = vec4(c, 1.0);
}
`
