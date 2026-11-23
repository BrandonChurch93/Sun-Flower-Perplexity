// What a floret's skin reads, from the vertex shader in src/plant/head/disc/shaders.ts: vWorld, vNormal, vDepth, vInfo, vState, vMore, vKind, vUnder, vRays, and RAY_LIGHT. Whoever needs to change the list writes to the other owner first.
export const floretMain = /* glsl */ `void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  if (dot(face, view) < 0.0) face = -face;
  float piece = vInfo.x;
  float along = vInfo.y;
  float around = vInfo.z;
  float open = vState.x;
  float rho = vState.y;
  float seed = vState.z;
  float swell = vState.w;
  // Fine marks fade once a pixel is wider than they are.
  float fine = saturate(0.0011 / max(vMore.y, 1e-6) - 0.6);
  float coarse = smoothstep(0.0007, 0.002, vMore.y);
  float grain = mix(0.5, valueNoise(vec2(around * 4.0 + seed * 61.0, along * 9.0 + vMore.z * 37.0)), fine);

  float ripe = vKind.x;
  float tone = mix(vKind.z, 0.4 + 0.6 * vKind.z, vKind.x) * (1.0 + 0.25 * vMore.w);
  float centre = 1.0 - smoothstep(0.3, 0.8, rho);
  // While the disc is young its middle is the darkest part.
  float deep = smoothstep(0.3, 0.95, rho);

  float lit = 1.0;
  Tissue t;
  t.through = vec3(0.0);
  t.rough = 0.7;
  t.wax = 0.3;
  t.sheen = 0.15;
  vec3 pollen = mix(vec3(0.62, 0.29, 0.033) * (0.7 + 0.6 * vKind.w), vec3(0.8, 0.56, 0.2), smoothstep(0.72, 0.92, vKind.w));

  if (piece < 0.5) {
    // A shut bud is pale on its crown and dark down its sides, so each one reads as a round bead.
    float ridge = (0.5 + 0.5 * around * around) * smoothstep(mix(0.3, 0.18, ripe), mix(0.85, 0.75, ripe), along);
    vec3 dark = mix(vec3(0.3, 0.08, 0.008), vec3(0.16, 0.21, 0.065), centre);
    vec3 pale = mix(vec3(0.29, 0.128, 0.018), vec3(0.24, 0.31, 0.095), centre);
    float olive = 4.0 * centre * (1.0 - centre);
    dark += vec3(0.03, 0.01, 0.0) * olive;
    pale += vec3(0.06, 0.02, 0.0) * olive;
    vec3 ochre = vec3(0.31, 0.12, 0.015);
    dark = mix(dark, ochre * 0.6, swell * (1.0 - centre));
    pale = mix(pale, ochre, swell * (1.0 - centre));
    vec3 closed = mix(dark, pale, ridge) * (1.0 + 0.35 * smoothstep(0.8, 1.0, along));
    vec3 young = mix(vec3(0.06, 0.12, 0.028), vec3(0.17, 0.275, 0.062), ridge);
    young = mix(young, vec3(0.3, 0.43, 0.11), smoothstep(0.7, 1.0, along) * (0.5 + 0.3 * vKind.w));
    closed = mix(young * mix(0.8, 1.0, deep), closed, ripe) * tone;
    vec3 flower = mix(vec3(0.14, 0.064, 0.018), vec3(0.22, 0.11, 0.03), smoothstep(0.3, 0.7, along));
    flower = mix(flower, vec3(0.07, 0.018, 0.004), smoothstep(0.78, 1.0, along) * 0.85);
    flower = mix(flower, pollen, 0.25 * smoothstep(0.55, 0.75, grain) * smoothstep(0.5, 1.0, along));
    float bloom = smoothstep(0.05, 0.6, open);
    t.albedo = mix(closed, flower * (0.8 + 0.4 * seed), bloom);
    t.through = vec3(0.16, 0.065, 0.01) * bloom * smoothstep(0.6, 0.8, along);
    t.wax = mix(0.3, 0.04, bloom);
    t.sheen = mix(0.15, 0.04, bloom);
  } else if (piece < 1.5) {
    // A share of the florets have shed their pollen or not yet pushed it out: dark spikes among the lumps.
    float laden = smoothstep(0.04, 0.22, vKind.y + 0.25 * seed) * (1.0 - 0.9 * vMore.x);
    laden *= mix(1.0, smoothstep(0.5, 0.7, vKind.w), smoothstep(0.885, 0.915, rho));
    float clot = valueNoise(vec2(around * 2.3 + seed * 17.0, along * 3.1 + vMore.z * 23.0));
    float dust = smoothstep(0.38, 0.62, along + 0.4 * (grain - 0.5) + 0.3 * vKind.y) * laden;
    dust = max(dust, 0.5 * smoothstep(0.62, 0.8, grain) * fine * laden);
    dust *= (1.0 - 0.6 * coarse) * (0.45 + 0.55 * smoothstep(0.25, 0.6, clot));
    // The pollen stands in crumbs: the knob's face is turned this way and that, and the gaps between crumbs are dark.
    vec2 crumb = vec2(around * 13.0 + seed * 29.0, along * 7.0 + vMore.z * 41.0);
    vec3 turnBy = vec3(valueNoise(crumb), valueNoise(crumb + 17.3), valueNoise(crumb + 41.7)) - 0.5;
    float crumbs = (1.0 - coarse) * dust;
    face = normalize(face + turnBy * 1.5 * crumbs);
    float gap = mix(1.0, 0.45 + 1.1 * valueNoise(crumb * 1.7 + 5.1), crumbs);
    vec3 grains = mix(pollen, vec3(0.8, 0.58, 0.22), smoothstep(0.62, 0.8, valueNoise(crumb * 1.3 + 9.1)) * crumbs);
    t.albedo = mix(vec3(0.15, 0.055, 0.012) * (0.7 + 0.6 * grain), grains * (0.8 + 0.4 * grain) * gap, dust);
    lit = 1.0 - 0.35 * dust;
    t.rough = mix(0.7, 1.0, dust);
    t.wax = mix(0.06, 0.0, dust);
    t.sheen = mix(0.05, 0.25, dust);
    t.through = pollen * dust * mix(0.12, 0.4, smoothstep(0.72, 0.92, vKind.w));
  } else if (piece < 2.5) {
    t.albedo = mix(vec3(0.7, 0.36, 0.04), pollen, 0.5 * grain);
    t.through = vec3(0.3, 0.145, 0.015);
    lit = 0.6;
    t.rough = 1.0;
    t.wax = 0.0;
    t.sheen = 0.25;
  } else {
    vec3 young = mix(vec3(0.09, 0.17, 0.045), vec3(0.3, 0.42, 0.1), along);
    vec3 green = mix(vec3(0.2, 0.085, 0.014), mix(vec3(0.105, 0.105, 0.014), mix(vec3(0.26, 0.16, 0.02), vec3(0.15, 0.245, 0.04), centre), along), open);
    vec3 dry = vec3(0.22, 0.075, 0.012);
    vec3 grownUp = mix(green, dry, smoothstep(0.55, 1.0, along) * (1.0 - open));
    t.albedo = mix(young * mix(0.6, 1.0, deep), grownUp, ripe) * (0.85 + 0.3 * around) * tone;
    t.through = mix(vec3(0.1, 0.16, 0.025), vec3(0.14, 0.09, 0.012), ripe);
    t.sheen = 0.4;
  }

  t.albedo = mix(t.albedo, t.albedo * 0.55, uPlantWet);
  t.wax = mix(t.wax, 0.9, uPlantWet);
  t.albedo = mix(t.albedo, vec3(0.82, 0.86, 0.9), uPlantFrost * 0.6 * saturate(face.y * 0.5 + 0.6));
  t.face = face;
  t.normal = face;
  // The outermost rows sit in the shade of the ray feet.
  t.albedo *= 1.0 - 0.6 * vUnder;
  t.occlusion = vInfo.w;
  // Deep between the florets no sky is mirrored.
  // Nor on anything finer than a pixel, where a mirror would only sparkle.
  float seen = (0.35 + 0.65 * smoothstep(0.1, 0.7, vInfo.w)) * (1.0 - 0.8 * coarse);
  t.wax *= seen;
  t.sheen *= seen;
  float toRays = saturate(0.42 + 0.58 * dot(face, vRays.xyz));
  vec3 fromRays = uSunColor * vec3(1.0, 0.62, 0.1) * (RAY_LIGHT * lit * vRays.w * toRays * (0.25 + 0.75 * vInfo.w));
  outColor = finish(shadeTissue(t, vWorld, view) + t.albedo * plantTone() * fromRays, vWorld, vDepth, -1.0);
}
`
