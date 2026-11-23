import { glslCommon } from '../core/shading.ts'

export const gradeFragment = /* glsl */ `${glslCommon}
uniform sampler2D tFrame;
uniform sampler2D tBloom;
uniform sampler2D tShafts;
uniform sampler2D tOpen;
uniform sampler2D tSun;
uniform float uBloom;
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
uniform float uKnee;
uniform float uTop;
uniform float uWhiten;
uniform vec3 uBlack;
uniform vec2 uSunAt;
uniform vec3 uSunLight;
uniform vec3 uSunAir;
uniform float uSunCore;
uniform float uSunHot;
uniform float uFan;
uniform float uShaftLevel;
uniform float uBloomCap;
uniform float uHaze;
uniform float uVeilSun;
uniform float uMist;
uniform float uWarm;
uniform float uEvening;
uniform sampler2D tRaw;
uniform float uFar;
uniform float uShafts;
uniform float uSaturation;
uniform float uVignette;
uniform float uGrain;
uniform float uSeed;
uniform float uDrift;
uniform float uTight;
uniform float uHorizon;
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
  vec3 over = max(y - uKnee, 0.0);
  return min(y, uKnee) + uTop * (1.0 - exp(-over / uTop));
}
// What a sun in the frame does to the glass and to the air, in the sun's own light as the air has coloured it.
// In the glass, over everything: a small hot core, a soft glow that widens with the haze, and a veil over the whole frame. All three follow how much of the disc shows and sit where the showing part sits, so a sun half behind a leaf blooms from the leaf's edge and wraps it.
// In the air: the light that stands between the lens and the far land, cut by whatever stands dark against the sky on the way to the sun.
float band(float turn, float n, float seed) {
  float x = (turn / 6.2831853 + 0.5) * n;
  float i = floor(x);
  float f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash31(vec3(mod(i, n), seed, 0.5)), hash31(vec3(mod(i + 1.0, n), seed, 0.5)), f);
}
// The same bands as the cloud that cuts them moves: they turn slowly about the tear and each one swells and thins on its own.
float drifting(float turn, float n, float seed, float rate) {
  float t = uDrift * rate + seed;
  float k = floor(t);
  float f = t - k;
  f = f * f * (3.0 - 2.0 * f);
  return mix(band(turn, n, seed + k), band(turn, n, seed + k + 1.0), f);
}
vec3 sunGlare(vec2 px) {
  float peak = max(uSunLight.r, max(uSunLight.g, uSunLight.b));
  if (peak <= 0.0) return vec3(0.0);
  vec4 seen = texelFetch(tSun, ivec2(0), 0);
  vec2 away = (px - uSunAt * uSize) / uSize.x;
  vec2 d = away - seen.gb;
  float r = length(d);
  vec3 air = mix(uSunLight, peak * uSunAir, 0.3);
  // The glow and the core are the disc's own light in the glass: they take the colour the sky drew the disc in and its level, as far as the disc shows, and a dull disc keeps its core to itself. Round a sun veiled by mist the glass keeps a tight glow at full strength; the wide one is the fog's own.
  vec3 hot = mix(uSunLight, vec3(peak), 0.5 - 0.3 * uWarm);
  vec4 face = texelFetch(tSun, ivec2(2, 0), 0);
  float top = max(face.r, max(face.g, face.b));
  float dull = 1.0;
  if (top > 0.0) {
    air = face.rgb * (peak / top);
    hot = air;
    // In the evenings the sky draws a low sun a few times over white and no more: there a disc four times over white has the whole glass.
    dull = min(1.0, top * uExposure / mix(5.66 * peak * uSunHot, 4.0, uEvening));
  } else if (uFar > 0.0) {
    dull = 0.0;
  }
  float size = uSunCore * (1.0 + 0.8 * uWarm * dull);
  float q = r * r / (size * size);
  float core = 1.0 / ((1.0 + q) * (1.0 + q) * sqrt(1.0 + q));
  float wide = mix(0.02, 0.05, uHaze);
  float glow = (0.07 + 0.07 * uHaze) * exp(-r / wide) + (0.012 + 0.02 * uHaze) * (1.0 - uTight) * exp(-r / 0.16);
  glow += uWarm * (0.16 * exp(-r / 0.035));
  float fogged = uMist * 0.3 * exp(-r / 0.03);
  float veil = uVeilSun * (1.0 - uTight) * (0.003 + 0.006 * uHaze) * (0.35 + 0.65 * exp(-r / 0.5));
  vec3 glass = hot * (uSunHot * core * min(seen.a, 2.0 * face.a) * dull) + air * (((glow + veil) * dull + fogged) * seen.r);
  // A sun going down behind the far land is in the air behind it: as its lower edge comes to the land the glass draws less and less in front of that land, and nothing once they touch.
  float circle = texture(tRaw, vUv).a;
  float ridge = uFar > 0.0 ? smoothstep(0.0006, 0.0012, abs(circle / uFar - 1.0)) * smoothstep(0.8, 0.95, circle / uFar) : 0.0;
  float clear = texelFetch(tSun, ivec2(3, 0), 0).r;
  glass *= 1.0 - ridge * (1.0 - clear * clear * (3.0 - 2.0 * clear));
  // Under a deck that has just torn the sun is the tear itself, ragged and already in the sky's picture: the glass adds no disc and no veil of its own there, only the beams.
  glass *= 1.0 - smoothstep(0.0, 0.35, uFan);
  float open = texture(tShafts, vUv).r;
  // Under a deck that has just torn the beams start where the tear is brightest, and they stand in the air behind the plant: what is in focus in front of them takes almost none.
  float fanned = smoothstep(0.0, 0.3, uFan);
  vec3 tear = texelFetch(tSun, ivec2(1, 0), 0).xyz;
  vec2 off = away - fanned * tear.xy;
  float back = uFar > 0.5 ? smoothstep(0.1, 0.5, texelFetch(tRaw, ivec2(px), 0).a / uFar) : 1.0;
  float here = mix(mix(0.14, 1.0, texture(tOpen, vUv).a), back, fanned);
  float ra = length(off);
  // The beams: the air is never even, so the light stands in it in uneven bands that all point at the sun. Under the tear they are few and unlike: a broad one, some thin, some missing, each as long as the cloud lets it be, and none reaches the land.
  float turn = atan(off.y, off.x);
  float fine = smoothstep(0.36, 0.6, 0.5 * band(turn, 13.0, 3.0) + 0.5 * band(turn, 31.0, 11.0));
  float broad = smoothstep(0.5, 0.82, drifting(turn + 0.03 * uDrift, 11.0, 5.3, 0.45));
  float thin = smoothstep(0.6, 0.8, drifting(turn - 0.05 * uDrift, 41.0, 7.7, 0.7)) * smoothstep(0.3, 0.6, drifting(turn, 6.0, 2.1, 0.3));
  float few = max(broad * (0.55 + 0.45 * band(turn, 53.0, 9.4)), 0.7 * thin);
  float beams = mix(1.0, mix(mix(0.06, 1.0, fine), few, fanned), smoothstep(mix(0.03, 0.006, fanned), mix(0.2, 0.05, fanned), ra));
  float under = mix(1.0, smoothstep(0.15, 0.65, -off.y / max(ra, 1e-4)), min(1.0, 3.0 * fanned));
  float span = mix(0.13, 0.24, drifting(turn, 17.0, 4.6, 0.35));
  float torn = exp(-ra / 0.16) * (1.0 - smoothstep(0.45 * span, span, -off.y)) * smoothstep(0.0, 0.07, (px.y / uSize.y - uHorizon) * uSize.y / uSize.x);
  float reach = mix(0.4 * exp(-ra / mix(0.14, 0.1, uTight)) + 0.6 * (1.0 - uTight) * exp(-ra / 0.55), torn, fanned);
  float standing = reach * mix(open * sqrt(open), mix(0.6, 1.0, open), fanned) * here * beams * under * smoothstep(mix(0.015, 0.0, fanned), mix(0.12, 0.03, fanned), ra);
  float lit = uShafts * mix(0.8 + 1.6 * uWarm, 1.4 * sqrt(clamp(tear.z / 0.5, 0.0, 1.0)), fanned) * standing;
  // The beams under the tear carry the sun's own colour, deepened: the air between them is the storm's and stays cold.
  vec3 own = uSunLight / peak;
  vec3 tint = mix(mix(own, uSunAir, 0.4), own * own, fanned);
  return glass + tint * (uShaftLevel * lit / (1.0 + 1.2 * lit));
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
  vec3 scattered = texture(tBloom, vUv).rgb * uBloom;
  c += scattered / (1.0 + uBloomCap * dot(scattered, vec3(0.2126, 0.7152, 0.0722))) + sunGlare(gl_FragCoord.xy);
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
  c = max(c + uLift * (1.0 - c) - uLift * uBlack * exp(-l / 0.014), 0.0);
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
