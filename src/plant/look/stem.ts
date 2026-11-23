import { tissueGuide } from '../surface/index.ts'
import { SKIN_H, SKIN_W } from '../stem/maps.ts'
import { TOP_M } from '../stem/shape.ts'

const GUIDE = tissueGuide.stem

// What the stem's skin reads, from the vertex shader in src/plant/stem/skin.ts. Whoever needs to change the list writes to the other owner first.
//   vWorld, vNormal, vDepth  the place in the world, the normal there, meters from the lens
//   vCoord   x round the stem and y along it in the skin map, z the height as a share of the grown stem
//   vSkin    x the rib (over 0 a crest, under 0 a furrow), y over 1 where the stem is young, z how pale (the sprout), w how near the foot
//   vSkin2   x how open to the sky, y how freckled, z the neck, w how thin (light comes through)
//   vSkin3   x the joint with the head, y how ribbed, z the purple below the seed leaves, w the rib height in meters
//   uStemAge how tender the skin is: 0 to 64 for the young stem, and up to 16 more for the sprout
//   uSkin, uRibs  the two maps, on the plant and the companion only
// From the tissue text: uCamPos, uSunDir, uSunColor, uPlantWet, uPlantFrost, saturate, texelDensity, reliefNormal, plantSun, shadeTissue, shadeTissueClear, finish, the Tissue it fills, outColor.
export const stemMain = /* glsl */ `void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  float age = uStemAge;
  float youth = saturate(vSkin.y - 1.0);
  float fresh = saturate((age - 64.0) * 0.0625);
  float tender = min(age, 64.0) * 0.015625;
  float pale = saturate(vSkin.z);
  float foot = saturate(vSkin.w);
  float thin = max(vSkin2.w, 0.0);
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
  albedo = mix(albedo, vec3(0.45, 0.32, 0.21) * (0.75 + 0.5 * tone), 0.5 * foot * (1.0 - 0.85 * smoothstep(0.3, 0.9, uPlantWet)));
  albedo = mix(albedo, vec3(0.25, 0.18, 0.12) * (0.7 + 0.6 * tone), 0.8 * foot * foot * foot * smoothstep(0.3, 0.75, dust + 0.4 * foot));
  // The sprout: one pale whitish green, a soft pink streaked in below, near white where it leaves the soil.
  vec3 sprout = mix(mix(vec3(0.78, 0.98, 0.17), vec3(0.24, 0.37, 0.13), smoothstep(0.35, 0.85, pale)), vec3(0.76, 0.74, 0.4), saturate(foot * 1.4)) * (0.9 + 0.2 * tone);
  float blush = smoothstep(0.4, 0.75, streak);
  albedo = mix(albedo, sprout, 0.92 * saturate(1.5 * pale));
  albedo = mix(albedo, mix(vec3(0.23, 0.045, 0.075), vec3(0.45, 0.2, 0.22), pale) * (0.55 + 0.9 * tone), vSkin3.z * mix(0.1 + 0.34 * streak * dust, (0.3 + 0.55 * blush) * (1.0 - 0.8 * foot), pale) * (1.0 - 0.8 * smoothstep(0.3, 0.9, uPlantWet)));
  albedo = mix(albedo, vec3(0.2, 0.3, 0.09), vSkin3.x);
  // The side the sun stands on all day, the south, flushes purple red in streaks, and a bloom of wax pales the rest at the outline.
  float near = 1.0 - smoothstep(0.3, 0.7, vDepth);
  vec2 round = face.xz / max(length(face.xz), 1e-4);
  float flush = smoothstep(0.1, 0.95, dot(round, vec2(-0.17, -0.985))) * (0.45 + 0.55 * streak) * (1.0 - pale) * (1.0 - 0.8 * smoothstep(0.3, 0.9, uPlantWet)) * near;
  albedo = mix(albedo, vec3(0.2, 0.045, 0.06) * (0.6 + 0.8 * tone), 0.42 * flush);
  float bloom = (1.0 - abs(dot(face, view))) * (1.0 - pale) * (1.0 - foot) * near;
  albedo = mix(albedo, vec3(0.24, 0.27, 0.22) * (0.8 + 0.4 * tone), 0.3 * bloom * bloom * (1.0 - uPlantWet));
  float rough = mix(${GUIDE.rough}, 0.5, thin);
  float wax = mix(${GUIDE.wax}, 0.45, thin);
  // A round stalk passes light where the way through it is short: at its outline.
  float limb = 1.0 - abs(dot(face, view));
  Tissue t;
  t.albedo = albedo;
  t.through = mix(mix(vec3(0.4, 0.7, 0.2), mix(vec3(0.47, 0.64, 0.27), vec3(0.51, 0.64, 0.3) * (1.07 - 0.45 * smoothstep(0.004, 0.032, vCoord.z * ${TOP_M.toFixed(4)})), fresh), tender), mix(vec3(0.2, 0.31, 0.16), vec3(0.42, 0.22, 0.22), saturate(vSkin3.z * 1.2) * (0.35 + 0.45 * blush)), pale) * (mix(0.25 * (1.0 - 0.64 * tender * (1.0 - limb * limb)), 0.1 + 0.4 * limb * limb * limb, pale) * thin);
  t.through = mix(t.through, t.through.g * vec3(1.2, 0.4, 0.32), 0.35 * flush);
  t.through *= mix(1.0, mix(0.45, 1.75, smoothstep(-0.5, 0.7, dot(face, uSunDir))), max(pale, fresh));
  t.face = face;
  t.normal = normal;
  t.rough = rough;
  t.wax = wax;
  // The bracts keep the sky off the stem's last centimeter, so little rime settles there.
  float lee = uPlantFrost * vSkin3.x;
  t.sheen = mix(0.5, ${GUIDE.sheen}, thin) * (1.0 - 0.4 * pale) * (1.0 - 0.6 * (1.0 - pale) * vSkin3.z) * (1.0 - 0.95 * lee);
  t.occlusion = vSkin2.x * (1.0 - 0.5 * ribbed * furrow) * (1.0 - 0.9 * lee);
#ifdef PLANT_FIELD
  vec3 color = shadeTissue(t, vWorld, view);
  // No hairs are drawn on a neighbor: the halo they catch against the sun pales the stalk from its edge inward.
  float graze = 1.0 - abs(dot(face, view));
  float toSun = saturate(dot(-view, uSunDir));
  // Under a light bluer than it is red, the moon or an overcast, the halo is the light's own color.
  vec3 halo = mix(vec3(0.8, 0.95, 0.6), vec3(1.0), smoothstep(0.0, 0.2, (uSunColor.b - uSunColor.r) / max(uSunColor.g, 1e-4)));
  color += uSunColor * halo * (0.2 * plantSun(vWorld, face) * graze * graze * (0.3 + 0.7 * toSun * toSun) * (1.0 - foot));
#else
  // The young stem is clear, moist flesh: the sun enters at its outline and leaves toward the lens.
  vec3 color = shadeTissueClear(t, vWorld, view, vec2(vCoord.x * 0.08, vCoord.z * ${TOP_M.toFixed(4)}), 0.0, 0.7 * max(pale, fresh));
#endif
  outColor = finish(color, vWorld, vDepth, density);
}
`
