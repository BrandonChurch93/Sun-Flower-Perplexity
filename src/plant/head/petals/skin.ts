import { tissueGlsl } from '../../surface/index.ts'

export const vertex = /* glsl */ `
in vec3 position;
#ifndef PLANT_FIELD
in vec3 positionB;
#endif
in vec3 normal;
in vec2 uv;
in vec4 aRay;
in vec3 aState;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out vec4 vRay;
out vec3 vState;
out float vDepth;
#ifdef DEPTH_PASS
uniform float uShadowTexelM;
#endif
void main() {
#ifdef PLANT_FIELD
  vec3 local = position;
#else
  vec3 local = mix(position, positionB, uShutter);
#endif
  vec4 world = vec4(plantWorld(local), 1.0);
#ifdef DEPTH_PASS
  // The pleats of a folded ray are finer than the shadow map: the caster stands back so they do not stripe themselves.
  world.xyz -= uSunDir * (uShadowTexelM * mix(3.5, 1.0, aState.y) - 0.008 * aState.x);
#endif
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
in vec3 vState;
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
  float foot = 1.0 - smoothstep(0.0, 0.5, u);
  float claw = 1.0 - smoothstep(0.0, 0.1, u);

  vec3 body = mix(vec3(0.8, 0.43, 0.015), vec3(0.88, 0.54, 0.03), smoothstep(0.1, 0.8, u));
  // A ray just out of the bud is still green yellow.
  // A ray that is lifting is yellow before it deepens.
  body = mix(body, vec3(0.86, 0.62, 0.05), 0.7 * (1.0 - vState.z));
  body = mix(body, vec3(0.36, 0.46, 0.1), 0.95 * fresh);
  // Each ray has its own depth of yellow.
  float own = hash11(vRay.x * 91.7 + 3.1);
  body *= vec3(0.94 + 0.1 * own, 0.88 + 0.2 * own, 1.0) * (0.78 + 0.3 * hash11(vRay.x * 57.3 + 9.7));
  // The thin edges and the far end let the most light through, and it comes out pale.
  float pale = max(smoothstep(0.45, 1.0, abs(across)), 0.75 * smoothstep(0.35, 0.95, u)) * mix(0.3, 1.0, unfolded);
  body = mix(body, vec3(1.0, 0.62, 0.1), 0.12 * pale * (1.0 - fresh));
  vec3 albedo = mix(body, vec3(0.6, 0.28, 0.012), 0.6 * foot);
  albedo = mix(albedo, vec3(0.30, 0.32, 0.05), claw);
  vec3 through = mix(vec3(0.8, 0.36, 0.015), vec3(1.35, 0.74, 0.045), smoothstep(0.0, 0.7, u));
  through.g *= 0.9 + 0.2 * own;
  through = mix(through, vec3(1.45, 0.78, 0.2), 0.5 * pale);
  // A ray still folded is several layers thick: less light comes through, and it comes out deeper.
  through *= mix(vec3(0.62, 0.66, 0.5), vec3(1.0), unfolded);
  // A ray just opened is still thick with sap: the light through it is deep orange, and it thins to yellow over the next second.
  through *= mix(vec3(0.85, 0.88, 0.7), vec3(1.0), vState.z);
  through = mix(through, vec3(0.5, 0.72, 0.16), 0.9 * fresh);

  // The two folds a ray keeps from the bud, and the groove of its middle vein.
  float fold = 1.0 - smoothstep(0.0, 0.07, abs(abs(across) - 0.34));
  float groove = 1.0 - smoothstep(0.0, 0.05, abs(across));
  through *= 1.0 - 0.4 * (fold + groove) * smoothstep(1.0, 0.75, u);
  // The veins run the length of a ray and pass less light than the tissue between them.
  float streak = smoothstep(0.72, 1.0, abs(sin(across * 21.0 + own * 6.0))) * smoothstep(1.0, 0.8, u) * smoothstep(0.02, 0.2, u);
  through *= 1.0 - 0.45 * streak;
  albedo *= 1.0 - 0.15 * streak;

  Tissue t;
  t.face = n;
#ifdef PLANT_FIELD
  // Far heads are seen through haze that already pales them.
  albedo *= vec3(0.92, 0.82, 0.5);
  through *= vec3(0.92, 0.82, 0.5);
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
  float texels = texelDensity(m, uRaySize);
  // The slopes are taken in the map and by formula: screen differences of a fine height break into blocks on a steep fold.
  vec2 step = max(texels, 1.5) / uRaySize;
  float alongSlope = (texture(uRayData, m + vec2(step.x, 0.0)).r - data.r) / step.x * 0.84 * 0.00028;
  float acrossSlope = (texture(uRayData, m + vec2(0.0, step.y)).r - data.r) / step.y * 0.3 * vRay.z * 0.00028;
  float fx = clamp(abs(abs(across) - 0.34) / 0.07, 0.0, 1.0);
  float gx = clamp(abs(across) / 0.05, 0.0, 1.0);
  float foldSlope = -6.0 * fx * (1.0 - fx) / 0.07 * sign(abs(across) - 0.34) * sign(across);
  float grooveSlope = -6.0 * gx * (1.0 - gx) / 0.05 * sign(across);
  acrossSlope += (foldSlope - 0.7 * grooveSlope) * smoothstep(1.0, 0.75, u) * 0.00022;
  float side = front ? 1.0 : -1.4;
  vec3 wx = dFdx(vWorld);
  vec3 wy = dFdy(vWorld);
  vec3 r1 = cross(wy, n);
  vec3 r2 = cross(n, wx);
  float det = dot(wx, r1);
  vec3 grad = (r1 * dFdx(u) + r2 * dFdy(u)) * alongSlope + (r1 * dFdx(across) + r2 * dFdy(across)) * acrossSlope;
  t.normal = normalize(abs(det) * n - sign(det) * side * grad);
#endif
  if (!front) albedo = mix(albedo, vec3(0.8, 0.46, 0.05), 0.3 * (1.0 - fresh)) * 0.92;
  t.albedo = albedo;
  t.through = through;
  t.rough = front ? 0.62 : 0.8;
  t.wax = front ? 0.2 : 0.08;
  t.sheen = front ? 0.12 : 0.2 + 0.3 * foot;
  // The valley between the two folds and the hollow under each rolled edge see less sky than the ridges.
  float valley = (1.0 - smoothstep(0.0, 0.2, abs(across))) + 0.6 * smoothstep(0.62, 0.95, abs(across));
  float creased = smoothstep(1.0, 0.7, u) * (front ? 1.0 : 0.5);
  t.albedo *= mix(vec3(1.0), vec3(0.8, 0.62, 0.5), 0.8 * valley * creased);
  // A shut ray is a strap with a ridge down its middle: the ridge catches the light and the edges lie in the dark between two straps.
  float seam = smoothstep(0.5, 1.0, abs(across)) * fresh * smoothstep(1.0, 0.6, u);
  t.albedo *= (1.0 - 0.75 * seam) * (1.0 + 0.35 * fresh * (1.0 - smoothstep(0.0, 0.3, abs(across))));
  t.through *= 1.0 - 0.85 * seam;
  t.occlusion = (1.0 - 0.7 * seam) * mix(0.42, 1.0, smoothstep(0.0, 0.32, u)) * mix(0.6, 1.0, unfolded) * (1.0 - 0.45 * valley * creased) * (1.0 - 0.25 * fold * creased);
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, vDepth, texels);
}
`
