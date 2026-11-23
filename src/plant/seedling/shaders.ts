import { seedlingMain } from '../look/seedling.ts'
import { tissueGlsl } from '../surface/index.ts'

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
${seedlingMain}
`
