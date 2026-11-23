import { tissueGlsl } from '../../surface/index.ts'
import { rayMain } from '../../look/ray.ts'

export const vertex = /* glsl */ `
in vec3 position;
#ifdef PLANT_FIELD
in vec4 aState;
#else
in vec3 positionB;
in vec3 normalB;
uniform vec4 uRayStateA[38];
uniform vec4 uRayStateB[38];
#endif
in vec3 normal;
in vec2 uv;
in vec4 aRay;
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
  vec3 own = normal;
  vec4 state = aState;
  vec4 rayInfo = aRay;
#else
  vec3 local = mix(position, positionB, plantBlend());
  vec3 own = mix(normal, normalB, plantLead());
  int rk = clamp(int(aRay.x), 0, 37);
  vec4 rawState = mix(uRayStateA[rk], uRayStateB[rk], plantLead());
  vec4 state = vec4(rawState.x, smoothstep(0.0, 1.0, rawState.y * 1.25 - 0.22 * uv.x), rawState.z, rawState.w);
  vec4 rayInfo = vec4(fract(aRay.x) / 0.999, aRay.yzw);
#endif
  vec4 world = vec4(plantWorld(local), 1.0);
#ifdef DEPTH_PASS
  world.xyz -= uSunDir * (uShadowTexelM * mix(4.2, 2.8, state.y));
#endif
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vNormal = plantDirection(own);
  vUv = uv;
  vRay = rayInfo;
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
