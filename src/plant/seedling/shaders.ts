import { tissueGlsl, tissueGuide } from '../surface/index.ts'

const LEAF = tissueGuide.seedLeaf

export const vertex = /* glsl */ `
in vec3 position;
#ifndef PLANT_FIELD
in vec3 positionB;
in vec3 normalB;
in vec4 aStateB;
#endif
in vec3 normal;
in vec4 aCoord;
in vec4 aState;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vCoord;
out vec4 vState;
out float vDepth;
void main() {
#ifdef PLANT_FIELD
  vec3 local = position;
#else
  vec3 local = mix(position, positionB, plantBlend());
#endif
  vec4 world = vec4(plantWorld(local), 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
#ifdef PLANT_FIELD
  vNormal = plantDirection(normal);
  vState = aState;
#else
  vNormal = plantDirection(mix(normal, normalB, plantLead()));
  vState = mix(aState, aStateB, plantLead());
#endif
  vCoord = aCoord;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

// vCoord: along the body 0 to 1, across it -1 to 1, which face (1 upper or outer, -1 lower or inner), the body (0 and 1 seed leaves, 2 and 3 husk halves, 4 a crumb of soil).
// vState: the pallor of the sprout, how withered, how open to the sky, how much soil dust.
export const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec4 vCoord;
in vec4 vState;
in float vDepth;
${tissueGlsl}
void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  float along = vCoord.x;
  float across = vCoord.y;
  float upper = smoothstep(-0.2, 0.2, vCoord.z);
  float body = vCoord.w;
  float crumb = step(3.5, body);
  float husk = step(1.5, body) * (1.0 - crumb);
  float pale = vState.x;
  float wither = vState.y;

  float cloud = valueNoise(vec2(across * 2.6 + body * 7.3, along * 7.0));
  float grain = valueNoise(vec2(across * 34.0 + body * 3.1, along * 90.0));
  float mid = (1.0 - smoothstep(0.0, 0.09, abs(across))) * (1.0 - 0.7 * along);
  float rung = abs(fract(along * 7.0 - abs(across) * 1.9 + 0.11 * cloud) - 0.5) * 2.0;
  float vein = (1.0 - smoothstep(0.0, 0.16, rung)) * smoothstep(0.04, 0.2, abs(across)) * (1.0 - smoothstep(0.7, 0.98, abs(across))) * (1.0 - 0.6 * along);
  vec3 leaf = mix(vec3(0.007, 0.055, 0.028), vec3(0.0145, 0.08, 0.038), 0.65 * cloud + 0.35 * grain);
  // The skin of a seed leaf is a mosaic of cells, some paler, with darker moist patches.
  float cells = valueNoise(vec2(across * 70.0 + body * 4.0, along * 190.0));
  float patchy = valueNoise(vec2(across * 5.0 - body * 3.0, along * 13.0));
  leaf *= (0.8 + 0.4 * cells) * (0.62 + 0.76 * patchy);
  leaf = mix(leaf * vec3(1.9, 1.5, 2.0), leaf, upper);
  leaf *= mix(vec3(1.0), vec3(0.3, 0.66, 0.68), 1.0 - wither);
  leaf = mix(leaf, vec3(0.3, 0.47, 0.13), (0.45 * mid + 0.1 * vein) * upper);
  leaf = mix(leaf, vec3(0.2, 0.27, 0.08) * (0.9 + 0.2 * cloud), 0.75 * pale);
  leaf = mix(leaf, mix(vec3(0.52, 0.47, 0.1), vec3(0.3, 0.2, 0.07), smoothstep(0.5, 1.0, wither + 0.3 * cloud - 0.15)), wither);
  float lens = 1.0 - across * across;
  vec3 glow = mix(vec3(0.07, 0.092, 0.02), vec3(0.007, 0.021, 0.0045), smoothstep(0.0, 0.45, lens)) * (1.0 - 0.5 * mid) * (1.0 - 0.25 * vein) * (0.6 + 0.8 * patchy) * mix(1.0, mix(1.8, 0.5, smoothstep(0.1, 0.8, along)), 1.0 - wither);
  // The thin margin of the leaf passes the sun almost whole.
  glow = mix(glow, vec3(0.3, 0.27, 0.1), 0.5 * smoothstep(0.955, 1.0, abs(across)));
  glow = mix(glow, vec3(0.1, 0.13, 0.04), 0.7 * pale);
  glow = mix(glow, vec3(0.5, 0.36, 0.08), wither);
  glow *= (1.0 - 0.6 * uPlantWet) / (1.0 + WET_SHEER * uPlantWet);
  glow *= mix(vec3(1.0), mix(vec3(1.25, 1.75, 1.3), vec3(0.8), upper), (1.0 - wither) * (1.0 - pale));
  float leafHeight = -0.00016 * mid * upper + 0.00012 * mid * (1.0 - upper) - 0.00011 * vein * upper + (grain - 0.5) * 0.00002 + (cells - 0.5) * 0.000028 + (cloud - 0.5) * 0.00006 * wither;

  // Out of the soil the shell is damp and dark; lying in the air it dries pale, and its dark bands narrow to lines.
  float damp = smoothstep(0.14, 0.55, vState.w);
  float lane = across * 2.6 + 0.07 * (valueNoise(vec2(along * 9.0, across * 3.0 + body)) - 0.5) + 0.1 * damp * (valueNoise(vec2(along * 3.3 + body * 2.0, across * 1.7)) - 0.5);
  float band = abs(fract(lane + 0.5) - 0.5) * 2.0;
  float wide = hash11(floor(lane + 0.5) + body * 17.0);
  float white = smoothstep(mix(0.1, 0.34, damp) + mix(0.2, 0.26, damp) * wide, mix(0.2, 0.44, damp) + mix(0.2, 0.26, damp) * wide, band);
  float hairline = smoothstep(0.75, 0.95, abs(fract(across * 13.0 + body * 0.37) - 0.5) * 2.0);
  white = saturate(white - 0.3 * hairline * white + 0.08 * hairline * (1.0 - white));
  float scuff = valueNoise(vec2(across * 9.0 + body * 5.0, along * 26.0));
  // The damp shell is fibrous: fine threads run its length, pale in the dark bands and grey in the pale ones.
  float fibre = valueNoise(vec2(across * 120.0 + body * 9.0, along * 5.0));
  float thread = smoothstep(0.55, 0.85, fibre) * damp;
  white = saturate(white * (1.0 - 0.45 * thread * scuff) + 0.3 * thread * (1.0 - white));
  vec3 outer = mix(vec3(0.05, 0.05, 0.052), mix(vec3(0.8, 0.8, 0.77), vec3(0.86, 0.82, 0.72), damp), white * (0.8 + 0.2 * scuff));
  vec3 inner = mix(vec3(0.2, 0.19, 0.17), vec3(0.76, 0.74, 0.69), 0.25 * grain + 0.75 * smoothstep(0.1, 0.45, abs(fract(across * 11.0) - 0.5) * 2.0));
  inner = mix(inner, vec3(0.07, 0.065, 0.06), 0.85 * smoothstep(0.72, 0.96, abs(across)));
  vec3 shell = mix(inner, outer, upper);
  float soak = smoothstep(0.3, 0.9, uPlantWet);
  float grit = damp * max(smoothstep(0.52, 0.7, valueNoise(vec2(across * 46.0 + body * 2.0, along * 120.0))) * smoothstep(0.2, 0.6, scuff), smoothstep(0.6, 0.68, valueNoise(vec2(across * 17.0 + body * 5.0, along * 44.0))));
  float dusty = max(max(0.7 * vState.w * smoothstep(0.52, 0.8, scuff + 0.25 * grain), 0.9 * grit), soak * (0.55 + 0.45 * scuff));
  shell = mix(shell, vec3(0.2, 0.15, 0.1) * (0.7 + 0.6 * grain) * (1.0 - 0.75 * soak), mix(0.7, 0.93, soak) * dusty);
  float ridge = abs(fract(across * 13.0 + body * 0.37) - 0.5) * 2.0;
  float huskHeight = 0.000022 * ridge * ridge + 0.00003 * white * upper + 0.00003 * dusty * grain;

  Tissue t;
  float flesh0 = (1.0 - husk) * (1.0 - crumb);
  // Damp soil, each crumb with its own tone (in the place of the pallor).
  vec3 soil = vec3(0.15, 0.09, 0.045) * vState.x * (0.7 + 0.6 * valueNoise(vec2(along * 4.0, across * 4.0)));
  t.albedo = mix(mix(leaf, shell, husk), soil, crumb);
  t.through = glow * (${LEAF.through} * (1.0 - husk) * (1.0 - crumb));
  t.face = face;
  t.normal = reliefNormal(face, vWorld, mix(mix(leafHeight, huskHeight, husk), (grain - 0.5) * 0.00004, crumb), 1.0);
  t.rough = mix(mix(mix(${LEAF.rough}, 0.8, wither), mix(0.85, mix(0.3, 0.8, dusty), upper), husk), 1.0, crumb);
  t.wax = mix(${LEAF.wax} * (1.0 - 0.7 * wither), mix(0.05, 0.7 * (1.0 - dusty), upper), husk) * (1.0 - crumb);
  t.sheen = flesh0 * (1.0 - wither) * (0.3 + 0.6 * smoothstep(0.8, 1.0, abs(across)));
  t.occlusion = vState.z;
  // A seed leaf is thick, clear flesh: the sun enters at its outline and leaves toward the lens.
  float flesh = (1.0 - husk) * (1.0 - crumb);
  vec3 color = shadeTissueClear(t, vWorld, view, vec2(across * 0.008, along * 0.03), flesh * smoothstep(0.55, 1.0, abs(across)), 0.6 * flesh * (1.0 - wither));
  outColor = finish(color, vWorld, vDepth, -1.0);
}
`
