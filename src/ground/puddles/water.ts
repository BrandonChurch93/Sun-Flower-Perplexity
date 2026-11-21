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

// The sky a ray leaving the water meets, read from the world's own picture of it by direction.
export const skyMirror = /* glsl */ `
uniform sampler2D tMirror;
uniform mat3 uMirrorBasis;
uniform vec3 uMirrorScale;
vec3 skyMirror(vec3 d, float blur) {
  vec3 k = d * uMirrorBasis;
  vec2 uv = vec2(0.5) + k.xy / max(k.z, 0.05) * uMirrorScale.xy;
  vec2 over = max(max(-uv, uv - 1.0), vec2(0.0));
  float lod = max(blur, 7.0 * smoothstep(0.0, 0.3, max(over.x, over.y)));
  return textureLod(tMirror, clamp(uv, 0.0, 1.0), lod).rgb * uMirrorScale.z;
}
`

export const waterFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
uniform sampler2D tRipple;
uniform vec3 uBox;
${basin}
${skyMirror}
void main() {
  vec2 p = vWorld.xz;
  float depth = waterDepth(p);
  float cover = smoothstep(0.0, 0.0005, depth);
  if (cover <= 0.0) discard;
  vec2 q = (p - uBox.xy) * uBox.z;
  vec2 edge = smoothstep(vec2(1.0), vec2(0.85), abs(q));
  vec2 slope = texture(tRipple, q * 0.5 + 0.5).rg * edge.x * edge.y * smoothstep(0.0, 0.004, depth);
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 v = normalize(uCamPos - vWorld);
  float facing = max(dot(n, v), 0.0);
  float mirror = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  vec3 r = reflect(-v, n);
  vec3 up = vec3(r.x, abs(r.y), r.z);
  vec3 sky = 0.5 * (skyMirror(normalize(up), 3.0) + skyMirror(normalize(vec3(up.x, up.y * 0.35, up.z)), 5.0));
  sky = mix(uGroundBounce * 0.25, sky, smoothstep(-0.06, 0.02, r.y));
  float clear = exp(-depth / 0.008) * (1.0 - mirror);
  vec3 murk = vec3(0.05, 0.043, 0.036) * skyAmbient(vec3(0.0, 1.0, 0.0)) * (1.0 - mirror) * (1.0 - exp(-depth / 0.008));
  float alpha = 1.0 - clear;
  vec4 done = finish((sky * mirror + murk) / max(alpha, 1e-3), vWorld, vDepth, -1.0);
  outColor = vec4(done.rgb, alpha * cover);
}
`
