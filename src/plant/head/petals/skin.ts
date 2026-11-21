import { tissueGlsl } from '../../surface/index.ts'

export const vertex = /* glsl */ `
in vec3 position;
#ifndef PLANT_FIELD
in vec3 positionB;
#endif
in vec3 normal;
in vec2 uv;
in vec4 aRay;
in vec2 aState;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out vec4 vRay;
out vec2 vState;
out float vDepth;
void main() {
#ifdef PLANT_FIELD
  vec3 local = position;
#else
  vec3 local = mix(position, positionB, uShutter);
#endif
  vec4 world = vec4(plantWorld(local), 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vNormal = plantDirection(normal);
  vUv = uv;
  vRay = aRay;
  vState = aState;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

// The mean of the color map in linear light: the map only says how a place differs from it.
const MAP_MEAN = 'vec3(0.72, 0.40, 0.012)'

export const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in vec4 vRay;
in vec2 vState;
in float vDepth;
#ifndef PLANT_FIELD
uniform sampler2D uRayColor;
uniform sampler2D uRayData;
uniform vec2 uRaySize;
#endif
${tissueGlsl}
void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 n = normalize(vNormal);
#ifdef PLANT_FIELD
  bool front = dot(n, view) >= 0.0;
#else
  bool front = gl_FrontFacing;
#endif
  if (!front) n = -n;
  float u = vUv.x;
  float across = vUv.y * 2.0 - 1.0;
  float fresh = vState.x;
  float unfolded = vState.y;
  float foot = 1.0 - smoothstep(0.0, 0.3, u);
  float claw = 1.0 - smoothstep(0.0, 0.1, u);

  vec3 body = mix(vec3(0.84, 0.45, 0.018), vec3(0.93, 0.56, 0.03), smoothstep(0.25, 1.0, u));
  body = mix(body, vec3(0.86, 0.74, 0.05), 0.8 * fresh);
  vec3 albedo = mix(body, vec3(0.50, 0.33, 0.03), 0.75 * foot);
  albedo = mix(albedo, vec3(0.30, 0.34, 0.05), claw);
  vec3 through = mix(vec3(1.0, 0.62, 0.035), vec3(1.0, 0.74, 0.06), smoothstep(0.3, 1.0, u));
  through = mix(through, vec3(0.80, 0.86, 0.10), 0.7 * fresh);
  through = mix(through, vec3(0.62, 0.24, 0.01), 0.85 * foot);

  // The two folds a ray keeps from the bud, and the groove of its middle vein.
  float fold = 1.0 - smoothstep(0.0, 0.07, abs(abs(across) - 0.34));
  float groove = 1.0 - smoothstep(0.0, 0.05, abs(across));
  float lines = (fold - 0.7 * groove) * smoothstep(1.0, 0.75, u);
  through *= 1.0 - 0.22 * (fold + groove) * smoothstep(1.0, 0.75, u);

  Tissue t;
  t.face = n;
#ifdef PLANT_FIELD
  t.normal = n;
  float texels = -1.0;
#else
  vec2 m = vec2(vRay.w + u * 0.84, vRay.y + vRay.z * across * 0.3);
  vec3 tint = texture(uRayColor, m).rgb;
  vec3 data = texture(uRayData, m).rgb;
  vec3 rel = clamp(tint / ${MAP_MEAN}, 0.35, 1.9);
  rel.b = mix(1.0, rel.b, 0.3);
  albedo *= mix(vec3(1.0), rel, 0.6);
  float vein = data.b;
  through *= (0.45 + 0.75 * data.g) * (1.0 - 0.3 * vein);
  through.g *= 1.0 - 0.25 * vein;
  float height = ((data.r - 0.5) * 0.00028 + lines * 0.00022) * (front ? 1.0 : -1.4);
  t.normal = reliefNormal(n, vWorld, height, 1.0);
  float texels = texelDensity(m, uRaySize);
#endif
  if (!front) albedo = mix(albedo, vec3(0.80, 0.60, 0.13), 0.3) * 0.92;
  albedo *= 1.0 - 0.25 * uPlantWet;
  albedo = mix(albedo, vec3(0.82, 0.86, 0.9), 0.55 * uPlantFrost);
  through *= 1.0 - 0.6 * uPlantFrost;
  t.albedo = albedo;
  t.through = through;
  t.rough = (front ? 0.5 : 0.8) * (1.0 - 0.6 * uPlantWet);
  t.wax = (front ? 0.3 : 0.08) + 0.4 * uPlantWet + 0.3 * uPlantDew;
  t.sheen = front ? 0.2 : 0.3 + 0.3 * foot;
  t.occlusion = mix(0.4, 1.0, smoothstep(0.0, 0.22, u)) * mix(0.7, 1.0, unfolded);
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, vDepth, texels);
}
`
