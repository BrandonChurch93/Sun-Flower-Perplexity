import { tissueGlsl, tissueGuide } from '../surface/index.ts'
import { SKIN_H, SKIN_W } from './maps.ts'
import { TOP_M } from './shape.ts'

const GUIDE = tissueGuide.stem

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
  vec3 local = mix(position, positionB, uShutter);
#endif
  vec4 world = vec4(plantWorld(local), 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vNormal = plantDirection(normal);
  vCoord = aCoord;
  vSkin = aSkin;
  vSkin2 = aSkin2;
  vSkin3 = aSkin3;
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
${tissueGlsl}
void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  float age = floor(vSkin.y * 0.25);
  float youth = saturate(vSkin.y - 4.0 * age - 1.0);
  float fresh = saturate((age - 64.0) * 0.0625);
  float tender = min(age, 64.0) * 0.015625;
  float pale = vSkin.z;
  float foot = vSkin.w;
  float thin = vSkin2.w;
  float ribbed = vSkin3.y;
#ifdef PLANT_FIELD
  float rib = vSkin.x;
  float tone = 0.5 + 0.2 * rib;
  float streak = 0.5;
  float thread = 0.0;
  float fleck = 0.0;
  float spot = 0.0;
  float dust = 0.5;
  vec3 normal = face;
  float density = -1.0;
#else
  vec4 fine = texture(uSkin, vCoord.xy);
  vec4 wide = texture(uSkin, vec2(vCoord.x + 0.37, vCoord.y * 0.173 + 0.61));
  float rib = mix(vSkin.x, (texture(uRibs, vec2(vCoord.x, vCoord.z)).r - 0.34) / 0.6, 0.7);
  // Tissue that has not grown out yet is packed under the tip: its marks are too close together to show.
  float packed = smoothstep(25.0, 90.0, length(vec2(dFdx(vCoord.z), dFdy(vCoord.z))) * ${TOP_M.toFixed(4)} / max(length(vec2(length(dFdx(vWorld)), length(dFdy(vWorld)))), 1e-7));
  fine = mix(fine, vec4(0.5), packed);
  wide = mix(wide, vec4(0.5), packed);
  float tone = 0.58 * wide.g + 0.42 * fine.g;
  tone = mix(saturate(0.5 + (tone - 0.5) * 1.45), 0.5, 0.45 * thin);
  float streak = wide.g;
  float thread = smoothstep(0.55, 0.8, fine.g) * (0.35 + 0.65 * wide.g);
  float fleck = saturate(vSkin2.y * (0.8 * smoothstep(0.76, 0.86, fine.b) + 0.4 * smoothstep(0.74, 0.86, wide.b)));
  float spot = smoothstep(0.84, 0.97, fine.a) * (1.0 - youth);
  float dust = fine.a;
  float height = rib * vSkin3.w * 1.4 + (fine.r - 0.5) * mix(0.00016, 0.00003, thin) + (wide.r - 0.5) * 0.00012 * ribbed;
  vec3 normal = reliefNormal(face, vWorld, height, 1.0);
  float density = texelDensity(vCoord.xy, vec2(${SKIN_W}.0, ${SKIN_H}.0));
#endif
  float crest = saturate(rib);
  float furrow = saturate(-rib * 2.6);
  vec3 grown = mix(vec3(0.052, 0.095, 0.007), vec3(0.124, 0.2, 0.016), tone);
  grown = mix(grown, vec3(0.29, 0.33, 0.05), 0.7 * thread);
  grown *= 1.0 - 0.15 * ribbed * furrow;
  grown = mix(grown, vec3(0.28, 0.315, 0.045), ribbed * smoothstep(0.25, 0.9, crest) * (0.06 + 0.2 * streak));
  vec3 young = mix(vec3(0.17, 0.36, 0.075), vec3(0.36, 0.58, 0.17), tone);
  // The seedling's own warmth is gone before the field's youngest plants reach the bloom.
  young = mix(young, mix(mix(vec3(0.06, 0.125, 0.03), vec3(0.1, 0.19, 0.05), tone), mix(vec3(0.068, 0.128, 0.034), vec3(0.11, 0.19, 0.054), tone), fresh), tender);
  vec3 albedo = mix(grown, young, youth);
  albedo = mix(albedo, vec3(0.4, 0.5, 0.25), 0.7 * spot);
  albedo = mix(albedo, mix(vec3(0.028, 0.07, 0.018), vec3(0.11, 0.05, 0.04), smoothstep(0.55, 0.9, dust)) * (0.7 + 0.6 * tone), 0.7 * fleck);
  albedo = mix(albedo, vec3(0.45, 0.32, 0.21) * (0.75 + 0.5 * tone), 0.5 * foot);
  albedo = mix(albedo, vec3(0.25, 0.18, 0.12) * (0.7 + 0.6 * tone), 0.8 * foot * foot * foot * smoothstep(0.3, 0.75, dust + 0.4 * foot));
  // The sprout: pale yellow green where it has seen the light, clear pink red below, near white where it leaves the soil.
  vec3 sprout = mix(vec3(0.36, 0.34, 0.22), vec3(0.085, 0.15, 0.125), saturate(1.0 - foot * 1.4)) * (0.9 + 0.2 * tone);
  albedo = mix(albedo, sprout, 0.92 * saturate(1.5 * pale));
  albedo = mix(albedo, mix(vec3(0.23, 0.045, 0.075), vec3(0.26, 0.075, 0.11), pale) * (0.55 + 0.9 * tone), vSkin3.z * mix(0.1 + 0.34 * streak * dust, 0.72 + 0.16 * streak + 0.12 * dust, pale));
  albedo = mix(albedo, vec3(0.2, 0.3, 0.09), vSkin3.x);
  float rough = mix(${GUIDE.rough}, 0.5, thin);
  float wax = mix(${GUIDE.wax}, 0.45, thin);
  // A round stalk passes light where the way through it is short: at its outline.
  float limb = 1.0 - abs(dot(face, view));
  Tissue t;
  t.albedo = albedo;
  t.through = mix(mix(vec3(0.4, 0.7, 0.2), mix(vec3(0.47, 0.64, 0.27), vec3(0.51, 0.64, 0.3) * (1.07 - 0.45 * smoothstep(0.004, 0.032, vCoord.z * ${TOP_M.toFixed(4)})), fresh), tender), mix(vec3(0.34, 0.51, 0.33), vec3(0.37, 0.155, 0.115), saturate(vSkin3.z * 1.2)), pale) * (mix(0.25 * (1.0 - 0.64 * tender * (1.0 - limb * limb)), 0.04 + 0.42 * limb * limb * limb, pale) * thin);
  t.face = face;
  t.normal = normal;
  t.rough = rough;
  t.wax = wax;
  t.sheen = mix(0.5, ${GUIDE.sheen}, thin) * (1.0 - 0.4 * pale) * (1.0 - 0.6 * (1.0 - pale) * vSkin3.z);
  t.occlusion = vSkin2.x * (1.0 - 0.5 * ribbed * furrow);
#ifdef PLANT_FIELD
  vec3 color = shadeTissue(t, vWorld, view);
  // No hairs are drawn on a neighbor: the halo they catch against the sun pales the stalk from its edge inward.
  float graze = 1.0 - abs(dot(face, view));
  float toSun = saturate(dot(-view, uSunDir));
  color += uSunColor * vec3(0.8, 0.95, 0.6) * (0.2 * plantSun(vWorld, face) * graze * graze * (0.3 + 0.7 * toSun * toSun) * (1.0 - foot));
#else
  // The young stem is clear, moist flesh: the sun enters at its outline and leaves toward the lens.
  vec3 color = shadeTissueClear(t, vWorld, view, vec2(vCoord.x * 0.08, vCoord.z * ${TOP_M.toFixed(4)}), 0.0, 0.7 * max(pale, fresh));
#endif
  outColor = finish(color, vWorld, vDepth, density);
}
`
