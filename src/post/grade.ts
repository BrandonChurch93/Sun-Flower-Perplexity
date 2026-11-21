import { glslCommon } from '../core/shading.ts'
import { skyness } from './fill.ts'

export const gradeFragment = /* glsl */ `${glslCommon}
uniform sampler2D tFrame;
uniform sampler2D tRaw;
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
uniform float uPunch;
uniform float uPale;
uniform float uGreens;
uniform float uTop;
uniform float uWhiten;
uniform sampler2D tHot;
uniform vec2 uSunAt;
uniform float uStar;
uniform float uStarLen;
uniform float uGlow;
uniform float uShafts;
uniform float uRays;
uniform float uSunClear;
uniform float uFarFill;
uniform float uSaturation;
uniform float uVignette;
uniform float uGrain;
uniform float uSeed;
uniform int uMode;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
${skyness}
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
  float v = max(y.r, max(y.g, y.b));
  // Bright greens are pressed toward their shade: a backlit leaf on film sits well under the petals.
  float green = smoothstep(0.8, 1.0, y.g / max(y.r, 1e-5)) * smoothstep(0.9, 1.1, y.g / max(y.b, 1e-5)) * smoothstep(0.2, 0.5, (v - min(y.r, min(y.g, y.b))) / max(v, 1e-5));
  float pressed = min(v, 0.03) + max(v - 0.03, 0.0) * uGreens;
  y = mix(y, mix(y, vec3(dot(y, vec3(0.2126, 0.7152, 0.0722))), 0.25 * (1.0 - uGreens)) * (pressed / max(v, 1e-5)), green);
  // More slope through the upper half, and a burning color takes on white as it nears the top.
  y *= 1.0 + uPunch * (smoothstep(0.3, 0.75, v) - 0.65 * smoothstep(0.02, 0.2, v) * (1.0 - smoothstep(0.25, 0.45, v)));
  float burn = smoothstep(0.75, 1.05, max(y.r, max(y.g, y.b)));
  float hi = max(y.r, max(y.g, y.b));
  y += vec3(1.0, 1.0, 0.8) * (uPale * burn * burn * smoothstep(0.3, 0.6, (hi - min(y.r, min(y.g, y.b))) / max(hi, 1e-5)));
  // The brightest light loses its hue: on film the area round a sun in the frame is near white, not the sun's own color.
  float white = dot(y, vec3(0.2126, 0.7152, 0.0722));
  y = mix(y, vec3(white), uWhiten * smoothstep(0.6, 1.0, white));
  vec3 over = max(y - 0.88, 0.0);
  return min(y, 0.88) + uTop * (1.0 - exp(-over / uTop));
}
// The star the edges of the aperture blades draw round a point of light: seven blades, fourteen soft rays, one pair far longer than the rest, widest at the light and fading to nothing, as bright as what shows of the light itself.
vec3 star(vec2 px) {
  vec2 d = px - uSunAt * uSize;
  float r = length(d);
  if (uStar <= 0.0 || r > uStarLen) return vec3(0.0);
  float a = atan(d.y, d.x) * (14.0 / 6.2831853) + 0.31;
  float k = floor(a + 0.5);
  float h = hash31(vec3(mod(k + 14.0, 7.0), 5.0, 2.0));
  float len = uStarLen * (0.28 + 0.72 * h * h * sqrt(h)) * (0.8 + 0.2 * hash31(vec3(k, 3.0, 7.0)));
  float across = abs(a - k) * (6.2831853 / 14.0) * r;
  float t = saturate(1.0 - r / len);
  float w = (0.7 + 1.5 * t) * uSize.y / 1080.0;
  float x = across * across / (w * w);
  float line = 0.7 * exp(-x) + 0.3 * exp(-x / 12.0);
  return texture(tHot, uSunAt).rgb * vec3(1.0, 0.62, 0.3) * (line * t * t * uStar);
}
// How open the sky is round a pixel. A leaf whose own blur happens to match that of infinity carries the sky's mark along a thin line, and the mark ends hard where a blurred edge begins, so it is read over a small disc and only a clear majority counts.
float openSky(ivec2 p) {
  ivec2 top = ivec2(uSize) - 1;
  float open = sky(texelFetch(tRaw, p, 0).a);
  for (int i = 0; i < 16; i++) {
    float a = (float(i) + 0.5 * float(i / 8)) * 0.7853982;
    vec2 o = vec2(cos(a), sin(a)) * (i < 8 ? 6.0 : 12.0) * uSize.y / 1080.0;
    open += sky(texelFetch(tRaw, clamp(p + ivec2(round(o)), ivec2(0), top), 0).a);
  }
  return smoothstep(0.6, 1.0, open / 17.0);
}
float fanNoise(float t, float n, float s) {
  float i = floor(t);
  float f = t - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash31(vec3(mod(i, n), s, 1.0)), hash31(vec3(mod(i + 1.0, n), s, 1.0)), f);
}
// Thin rays out of the sun: thirteen round the circle at uneven angles, each a wedge with its own width, length and strength, so they open as they run and never draw a line of one width.
float rays(float turn, float r, float down) {
  float t = turn * 13.0;
  float k = floor(t);
  vec3 h = vec3(hash31(vec3(k, 11.0, 1.0)), hash31(vec3(k, 12.0, 1.0)), hash31(vec3(k, 13.0, 1.0)));
  float girth = 6.2831853 * r * uSize.x;
  float across = (t - k - 0.25 - 0.5 * h.x) / 13.0 * girth;
  float wide = max(mix(0.004, 0.012, h.y) * girth, uSize.y / 1080.0);
  float len = mix(0.16, 0.52, h.z * h.z) * mix(1.0, 0.6, down);
  float along = saturate(1.0 - r / len);
  float x = across / wide;
  return exp(-x * x) * along * along * (0.45 + 0.55 * hash31(vec3(k, 14.0, 1.0)));
}
// What a low sun in the frame does. In the glass: a small near white core and a short soft glow, which lie over everything. In the air of the field: thin rays and wide soft shafts fanning out from the sun and a warm spill round it, which lie only over what is behind them. The air follows how much of the sun shows, down to a floor: a leaf across the disc shades little of the air behind it.
vec3 sunAir(vec2 px, float circle, float under) {
  if (uGlow <= 0.0 && uShafts <= 0.0) return vec3(0.0);
  vec2 d = (px - uSunAt * uSize) / uSize.x;
  float r = length(d);
  float shown = dot(texture(tHot, uSunAt).rgb, vec3(0.2126, 0.7152, 0.0722));
  // The bloom is nothing without the sun, but a sun half covered keeps more than half of it: the eye reads the bloom's size, which shrinks slower than its light.
  float lit = uSunClear > 0.0 ? uSunClear * pow(min(shown / uSunClear, 1.5), 0.6) : shown;
  float tight = 1.0 + r * r / 0.0004;
  // The core's tail ends inside a fifth of the width: left to run, it lays a warm grey over every black in the frame.
  float tail = r * r / 0.0289;
  float glow = exp(-tail * tail) / (tight * sqrt(tight)) + 0.12 * exp(-r * r / 0.002) + 0.05 * exp(-r / 0.05);
  vec3 glass = mix(vec3(1.0, 0.92, 0.82), vec3(1.0, 0.46, 0.14), smoothstep(0.0, 0.08, r)) * (lit * uGlow * glow);
  float turn = atan(d.y, d.x) / 6.2831853 + 0.5;
  float down = smoothstep(0.02, 0.1, turn) * (1.0 - smoothstep(0.42, 0.5, turn));
  // Over the field the shafts are short and even; up against the dark cloud they run long and stand apart.
  float beams = mix(0.15, 0.5, down) + mix(0.85, 0.5, down) * smoothstep(0.15, 0.9, 0.65 * fanNoise(turn * 26.0, 26.0, 3.0) + 0.35 * fanNoise(turn * 62.0, 62.0, 7.0));
  float reach = saturate(1.0 - r / mix(0.55, 0.3, down));
  // Nothing in focus and nothing nearer than the focus is behind the lit air. Far things blur up to the circle of infinity, near leaves beyond it.
  float depth = circle / max(uFarFill, 1e-4);
  float behind = smoothstep(0.3, 0.7, depth) * (1.0 - smoothstep(1.03, 1.25, depth));
  // Above the sun only the open sky is behind the lit air: what else stands there is a near leaf.
  float open = uShafts > 0.0 && r < 0.56 ? openSky(ivec2(px)) : 0.0;
  behind = max(open, behind * smoothstep(0.0, 0.015, turn) * (1.0 - smoothstep(0.485, 0.5, turn)));
  // Lit haze in front of a dark field leaves its deepest holes dark.
  float hold = mix(1.0, mix(0.3, 1.0, smoothstep(0.004, 0.05, under)), down);
  float near = r / (r + 0.02);
  float air = (mix(4.0 * smoothstep(0.04, 0.2, r), 1.0, down) * beams * reach * reach * near + 0.3 * exp(-r / 0.07) + 0.45 * down * smoothstep(0.75, 1.0, depth) * exp(-r / 0.16)) * hold + uRays * rays(turn, r, down) * near;
  return glass + vec3(1.0, 0.45, 0.27) * (max(shown, 0.6 * uSunClear) * uShafts * air * behind);
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
  c = max(c, 0.0) * uExposure;
  c += texture(tBloom, vUv).rgb * uBloom + texture(tFlare, vUv).rgb * uFlare + star(gl_FragCoord.xy) + sunAir(gl_FragCoord.xy, f.a, dot(c, vec3(0.2126, 0.7152, 0.0722)));
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
  // Grain: one part per pixel and one part in clumps two pixels wide, which is the part a video encoder keeps. Mostly in brightness, and it follows tone as film does: strongest in the middle tones, under half of that in deep shadow, a third in the highlights.
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float weight = mix(0.33, 0.8, smoothstep(0.0, 0.4, luma)) * mix(1.0, 0.35, smoothstep(0.55, 0.9, luma));
  vec3 fine = tri3(gl_FragCoord.xy, uSeed);
  float body = (fine.r + fine.g + fine.b) * 0.5774 + 0.5 * clump(gl_FragCoord.xy * 0.53 + 11.0, uSeed + 0.19);
  c += (vec3(body) + 0.22 * (fine - (fine.r + fine.g + fine.b) / 3.0) * 1.5) * (uGrain * weight);
  c += tri3(gl_FragCoord.xy + 113.0, uSeed + 0.71) / 255.0;
  outColor = vec4(c, 1.0);
}
`
