import { leafFieldMain, leafMain } from '../look/leaf.ts'
import { stalkMain } from '../look/body.ts'
import { tissueGlsl } from '../surface/index.ts'

export const LEAVES = 24

export const bladeVertex = /* glsl */ `
in vec3 position;
#ifndef PLANT_FIELD
in vec3 positionB;
in vec3 normalB;
in vec4 aMark;
in vec2 aPlane;
out vec4 vMark;
out vec2 vPlane;
#endif
in vec3 normal;
in vec2 uv;
in vec4 aLeaf;
uniform vec4 uLeafState[${LEAVES}];
uniform float uLeafRipe[${LEAVES}];
uniform vec4 uLeafCut[${LEAVES}];
uniform vec4 uLeafEdge[${LEAVES}];
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out vec4 vLeaf;
out vec4 vState;
out float vRipe;
out vec4 vCut;
out float vKey;
out float vDepth;
void main() {
#ifdef PLANT_FIELD
  vec3 local = position;
#else
  vec3 local = mix(position, positionB, plantBlend());
  vMark = aMark;
  vPlane = aPlane;
#endif
  vec4 world = vec4(plantWorld(local), 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
#ifdef PLANT_FIELD
  vNormal = plantDirection(normal);
#else
  vNormal = plantDirection(mix(normal, normalB, plantLead()));
#endif
  vUv = uv;
  vLeaf = aLeaf;
  vState = uLeafState[int(aLeaf.x + 0.5)];
  vRipe = uLeafRipe[int(aLeaf.x + 0.5)];
  vec4 edgeOf = uLeafEdge[int(aLeaf.x + 0.5)];
  vec4 cutOf = uLeafCut[int(aLeaf.x + 0.5)];
  vCut = vec4(cutOf.xy, uv.x < 0.0 ? edgeOf.xy : edgeOf.zw);
  vKey = uv.x < 0.0 ? cutOf.z : cutOf.w;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

// The teeth of the edge, cut in the skin: how far in from the edge the bay beside a tooth reaches, as a share of the half width. It counts as bayAt does, so the hairs of the margin find the edge.
const serrationGlsl = /* glsl */ `
float serration(vec2 uv, float key, vec4 cut) {
  float s = clamp(uv.y, 0.0, 1.0);
  float x = cut.x * pow(s, 0.85) + cut.z + 0.4 * sin(7.3 * s + cut.w);
  float id = floor(x);
  float f = x - id;
  float edge = f < 0.62 ? f / 0.62 : (1.0 - f) / 0.38;
  highp uint n = uint(int(id) + 64) * 747796405u + uint(key + 0.5);
  n = (n ^ (n >> 16u)) * 2246822519u;
  n ^= n >> 13u;
  float size = (0.45 + 1.1 * float(n & 65535u) / 65536.0) * (float((n >> 16u) & 65535u) / 65536.0 < 0.22 ? 0.3 : 1.0);
  return cut.y * smoothstep(0.0, 0.1, s) * smoothstep(1.0, 0.78, s) * (1.0 - size * (edge * edge * (3.0 - 2.0 * edge) - 0.35));
}
`

export const bladeFragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in vec4 vLeaf;
in vec4 vState;
in float vRipe;
in vec4 vCut;
in float vKey;
in float vDepth;
${tissueGlsl}
${serrationGlsl}
#ifdef PLANT_FIELD
${leafFieldMain}#else
in vec4 vMark;
in vec2 vPlane;
uniform sampler2D uVeins;
uniform sampler2D uDetail;
uniform sampler2D uMarks;
uniform vec2 uDetailSize;
uniform float uVeinPad;
uniform float uGlow;
uniform float uWarm;
uniform float uFresh;
${leafMain}#endif
`

export const bladeDepth = /* glsl */ `
in vec2 vUv;
in vec4 vLeaf;
in vec4 vMark;
in vec4 vState;
in vec2 vPlane;
in vec4 vCut;
in float vKey;
uniform sampler2D uMarks;
${serrationGlsl}
void main() {
  float mark = texture(uMarks, vPlane * 8.0 + vec2(vLeaf.z * 31.0, vLeaf.z * 17.0)).r;
  if (mark + vMark.y * smoothstep(0.62, 1.0, abs(vUv.x)) - vMark.x - 0.3 * (1.0 - vState.w) > 0.0) discard;
  float bay = serration(vUv, vKey, vCut);
  if (bay > 0.0 && abs(vUv.x) > 1.0 - bay) discard;
  outColor = vec4(1.0);
}
`

export const stalkVertex = /* glsl */ `
in vec3 position;
in vec3 positionB;
in vec3 normal;
in vec3 normalB;
in vec2 uv;
in vec2 uvB;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out float vDepth;
void main() {
  vec4 world = vec4(plantWorld(mix(position, positionB, plantBlend())), 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vNormal = plantDirection(mix(normal, normalB, plantLead()));
  vUv = mix(uv, uvB, plantLead());
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
${stalkMain}`
