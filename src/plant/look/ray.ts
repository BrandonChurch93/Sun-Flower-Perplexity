const RAY_MAP_MEAN = 'vec3(0.72, 0.40, 0.012)'

export const rayMain = /* glsl */ `void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 n = normalize(vNormal);
#ifdef PLANT_FIELD
  bool front = dot(n, view) >= 0.0;
#else
  bool front = gl_FrontFacing;
#endif
  if (!front) n = -n;
#ifndef PLANT_FIELD
  vec3 flatN = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(flatN, n) < 0.0) flatN = -flatN;
  n = normalize(mix(n, flatN, 0.52));
#endif
  float u = vUv.x;
  float across = vUv.y * 2.0 - 1.0;
  float fresh = vState.x;
  float unfolded = vState.y;
#ifndef PLANT_FIELD
  float endAt = 0.8 + 0.2 * hash11(vRay.x * 37.1 + sign(across) * 5.3);
  if (abs(across) > mix(1.0, 0.5, vState.w * smoothstep(endAt - 0.25, endAt, u))) discard;
  if (vRay.x < 0.34) {
    float asym = 0.08 * (hash11(vRay.x * 73.7 + 2.1) - 0.5);
    float cleft = 1.0 - smoothstep(0.0, 0.28, abs(across - asym));
    if (u > mix(1.02, 0.938, unfolded * cleft)) discard;
  }
#endif
  float foot = 1.0 - smoothstep(0.0, 0.30, u);
  float claw = 1.0 - smoothstep(0.0, 0.06, u);
  float midU = smoothstep(0.08, 0.46, u);
  float tipU = smoothstep(0.62, 0.98, u);
  float edgeThin = smoothstep(0.64, 1.0, abs(across)) * smoothstep(0.32, 0.82, u);
  float thinTip = clamp(tipU + 0.28 * edgeThin, 0.0, 1.0);

  vec3 body = mix(vec3(0.68, 0.28, 0.012), vec3(0.77, 0.64, 0.046), midU);
  body = mix(body, vec3(0.87, 0.79, 0.155), thinTip);
  body = mix(body, body * mix(0.88, 1.06, smoothstep(0.0, 0.85, u)), 0.30 * (1.0 - vState.z));
  body = mix(body, mix(vec3(0.33, 0.5, 0.1), vec3(0.17, 0.35, 0.1), smoothstep(0.3, 0.9, u)), 0.95 * fresh);
  float own = hash11(vRay.x * 91.7 + 3.1);
  body *= vec3(0.95 + 0.09 * own, 0.93 + 0.13 * own, 0.92 + 0.16 * own) * (0.88 + 0.20 * hash11(vRay.x * 57.3 + 9.7));
  float pale = max(0.50 * smoothstep(0.58, 1.0, abs(across)), smoothstep(0.64, 0.99, u)) * mix(0.3, 1.0, unfolded);
  body = mix(body, vec3(0.89, 0.82, 0.21), 0.18 * pale * (1.0 - fresh));
  vec3 albedo = mix(body, vec3(0.64, 0.23, 0.008), 0.48 * foot * (1.0 - fresh));
  albedo = mix(albedo, vec3(0.26, 0.33, 0.050), claw);

  vec3 through = mix(vec3(1.24, 0.62, 0.042), vec3(1.62, 1.36, 0.205), midU);
  through = mix(through, vec3(2.78, 2.52, 0.92), thinTip * (0.35 + 0.65 * thinTip));
  through.g *= 0.94 + 0.12 * own;
  through *= mix(vec3(0.56, 0.62, 0.46), vec3(1.0), unfolded);
  through = mix(through, vec3(0.66, 0.9, 0.22), 0.9 * fresh);

  float fold = 1.0 - smoothstep(0.0, 0.07, abs(abs(across) - 0.34));
  float groove = 1.0 - smoothstep(0.0, 0.05, abs(across));
  through *= 1.0 - 0.38 * (fold + groove) * smoothstep(1.0, 0.75, u);
  through *= 1.0 - 0.32 * (1.0 - smoothstep(0.0, 0.07, abs(across))) * (1.0 - vState.z) * (1.0 - fresh);
  float lane = across + 0.11 * sin(across * 4.3 + own * 31.0);
  float lanes = 15.0 + 12.0 * hash11(vRay.x * 23.9 + 1.7);
  float lasts = 0.72 + 0.28 * hash11(vRay.x * 41.3 + 5.9);
  float streak = smoothstep(0.72, 1.0, abs(sin(lane * lanes + own * 6.0))) * (1.0 - smoothstep(lasts - 0.3, lasts, u)) * smoothstep(0.02, 0.2, u) * (0.6 + hash11(vRay.x * 67.1 + 0.3));
  through *= 1.0 - 0.18 * streak * mix(2.0, 1.0, vState.z);
  albedo *= 1.0 - 0.07 * streak;

  Tissue t;
  t.face = n;
#ifdef PLANT_FIELD
  albedo *= vec3(0.95, 0.98, 0.45);
  through *= vec3(1.0, 1.03, 0.45);
  t.normal = n;
  float texels = -1.0;
#else
  vec2 m = vec2(vRay.w + u * 0.84, vRay.y + vRay.z * across * 0.3);
  vec3 tint = texture(uRayColor, m).rgb;
  vec3 data = texture(uRayData, m).rgb;
  vec3 rel = clamp(tint / ${RAY_MAP_MEAN}, 0.45, 1.75);
  rel.b = mix(1.0, rel.b, 0.3);
  albedo *= mix(vec3(1.0), rel, 0.42);
  float vein = data.b;
  through *= (0.68 + 0.64 * data.g) * (1.0 - 0.46 * vein) * mix(0.55, 1.0, unfolded * (1.0 - fresh));
  through.g *= 1.0 - 0.22 * vein;
  float texels = texelDensity(m, uRaySize);
  vec2 step = max(texels, 1.5) / uRaySize;
  float alongSlope = (texture(uRayData, m + vec2(step.x, 0.0)).r - data.r) / step.x * 0.84 * 0.00028;
  float acrossSlope = (texture(uRayData, m + vec2(0.0, step.y)).r - data.r) / step.y * 0.3 * vRay.z * 0.00028;
  float fx = clamp(abs(abs(across) - 0.34) / 0.07, 0.0, 1.0);
  float gx = clamp(abs(across) / 0.05, 0.0, 1.0);
  float foldSlope = -6.0 * fx * (1.0 - fx) / 0.07 * sign(abs(across) - 0.34) * sign(across);
  float grooveSlope = -6.0 * gx * (1.0 - gx) / 0.05 * sign(across);
  acrossSlope += (foldSlope - 0.7 * grooveSlope) * smoothstep(1.0, 0.75, u) * 0.00034;
  acrossSlope += cos(lane * (0.6 * lanes) + own * 6.0) * 0.016 * (0.6 + hash11(vRay.x * 13.7 + 2.9)) * (1.0 - 0.7 * vState.z) * smoothstep(0.02, 0.2, u) * (1.0 - smoothstep(lasts - 0.3, lasts, u));
  float side = front ? 1.0 : -1.4;
  vec3 wx = dFdx(vWorld);
  vec3 wy = dFdy(vWorld);
  vec3 r1 = cross(wy, n);
  vec3 r2 = cross(n, wx);
  float det = dot(wx, r1);
  vec3 grad = (r1 * dFdx(u) + r2 * dFdy(u)) * alongSlope + (r1 * dFdx(across) + r2 * dFdy(across)) * acrossSlope;
  t.normal = normalize(abs(det) * n - sign(det) * side * grad);
#endif
  if (!front) albedo = mix(albedo, vec3(0.72, 0.68, 0.115), 0.36 * (1.0 - fresh)) * 0.97;
  t.albedo = albedo;
  t.through = through;
  t.rough = front ? 0.84 : 0.78;
  t.wax = front ? 0.20 : 0.09;
  t.sheen = front ? 0.12 : 0.18 + 0.25 * foot;
  float valley = (1.0 - smoothstep(0.0, 0.2, abs(across))) + 0.55 * smoothstep(0.62, 0.95, abs(across));
  float creased = smoothstep(1.0, 0.7, u) * (front ? 1.0 : 0.5);
  t.albedo *= mix(vec3(1.0), vec3(0.86, 0.84, 0.68), 0.50 * valley * creased);
  float beside = smoothstep(0.3, 0.38, abs(across)) * (1.0 - smoothstep(0.42, 0.8, abs(across)));
  float seam = max(smoothstep(0.9, 1.0, abs(across)), beside) * fresh * smoothstep(1.0, 0.6, u);
  t.albedo *= (1.0 - 0.55 * seam) * (1.0 + 0.45 * fresh * (1.0 - smoothstep(0.08, 0.34, abs(across))));
  t.through *= 1.0 - 0.85 * seam;
  t.occlusion = (1.0 - 0.65 * seam) * mix(0.55, 1.0, smoothstep(0.0, 0.28, u)) * mix(0.65, 1.0, unfolded) * (1.0 - 0.34 * valley * creased) * (1.0 - 0.2 * fold * creased);
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, vDepth, texels);
}
`
