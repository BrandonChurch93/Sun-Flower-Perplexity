// From the field shot on the light comes through the crop in patches, most of it round the plant's foot and to its right, and none under the crop itself.
// What comes through is share of the open sun; each stem throws a shadow stemM wide at its foot, wider by stemSpread for each meter, that fades over stemReachM.
export const fieldLight = { share: 0.6, stemM: 0.03, stemSpread: 0.025, stemReachM: 1.6, rightM: 0.55, aheadM: 0, reachM: 0.65, underFromM: 1.15, underToM: 1.7 }
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
  if (fieldOn()) gap = 0.0;
  return 1.0 - shade * (1.0 - 0.4 * gap);
}
float stemShadow(vec2 w, vec2 s) {
  float along = -dot(w, s);
  float across = dot(w, vec2(-s.y, s.x));
  float wide = ${fieldLight.stemM.toFixed(3)} + ${fieldLight.stemSpread.toFixed(3)} * max(along, 0.0);
  return 0.9 * smoothstep(-0.03, 0.02, along) * exp(-across * across / (wide * wide)) * exp(-max(along, 0.0) / ${fieldLight.stemReachM.toFixed(2)});
}
float fieldPatch(vec2 p, float d) {
  if (!fieldOn() || uCrop.z <= 0.0) return 0.0;
  vec2 s = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  vec2 q = vec2(dot(p, vec2(-s.y, s.x)) + (valueNoise(p * 0.9 + 5.0) - 0.5) * 0.5, dot(p, s));
  vec2 w = p - uStems.xy;
  vec2 e = vec2(dot(w, vec2(uToward.y, -uToward.x)) - uField.y, -dot(w, uToward) - uField.z) / uField.w;
  float by = exp(-e.x * e.x - 1.6 * e.y * e.y);
  float n = 0.55 * valueNoise(vec2(q.x * 2.3, q.y * 0.7) + 11.0) + 0.45 * valueNoise(vec2(q.x * 6.1, q.y * 2.0) + 3.0);
  float through = smoothstep(0.5, 0.74, n + 0.45 * by - 0.17) * (1.0 - smoothstep(${fieldLight.underFromM.toFixed(2)}, ${fieldLight.underToM.toFixed(2)}, d));
  return ${fieldLight.share.toFixed(2)} * uCrop.z * through * (1.0 - stemShadow(w, s)) * (1.0 - stemShadow(p - uStems.zw, s));
}
`
