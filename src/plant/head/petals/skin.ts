import { tissueGlsl } from '../../surface/index.ts'
import { rayMain } from '../../look/ray.ts'

export const vertex = /* glsl */ `
in vec3 position;
#ifndef PLANT_FIELD
in vec3 positionB;
in vec3 normalB;
in vec4 aStateB;
#endif
in vec3 normal;
in vec2 uv;
in vec4 aRay;
in vec4 aState;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out vec4 vRay;
out vec4 vState;
out float vDepth;
#ifdef DEPTH_PASS
uniform float uShadowTexelM;
#endif
void main() {
#ifdef PLANT_FIELD
  vec3 local = position;
#else
  vec3 local = mix(position, positionB, plantBlend());
#endif
#ifdef PLANT_FIELD
  vec3 own = normal;
  vec4 state = aState;
#else
  vec3 own = mix(normal, normalB, plantLead());
  vec4 state = mix(aState, aStateB, plantLead());
#endif
  vec4 world = vec4(plantWorld(local), 1.0);
#ifdef DEPTH_PASS
  // The pleats of a folded ray are finer than the shadow map: the caster stands back so they do not stripe themselves.
  world.xyz -= uSunDir * (uShadowTexelM * mix(3.5, 1.0, state.y) - 0.008 * state.x);
#endif
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vNormal = plantDirection(own);
  vUv = uv;
  vRay = aRay;
  vState = state;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

export const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in vec4 vRay;
in vec4 vState;
in float vDepth;
#ifndef PLANT_FIELD
uniform sampler2D uRayColor;
uniform sampler2D uRayData;
uniform vec2 uRaySize;
#endif
${tissueGlsl}
${rayMain}
`
