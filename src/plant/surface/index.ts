// The skin of the plant: one way of lighting every part of it.
// `real` turns true once this folder holds the plant's skin at its real quality.
export const real = true

// What the skin expects from each kind of part. `through` is the brightest channel of the color a part passes in.
export const tissueGuide = {
  leafTop: { rough: 0.82, wax: 0.3, sheen: 0.6, through: 0.5 },
  leafUnderside: { rough: 0.9, wax: 0.12, sheen: 0.85, through: 0.5 },
  seedLeaf: { rough: 0.38, wax: 0.8, sheen: 0, through: 0.7 },
  stalk: { rough: 0.78, wax: 0.2, sheen: 0.9, through: 0.15 },
  stem: { rough: 0.78, wax: 0.2, sheen: 0.8, through: 0 },
  bract: { rough: 0.85, wax: 0.15, sheen: 1, through: 0.15 },
  receptacle: { rough: 0.9, wax: 0.1, sheen: 0.8, through: 0 },
  ray: { rough: 0.62, wax: 0.35, sheen: 0.25, through: 1 },
  floret: { rough: 0.7, wax: 0.3, sheen: 0.15, through: 0.5 },
} as const

// A part fills a Tissue for the pixel and gives it to shadeTissue. Needs the chunks of `makePartSurface` before it.
export const tissueGlsl = /* glsl */ `
struct Tissue {
  // The color of the skin.
  vec3 albedo;
  // The color of sunlight that has come through from the far side. Black for a part too thick to light up.
  vec3 through;
  // The normal used for light, in the world, with the relief of the skin in it, on the viewer's side.
  vec3 normal;
  // The normal of the surface itself, on the viewer's side.
  vec3 face;
  // 0 glossy to 1 dull.
  float rough;
  // How strong the glossy layer is, 0 to 1.
  float wax;
  // How strongly fine hair lights up along an edge against the light, 0 to 1.
  float sheen;
  // 1 open to 0 buried: creases, the inside of the bud, the foot of a petal.
  float occlusion;
};

// A normal bent by a height in meters, with no need of tangents.
vec3 reliefNormal(vec3 n, vec3 world, float height, float strength) {
  vec3 dx = dFdx(world);
  vec3 dy = dFdy(world);
  float hx = dFdx(height);
  float hy = dFdy(height);
  vec3 r1 = cross(dy, n);
  vec3 r2 = cross(n, dx);
  float det = dot(dx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2) * (strength / max(abs(det), 1e-12));
  // A slope past about 50 degrees is finer than the pixel or a mistake: eased off so it cannot sparkle.
  return normalize(n - grad * inversesqrt(1.0 + 0.7 * dot(grad, grad)));
}

// The share of the sun a thin tissue passes when 'through' is 1.
const float TISSUE_THROUGH = 0.17;
const float TISSUE_FORWARD = 0.4;
// Wax: a dielectric of index 1.45.
const float TISSUE_F0 = 0.0337;
const float TISSUE_FUZZ = 0.22;
// A thin part shaded by a thin part this close still gets the sun that came through it.
const float TISSUE_LAYER = 1.6;
const float TISSUE_LAYER_M = 0.006;
// The share of the sun a shaded thin tissue gets off its lit neighbors, and how far toward the sun the head is asked whether it is lit.
const float TISSUE_BOUNCE = 0.028;
const float TISSUE_BOUNCE_M = 0.15;
// Hairs too short to draw: a line of light along the outline of a hairy part.
const float TISSUE_FELT = 0.8;
const float TISSUE_FELT_M = 0.03;

// With the sun low the sky is bright and warm on its side, dim and cool away from it; thick air evens it. The mean of skyAmbient is kept.
vec3 tissueSky(vec3 n) {
  vec3 sky = skyAmbient(n);
  float level = (1.0 - n.y * n.y) * (1.0 - uSunDir.y * uSunDir.y);
  float toward = dot(n.xz, uSunDir.xz) * inversesqrt(max(level, 1e-4));
  level *= saturate(1.15 - 26.0 * uFogDensity);
  float side = saturate(0.5 + 0.5 * toward);
#ifndef PLANT_FIELD
  float lum = dot(sky, vec3(0.3, 0.6, 0.1));
  float cool = dot(uSkyZenith, vec3(0.3, 0.6, 0.1));
  sky = mix(sky, uSkyZenith * (lum / max(cool, 1e-4)), 0.75 * level * (1.0 - side) * smoothstep(-0.4, 0.0, n.y));
#endif
  return sky * mix(1.0, 0.2 + 2.56 * side * side * side, level);
}

// 'edge' is 1 on the margin of a blade and falls to 0 a pixel or two inside: a flat blade has an outline the skin cannot find by itself.
vec3 shadeTissueEdge(Tissue t, vec3 world, vec3 view, float edge) {
  // Normals handed over on the far side are turned round, not lit from inside.
  float turn = dot(t.face, view) < 0.0 ? -1.0 : 1.0;
  vec3 F = t.face * turn;
  // A film of water fills the fine relief.
  vec3 N = normalize(mix(t.normal * turn, F, 0.6 * uPlantWet));
  vec3 L = uSunDir;
  float ndl = dot(N, L);
  float fdl = dot(F, L);
  float ndv = min(abs(dot(N, view)) + 0.002, 1.0);
  float against = saturate(dot(-view, L));
  float grazing = 1.0 - ndv;
  float rim = grazing * grazing;
  rim *= rim * grazing;
  float tone = plantTone();
  vec3 albedo = t.albedo * tone;
  vec3 through = t.through * (tone * TISSUE_THROUGH);
  // What a tissue sends back and what it passes on never add up to more than arrives.
  vec3 total = albedo + through;
  float keep = 1.0 / max(1.0, max(total.r, max(total.g, total.b)));
  albedo *= keep;
  through *= keep;
  float rough = t.rough;
  float wax = t.wax;
  float fuzz = t.sheen;

  float wet = uPlantWet;
  albedo = mix(albedo, albedo * (0.38 + 0.62 * albedo), wet);
  rough = mix(rough, min(rough, 0.3), wet);
  wax = mix(wax, 1.0, wet);
  fuzz *= 1.0 - 0.6 * wet;

  float dew = uPlantDew * (1.0 - wet);
  fuzz = min(1.0, fuzz + 0.2 * dew * rim);

  float frost = uPlantFrost;
  float bloom = frost * (0.16 + 0.26 * saturate(N.y) * saturate(N.y) + 0.34 * rim) * (0.55 + 0.45 * t.sheen);
  float grey = dot(albedo, vec3(0.3, 0.6, 0.1));
  albedo = mix(albedo, mix(albedo, vec3(0.92, 1.0, 1.04) * grey, 0.4) * 0.85, frost);
  albedo = mix(albedo, vec3(0.7, 0.76, 0.84), bloom);
  through *= 1.0 - 0.65 * bloom;
  rough = mix(rough, 1.0, bloom);
  fuzz = max(fuzz, bloom);

  float peak = max(through.r, max(through.g, through.b));
  // A thin part is asked on the sun's side. A thick one is asked just off its skin, where its hairs stand.
  vec3 lee = fdl >= 0.0 || peak <= 0.0 ? F : -F;
  // How far inside the outline the pixel is, in pixels, from how fast the face turns away.
  float fv = abs(dot(F, view));
  float line = max(1.0 - smoothstep(0.6, 2.6, 0.5 * fv / max(fwidth(fv), 1e-5)), edge);
  // On the outline of a thick part the sun is asked where the tips of its hairs are, clear of the part itself.
  float sun = plantSun(world + L * (TISSUE_FELT_M * line * step(peak, 0.0)), lee);
  float open = plantSky(world) * t.occlusion;
  vec3 skyFront = tissueSky(N);
  vec3 skyBack = tissueSky(-N);

  float back = -(0.65 * fdl + 0.35 * ndl);
  float wrap = saturate((back + 0.35) / 1.35);
  vec3 hue = through / max(peak, 1e-4);
  // A longer path inside the blade deepens the color.
  float slant = saturate(0.6 * (1.0 / max(ndv, 0.3) - 1.0));
  vec3 passed = through * mix(vec3(1.0), hue, slant) * (1.0 - 0.3 * slant);
  float lobe = (1.0 - TISSUE_FORWARD) + TISSUE_FORWARD * 2.5 * against * against * against;

#ifdef PLANT_FIELD
  vec3 color = albedo * (uSunColor * (max(ndl, 0.0) * sun) + skyFront * open);
  color += passed * (uSunColor * (wrap * lobe * sun) + skyBack * (open * (0.6 + 0.4 * sun)));
  color += (uSunColor * (sun * (0.5 + 0.5 * ndl) * (0.15 + 0.85 * against * against)) + skyFront * (0.5 * open)) * (TISSUE_FUZZ * fuzz * rim);
  return color;
#else
  vec3 glow = vec3(sun);
  float reach = 1.0;
  if (peak > 0.0 && sun < 0.98 && uShadowOn > 0.5) {
    float beyond = sunShadow(world + L * TISSUE_LAYER_M, lee, uShadowTexelM * 2.5);
    glow += min(through * TISSUE_LAYER, vec3(1.0)) * saturate(beyond - sun);
    reach = sunShadow(world + L * TISSUE_BOUNCE_M, L, uShadowTexelM * 2.5);
  }
  vec3 H = normalize(L + view);
  float ndh = saturate(dot(N, H));
  float vdh = saturate(dot(view, H));
  float lit = max(ndl, 0.0) * smoothstep(-0.08, 0.12, fdl);

  // The highlight is widened where the normal turns fast or the relief is steep, so it cannot shimmer, and in thick air, where the sun is a wide glow.
  vec3 nx = dFdx(N);
  vec3 ny = dFdy(N);
  float a = max(rough * rough, 0.03);
  float a2 = min(a * a + min(0.5 * (dot(nx, nx) + dot(ny, ny)), 0.2) + 0.6 * (1.0 - saturate(dot(N, F))) + 0.03 * (1.0 - saturate(1.15 - 26.0 * uFogDensity)), 1.0);
  a = sqrt(a2);

  float f5 = 1.0 - vdh;
  f5 = f5 * f5 * f5 * f5 * f5;
  float fresnel = TISSUE_F0 + (1.0 - TISSUE_F0) * f5;
  float d = ndh * ndh * (a2 - 1.0) + 1.0;
  float vis = 0.5 / max(lit * (ndv * (1.0 - a) + a) + ndv * (lit * (1.0 - a) + a), 1e-4);
  float gloss = min(wax * fresnel * (a2 / (d * d)) * vis * lit, 8.0);

  float g5 = grazing * grazing;
  g5 = g5 * g5 * grazing;
  float mirror = wax * (TISSUE_F0 + (max(1.0 - rough, TISSUE_F0) - TISSUE_F0) * g5);
  vec3 R = reflect(-view, N);
  vec3 skyGloss = tissueSky(normalize(mix(R, N, a2)));

  // What gets under the wax is what the wax did not send back.
  float l5 = 1.0 - max(ndl, 0.0);
  l5 = l5 * l5 * l5 * l5 * l5;
  float enter = 1.0 - wax * (TISSUE_F0 + (1.0 - TISSUE_F0) * l5);
  float under = (1.0 - mirror) * (1.0 - 0.5 * fuzz * rim);

  float s = dot(L, view) - ndl * ndv;
  float q = s > 0.0 ? max(max(ndl, 0.0), ndv) : 1.0;
  float base = 1.0 / (1.0 + 0.2878 * rough);
  float matte = lit * base * (1.0 + rough * s / max(q, 1e-3));

  // A crease of a bright tissue is lit by its own walls: darker and richer, never grey.
  vec3 buried = vec3(open) / (1.0 - albedo * (1.0 - open) * 0.85);
  float crease = 0.4 + 0.6 * t.occlusion;

  vec3 direct = uSunColor * (sun * crease);
  float lit1 = max(glow.r, max(glow.g, glow.b));
  // The neighbors are taken to be as bright as the part itself: petals light each other far more than leaves do.
  float thin = saturate(max(t.through.r, max(t.through.g, t.through.b)) / 0.6) * min(max(albedo.r, max(albedo.g, albedo.b)) / 0.7, 1.0);
  float shade = 1.0 - saturate(lit1);
  // The neighbors that shade a thin part stand in front of some of its sky.
  vec3 color = albedo * (direct * (matte * enter * under) + skyFront * buried * (under * (1.0 - 0.4 * thin * shade)));
  color += direct * gloss + skyGloss * (mirror * open);
  // What hides the sun hides the brightest of the sky behind as well: a shaded blade does not glow by itself.
  float behind = 0.6 + 0.4 * lit1;
  color += passed * (uSunColor * glow * (crease * wrap * lobe) + skyBack * (open * behind));
  // In shade a thin, colored tissue is lit by the sun off its neighbors and through them: twice colored, so deep and warm.
  color += albedo * hue * uSunColor * (TISSUE_BOUNCE * crease * thin * reach * shade * under);
  float catches = (0.5 + 0.5 * ndl) * (0.15 + 0.85 * against * against);
  vec3 pale = mix(vec3(1.0), albedo / max(max(albedo.r, max(albedo.g, albedo.b)), 1e-3), 0.3);
  color += (direct * catches + skyFront * (0.5 * open)) * pale * (TISSUE_FUZZ * fuzz * rim);

  float px = length(fwidth(world));
  float lumps = 1.0 + 0.3 * saturate(2.0 - 420.0 * px) * sin(world.y * 420.0 + 2.0 * sin(world.x * 190.0 + world.z * 230.0))
    + 0.15 * saturate(2.0 - 2100.0 * px) * sin(world.y * 2100.0 + world.x * 900.0 - world.z * 700.0);
  float toSun = (0.2 + 0.8 * against * against) * (0.35 + 0.65 * saturate(0.5 + 0.5 * fdl));
  color += direct * pale * (TISSUE_FELT * fuzz * line * lumps * toSun);
  return color;
#endif
}

vec3 shadeTissue(Tissue t, vec3 world, vec3 view) {
  return shadeTissueEdge(t, world, view, 0.0);
}
`
