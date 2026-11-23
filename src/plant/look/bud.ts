// What the bud's and the head's back skin reads, from the vertex shader in src/plant/head/bud/shaders.ts: vWorld, vNormal, vInfo, vDepth, vLow, uBudOpen, uBudShut, uBudEarly, and the tissue text. Whoever needs to change the list writes to the other owner first.
export const budMain = /* glsl */ `float bractRelief(float x, float u, float seed) {
  float ax = abs(x);
  float grain = valueNoise(vec2(x * 6.0 + seed * 91.0, u * 30.0 + seed * 17.0));
  float fine = valueNoise(vec2(x * 11.0, u * 60.0) + seed * 50.0);
  float vein = abs(fract(x * 3.0 + 0.5 + 0.06 * grain) - 0.5) * 2.0;
  float line = smoothstep(0.86, 1.0, vein) * (1.0 - smoothstep(0.6, 0.97, u)) * (1.0 - smoothstep(0.8, 1.0, ax));
  float keel = smoothstep(0.09, 0.0, ax);
  float side = abs(fract(u * 9.0 - ax * 2.2 + seed * 3.0) - 0.5) * 2.0;
  float rib = smoothstep(0.8, 1.0, side) * smoothstep(0.08, 0.3, ax) * (1.0 - smoothstep(0.7, 0.95, u));
  return 0.0003 * grain + 0.0006 * line + 0.0009 * keel + 0.0005 * rib + 0.00008 * fine;
}

void main() {
  vec3 toCam = uCamPos - vWorld;
  vec3 view = length(toCam) > 1e-6 ? normalize(toCam) : vec3(0.0, 0.0, 1.0);
  vec3 face = length(vNormal) > 1e-6 ? normalize(vNormal) : view;
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
  float uField = saturate(vInfo.x);
  if (kind > 1.5) {
    t.albedo = mix(vec3(0.12, 0.21, 0.055), vec3(0.26, 0.37, 0.1), uField);
    t.through = vec3(0.4, 0.6, 0.06) * smoothstep(0.2, 0.8, uField);
  } else if (kind > 0.5) {
    t.albedo = mix(vec3(0.3, 0.34, 0.12), vec3(0.3, 0.2, 0.07), uBudOpen);
  } else {
    t.albedo = vec3(0.16, 0.25, 0.07);
  }
#else
  float height = 0.0;
  float gather = -1.0;
  vec2 at = vec2(0.0);
  vec2 slope = vec2(0.0);
  if (kind > 1.5) {
    float u = saturate(vInfo.x);
    float x = clamp(vInfo.y, -1.0, 1.0);
    float ax = abs(x);
    float seed = saturate(vInfo.z);
    float rank = saturate(kind - 2.0);
    float low = clamp(vLow, -1.0, 2.0);
    float grain = valueNoise(vec2(x * 6.0 + seed * 91.0, u * 30.0 + seed * 17.0));
    float fine = valueNoise(vec2(x * 11.0, u * 60.0) + seed * 50.0);
    float vein = abs(fract(x * 3.0 + 0.5 + 0.06 * grain) - 0.5) * 2.0;
    float line = smoothstep(0.86, 1.0, vein) * (1.0 - smoothstep(0.6, 0.97, u)) * (1.0 - smoothstep(0.8, 1.0, ax));
    line *= 1.0 - 0.7 * uBudShut * uBudEarly;
    float keel = smoothstep(0.09, 0.0, ax);
    float blotch = valueNoise(vec2(x * 2.3 + seed * 37.0, u * 7.0 + seed * 53.0));
    float toTip = smoothstep(0.3, 1.0, u);
    float rim = smoothstep(0.55, 1.0, ax);
    float middle = 1.0 - smoothstep(0.0, 0.55, ax);
    vec3 dark = mix(vec3(0.03, 0.078, 0.04), vec3(0.068, 0.14, 0.058), grain);
    vec3 pale = mix(vec3(0.11, 0.2, 0.066), vec3(0.17, 0.27, 0.078), grain);
    vec3 albedo = mix(dark, pale, saturate(0.35 * toTip + 0.4 * keel + 0.6 * line + 0.12 * rank * (1.0 - toTip) + 0.3 * (blotch - 0.5) + 0.4 * rim - 0.25 * middle));
    albedo = mix(albedo, pale * 1.25, smoothstep(0.78, 1.0, ax) * 0.82);
    albedo = mix(albedo, pale * 1.38, 0.65 * smoothstep(0.055, 0.015, ax) * (1.0 - smoothstep(0.75, 0.95, u)));
    albedo *= 0.93 + 0.14 * fine;
    albedo = mix(albedo, vec3(0.2, 0.09, 0.035), 0.65 * smoothstep(0.94, 1.0, u));
    if (inner) albedo = mix(albedo, vec3(0.085, 0.135, 0.055), 0.68);
    else albedo *= vec3(0.72, 0.80, 0.68);
    albedo = mix(albedo, vec3(dot(albedo, vec3(0.3, 0.6, 0.1))) * vec3(0.95, 1.08, 0.85), 0.35 * (1.0 - uBudShut));
    albedo *= mix(vec3(1.0), mix(mix(vec3(1.15, 2.0, 0.85), mix(vec3(0.6, 1.1, 0.45), vec3(2.6, 2.8, 0.5), smoothstep(0.5, 1.0, rank)), uBudEarly), vec3(2.6), smoothstep(0.78, 1.0, ax) * (1.0 - uBudEarly)), uBudShut);
    albedo = mix(albedo, vec3(0.36, 0.43, 0.3), saturate(0.85 * pow(max(smoothstep(0.0, 0.9, ax), 0.0), 1.3) + 0.8 * smoothstep(0.25, 0.9, u)) * smoothstep(0.03, 0.35, u) * (1.0 - 0.3 * smoothstep(0.5, 1.0, rank)) * uBudEarly * uBudShut);
    float lit = (1.0 - smoothstep(0.0, 0.8, low)) * (1.0 - smoothstep(0.35, 0.9, uBudOpen));
    float blade = saturate(0.3 + 0.4 * smoothstep(0.2, 0.9, u) + 0.5 * smoothstep(0.1, 0.9, ax)) * smoothstep(0.03, 0.3, u);
    float margin = saturate(0.04 + 0.55 * smoothstep(0.38, 0.98, u) + 0.8 * smoothstep(0.3, 0.95, ax) * smoothstep(0.05, 0.3, u));
    float side = abs(fract(u * 9.0 - ax * 2.2 + seed * 3.0) - 0.5) * 2.0;
    float rib = smoothstep(0.8, 1.0, side) * smoothstep(0.08, 0.3, ax) * (1.0 - smoothstep(0.7, 0.95, u)) * (1.0 - 0.7 * uBudShut * uBudEarly);
    float thin = mix(margin, blade, lit);
    thin = mix(thin, 0.9, uBudShut * uBudEarly * smoothstep(0.5, 1.0, rank) * smoothstep(0.1, 0.4, u));
    thin = mix(thin, max(thin, pow(max(smoothstep(0.25, 1.0, ax), 0.0), 1.5)), uBudShut * uBudEarly);
    thin *= 1.0 - 0.65 * max(max(keel, line), 0.6 * rib);
    t.albedo = albedo;
    t.through = mix(vec3(0.56, 0.8, 0.08), vec3(0.66, 0.78, 0.1), lit) * mix(0.03, mix(0.36, 0.24, lit), thin) * (0.8 + 0.4 * grain) * (1.0 + 0.8 * uBudShut * uBudEarly);
    albedo = mix(albedo, pale, 0.45 * rib);
    t.albedo = albedo;
    at = vec2(vInfo.y, vInfo.x);
    vec2 reach = max(reliefReach(at), vec2(1e-5));
    slope = vec2(bractRelief(x + reach.x, u, seed) - bractRelief(x - reach.x, u, seed), bractRelief(x, u + reach.y, seed) - bractRelief(x, u - reach.y, seed)) / (2.0 * reach);
    float buried = smoothstep(0.0, 0.16, u);
    t.sheen = mix(0.7, 0.45, uBudShut);
    t.occlusion = mix(0.8, 1.0, buried) * (inner ? mix(0.75, 1.0, toTip) : 1.0) * (1.0 - 0.25 * middle * (1.0 - toTip));
    t.occlusion *= 1.0 - 0.3 * uPlantWet;
    t.occlusion *= mix(1.0, mix(mix(0.45, 1.0, smoothstep(0.0, 0.34, u)), mix(0.42, 1.0, smoothstep(0.0, 0.4, u)), uBudEarly), uBudShut);
    float shaded = smoothstep(0.35, 0.9, uBudOpen);
    t.occlusion *= mix(1.0 - 0.38 * shaded, 0.88, smoothstep(0.55, 0.95, u));
    t.through *= mix(1.0 - 0.55 * shaded, 0.85, smoothstep(0.55, 0.95, u));
    t.wax = 0.15 + 0.3 * uPlantWet;
    float open = smoothstep(0.1, 0.35, u) * (0.75 + 0.25 * smoothstep(-0.25, 0.25, sin(u * 11.0 + seed * 40.0 + step(0.0, x) * 2.1) * sin(u * 5.3 + seed * 17.0 + 1.0) + 0.15));
    gather = max(max(smoothstep(mix(0.82, 0.64, uBudEarly * uBudShut), 1.0, ax) * mix(1.0, open, uBudEarly * uBudShut), smoothstep(mix(0.8, 0.5, uBudEarly * uBudShut), 1.0, u)), mix(0.4, 0.1, uBudEarly) * keel);
  } else if (kind > 0.5) {
    float rho = saturate(vInfo.x);
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
    float v = saturate(vInfo.x);
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
  t.albedo = clamp(t.albedo, vec3(0.0), vec3(1.0));
  t.through = clamp(t.through, vec3(0.0), vec3(1.5));
  t.occlusion = saturate(t.occlusion);
  t.normal = reliefNormal(face, vWorld, height, 1.0);
  if (kind > 1.5) t.normal = reliefSlope(face, vWorld, at, slope, 1.0);
  vec3 shade;
  if (gather >= 0.0) shade = shadeTissueAt(t, vWorld, view, at * vec2(0.012, 0.05) + saturate(vInfo.z) * 3.0, gather);
  else shade = shadeTissue(t, vWorld, view);
  outColor = finish(shade, vWorld, max(vDepth, 1e-4), -1.0);
#endif
#ifdef PLANT_FIELD
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, max(vDepth, 1e-4), -1.0);
#endif
}
`
