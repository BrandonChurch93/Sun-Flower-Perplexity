import { tissueGlsl } from '../../surface/index.ts'
import { budMain } from '../../look/bud.ts'

export const vertex = /* glsl */ `
in vec3 position;
#ifndef PLANT_FIELD
in vec3 positionB;
in vec3 normalB;
#endif
in vec3 normal;
in vec4 aInfo;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vInfo;
out float vDepth;
out float vLow;
uniform vec4 uBudHead;
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
#else
  vNormal = plantDirection(mix(normal, normalB, plantLead()));
#endif
  vInfo = aInfo;
  vDepth = -view.z;
  vLow = (uBudHead.y - local.y) / max(uBudHead.w, 1e-4);
  gl_Position = projectionMatrix * view;
}
`

// aInfo.w says what the surface is: 0 the back and side of the receptacle, 1 its floor, 2 and over a bract (2 is the outermost, 3 the innermost).
export const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec4 vInfo;
in float vDepth;
in float vLow;
uniform float uBudOpen;
uniform float uBudShut;
uniform float uBudEarly;
${tissueGlsl}
${budMain}
`
