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
  t.rough = 0.85;
  t.wax = 0.15;
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
    float fine = valueNoise(vec2(x * 11.0, u * 60.0) + seed * 50.0);
    float vein = abs(fract(x * 2.0 + 0.5 + 0.06 * grain) - 0.5) * 2.0;
    float line = smoothstep(0.86, 1.0, vein) * (1.0 - smoothstep(0.6, 0.97, u)) * (1.0 - smoothstep(0.8, 1.0, ax));
    float keel = smoothstep(0.09, 0.0, ax);
    float blotch = valueNoise(vec2(x * 2.3 + seed * 37.0, u * 7.0 + seed * 53.0));
    float toTip = smoothstep(0.3, 1.0, u);
    float rim = smoothstep(0.55, 1.0, ax);
    float middle = 1.0 - smoothstep(0.0, 0.55, ax);
    vec3 dark = mix(vec3(0.03, 0.078, 0.04), vec3(0.068, 0.14, 0.058), grain);
    vec3 pale = mix(vec3(0.11, 0.2, 0.066), vec3(0.17, 0.27, 0.078), grain);
    vec3 albedo = mix(dark, pale, saturate(0.35 * toTip + 0.4 * keel + 0.6 * line + 0.12 * rank * (1.0 - toTip) + 0.3 * (blotch - 0.5) + 0.4 * rim - 0.25 * middle));
    albedo = mix(albedo, pale * 1.15, smoothstep(0.8, 1.0, ax) * 0.75);
    albedo *= 0.93 + 0.14 * fine;
    albedo = mix(albedo, vec3(0.2, 0.09, 0.035), 0.7 * smoothstep(0.94, 1.0, u));
    if (inner) albedo = mix(albedo, vec3(0.07, 0.115, 0.05), 0.7);
    else albedo *= vec3(0.6, 0.67, 0.58);
    float thin = saturate(0.04 + 0.55 * smoothstep(0.38, 0.98, u) + 0.8 * smoothstep(0.3, 0.95, ax) * smoothstep(0.05, 0.3, u));
    thin *= 1.0 - 0.45 * max(keel, line);
    t.albedo = albedo;
    t.through = vec3(0.56, 0.8, 0.08) * (mix(0.03, 0.3, thin) + 0.3 * smoothstep(0.75, 1.0, ax) * smoothstep(0.05, 0.3, u)) * (0.8 + 0.4 * grain);
    float side = abs(fract(u * 9.0 - ax * 2.2 + seed * 3.0) - 0.5) * 2.0;
    float rib = smoothstep(0.8, 1.0, side) * smoothstep(0.08, 0.3, ax) * (1.0 - smoothstep(0.7, 0.95, u));
    albedo = mix(albedo, pale, 0.45 * rib);
    t.albedo = albedo;
    // Relief finer than about three pixels turns into two pixel blocks in the screen derivatives, so each term fades out as its own width nears a pixel.
    float px = fwidth(x);
    float pu = fwidth(u);
    float coarse = 1.0 - smoothstep(0.33, 0.8, max(px * 6.0, pu * 30.0));
    float thread = 1.0 - smoothstep(0.012, 0.035, px);
    height = 0.0003 * grain * coarse + 0.0003 * line * thread + 0.00045 * keel * (1.0 - smoothstep(0.03, 0.09, px)) + 0.0002 * rib * (1.0 - smoothstep(0.004, 0.011, pu)) + 0.00006 * fine * (1.0 - smoothstep(0.33, 0.8, max(px * 11.0, pu * 60.0)));
    float buried = smoothstep(0.0, 0.16, u);
    t.sheen = 0.45;
    t.occlusion = mix(0.8, 1.0, buried) * (inner ? mix(0.75, 1.0, toTip) : 1.0) * (1.0 - 0.25 * middle * (1.0 - toTip));
    t.occlusion *= 1.0 - 0.3 * uPlantWet;
    t.wax = 0.15 + 0.3 * uPlantWet;
  } else if (kind > 0.5) {
    float rho = vInfo.x;
    float grain = valueNoise((0.3 + rho) * vec2(cos(vInfo.y), sin(vInfo.y)) * 30.0);
    vec3 cream = mix(vec3(0.42, 0.47, 0.2), vec3(0.52, 0.52, 0.27), grain);
    vec3 tan = mix(vec3(0.36, 0.27, 0.13), vec3(0.46, 0.36, 0.2), grain);
    t.albedo = mix(cream, tan, uBudOpen * smoothstep(1.0, 0.3, rho));
    t.albedo = mix(t.albedo, mix(vec3(0.085, 0.155, 0.055), vec3(0.05, 0.06, 0.028), uBudOpen), smoothstep(0.8, 0.93, rho));
    t.occlusion = mix(mix(0.45, 0.9, uBudOpen), mix(0.75, 0.45, uBudOpen), smoothstep(0.8, 0.93, rho));
    t.rough = 0.9;
    t.wax = 0.1;
    t.sheen = 0.0;
  } else {
    float v = vInfo.x;
    float grain = valueNoise((0.35 + v) * vec2(cos(vInfo.y), sin(vInfo.y)) * 26.0);
    float rib = abs(fract(vInfo.y * 3.3422538 + 0.2 * grain) - 0.5) * 2.0;
    vec3 neck = vec3(0.2, 0.3, 0.09);
    vec3 body = mix(vec3(0.05, 0.1, 0.04), vec3(0.1, 0.18, 0.065), grain);
    t.albedo = mix(neck, body, smoothstep(0.08, 0.4, v)) * (0.92 + 0.16 * rib);
    float pits = valueNoise((0.35 + v) * vec2(cos(vInfo.y), sin(vInfo.y)) * 90.0);
    t.albedo *= 0.8 + 0.3 * pits;
    height = 0.0005 * grain + 0.0002 * rib + 0.00035 * pits;
    t.occlusion = mix(1.0, mix(0.7, 0.45, uBudOpen), smoothstep(0.3, 0.75, v));
    float shoulder = smoothstep(0.55, 0.8, v);
    t.albedo = mix(t.albedo, mix(vec3(0.085, 0.155, 0.055), vec3(0.04, 0.05, 0.024), uBudOpen), shoulder);
    t.rough = 0.9;
    t.wax = 0.1 * (1.0 - shoulder);
    t.sheen = 0.8 * (1.0 - shoulder);
  }
  t.normal = reliefNormal(face, vWorld, height, 1.0);
#endif
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, vDepth, -1.0);
}
`
