// What water shows of the sky, from the light the sky says it gives: the dome, the bright band toward the sun, the sun itself, the cloud a flash lights, and the blaze round the gap when the deck tears.
export const skyMirror = /* glsl */ `
uniform vec3 uMirrorFlash;
uniform vec3 uMirrorFlashAt;
uniform float uBlaze;
uniform vec4 uStalk;
// 'blur' is how far the surface is broken up: 0 a still mirror, 6 the glitter of a chopped one.
vec3 skyMirror(vec3 d, float blur) {
  float up = max(d.y, 0.0);
  float flat2 = max(dot(d.xz, d.xz) * dot(uSunDir.xz, uSunDir.xz), 1e-8);
  float toSun = 0.5 + 0.5 * dot(d.xz, uSunDir.xz) * inversesqrt(flat2);
  vec3 low = mix(uAirHorizon, uSkyHorizonSun, toSun * toSun);
  vec3 sky = mix(low, uAirZenith, 1.0 - exp(-3.2 * up));
  float aim = dot(d, uSunDir) - 1.0;
  float wide = 0.0005 * (1.0 + 24.0 * blur);
  sky += uAirSun * (exp(aim / wide) * (3.0 / (1.0 + 3.0 * blur)) + exp(aim / (0.012 + 0.008 * blur)) * (0.25 + 1.4 * uBlaze) + exp(aim / 0.22) * 0.05 * uBlaze);
  float lit = dot(d, uMirrorFlashAt) - 1.0;
  sky += uMirrorFlash * (0.1 + 1.6 * exp(lit / 0.1) + 3.0 * exp(lit / 0.012));
  return sky;
}
// How much of the sky along a ray from p the plant stands in front of: its stem, and the leaves round it.
float stalkOver(vec3 p, vec3 r) {
  float level = max(dot(r.xz, r.xz), 1e-6);
  float s = max(-dot(p.xz, r.xz) / level, 0.0);
  vec3 q = p + r * s;
  float off = length(q.xz);
  float high = q.y / max(uStalk.x, 1e-3);
  if (high > 1.08 || q.y < 0.0) return 0.0;
  float stem = 1.0 - smoothstep(0.6 * uStalk.y, 1.6 * uStalk.y, off);
  float ragged = valueNoise(vec2(high * 9.0, atan(q.x, q.z) * 1.3 + 3.0));
  float leaves = (1.0 - smoothstep(0.35, 1.0, off / (uStalk.z * (0.35 + 0.65 * ragged)))) * smoothstep(0.22, 0.4, high) * smoothstep(0.25, 0.55, ragged) * 0.8;
  return max(stem, leaves) * uStalk.w;
}
`
