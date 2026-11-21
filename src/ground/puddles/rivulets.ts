import { basin, course } from './basin.ts'
import { skyMirror } from './water.ts'

// Threads of water this far apart on average run down the furrow's banks into it.
const SPACING_M = 0.045
const REACH_M = 0.3

export const rivuletVertex = /* glsl */ `
in vec3 position;
out vec3 vWorld;
out float vDepth;
${basin}
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  world.y += soilHeight(world.xz, soilLod(world.xz));
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

export const rivuletFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
uniform sampler2D tData;
uniform vec4 uRelief;
uniform vec2 uLevel;
uniform vec2 uSpan;
${course}
${skyMirror}
const mat2 TURN = mat2(0.891, 0.454, -0.454, 0.891);
void main() {
  vec2 p = vWorld.xz;
  vec2 f = furrowPlace(p);
  float d = f.y;
  float across = f.x;
  float side = abs(across);
  float band = smoothstep(${REACH_M.toFixed(2)}, ${(REACH_M * 0.55).toFixed(3)}, side) * smoothstep(-0.95, -0.7, d) * smoothstep(0.45, 0.3, d);
  if (band <= 0.0) discard;
  float clod = textureLod(tData, TURN * p * uRelief.z + vec2(0.5, 0.2), 1.0).a;
  float along = d / ${SPACING_M.toFixed(3)} + 2.6 * (clod - 0.5) + 0.7 * (valueNoise(p * 31.0) - 0.5) + 0.35 * sin(side * 37.0 + d * 9.0);
  float id = floor(along);
  float runs = step(0.42, hash11(id * 1.37 + 5.0)) * uLevel.y;
  float t = mix(uSpan.x, uSpan.y, uShutter);
  float width = (0.05 + 0.07 * hash11(id + 0.61)) * (0.75 + 0.25 * sin(t * 0.9 + id * 2.3)) * (1.0 - 0.6 * smoothstep(0.1, ${REACH_M.toFixed(2)}, side));
  float off = abs(fract(along) - 0.5);
  float thread = runs * band * (1.0 - smoothstep(0.55 * width, width, off)) * smoothstep(0.62, 0.46, clod);
  if (thread <= 0.003) discard;
  vec3 face = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  face = face.y < 0.0 ? -face : face;
  vec2 down = uRight * sign(-across);
  float wave = sin(side * 420.0 + t * 14.0 + id * 1.7) * 0.14 + sin(side * 190.0 + t * 8.0 + id) * 0.1;
  vec3 n = normalize(mix(face, vec3(0.0, 1.0, 0.0), 0.35) + vec3(down.x, 0.0, down.y) * wave);
  vec3 v = normalize(uCamPos - vWorld);
  float mirror = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uGroundBounce * 0.25, skyMirror(normalize(vec3(r.x, abs(r.y), r.z)), 3.5), smoothstep(-0.06, 0.02, r.y));
  float alpha = saturate(mirror + 0.25);
  outColor = vec4(finish(sky * mirror / alpha, vWorld, vDepth, -1.0).rgb, alpha * thread);
}
`
