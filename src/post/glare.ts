// What is bright enough to scatter in the glass, kept in its own colour. Alpha says how open each place is to the light of the sky: 1 for sky as bright as the sky low toward the sun, 0 for anything that stands dark against it. The shafts are cast through it.
export const brightFragment = /* glsl */ `
uniform sampler2D tFrame;
uniform float uExposure;
uniform float uKnee;
uniform float uSkyLevel;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
vec4 bright(vec3 c) {
  c = max(c, 0.0) * uExposure;
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - uKnee * 0.5, 0.0, uKnee);
  float over = max(l - uKnee, soft * soft / (2.0 * uKnee + 1e-4));
  float kept = over / (1.0 + over / 800.0);
  float open = smoothstep(0.18, 0.6, dot(c, vec3(0.2126, 0.7152, 0.0722)) / uSkyLevel);
  return vec4(c * (kept / max(l, 1e-4)), open);
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 2;
  ivec2 top = textureSize(tFrame, 0) - 1;
  vec4 s = bright(texelFetch(tFrame, min(p, top), 0).rgb);
  s += bright(texelFetch(tFrame, min(p + ivec2(1, 0), top), 0).rgb);
  s += bright(texelFetch(tFrame, min(p + ivec2(0, 1), top), 0).rgb);
  s += bright(texelFetch(tFrame, min(p + ivec2(1, 1), top), 0).rgb);
  outColor = s * 0.25;
}
`

export const downFragment = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uTexel;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
void main() {
  vec4 s = texture(tSource, vUv + uTexel * vec2(-1.0, -1.0));
  s += texture(tSource, vUv + uTexel * vec2(1.0, -1.0));
  s += texture(tSource, vUv + uTexel * vec2(-1.0, 1.0));
  s += texture(tSource, vUv + uTexel * vec2(1.0, 1.0));
  outColor = s * 0.25;
}
`

export const upFragment = /* glsl */ `
uniform sampler2D tSource;
uniform sampler2D tBase;
uniform vec2 uTexel;
uniform vec3 uSourceGain;
uniform vec3 uBaseGain;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
void main() {
  vec3 s = texture(tSource, vUv).rgb * 4.0;
  s += texture(tSource, vUv + uTexel * vec2(-1.0, 0.0)).rgb * 2.0;
  s += texture(tSource, vUv + uTexel * vec2(1.0, 0.0)).rgb * 2.0;
  s += texture(tSource, vUv + uTexel * vec2(0.0, -1.0)).rgb * 2.0;
  s += texture(tSource, vUv + uTexel * vec2(0.0, 1.0)).rgb * 2.0;
  s += texture(tSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  s += texture(tSource, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  s += texture(tSource, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  s += texture(tSource, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  outColor = vec4(s / 16.0 * uSourceGain + texture(tBase, vUv).rgb * uBaseGain, 1.0);
}
`

// Light standing in the air. Every place looks toward the sun through the frame's own bright and dark: the share of that line that is open is the share of the sun's light that reaches the air there. The steps shrink toward the sun by a fixed ratio, so three rounds of six readings stand for two hundred and sixteen along the whole line.
export const SHAFT_TAPS = 6
export const shaftFragment = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uSun;
uniform float uRatio;
uniform int uAlpha;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
void main() {
  vec2 d = vUv - uSun;
  float sum = 0.0;
  float k = 1.0;
  for (int i = 0; i < ${SHAFT_TAPS}; i++) {
    vec4 s = texture(tSource, uSun + d * k);
    sum += uAlpha == 1 ? s.a : s.r;
    k *= uRatio;
  }
  outColor = vec4(sum / ${SHAFT_TAPS}.0);
}
`

// The share of the scattered light each level of the pyramid carries, counted from the widest (the whole frame) to the tightest. Equal shares would fall off as one over the square of the distance; these lean a little wide.
const shares = [0.22, 0.2, 0.16, 0.14, 0.12, 0.1, 0.06, 0.04]
const halationTint = [1, 0.32, 0.08]

// The gain of pyramid level `index` out of `levels` (0 is the finest, half the frame), per channel.
export function levelGain(index: number, levels: number, veil: number, halation: number, core = 1, tint: readonly number[] = [1, 1, 1]): [number, number, number] {
  const wide = levels - 1 - index
  const base = (shares[wide] ?? 0.03) * (wide <= 2 ? veil : wide === 3 ? 1 : core)
  const glow = wide >= 5 ? 0.06 * halation : 0
  const far = wide <= 2 ? tint : [1, 1, 1]
  return [base * far[0] + glow * halationTint[0], base * far[1] + glow * halationTint[1], base * far[2] + glow * halationTint[2]]
}
