import { rainSkyGlsl } from '../../worlds/rain/sky.ts'
import { basin } from './basin.ts'

export const waterVertex = /* glsl */ `
in vec3 position;
uniform vec2 uLevel;
out vec3 vWorld;
out float vDepth;
void main() {
  vec4 world = vec4(position.x, uLevel.x, position.z, 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

// The sky a ray leaving the water meets: the rain world's own sky by direction.
export const skyMirror = /* glsl */ `${rainSkyGlsl}
vec3 skyMirror(vec3 d, float blur) {
  return rainSky(d, blur);
}
`

// The share of the surface that the fine rain keeps too rough to mirror sharply.
const ROUGH = 0.3
// The chop that rings long faded leave standing between the banks: wave number per meter, radians per second, heading, slope. Each runs in short crests.
const CHOP = [
  [97, 29, 1.83, 0.03],
  [148, 39, 0.59, 0.04],
  [211, 52, 4.22, 0.05],
  [293, 68, 2.8, 0.055],
  [383, 31, 5.35, 0.075],
  [521, 44, 1.12, 0.07],
  [694, 62, 3.47, 0.06],
  [907, 86, 0.21, 0.05],
]
const chop = CHOP.map(([k, w, a, s], i) => {
  const x = Math.cos(a)
  const z = Math.sin(a)
  const along = `vec2(${x.toFixed(3)}, ${z.toFixed(3)})`
  const bend = `sin(dot(p, vec2(${(z * 31 + i * 7).toFixed(1)}, ${(i * 5 - x * 27).toFixed(1)})) + ${(i * 1.7).toFixed(1)})`
  const seen = `(1.0 - smoothstep(0.15, 0.45, ${(k / 6.2831853).toFixed(2)} * max(abs(dot(dx, ${along})), abs(dot(dy, ${along})))))`
  const crest = `smoothstep(-0.2, 0.7, sin(dot(p, vec2(${(-z * k * 0.23).toFixed(1)}, ${(x * k * 0.23).toFixed(1)})) + ${(i * 2.4).toFixed(1)} + 0.8 * ${bend}))`
  return `  s += ${along} * ${s.toFixed(3)} * ${seen} * ${crest} * cos(dot(p, ${along}) * ${k.toFixed(1)} - t * ${w.toFixed(1)} + 1.6 * ${bend});`
}).join('\n')

export const waterFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
uniform sampler2D tRipple;
uniform vec2 uSpan;
${basin}
${skyMirror}
// How much of a ray leaving the water at p is stopped by the furrow's bank after s meters.
float bankOver(vec2 p, vec3 r, float s) {
  vec2 q = p + r.xz * s;
  return smoothstep(-0.003, 0.006, furrow(q) * nearFade(q) - uLevel.x - r.y * s);
}
vec2 chop(vec2 p, float t, vec2 dx, vec2 dy) {
  vec2 s = vec2(0.0);
${chop}
  return s;
}
void main() {
  vec2 p = vWorld.xz;
  float depth = waterDepth(p);
  float cover = smoothstep(0.0, 0.0035, depth);
  if (cover <= 0.0) discard;
  vec2 q = boxPlace(p);
  vec2 edge = smoothstep(vec2(1.0), vec2(0.85), abs(q));
  vec2 slope = (texture(tRipple, q * 0.5 + 0.5).rg * edge.x * edge.y + chop(p, mix(uSpan.x, uSpan.y, uShutter), dFdx(p), dFdy(p))) * smoothstep(0.0, 0.004, depth);
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 v = normalize(uCamPos - vWorld);
  float facing = max(dot(n, v), 0.0);
  float mirror = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  vec3 r = reflect(-v, n);
  vec3 up = vec3(r.x, abs(r.y), r.z);
  vec3 glitter = skyMirror(normalize(vec3(up.x, up.y * 0.35, up.z)), 6.0);
  vec3 sky = mix(mix(uGroundBounce * 0.25, skyMirror(normalize(up), 1.0), smoothstep(-0.06, 0.02, r.y)), glitter, ${ROUGH.toFixed(2)});
  float banked = max(max(bankOver(p, up, 0.035), bankOver(p, up, 0.09)), bankOver(p, up, 0.2));
  sky = mix(sky, uGroundBounce * 0.25, banked);
  float clear = exp(-depth / 0.008) * (1.0 - mirror);
  vec3 murk = vec3(0.05, 0.043, 0.036) * skyAmbient(vec3(0.0, 1.0, 0.0)) * (1.0 - mirror) * (1.0 - exp(-depth / 0.008));
  float alpha = 1.0 - clear;
  vec4 done = finish((sky * mirror + murk) / max(alpha, 1e-3), vWorld, vDepth, -1.0);
  outColor = vec4(done.rgb, alpha * cover);
}
`
