// How much of the low sun reaches the ground in front of the crop: the field is not in the shadow map, so its long shadow is worked out here.
export const cropLight = /* glsl */ `
uniform vec3 uCrop;
float cropLight(vec2 p, float d) {
  if (uCrop.z <= 0.0) return 1.0;
  float toField = -dot(uSunDir.xz, uToward);
  float clear = uCrop.y - max(uCrop.x - d, 0.0) * uSunDir.y / max(toField, 1e-3);
  float shade = uCrop.z * smoothstep(0.0, 0.5 * uCrop.y + 1e-3, clear) * smoothstep(0.0, 0.05, toField);
  vec2 s = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  vec2 q = vec2(dot(p, vec2(-s.y, s.x)) + (valueNoise(p * 0.9 + 5.0) - 0.5) * 0.5, dot(p, s));
  float gap = smoothstep(0.6, 0.85, valueNoise(vec2(q.x * 3.7, q.y * 0.11) + 11.0)) * smoothstep(0.4, 0.8, valueNoise(q * vec2(6.0, 1.9) + 3.0));
  return 1.0 - shade * (1.0 - 0.4 * gap);
}
`
