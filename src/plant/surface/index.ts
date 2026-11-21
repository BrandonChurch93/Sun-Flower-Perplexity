// The skin of the plant: one way of lighting every part of it.
// `real` turns true once this folder holds the plant's skin at its real quality.
export const real = true

// What the skin expects from each kind of part. `through` is the brightness of the brightest channel of the color a part passes in.
export const tissueGuide = {
  leafTop: { rough: 0.82, wax: 0.3, sheen: 0.6, through: 0.85 },
  leafUnderside: { rough: 0.9, wax: 0.12, sheen: 0.85, through: 0.85 },
  seedLeaf: { rough: 0.38, wax: 0.8, sheen: 0, through: 1 },
  stalk: { rough: 0.78, wax: 0.2, sheen: 0.9, through: 0.3 },
  stem: { rough: 0.78, wax: 0.2, sheen: 0.8, through: 0 },
  bract: { rough: 0.85, wax: 0.15, sheen: 1, through: 0.45 },
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
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  return normalize(abs(det) * n - strength * grad);
}

// The share of the sun a thin tissue passes when 'through' is 1. With it a part never returns more than arrives: albedo plus what comes through stays under 1.
const float TISSUE_THROUGH = 0.25;
// How much of the light through goes on toward where it was heading, and how tight that lobe is. The lobe keeps its energy: (k + 2) / 2 at its peak.
const float TISSUE_FORWARD = 0.4;
// Wax over a cell wall: a dielectric of index 1.45.
const float TISSUE_F0 = 0.0337;
// The fuzz at its brightest, as a share of the sun.
const float TISSUE_FUZZ = 0.22;
// A thin part shaded by another thin part lying against it still gets the sun that came through that one, taken as a layer of its own kind. Anything farther than this toward the sun shades it fully.
const float TISSUE_LAYER = 1.6;
const float TISSUE_LAYER_M = 0.006;

// The sky is not even. With the sun low, most of its light comes from the sun's side and that side is warm; away from it the sky is dim and takes the color of the zenith. Thick air spreads the light and evens it out. Over all directions this keeps the mean of skyAmbient.
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

vec3 shadeTissue(Tissue t, vec3 world, vec3 view) {
  // A part that hands over normals on the far side is turned round instead of lit from inside.
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
  // Nothing returns more than arrives: what a tissue sends back and what it passes on are scaled down together.
  vec3 total = albedo + through;
  float keep = 1.0 / max(1.0, max(total.r, max(total.g, total.b)));
  albedo *= keep;
  through *= keep;
  float rough = t.rough;
  float wax = t.wax;
  float fuzz = t.sheen;

  // Rain: a film of water. The tissue under it is darker and richer, the film is smooth and the fine hair lies flat.
  float wet = uPlantWet;
  albedo = mix(albedo, albedo * (0.38 + 0.62 * albedo), wet);
  rough = mix(rough, min(rough, 0.3), wet);
  wax = mix(wax, 1.0, wet);
  fuzz *= 1.0 - 0.6 * wet;

  // Dew: a mist of beads too small to see, a little grey and a little bright along the edge.
  float dew = uPlantDew * (1.0 - wet);
  fuzz = min(1.0, fuzz + 0.2 * dew * rim);

  // Frost: the tissue under it turns a dull cold green, and a thin pale bloom lies on it, thicker on faces that look up, on edges and on hair.
  float frost = uPlantFrost;
  float bloom = frost * (0.16 + 0.26 * saturate(N.y) * saturate(N.y) + 0.34 * rim) * (0.55 + 0.45 * t.sheen);
  float grey = dot(albedo, vec3(0.3, 0.6, 0.1));
  albedo = mix(albedo, mix(albedo, vec3(0.92, 1.0, 1.04) * grey, 0.4) * 0.85, frost);
  albedo = mix(albedo, vec3(0.7, 0.76, 0.84), bloom);
  through *= 1.0 - 0.65 * bloom;
  rough = mix(rough, 1.0, bloom);
  fuzz = max(fuzz, bloom);

  vec3 lee = fdl >= 0.0 ? F : -F;
  float sun = plantSun(world, lee);
  float open = plantSky(world) * t.occlusion;
  vec3 skyFront = tissueSky(N);
  vec3 skyBack = tissueSky(-N);

  // Light through. It enters the far face, scatters and leaves from this one: wrapped, so a blade edge on to the sun still glows, and stronger toward the sun.
  float back = -(0.65 * fdl + 0.35 * ndl);
  float wrap = saturate((back + 0.35) / 1.35);
  float peak = max(through.r, max(through.g, through.b));
  vec3 hue = through / max(peak, 1e-4);
  // A longer path inside the blade, seen or lit on the slant, deepens the color.
  float slant = saturate(0.6 * (1.0 / max(ndv, 0.3) - 1.0));
  vec3 passed = through * mix(vec3(1.0), hue, slant) * (1.0 - 0.3 * slant);
  float lobe = (1.0 - TISSUE_FORWARD) + TISSUE_FORWARD * 2.5 * against * against * against;

#ifdef PLANT_FIELD
  vec3 color = albedo * (uSunColor * (max(ndl, 0.0) * sun) + skyFront * open);
  color += passed * (uSunColor * (wrap * lobe * sun) + skyBack * open);
  color += (uSunColor * (sun * (0.5 + 0.5 * ndl) * (0.15 + 0.85 * against * against)) + skyFront * (0.5 * open)) * (TISSUE_FUZZ * fuzz * rim);
  return color;
#else
  vec3 glow = vec3(sun);
  if (peak > 0.0 && sun < 0.98 && uShadowOn > 0.5) {
    float beyond = sunShadow(world + L * TISSUE_LAYER_M, lee, uShadowTexelM * 2.5);
    glow += min(through * TISSUE_LAYER, vec3(1.0)) * saturate(beyond - sun);
  }
  vec3 H = normalize(L + view);
  float ndh = saturate(dot(N, H));
  float vdh = saturate(dot(view, H));
  float lit = max(ndl, 0.0) * smoothstep(-0.08, 0.12, fdl);

  // The highlight must not shimmer where the relief turns faster than a pixel: it is widened there.
  vec3 nx = dFdx(N);
  vec3 ny = dFdy(N);
  float a = max(rough * rough, 0.03);
  float a2 = min(a * a + min(0.5 * (dot(nx, nx) + dot(ny, ny)), 0.2), 1.0);
  a = sqrt(a2);

  // The wax layer: GGX with the Fresnel of a dielectric. Low sun at a grazing angle gives the broad pale sheen.
  float f5 = 1.0 - vdh;
  f5 = f5 * f5 * f5 * f5 * f5;
  float fresnel = TISSUE_F0 + (1.0 - TISSUE_F0) * f5;
  float d = ndh * ndh * (a2 - 1.0) + 1.0;
  float vis = 0.5 / max(lit * (ndv * (1.0 - a) + a) + ndv * (lit * (1.0 - a) + a), 1e-4);
  float gloss = min(wax * fresnel * (a2 / (d * d)) * vis * lit, 8.0);

  // The sky in the wax: dim on a dull leaf, a clear rim on a wet one.
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

  // The lit face: the falloff of a rough surface, flatter than Lambert and brighter back toward the light.
  float s = dot(L, view) - ndl * ndv;
  float q = s > 0.0 ? max(max(ndl, 0.0), ndv) : 1.0;
  float base = 1.0 / (1.0 + 0.2878 * rough);
  float matte = lit * base * (1.0 + rough * s / max(q, 1e-3));

  // A crease of a bright tissue is lit by its own walls: darker, and richer, never grey.
  vec3 buried = vec3(open) / (1.0 - albedo * (1.0 - open) * 0.85);
  float crease = 0.4 + 0.6 * t.occlusion;

  vec3 direct = uSunColor * (sun * crease);
  vec3 color = albedo * (direct * (matte * enter * under) + skyFront * buried * under);
  color += direct * gloss + skyGloss * (mirror * open);
  color += passed * (uSunColor * glow * (crease * wrap * lobe) + skyBack * open);
  float catches = (0.5 + 0.5 * ndl) * (0.15 + 0.85 * against * against);
  // Hair is colorless, but what it scatters has already met the skin under it.
  vec3 pale = mix(vec3(1.0), albedo / max(max(albedo.r, max(albedo.g, albedo.b)), 1e-3), 0.3);
  color += (direct * catches + skyFront * (0.5 * open)) * pale * (TISSUE_FUZZ * fuzz * rim);
  return color;
#endif
}
`
