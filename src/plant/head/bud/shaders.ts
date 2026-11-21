import { tissueGlsl } from '../../surface/index.ts'

export const vertex = /* glsl */ `
in vec3 position;
#ifndef PLANT_FIELD
in vec3 positionB;
#endif
in vec3 normal;
in vec4 aInfo;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vInfo;
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
  vInfo = aInfo;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

// aInfo.w says what the surface is: 0 the back and side of the receptacle, 1 its floor, 2 and over a bract (2 is the outermost, 3 the innermost).
export const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec4 vInfo;
in float vDepth;
uniform float uBudOpen;
${tissueGlsl}
void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  bool inner = dot(face, view) < 0.0;
  if (inner) face = -face;
  float kind = vInfo.w;
  Tissue t;
  t.face = face;
  t.normal = face;
  t.through = vec3(0.0);
  t.rough = 0.86;
  t.wax = 0.07;
  t.sheen = 1.0;
  t.occlusion = 1.0;
#ifdef PLANT_FIELD
  if (kind > 1.5) {
    t.albedo = mix(vec3(0.12, 0.21, 0.055), vec3(0.26, 0.37, 0.1), vInfo.x);
    t.through = vec3(0.4, 0.6, 0.06) * smoothstep(0.2, 0.8, vInfo.x);
  } else if (kind > 0.5) {
    t.albedo = mix(vec3(0.3, 0.34, 0.12), vec3(0.3, 0.2, 0.07), uBudOpen);
  } else {
    t.albedo = vec3(0.16, 0.25, 0.07);
  }
#else
  float height = 0.0;
  if (kind > 1.5) {
    float u = vInfo.x;
    float x = vInfo.y;
    float ax = abs(x);
    float seed = vInfo.z;
    float rank = kind - 2.0;
    float grain = valueNoise(vec2(x * 6.0 + seed * 91.0, u * 30.0 + seed * 17.0));
    float fine = hash21(floor(vec2(x * 40.0, u * 220.0) + seed * 50.0));
    float vein = abs(fract(x * 4.5 + 0.5) - 0.5) * 2.0;
    float line = smoothstep(0.75, 1.0, vein) * (1.0 - smoothstep(0.55, 0.95, u));
    float keel = smoothstep(0.12, 0.0, ax);
    float toTip = smoothstep(0.3, 1.0, u);
    vec3 dark = mix(vec3(0.07, 0.135, 0.036), vec3(0.15, 0.25, 0.066), grain);
    vec3 pale = mix(vec3(0.24, 0.36, 0.085), vec3(0.34, 0.44, 0.1), grain);
    vec3 albedo = mix(dark, pale, saturate(0.62 * toTip + 0.3 * keel + 0.22 * line + 0.25 * rank * (1.0 - toTip)));
    albedo = mix(albedo, pale * 1.1, smoothstep(0.82, 1.0, ax) * 0.5);
    albedo *= 0.93 + 0.14 * fine;
    if (inner) albedo = mix(albedo, vec3(0.3, 0.43, 0.12), 0.65);
    float thin = saturate(0.04 + 0.96 * smoothstep(0.38, 0.98, u) + 0.5 * ax * ax * ax * smoothstep(0.1, 0.4, u));
    thin *= 1.0 - 0.45 * max(keel, line);
    t.albedo = albedo;
    t.through = vec3(0.52, 0.74, 0.07) * thin * (0.75 + 0.5 * grain);
    height = 0.00022 * grain + 0.00012 * line + 0.00005 * fine;
    float buried = smoothstep(0.0, 0.32, u);
    t.occlusion = mix(0.28, 1.0, buried) * (inner ? mix(0.35, 1.0, max(uBudOpen, toTip * 0.7)) : 1.0);
    t.occlusion *= 1.0 - 0.3 * uPlantWet;
    t.wax = 0.07 + 0.3 * uPlantWet;
  } else if (kind > 0.5) {
    float rho = vInfo.x;
    float grain = valueNoise((0.3 + rho) * vec2(cos(vInfo.y), sin(vInfo.y)) * 30.0);
    vec3 cream = mix(vec3(0.42, 0.47, 0.2), vec3(0.52, 0.52, 0.27), grain);
    vec3 tan = mix(vec3(0.36, 0.27, 0.13), vec3(0.46, 0.36, 0.2), grain);
    t.albedo = mix(cream, tan, uBudOpen * smoothstep(1.0, 0.3, rho));
    t.occlusion = mix(0.45, 0.9, uBudOpen);
    t.sheen = 0.0;
  } else {
    float v = vInfo.x;
    float grain = valueNoise((0.35 + v) * vec2(cos(vInfo.y), sin(vInfo.y)) * 26.0);
    float rib = abs(fract(vInfo.y * 3.3422538 + 0.2 * grain) - 0.5) * 2.0;
    vec3 neck = vec3(0.2, 0.3, 0.09);
    vec3 body = mix(vec3(0.085, 0.15, 0.04), vec3(0.17, 0.26, 0.07), grain);
    t.albedo = mix(neck, body, smoothstep(0.08, 0.4, v)) * (0.92 + 0.16 * rib);
    height = 0.0004 * grain + 0.0002 * rib;
    t.occlusion = mix(1.0, 0.4, smoothstep(0.3, 0.75, v));
  }
  t.normal = reliefNormal(face, vWorld, height, 1.0);
#endif
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, vDepth, -1.0);
}
`
