import { tissueGlsl, tissueGuide } from '../surface/index.ts'

const LEAF = tissueGuide.seedLeaf

export const vertex = /* glsl */ `
in vec3 position;
#ifndef PLANT_FIELD
in vec3 positionB;
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
  vec3 local = mix(position, positionB, uShutter);
#endif
  vec4 world = vec4(plantWorld(local), 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vNormal = plantDirection(normal);
  vCoord = aCoord;
  vState = aState;
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
  vec3 leaf = mix(vec3(0.012, 0.085, 0.042), vec3(0.024, 0.128, 0.06), 0.65 * cloud + 0.35 * grain);
  leaf = mix(leaf * vec3(1.9, 1.5, 2.0), leaf, upper);
  leaf = mix(leaf, vec3(0.3, 0.47, 0.13), 0.45 * mid * upper);
  leaf = mix(leaf, vec3(0.2, 0.27, 0.08) * (0.9 + 0.2 * cloud), 0.75 * pale);
  leaf = mix(leaf, mix(vec3(0.52, 0.47, 0.1), vec3(0.3, 0.2, 0.07), smoothstep(0.5, 1.0, wither + 0.3 * cloud - 0.15)), wither);
  float lens = 1.0 - across * across;
  vec3 glow = mix(vec3(0.066, 0.108, 0.074), vec3(0.0105, 0.021, 0.0135), lens) * (1.0 - 0.5 * mid);
  // The thin margin of the leaf passes the sun almost whole.
  glow = mix(glow, vec3(0.4, 0.39, 0.28), 0.6 * smoothstep(0.965, 1.0, abs(across)));
  glow = mix(glow, vec3(0.1, 0.13, 0.04), 0.7 * pale);
  glow = mix(glow, vec3(0.5, 0.36, 0.08), wither);
  float leafHeight = -0.00016 * mid * upper + (grain - 0.5) * 0.000012 + (cloud - 0.5) * 0.00006 * wither;

  float lane = across * 2.6 + 0.07 * (valueNoise(vec2(along * 9.0, across * 3.0 + body)) - 0.5);
  float band = abs(fract(lane + 0.5) - 0.5) * 2.0;
  float wide = hash11(floor(lane + 0.5) + body * 17.0);
  // Out of the soil the shell is damp and dark; lying in the air it dries pale, and its dark bands narrow to lines.
  float damp = smoothstep(0.14, 0.55, vState.w);
  float white = smoothstep(mix(0.1, 0.16, damp) + mix(0.2, 0.26, damp) * wide, mix(0.2, 0.26, damp) + mix(0.2, 0.26, damp) * wide, band);
  float hairline = smoothstep(0.75, 0.95, abs(fract(across * 13.0 + body * 0.37) - 0.5) * 2.0);
  white = saturate(white - 0.3 * hairline * white + 0.08 * hairline * (1.0 - white));
  float scuff = valueNoise(vec2(across * 9.0 + body * 5.0, along * 26.0));
  vec3 outer = mix(vec3(0.05, 0.048, 0.046), mix(vec3(0.8, 0.8, 0.77), vec3(0.74, 0.7, 0.62), damp), white * (0.8 + 0.2 * scuff));
  vec3 inner = mix(vec3(0.16, 0.16, 0.15), vec3(0.6, 0.61, 0.6), 0.25 * grain + 0.75 * smoothstep(0.1, 0.45, abs(fract(across * 11.0) - 0.5) * 2.0));
  vec3 shell = mix(inner, outer, upper);
  float dusty = vState.w * smoothstep(0.42, 0.75, scuff + 0.25 * grain);
  shell = mix(shell, vec3(0.2, 0.15, 0.1) * (0.7 + 0.6 * grain), 0.7 * dusty);
  float ridge = abs(fract(across * 13.0 + body * 0.37) - 0.5) * 2.0;
  float huskHeight = 0.000022 * ridge * ridge + 0.00003 * white * upper + 0.00003 * dusty * grain;

  Tissue t;
  // Damp soil, each crumb with its own tone (in the place of the pallor).
  vec3 soil = vec3(0.11, 0.0694, 0.0332) * vState.x * (0.7 + 0.6 * valueNoise(vec2(along * 4.0, across * 4.0)));
  t.albedo = mix(mix(leaf, shell, husk), soil, crumb);
  t.through = glow * (${LEAF.through} * (1.0 - husk) * (1.0 - crumb));
  t.face = face;
  t.normal = reliefNormal(face, vWorld, mix(mix(leafHeight, huskHeight, husk), (grain - 0.5) * 0.00004, crumb), 1.0);
  t.rough = mix(mix(mix(${LEAF.rough}, 0.8, wither), mix(0.85, mix(0.3, 0.8, dusty), upper), husk), 1.0, crumb);
  t.wax = mix(${LEAF.wax} * (1.0 - 0.7 * wither), mix(0.05, 0.7 * (1.0 - dusty), upper), husk) * (1.0 - crumb);
  t.sheen = 0.0;
  t.occlusion = vState.z;
  // A seed leaf is thick, clear flesh: the sun enters at its outline and leaves toward the lens.
  float flesh = (1.0 - husk) * (1.0 - crumb);
  vec3 color = shadeTissueClear(t, vWorld, view, vec2(across * 0.008, along * 0.03), flesh * smoothstep(0.55, 1.0, abs(across)), 0.6 * flesh * (1.0 - wither));
  outColor = finish(color, vWorld, vDepth, -1.0);
}
`
