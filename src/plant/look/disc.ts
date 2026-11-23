export const floretMain = /* glsl */ `void main() {
  vec3 toCam = uCamPos - vWorld;
  vec3 view = length(toCam) > 1e-6 ? normalize(toCam) : vec3(0.0, 0.0, 1.0);
  vec3 face = length(vNormal) > 1e-6 ? normalize(vNormal) : view;
  if (dot(face, view) < 0.0) face = -face;
  float piece = vInfo.x;
  float along = saturate(vInfo.y);
  float around = clamp(vInfo.z, -1.0, 1.0);
  float occ = saturate(vInfo.w);
  float open = saturate(vState.x);
  float rho = saturate(vState.y);
  float seed = saturate(vState.z);
  float swell = saturate(vState.w);
  float style = saturate(vMore.x);
  float pxSize = max(vMore.y, 1e-5);
  float seedW = saturate(vMore.z);
  float blotch = clamp(vMore.w, -1.0, 1.0);
  float fine = saturate(0.0011 / pxSize - 0.6);
  float coarse = smoothstep(0.0007, 0.0022, pxSize);
  float grain = mix(0.5, valueNoise(vec2(around * 4.0 + seed * 61.0, along * 9.0 + seedW * 37.0)), fine);

  float ripe = saturate(vKind.x);
  float lump = saturate(vKind.y);
  float kindTone = clamp(vKind.z, 0.68, 1.32);
  float h1 = saturate(vKind.w);
  float under = saturate(vUnder);
  float tone = mix(0.78 + 0.38 * kindTone, 0.62 + 0.48 * kindTone, ripe) * (1.0 + 0.16 * blotch);
  float centre = 1.0 - smoothstep(0.36, 0.68, rho);
  float deep = smoothstep(0.22, 0.9, rho);

  float lit = 1.0;
  Tissue t;
  t.through = vec3(0.0);
  t.rough = 0.72;
  t.wax = 0.24;
  t.sheen = 0.14;
  vec3 pollen = mix(vec3(0.92, 0.76, 0.18) * (0.84 + 0.30 * h1), vec3(1.0, 0.90, 0.40), smoothstep(0.42, 0.88, h1));

  if (piece < 0.5) {
    float ridge = (0.42 + 0.58 * around * around) * smoothstep(0.22, 0.74, along);
    vec3 dark = mix(vec3(0.095, 0.058, 0.015), vec3(0.078, 0.105, 0.024), centre);
    vec3 pale = mix(vec3(0.24, 0.16, 0.038), vec3(0.33, 0.35, 0.068), centre);
    vec3 ochre = vec3(0.25, 0.155, 0.036);
    dark = mix(dark, ochre * 0.55, swell * (1.0 - centre));
    pale = mix(pale, ochre, swell * (1.0 - centre));
    vec3 closed = mix(dark, pale, ridge) * (1.0 + 0.28 * smoothstep(0.76, 1.0, along));
    closed = mix(closed, vec3(0.45, 0.43, 0.082), centre * smoothstep(0.70, 1.0, along) * (0.36 + 0.28 * h1));
    vec3 young = mix(vec3(0.026, 0.046, 0.011), vec3(0.24, 0.30, 0.065), ridge);
    young = mix(young, vec3(0.40, 0.44, 0.095), smoothstep(0.70, 1.0, along) * (0.52 + 0.35 * h1));
    closed = mix(young * mix(0.90, 1.04, deep), closed, ripe) * tone;
    vec3 flower = mix(vec3(0.072, 0.036, 0.011), vec3(0.145, 0.078, 0.022), smoothstep(0.26, 0.72, along));
    flower = mix(flower, vec3(0.042, 0.018, 0.005), smoothstep(0.78, 1.0, along) * 0.75);
    flower = mix(flower, pollen, 0.20 * smoothstep(0.58, 0.80, grain) * smoothstep(0.72, 1.0, along));
    float bloom = smoothstep(0.05, 0.58, open);
    t.albedo = mix(closed, flower * (0.82 + 0.36 * seed), bloom);
    t.through = mix(vec3(0.045, 0.074, 0.016) * smoothstep(0.42, 1.0, along), vec3(0.12, 0.062, 0.013) * smoothstep(0.56, 0.86, along), bloom);
    t.wax = mix(0.26, 0.05, bloom);
    t.sheen = mix(0.16, 0.05, bloom);
  } else if (piece < 1.5) {
    float laden = smoothstep(0.22, 0.60, lump + 0.35 * seed) * (1.0 - 0.56 * style);
    laden *= mix(1.0, smoothstep(0.48, 0.70, h1), smoothstep(0.90, 0.935, rho));
    float clot = valueNoise(vec2(around * 2.3 + seed * 17.0, along * 3.1 + seedW * 23.0));
    float dust = smoothstep(0.40, 0.64, along + 0.30 * (grain - 0.5) + 0.25 * lump) * laden;
    dust = max(dust, 0.48 * smoothstep(0.60, 0.80, grain) * fine * laden);
    dust *= (1.0 - 0.20 * coarse) * (0.55 + 0.45 * smoothstep(0.24, 0.60, clot));
    vec2 crumb = vec2(around * 13.0 + seed * 29.0, along * 7.0 + seedW * 41.0);
    vec3 turnBy = vec3(valueNoise(crumb), valueNoise(crumb + 17.3), valueNoise(crumb + 41.7)) - 0.5;
    float crumbs = (1.0 - 0.65 * coarse) * dust;
    vec3 bent = face + turnBy * 1.15 * crumbs;
    face = length(bent) > 1e-6 ? normalize(bent) : face;
    if (dot(face, view) < 0.0) face = -face;
    float gap = mix(1.0, 0.62 + 0.78 * valueNoise(crumb * 1.7 + 5.1), crumbs);
    vec3 grains = mix(pollen, vec3(1.0, 0.92, 0.48), smoothstep(0.56, 0.80, valueNoise(crumb * 1.3 + 9.1)) * crumbs);
    t.albedo = mix(vec3(0.10, 0.048, 0.014) * (0.75 + 0.5 * grain), grains * (0.90 + 0.26 * grain) * gap, dust);
    lit = 1.0 - 0.15 * dust;
    t.rough = mix(0.72, 0.95, dust);
    t.wax = mix(0.06, 0.0, dust);
    t.sheen = mix(0.05, 0.28, dust);
    t.through = pollen * dust * mix(0.48, 0.82, smoothstep(0.35, 0.88, h1));
  } else if (piece < 2.5) {
    float gold = smoothstep(0.32, 0.76, seed) * (0.55 + 0.45 * grain);
    t.albedo = mix(vec3(0.32, 0.19, 0.035), pollen, gold);
    t.through = mix(vec3(0.16, 0.09, 0.018), vec3(0.52, 0.42, 0.11), gold);
    lit = 0.85;
    t.rough = 0.95;
    t.wax = 0.0;
    t.sheen = 0.28;
  } else {
    vec3 young = mix(vec3(0.046, 0.082, 0.019), vec3(0.33, 0.40, 0.088), along);
    vec3 green = mix(vec3(0.11, 0.062, 0.016), mix(vec3(0.085, 0.088, 0.018), mix(vec3(0.20, 0.145, 0.032), vec3(0.25, 0.28, 0.050), centre), along), open);
    vec3 dry = vec3(0.17, 0.095, 0.022);
    vec3 grownUp = mix(green, dry, smoothstep(0.55, 1.0, along) * (1.0 - open));
    t.albedo = mix(young * mix(0.88, 1.02, deep), grownUp, ripe) * (0.88 + 0.24 * around) * tone;
    t.through = mix(vec3(0.08, 0.13, 0.028), vec3(0.11, 0.075, 0.016), ripe) * smoothstep(0.35, 1.0, along);
    t.sheen = 0.34;
  }

  t.albedo = mix(t.albedo, t.albedo * 0.55, uPlantWet);
  t.wax = mix(t.wax, 0.9, uPlantWet);
  t.albedo = mix(t.albedo, vec3(0.82, 0.86, 0.9), uPlantFrost * 0.6 * saturate(face.y * 0.5 + 0.6));
  t.face = face;
  t.normal = face;
  t.albedo *= 1.0 - 0.35 * under;
  t.albedo = clamp(t.albedo, vec3(0.0), vec3(1.0));
  t.through = clamp(t.through, vec3(0.0), vec3(1.0));
  t.rough = clamp(t.rough, 0.05, 1.0);
  t.occlusion = occ;
  float seen = (0.35 + 0.65 * smoothstep(0.1, 0.7, occ)) * (1.0 - 0.8 * coarse);
  t.wax = saturate(t.wax * seen);
  t.sheen = saturate(t.sheen * seen);
  vec3 rayDir = length(vRays.xyz) > 1e-6 ? normalize(vRays.xyz) : face;
  float rayAmt = saturate(vRays.w);
  float toRays = saturate(0.45 + 0.55 * dot(face, rayDir));
  vec3 fromRays = uSunColor * vec3(1.0, 0.68, 0.16) * (RAY_LIGHT * lit * rayAmt * toRays * (0.28 + 0.72 * occ));
  vec3 ownAlbedo = t.albedo * plantTone();
  vec3 shaded = shadeTissue(t, vWorld, view) + ownAlbedo * fromRays;
  vec3 ownSky = max(skyAmbient(face), skyAmbient(vec3(0.0, 1.0, 0.0)));
  vec3 ownCap = (ownAlbedo * 1.25 + t.through * plantTone() + vec3(0.28 * t.wax + 0.08 * t.sheen)) * (uSunColor + ownSky * 2.2) + ownAlbedo * fromRays;
  shaded = clamp(shaded, vec3(0.0), ownCap);
  outColor = finish(shaded, vWorld, max(vDepth, 1e-4), -1.0);
}
`
