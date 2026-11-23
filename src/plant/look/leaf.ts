// What this text reads, and what the leaves give it. Whoever needs to change the list writes to the other owner first.
// Per pixel, from the blade's vertex shader in src/plant/leaves/shaders.ts:
//   vWorld   the place in the world, in meters
//   vNormal  the blade's normal in the world, not of unit length, not turned to the eye
//   vUv      x across the blade from -1 at one margin over 0 at the midrib to 1, y along it from 0 at the base to 1 at the tip
//   vLeaf    x the leaf's number, y which of the three vein drawings, z the leaf's own number from 0 to 1, w 1 or -1 where the drawing is mirrored
//   vPlane   the blade laid flat, in meters
//   vMark    x the level under which the marks map cuts a hole, y how much nearer the margin it cuts, z the damage (0 none, 1 a dry tip, 1.14 a dry tip on a withered leaf, 2 a tear), w how marked an old leaf is
//   vState   x the leaf's length in meters, y how yellow, z how folded, w how aged (under 0 on the first pair while it opens)
//   vRipe    0 a young leaf, 1 a grown one
//   vCut, vKey  the teeth of the margin, for serration(vUv, vKey, vCut) only
//   vDepth   meters from the lens
// Once a frame, from src/plant/leaves/index.ts:
//   uVeins, uDetail, uMarks  the three maps, uDetailSize the detail map's size in texels, uVeinPad the padding round each vein drawing
//   uGlow    how much light a blade passes at this hour of the plant (0.1 on a neighbor)
//   uFresh   1 while the first pair opens, 0 after
//   uWarm    declared, not read
// From the tissue text (src/plant/surface/index.ts): uCamPos, uSunDir, saturate, texelDensity, reliefNormal, shadeTissueAt, finish, the Tissue it fills, outColor.
// The holes, the tear and the teeth are thrown away here and in bladeDepth alike: hole, tear and bay must stay as they are, or the shadow no longer fits the leaf.
const DETAIL_MEAN = 'vec3(0.163, 0.269, 0.111)'

export const leafMain = /* glsl */ `// The short stiff hairs of a blade's upper face, at 'p' on the flat blade in meters: x the share of the pixel that is hair, y the share that is its dark foot. They lean toward the tip and fade where the pixel is too coarse to draw them.
float bladeHash(vec2 c, float key) {
  highp uvec2 q = uvec2(ivec2(c) + 65536);
  highp uint n = (q.x * 1597334677u) ^ (q.y * 3812015801u) ^ uint(key * 4095.0);
  n = (n ^ (n >> 16u)) * 2246822519u;
  n = (n ^ (n >> 13u)) * 3266489917u;
  return float(n ^ (n >> 16u)) / 4294967296.0;
}

vec2 bladeHairs(vec2 p, float key) {
  const float CELL = 0.0007;
  float px = max(0.7 * length(fwidth(p)), 1e-8);
  float shown = smoothstep(2.0, 5.0, 0.6 * CELL / px);
  vec2 hair = vec2(0.0);
  if (shown <= 0.0) return hair;
  vec2 id = floor(p / CELL);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = id + vec2(float(i), float(j));
      float h0 = bladeHash(c, key);
      if (h0 > 0.7) continue;
      float h1 = bladeHash(c + 0.5, key);
      float h2 = bladeHash(c + 0.25, key);
      float h3 = bladeHash(c + 0.75, key);
      vec2 foot = (c + vec2(0.1 + 0.8 * h1, 0.1 + 0.8 * h2)) * CELL;
      float ang = 1.5708 + 0.7 * (h3 - 0.5);
      vec2 dir = vec2(cos(ang), sin(ang));
      float len = CELL * (0.45 + 0.5 * h0 / 0.7);
      vec2 d = p - foot;
      float along = clamp(dot(d, dir) / len, 0.0, 1.0);
      float w = 0.000016 * (1.0 - 0.75 * along);
      float dist = length(d - dir * (along * len));
      hair.x = max(hair.x, (1.0 - smoothstep(0.0, w + px, dist)) * min(1.0, 2.0 * w / (w + px)) * (0.5 + 0.5 * along));
      float fw = 0.000035;
      hair.y = max(hair.y, (1.0 - smoothstep(0.0, fw + px, length(d))) * min(1.0, 2.0 * fw / (fw + px)));
    }
  }
  return hair * shown;
}

void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  bool top = gl_FrontFacing;
  if (!top) face = -face;

  vec2 a = vec2(vUv.x * vLeaf.w * 0.5 + 0.5, vUv.y);
  vec4 vein = texture(uVeins, vec2((vLeaf.y + uVeinPad + (1.0 - 2.0 * uVeinPad) * a.x) / 3.0, a.y));
  vec2 dUv = vPlane * 7.0 + vec2(vLeaf.z * 7.0, vLeaf.z * 13.0);
  vec3 detail = texture(uDetail, dUv).rgb;
  vec4 mark = texture(uMarks, vPlane * 8.0 + vec2(vLeaf.z * 31.0, vLeaf.z * 17.0));

  float edge = smoothstep(0.62, 1.0, abs(vUv.x));
  float hole = mark.r + vMark.y * edge - vMark.x - 0.3 * (1.0 - vState.w);
  float tear = -1.0;
  if (vMark.z > 1.5 && vUv.x > 0.0) tear = (vUv.x - 0.42) * 0.085 - abs(vUv.y - 0.5 - 0.1 * (vUv.x - 1.0) + 0.02 * (mark.g - 0.5));
  float scar = max(smoothstep(-0.05, -0.008, hole), smoothstep(-0.012, -0.002, tear));
  float dryFrom = 0.8 - (vMark.z - 1.0);
  float dry = vMark.z > 0.5 && vMark.z < 1.5 ? smoothstep(dryFrom, dryFrom + 0.13, vUv.y + 0.1 * (mark.g - 0.5) + 0.25 * (vMark.z - 1.0) * abs(vUv.x)) * vState.w : 0.0;
  float speck = smoothstep(0.74, 0.82, mark.b) * smoothstep(0.5, 0.7, mark.g) * vMark.w * vState.w;
  float brown = max(max(scar, dry), speck);
  float yellow = saturate(vState.y * (0.35 + 1.3 * mark.g) + 0.4 * smoothstep(-0.07, -0.02, hole) * (1.0 - scar) + 0.7 * smoothstep(0.7, 0.86, vUv.y + 0.1 * (mark.g - 0.5)) * step(0.5, vMark.z) * step(vMark.z, 1.5));

  vec3 var = detail / ${DETAIL_MEAN};
  float lum = dot(var, vec3(0.3, 0.6, 0.1));
  float tone = 0.86 + 0.28 * mark.g;
  // The small net of veins between the side veins: pale lines on the face, dark lines in the glow.
  float net = smoothstep(1.02, 1.45, lum);
  // The same net read at the size it was photographed: the smallest veinlets and the cells they close, 2 to 3 mm across.
  vec2 fUv = vPlane * 16.0 + vec2(vLeaf.z * 11.0, vLeaf.z * 5.0);
  float fine = dot(texture(uDetail, fUv, -1.0).rgb, vec3(0.3, 0.6, 0.1)) / dot(vec3(${DETAIL_MEAN}), vec3(0.3, 0.6, 0.1));
  float cells = smoothstep(0.96, 1.25, fine);
  // Its relief is read a mip coarser: a height finer than about three pixels would print the screen's blocks of two by two.
  float fineHeight = dot(texture(uDetail, fUv, 0.6).rgb, vec3(0.3, 0.6, 0.1)) / dot(vec3(${DETAIL_MEAN}), vec3(0.3, 0.6, 0.1));

  vec3 upper = vec3(0.041, 0.1, 0.016) * mix(vec3(1.0), var, 0.85) * tone;
  // Close by the midrib and the side veins read as pale lines.
  float near = 1.0 - smoothstep(0.3, 0.7, vDepth);
  upper = mix(upper, mix(vec3(0.1, 0.16, 0.085), vec3(0.15, 0.22, 0.1), near), (0.85 * vein.r + 0.45 * vein.b) * (0.4 + 0.6 * vRipe) * (1.0 + 0.3 * near));
  vec3 under = vec3(0.07, 0.115, 0.03) * mix(vec3(1.0), var, 0.55) * tone;
  under = mix(under, vec3(0.11, 0.15, 0.08), 0.7 * vein.r + 0.35 * vein.b);
  // A young leaf is a paler, fresher green than a grown one.
  float grain = 0.5 + 0.5 * vRipe;
  vec3 albedo = (top ? upper * (1.0 + (0.6 * net + 1.1 * cells) * grain) : under * (1.0 + (0.8 * net + 0.8 * cells) * grain)) * 1.2 * mix(top ? vec3(1.15, 1.2, 0.8) : vec3(0.9, 1.0, 0.85), vec3(1.0), vRipe);
  albedo = mix(albedo, vec3(0.2, 0.17, 0.04) * (0.7 + 0.3 * lum), yellow * 0.85);
  albedo = mix(albedo, vec3(0.085, 0.05, 0.02) * (0.6 + 0.4 * lum), brown);

  // With the sun behind it the blade glows yellow green, unevenly, and its veins stand dark in the glow: they are thick and hold the light back.
  float thick = saturate((0.97 - vein.g) * 3.0);
  // A blade is thickest at its base and along the midrib and thins toward the tip and the margin.
  float taper = mix(0.2, 2.4, smoothstep(0.35, 0.95, vUv.y + 0.25 * abs(vUv.x) + 0.12 * (mark.g - 0.5)));
  float sheer = smoothstep(0.5, 0.92, mark.g);
  // A young blade lets the light through evenly: the thin patches come with age.
  float thin = (0.36 + mix(0.3, 0.2 + 0.6 * smoothstep(0.35, 0.85, mark.g), vRipe) + 0.7 * sheer * (0.15 + 0.85 * vRipe)) * taper * uGlow;
  // A leaf holds back red: what comes through is a deep green, gold at the rim and the tip of a grown blade, where it is thinnest, and against the low sun.
  vec3 through = mix(mix(vec3(0.088, 0.14, 0.022), vec3(0.11, 0.2, 0.045), uFresh), vec3(0.24, 0.19, 0.05), max(max(0.8 * sheer * smoothstep(0.55, 0.95, abs(vUv.x)), 0.75 * vRipe * max(smoothstep(0.8, 0.98, abs(vUv.x)), smoothstep(0.9, 1.0, vUv.y))), uWarm)) * thin * (0.5 + 0.5 * pow(lum, 1.7)) * (1.0 - 0.75 * net) * (1.0 - 0.7 * cells) * (1.6 - 1.1 * thick);
  // From far off a blade glows as the field's blades do: its patches are too small to tell.
  through = mix(through, vec3(0.045, 0.071, 0.016) * mix(0.3, 1.2, smoothstep(0.2, 0.8, vUv.y)) * (0.8 + 0.4 * vLeaf.z), smoothstep(1.6, 4.0, vDepth));
  through *= 1.0 - 0.88 * vein.r * (0.5 + 0.5 * vRipe) * (1.0 - 0.7 * uFresh);
  through *= 1.0 - 0.55 * vein.b * (1.0 - vein.r);
  through = mix(through, vec3(0.12, 0.1, 0.014) * thin * (0.5 + 0.5 * lum), yellow);
  through = mix(through, vec3(0.02, 0.01, 0.003), brown);
  // The neighbor's blades stand before the sun: the light comes through close round it and the rest of the face stays dark.
  if (uGlow < 0.5) through *= 0.6 + 1.4 * smoothstep(0.9975, 0.9998, dot(-view, uSunDir));
  // Seen from a hand's breadth the glow is warm, green gold, strongest in the thin fields between the veins, and the margin, a single layer of cells, is a bright line.
  through *= mix(vec3(1.0), vec3(2.1, 1.75, 0.95), near * (1.0 - brown) * (0.55 + 0.45 * (1.0 - thick)) * (1.0 - 0.7 * uPlantFrost));

  // Relief finer than about three pixels is left out: it would only sparkle.
  float texels = texelDensity(dUv, uDetailSize);
  float veinTexels = length(fwidth(a) * vec2(768.0, 1024.0));
  float high = ((vein.g - 0.55) * 0.0016 * (1.0 - smoothstep(3.0, 7.0, veinTexels)) - (lum - 1.0) * 0.00018 * (1.0 - smoothstep(4.0, 9.0, texels)) + mix(1.0 - fine, 1.0 - fineHeight, near) * 0.0003 * (1.0 - smoothstep(24.0, 70.0, texels * 2.29))) * vState.x * 4.0;
  if (!top) high = -high;
  // Close by the same relief is sloped from the maps a pixel either side and laid along the flat blade, not differenced across the screen's blocks of two by two, which print a lattice in the glint of the sun.
  vec2 aReach = 2.0 * reliefReach(a);
  vec2 pReach = 2.0 * reliefReach(vPlane);
  float vSide = (1.0 - 2.0 * uVeinPad) / 3.0;
  vec2 vAt = vec2((vLeaf.y + uVeinPad + (1.0 - 2.0 * uVeinPad) * a.x) / 3.0, a.y);
  vec2 vSlope = vec2(texture(uVeins, vAt + vec2(vSide * aReach.x, 0.0)).g - texture(uVeins, vAt - vec2(vSide * aReach.x, 0.0)).g, texture(uVeins, vAt + vec2(0.0, aReach.y)).g - texture(uVeins, vAt - vec2(0.0, aReach.y)).g) / (2.0 * aReach);
  vec3 lumOf = vec3(0.3, 0.6, 0.1) / dot(vec3(${DETAIL_MEAN}), vec3(0.3, 0.6, 0.1));
  vec2 dStep = 7.0 * pReach;
  vec2 lSlope = vec2(dot(texture(uDetail, dUv + vec2(dStep.x, 0.0)).rgb - texture(uDetail, dUv - vec2(dStep.x, 0.0)).rgb, lumOf), dot(texture(uDetail, dUv + vec2(0.0, dStep.y)).rgb - texture(uDetail, dUv - vec2(0.0, dStep.y)).rgb, lumOf)) / (2.0 * pReach);
  vec2 fStep = 16.0 * pReach;
  vec2 fSlope = vec2(dot(texture(uDetail, fUv + vec2(fStep.x, 0.0), 0.6).rgb - texture(uDetail, fUv - vec2(fStep.x, 0.0), 0.6).rgb, lumOf), dot(texture(uDetail, fUv + vec2(0.0, fStep.y), 0.6).rgb - texture(uDetail, fUv - vec2(0.0, fStep.y), 0.6).rgb, lumOf)) / (2.0 * pReach);
  float lift = vState.x * 4.0 * (top ? 1.0 : -1.0);
  vec2 aSlope = vSlope * (0.0016 * (1.0 + 4.0 * near) * (1.0 - smoothstep(3.0, 7.0, veinTexels)) * lift);
  vec2 pSlope = (lSlope * (-0.00018 * (1.0 - smoothstep(4.0, 9.0, texels))) + fSlope * (-0.0003 * (1.0 - smoothstep(24.0, 70.0, texels * 2.29)))) * lift;
  vec2 px = dFdx(vPlane);
  vec2 py = dFdy(vPlane);
  float pd = px.x * py.y - px.y * py.x;
  mat2 toA = mat2(dFdx(a), dFdy(a)) * mat2(py.y, -px.y, -py.x, px.x) / (abs(pd) > 1e-14 ? pd : 1e-14);
  vec3 wx = dFdx(vWorld);
  vec3 wy = dFdy(vWorld);
  vec3 along = (py.y * wx - px.y * wy) * sign(pd);
  along = normalize(along - face * dot(along, face) + 1e-9 * cross(face, vec3(0.0, 1.0, 0.0)));
  vec3 aside = cross(face, along) * sign(dot(cross(face, along), px.x * wy - py.x * wx) * sign(pd));
  vec2 grad = pSlope + aSlope * toA;
  vec3 tilt = grad.x * along + grad.y * aside;
  vec3 sloped = normalize(face - tilt * inversesqrt(1.0 + 0.7 * dot(tilt, tilt)));
  float fold = vState.z;

  // The margin takes little light of its own, so the lit edge breaks into teeth and hairs and is not a drawn line.
  float bay = serration(vUv, vKey, vCut);
  float margin = 1.0 - smoothstep(0.86, 0.98, min(1.0, abs(vUv.x) + bay)) * (0.6 - 0.4 * smoothstep(0.6, 0.9, mark.g));
  // The wax lies over a pebbled skin: close by, its sheen breaks into grains and is never one smooth light.
  float pebble = saturate((fineHeight - 0.82) * 2.5);
  Tissue t;
  // Close by the upper face is matt with bloom, a pale veil that takes the color of the sky, and stiff glassy hairs on dark feet.
  vec2 hairs = top ? bladeHairs(vPlane, vLeaf.z) * near * (1.0 - brown) : vec2(0.0);
  albedo = mix(albedo, vec3(0.12, 0.15, 0.18), (top ? 0.45 : 0.0) * near * (1.0 - brown) * (1.0 - thick));
  albedo = mix(albedo, vec3(0.03, 0.04, 0.02), 0.6 * hairs.y);
  albedo = mix(albedo, vec3(0.5, 0.55, 0.56), hairs.x);
  through = mix(through, vec3(0.5, 0.52, 0.45), hairs.x);
  // Frozen and seen against the sun a blade passes little and that little grey: only the thin margin keeps a warm line.
  float rimLine = smoothstep(0.9, 0.99, min(1.0, abs(vUv.x) + bay));
  float iced = uPlantFrost * smoothstep(0.6, 1.0, near) * smoothstep(0.3, 0.8, dot(-view, uSunDir)) * (1.0 - rimLine) * (1.0 - brown);
  through = mix(through, dot(through, vec3(0.3, 0.6, 0.1)) * vec3(0.85, 1.0, 1.1), 0.7 * iced) * (1.0 - 0.45 * iced);
  t.albedo = albedo * (0.3 + 0.7 * margin);
  t.through = through + vec3(0.2, 0.22, 0.05) * (near * thin * (1.0 - brown) * smoothstep(0.965, 0.995, min(1.0, abs(vUv.x) + bay)));
  t.face = face;
  t.normal = normalize(mix(reliefNormal(face, vWorld, high, 1.0), sloped, near));
  t.rough = (top ? 0.82 : 0.95) + 0.08 * near * (1.0 - pebble);
  t.wax = (top ? 0.22 : 0.04) * margin * mix(1.0, 0.25 + 1.5 * pebble, near);
  // A face turned from the sun mirrors only the sky: half the sheen there, and half on the under side.
  t.sheen = (top ? 0.6 * mix(0.25, 1.0, vRipe) : 0.06) * margin * mix(0.5, 1.0, smoothstep(0.0, 0.3, dot(top ? face : -face, uSunDir)));
  t.occlusion =  top ? mix(1.0, 0.4 + 0.6 * abs(vUv.x), fold) * (1.0 - 0.5 * near * thick) : 1.0;
  // The skin's states stand thickest at the margin, the tip and along the veins.
  float brim = max(max(smoothstep(0.55, 1.0, abs(vUv.x)), smoothstep(0.85, 1.0, vUv.y)), 0.7 * vein.r);
  frostAlong = vUv.y;
  vec4 shaded = finish(shadeTissueAt(t, vWorld, view, vPlane, brim), vWorld, vDepth, texels);
  // A hole is cut last: a slope taken across pixels is not defined once a neighbor of the pixel has been thrown away.
  if (hole > 0.0 || tear > 0.0) discard;
  if (bay > 0.0 && abs(vUv.x) > 1.0 - bay) discard;
  outColor = shaded;
}
`

// A neighbor's blade, from the same vertex shader under PLANT_FIELD: it reads vWorld, vNormal, vUv, vLeaf.z, vState.y, vDepth and the tissue text, and no map.
export const leafFieldMain = /* glsl */ `void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  bool top = dot(face, view) > 0.0;
  if (!top) face = -face;
  float rib = smoothstep(0.1, 0.0, abs(vUv.x));
  float shade = 0.8 + 0.4 * vLeaf.z;
  Tissue t;
  t.albedo = (top ? vec3(0.045, 0.1, 0.022) : vec3(0.06, 0.11, 0.034)) * shade;
  t.albedo = mix(t.albedo, vec3(0.17, 0.15, 0.04), vState.y * 0.7);
  t.through = vec3(0.11, 0.2, 0.01) * (1.0 - 0.4 * rib) * mix(0.3, 1.2, smoothstep(0.2, 0.8, vUv.y)) * shade;
  t.face = face;
  t.normal = face;
  t.rough = top ? 0.82 : 0.9;
  t.wax = top ? 0.3 : 0.12;
  t.sheen = top ? 0.6 : 0.85;
  t.occlusion = 1.0;
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, vDepth, -1.0);
}
`
