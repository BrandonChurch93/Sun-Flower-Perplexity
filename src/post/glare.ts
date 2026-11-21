// What is bright enough to scatter in the glass, kept in its own color, with a second, higher cut in alpha for the flare.
export const brightFragment = /* glsl */ `
uniform sampler2D tFrame;
uniform float uExposure;
uniform float uKnee;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
vec4 bright(vec3 c) {
  c = max(c, 0.0) * uExposure;
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - uKnee * 0.5, 0.0, uKnee);
  float over = max(l - uKnee, soft * soft / (2.0 * uKnee + 1e-4));
  float kept = over / (1.0 + over / 800.0);
  float hot = 1.0 - exp(-max(l - 6.0 * uKnee, 0.0) / (30.0 * uKnee));
  return vec4(c * (kept / max(l, 1e-4)), hot);
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

// A soft streak along the line from the light through the middle of the frame, and two faint ghosts on that line, all read from what is hot in the frame so anything that covers the light dims them.
export const flareFragment = /* glsl */ `
uniform sampler2D tNear;
uniform sampler2D tFar;
uniform vec2 uSun;
uniform float uAspect;
uniform float uStreak;
uniform float uGhost;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
vec3 hot(sampler2D t, vec2 uv) {
  vec4 s = texture(t, uv);
  vec2 e = min(uv, 1.0 - uv);
  float inside = smoothstep(0.0, 0.05, min(e.x, e.y));
  return s.rgb / max(max(s.r, max(s.g, s.b)), 1e-4) * (s.a * inside);
}
void main() {
  vec2 c = vec2(0.5);
  vec2 axis = (c - uSun) * vec2(uAspect, 1.0);
  vec2 d = axis / max(length(axis), 1e-4) / vec2(uAspect, 1.0);
  vec3 streak = vec3(0.0);
  for (int i = -10; i <= 10; i++) {
    float t = float(i) * 0.05;
    float fade = 1.0 - 4.0 * t * t;
    streak += hot(tFar, vUv - d * t) * (fade * fade / (1.0 + 40.0 * t * t));
  }
  vec3 ghosts = hot(tFar, c + (c - vUv) / 0.92) * vec3(0.5, 0.9, 0.75) * 0.7;
  ghosts += hot(tNear, c + (vUv - c) / 0.42) * vec3(1.0, 0.72, 0.4) * 0.4;
  outColor = vec4(streak * (uStreak / 3.0) + ghosts * uGhost, 1.0);
}
`

// The share of the scattered light each level of the pyramid carries, counted from the widest (the whole frame) to the tightest. Equal shares would fall off as one over the square of the distance; these lean a little wide.
const shares = [0.22, 0.2, 0.16, 0.14, 0.12, 0.1, 0.06, 0.04]
const halationTint = [1, 0.32, 0.08]

// The gain of pyramid level `index` out of `levels` (0 is the finest, half the frame), per channel.
export function levelGain(index: number, levels: number, veil: number, halation: number): [number, number, number] {
  const wide = levels - 1 - index
  const base = (shares[wide] ?? 0.03) * (wide <= 2 ? veil : 1)
  const glow = wide >= 5 ? 0.06 * halation : 0
  return [base + glow * halationTint[0], base + glow * halationTint[1], base + glow * halationTint[2]]
}
