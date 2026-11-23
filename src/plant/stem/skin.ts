import { stemMain } from '../look/stem.ts'
import { tissueGlsl } from '../surface/index.ts'

export const vertex = /* glsl */ `
in vec3 position;
#ifndef PLANT_FIELD
in vec3 positionB;
#endif
in vec3 normal;
in vec3 aCoord;
in vec4 aSkin;
in vec4 aSkin2;
in vec4 aSkin3;
#ifndef PLANT_FIELD
in vec3 normalB;
in vec3 aCoordB;
in vec4 aSkinB;
in vec4 aSkin2B;
in vec4 aSkin3B;
#endif
out vec3 vWorld;
out vec3 vNormal;
out vec3 vCoord;
out vec4 vSkin;
out vec4 vSkin2;
out vec4 vSkin3;
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
  vCoord = aCoord;
  vSkin = aSkin;
  vSkin2 = aSkin2;
  vSkin3 = aSkin3;
#else
  float lead = plantLead();
  vNormal = plantDirection(mix(normal, normalB, lead));
  vCoord = mix(aCoord, aCoordB, lead);
  vSkin = mix(aSkin, aSkinB, lead);
  vSkin2 = mix(aSkin2, aSkin2B, lead);
  vSkin3 = mix(aSkin3, aSkin3B, lead);
#endif
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

// vSkin: rib height (-0.5 furrow to 1 crest), youth, the pallor of the sprout, the foot.
// vSkin2: how open to the sky, how freckled, the neck, how thin (light comes through).
// vSkin3: the joint with the head, how ribbed, the purple below the seed leaves, the rib height in meters.
export const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec3 vCoord;
in vec4 vSkin;
in vec4 vSkin2;
in vec4 vSkin3;
in float vDepth;
#ifndef PLANT_FIELD
uniform sampler2D uSkin;
uniform sampler2D uRibs;
#endif
// How tender the skin is: 0 to 64 for the young stem, and up to 16 more for the sprout.
uniform float uStemAge;
${tissueGlsl}
${stemMain}`
