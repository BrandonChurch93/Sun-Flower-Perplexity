// The leaf's stalk reads vWorld, vNormal, vDepth, vUv (x round the stalk from 0 to 1, y along it in meters, under 0 where it runs on as the midrib of the blade) and the tissue text.
export const stalkMain = /* glsl */ `void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  if (dot(face, view) < 0.0) face = -face;
  float ribs = 0.5 + 0.5 * sin(vUv.x * 6.2832 * 9.0);
  float streak = valueNoise(vec2(vUv.x * 30.0, vUv.y * 140.0));
  Tissue t;
  t.albedo = mix(vec3(0.06, 0.09, 0.012), vec3(0.14, 0.185, 0.025), 0.45 * ribs + 0.55 * streak);
  t.through = vec3(0.012, 0.018, 0.003);
  t.face = face;
  t.normal = reliefNormal(face, vWorld, 0.00025 * ribs, 1.0);
  t.rough = 0.78;
  t.wax = 0.2;
  t.sheen = mix(0.9, 0.2, smoothstep(0.01, -0.01, vUv.y));
  t.occlusion = 1.0;
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, vDepth, -1.0);
}
`

// The stand-in colors of each part of a sunflower, shared with the neighbors in the field.
export const plantColorGlsl = /* glsl */ `
uniform float uPale;
uniform float uBloom;
void plantColor(int part, vec2 uv, float seed, bool front, out vec3 albedo, out vec3 through) {
  through = vec3(0.0);
  if (part == 0) {
    float streak = fbm(vec2(uv.x * 9.0, uv.y * 60.0));
    albedo = mix(vec3(0.2, 0.32, 0.08), vec3(0.42, 0.5, 0.2), streak);
    albedo = mix(albedo, vec3(0.78, 0.7, 0.5), uPale * 0.85);
  } else if (part == 1 || part == 2) {
    float across = abs(uv.x - 0.5) * 2.0;
    float side = abs(fract(uv.y * 7.0 + across * 1.6 + seed) - 0.5) * 2.0;
    float vein = max(smoothstep(0.1, 0.0, across), 0.6 * smoothstep(0.12, 0.0, side) * smoothstep(1.0, 0.2, across));
    if (part == 2) vein *= 0.25;
    float mottle = fbm(uv * vec2(14.0, 30.0) + seed * 40.0);
    albedo = mix(vec3(0.1, 0.24, 0.04), vec3(0.24, 0.4, 0.09), mottle);
    if (part == 2) albedo = mix(albedo * 1.5, vec3(0.7, 0.72, 0.35), uPale * 0.7);
    albedo = mix(albedo, vec3(0.34, 0.46, 0.16), vein * (front ? 0.5 : 0.9));
    through = mix(vec3(0.5, 0.78, 0.08), vec3(0.16, 0.34, 0.02), vein) * (0.75 + 0.5 * mottle);
  } else if (part == 3) {
    float stripe = smoothstep(0.35, 0.65, abs(fract(uv.x * 4.0) - 0.5) * 2.0);
    albedo = mix(vec3(0.03, 0.028, 0.025), vec3(0.5, 0.47, 0.4), stripe);
  } else if (part == 4) {
    float ring = uv.y;
    vec3 bud = mix(vec3(0.14, 0.26, 0.07), vec3(0.3, 0.42, 0.14), fbm(uv * vec2(18.0, 12.0)));
    vec3 face = mix(vec3(0.36, 0.3, 0.05), vec3(0.2, 0.1, 0.03), smoothstep(0.62, 0.98, ring));
    face = mix(face, vec3(0.5, 0.36, 0.05), smoothstep(0.75, 0.6, ring) * 0.6);
    face *= 0.75 + 0.5 * fbm(uv * vec2(60.0, 40.0));
    albedo = mix(bud, face, uBloom * smoothstep(0.4, 0.56, ring));
  } else if (part == 5) {
    albedo = mix(vec3(0.12, 0.25, 0.06), vec3(0.26, 0.4, 0.12), fbm(uv * vec2(6.0, 14.0) + seed * 30.0));
    through = vec3(0.3, 0.5, 0.06);
  } else {
    float line = abs(fract(uv.x * 5.0 + seed) - 0.5) * 2.0;
    albedo = mix(vec3(0.95, 0.6, 0.03), vec3(1.0, 0.78, 0.08), smoothstep(0.0, 1.0, uv.y)) * (0.86 + 0.14 * line);
    through = vec3(1.0, 0.62, 0.04);
  }
}
`
