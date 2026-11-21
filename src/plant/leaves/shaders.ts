import { tissueGlsl } from '../surface/index.ts'

export const LEAVES = 24

export const bladeVertex = /* glsl */ `
in vec3 position;
#ifndef PLANT_FIELD
in vec3 positionB;
in vec4 aMark;
in vec2 aPlane;
out vec4 vMark;
out vec2 vPlane;
#endif
in vec3 normal;
in vec2 uv;
in vec4 aLeaf;
uniform vec4 uLeafState[${LEAVES}];
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out vec4 vLeaf;
out vec4 vState;
out float vDepth;
void main() {
#ifdef PLANT_FIELD
  vec3 local = position;
#else
  vec3 local = mix(position, positionB, uShutter);
  vMark = aMark;
  vPlane = aPlane;
#endif
  vec4 world = vec4(plantWorld(local), 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vNormal = plantDirection(normal);
  vUv = uv;
  vLeaf = aLeaf;
  vState = uLeafState[int(aLeaf.x + 0.5)];
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

// The mean of the detail map in linear light, so that the map carries variation and the colors below carry the hue.
const DETAIL_MEAN = 'vec3(0.163, 0.269, 0.111)'

export const bladeFragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in vec4 vLeaf;
in vec4 vState;
in float vDepth;
${tissueGlsl}
#ifdef PLANT_FIELD
void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  bool top = dot(face, view) > 0.0;
  if (!top) face = -face;
  float rib = smoothstep(0.1, 0.0, abs(vUv.x));
  float shade = 0.8 + 0.4 * vLeaf.z;
  Tissue t;
  t.albedo = (top ? vec3(0.085, 0.17, 0.045) : vec3(0.17, 0.25, 0.11)) * shade;
  t.albedo = mix(t.albedo, vec3(0.42, 0.4, 0.1), vState.y * 0.7);
  t.through = vec3(0.5, 0.74, 0.07) * (1.0 - 0.55 * rib) * shade;
  t.face = face;
  t.normal = face;
  t.rough = 0.9;
  t.wax = 0.05;
  t.sheen = 0.8;
  t.occlusion = 1.0;
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, vDepth, -1.0);
}
#else
in vec4 vMark;
in vec2 vPlane;
uniform sampler2D uVeins;
uniform sampler2D uDetail;
uniform sampler2D uMarks;
uniform vec2 uDetailSize;
uniform float uVeinPad;
void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  bool top = gl_FrontFacing;
  if (!top) face = -face;

  vec2 a = vec2(vUv.x * vLeaf.w * 0.5 + 0.5, vUv.y);
  vec4 vein = texture(uVeins, vec2((vLeaf.y + uVeinPad + (1.0 - 2.0 * uVeinPad) * a.x) / 3.0, a.y));
  vec2 dUv = vPlane * 24.0 + vec2(vLeaf.z * 7.0, vLeaf.z * 13.0);
  vec3 detail = texture(uDetail, dUv).rgb;
  vec4 mark = texture(uMarks, vPlane * 8.0 + vec2(vLeaf.z * 31.0, vLeaf.z * 17.0));

  float edge = smoothstep(0.62, 1.0, abs(vUv.x));
  float hole = mark.r + vMark.y * edge - vMark.x - 0.3 * (1.0 - vState.w);
  float tear = -1.0;
  if (vMark.z > 1.5 && vUv.x > 0.0) tear = (vUv.x - 0.42) * 0.085 - abs(vUv.y - 0.5 - 0.1 * (vUv.x - 1.0) + 0.02 * (mark.g - 0.5));
  if (hole > 0.0 || tear > 0.0) discard;
  float scar = max(smoothstep(-0.05, -0.008, hole), smoothstep(-0.012, -0.002, tear));
  float dry = vMark.z > 0.5 && vMark.z < 1.5 ? smoothstep(0.8, 0.93, vUv.y + 0.1 * (mark.g - 0.5)) : 0.0;
  float speck = smoothstep(0.74, 0.82, mark.b) * smoothstep(0.5, 0.7, mark.g) * vMark.w * vState.w;
  float brown = max(max(scar, dry), speck);
  float yellow = saturate(vState.y * (0.35 + 1.3 * mark.g) + 0.4 * smoothstep(-0.07, -0.02, hole) * (1.0 - scar) + 0.7 * smoothstep(0.7, 0.86, vUv.y + 0.1 * (mark.g - 0.5)) * step(0.5, vMark.z) * step(vMark.z, 1.5));

  vec3 var = detail / ${DETAIL_MEAN};
  float lum = dot(var, vec3(0.3, 0.6, 0.1));
  float tone = 0.86 + 0.28 * mark.g;

  vec3 upper = vec3(0.07, 0.165, 0.035) * mix(vec3(1.0), var, 0.85) * tone;
  upper = mix(upper, vec3(0.34, 0.44, 0.18), 0.8 * vein.r + 0.3 * vein.b);
  vec3 under = vec3(0.17, 0.25, 0.115) * mix(vec3(1.0), var, 0.55) * tone;
  under = mix(under, vec3(0.44, 0.5, 0.27), 0.75 * vein.r + 0.4 * vein.b);
  vec3 albedo = top ? upper : under;
  albedo = mix(albedo, vec3(0.5, 0.43, 0.09) * (0.7 + 0.3 * lum), yellow * 0.85);
  albedo = mix(albedo, vec3(0.2, 0.115, 0.045) * (0.6 + 0.4 * lum), brown);

  // Veins hold no green, so the light that comes through them is pale; the blade beside a thick vein is denser and darker.
  float thick = saturate((0.97 - vein.g) * 3.0);
  vec3 through = vec3(0.34, 0.62, 0.04) * (0.3 + 0.7 * pow(lum, 1.7)) * tone * (1.0 - 0.3 * thick);
  through = mix(through, vec3(0.62, 0.66, 0.2), 0.75 * vein.r + 0.3 * vein.b);
  through = mix(through, vec3(0.95, 0.78, 0.1) * (0.5 + 0.5 * lum), yellow);
  through = mix(through, vec3(0.32, 0.13, 0.025), brown);

  float high = ((vein.g - 0.55) * 0.0011 + (lum - 1.0) * 0.00018) * vState.x * 4.0;
  if (!top) high = -high;
  float fold = vState.z;

  Tissue t;
  t.albedo = albedo;
  t.through = through;
  t.face = face;
  t.normal = reliefNormal(face, vWorld, high, 1.0);
  t.rough = 0.92;
  t.wax = top ? 0.07 : 0.03;
  t.sheen = 0.9;
  t.occlusion =  top ? mix(1.0, 0.4 + 0.6 * abs(vUv.x), fold) : 1.0;
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, vDepth, texelDensity(dUv, uDetailSize));
}
#endif
`

export const bladeDepth = /* glsl */ `
in vec2 vUv;
in vec4 vLeaf;
in vec4 vMark;
in vec4 vState;
in vec2 vPlane;
uniform sampler2D uMarks;
void main() {
  float mark = texture(uMarks, vPlane * 8.0 + vec2(vLeaf.z * 31.0, vLeaf.z * 17.0)).r;
  if (mark + vMark.y * smoothstep(0.62, 1.0, abs(vUv.x)) - vMark.x - 0.3 * (1.0 - vState.w) > 0.0) discard;
  outColor = vec4(1.0);
}
`

export const stalkVertex = /* glsl */ `
in vec3 position;
in vec3 positionB;
in vec3 normal;
in vec2 uv;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out float vDepth;
void main() {
  vec4 world = vec4(plantWorld(mix(position, positionB, uShutter)), 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vNormal = plantDirection(normal);
  vUv = uv;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

export const stalkFragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in float vDepth;
${tissueGlsl}
void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  if (dot(face, view) < 0.0) face = -face;
  float ribs = 0.5 + 0.5 * sin(vUv.x * 6.2832 * 9.0);
  float streak = valueNoise(vec2(vUv.x * 30.0, vUv.y * 140.0));
  Tissue t;
  t.albedo = mix(vec3(0.2, 0.3, 0.09), vec3(0.4, 0.48, 0.2), 0.45 * ribs + 0.55 * streak);
  t.through = vec3(0.08, 0.13, 0.015);
  t.face = face;
  t.normal = reliefNormal(face, vWorld, 0.00025 * ribs, 1.0);
  t.rough = 0.8;
  t.wax = 0.15;
  t.sheen = 0.9;
  t.occlusion = 1.0;
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, vDepth, -1.0);
}
`
