import { basin } from './basin.ts'
import { skyMirror } from './water.ts'

// The ground smoothed over this many more levels of its maps is the lie of the land the films of water follow.
const SMOOTH_LODS = 2.5
// How far under that smoothed ground a film's surface stands on open ground and in its valleys, in meters, and how much lower it starts when the rain does.
const FILM_M = [-0.004, -0.0015]
const FILM_STARTS_M = -0.004

export const rivuletVertex = /* glsl */ `
in vec3 position;
out vec3 vWorld;
out float vDepth;
out float vLie;
${basin}
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  float lod = soilLod(world.xz);
  world.y += soilHeight(world.xz, lod);
  vLie = soilHeight(world.xz, lod + ${SMOOTH_LODS.toFixed(1)});
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

// Water that stands between the crumbs above the pools: a film in every hollow of the fine soil, fuller in the valleys between the clods, creeping downhill.
export const rivuletFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
in float vLie;
uniform vec2 uSpan;
${basin}
${skyMirror}
void main() {
  vec2 p = vWorld.xz;
  float height = soilHeight(p, soilLod(p));
  float valley = 1.0 - smoothstep(-0.006, 0.004, vLie);
  float film = vLie + mix(${FILM_M[0].toFixed(4)}, ${FILM_M[1].toFixed(4)}, valley) + ${FILM_STARTS_M.toFixed(4)} * (1.0 - uLevel.y) - height;
  float open = 1.0 - smoothstep(0.0, 0.001, waterDepthOver(height));
  float cover = smoothstep(0.0, 0.0006, film) * open;
  float damp = 0.25 * smoothstep(-0.0025, 0.0, film) * (1.0 - cover) * open;
  if (cover + damp <= 0.002) discard;
  mat2 across = mat2(dFdx(p), dFdy(p));
  vec2 fall = vec2(dFdx(vLie), dFdy(vLie)) * inverse(across);
  float steep = length(fall);
  vec2 down = -fall / max(steep, 1e-4);
  float t = mix(uSpan.x, uSpan.y, uShutter);
  float run = saturate(steep * 4.0) * smoothstep(0.0, 0.002, film);
  float wave = 0.07 * sin(dot(p, down) * 900.0 - t * 11.0) + 0.05 * sin(dot(p, down) * 410.0 - t * 6.0 + 2.0);
  vec3 n = normalize(vec3(fall.x * 0.5 + down.x * wave * run, 1.0, fall.y * 0.5 + down.y * wave * run));
  vec3 v = normalize(uCamPos - vWorld);
  float mirror = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uGroundBounce * 0.25, skyMirror(normalize(vec3(r.x, abs(r.y), r.z)), 2.0), smoothstep(-0.06, 0.02, r.y));
  float deep = 1.0 - exp(-max(film, 0.0) / 0.003);
  float body = mirror + (1.0 - mirror) * 0.5 * deep;
  vec3 murk = vec3(0.05, 0.043, 0.036) * skyAmbient(vec3(0.0, 1.0, 0.0)) * (1.0 - mirror) * 0.5 * deep;
  float alpha = cover * body + damp;
  vec3 color = ((sky * mirror + murk) * cover + vec3(0.012, 0.011, 0.01) * skyAmbient(vec3(0.0, 1.0, 0.0)) * damp) / max(alpha, 1e-3);
  outColor = vec4(finish(color, vWorld, vDepth, -1.0).rgb, alpha);
}
`
