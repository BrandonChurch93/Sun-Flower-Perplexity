// From the field shot on the light comes through the crop in patches, most of it round the plant's foot and to its right, and none under the crop itself.
export const fieldLight = { rightM: 0.6, aheadM: 0, reachM: 0.8, underFromM: 1.15, underToM: 1.7 }
export const fieldGate = /* glsl */ `
uniform vec4 uField;
uniform vec4 uStems;
bool fieldOn() {
  return uTime >= uField.x;
}
float stemNear(vec2 p) {
  return min(length(p - uStems.xy), length(p - uStems.zw));
}
`
// How much of the low sun reaches the ground in front of the crop: the field is not in the shadow map, so its long shadow is worked out here.
export const cropLight = /* glsl */ `
${fieldGate}
uniform vec3 uCrop;
float cropLight(vec2 p, float d) {
  if (uCrop.z <= 0.0) return 1.0;
  float toField = -dot(uSunDir.xz, uToward);
  float clear = uCrop.y - max(uCrop.x - d, 0.0) * uSunDir.y / max(toField, 1e-3);
  float shade = uCrop.z * smoothstep(0.0, 0.5 * uCrop.y + 1e-3, clear) * smoothstep(0.0, 0.05, toField);
  vec2 s = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  vec2 q = vec2(dot(p, vec2(-s.y, s.x)) + (valueNoise(p * 0.9 + 5.0) - 0.5) * 0.5, dot(p, s));
  float gap = smoothstep(0.6, 0.85, valueNoise(vec2(q.x * 3.7, q.y * 0.11) + 11.0)) * smoothstep(0.4, 0.8, valueNoise(q * vec2(6.0, 1.9) + 3.0));
  if (fieldOn()) {
    vec2 w = p - uStems.xy;
    vec2 e = vec2(dot(w, vec2(uToward.y, -uToward.x)) - uField.y, -dot(w, uToward) - uField.z) / uField.w;
    float by = exp(-e.x * e.x - 1.6 * e.y * e.y);
    float n = 0.55 * valueNoise(vec2(q.x * 2.3, q.y * 0.7) + 11.0) + 0.45 * valueNoise(vec2(q.x * 6.1, q.y * 2.0) + 3.0);
    gap = 2.1 * smoothstep(0.52, 0.68, n + 0.4 * by - 0.1) * (1.0 - smoothstep(${fieldLight.underFromM.toFixed(2)}, ${fieldLight.underToM.toFixed(2)}, d));
  }
  return 1.0 - shade * (1.0 - 0.4 * gap);
}
`
