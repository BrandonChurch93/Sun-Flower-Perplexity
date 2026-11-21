import { dewGlsl } from './dew/index.ts'
import { frostGlsl } from './frost/index.ts'
import { wetGlsl } from './wet/film.ts'

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
  bract: { rough: 0.85, wax: 0.15, sheen: 0.45, through: 0.3 },
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

vec3 reliefTilt(vec3 n, vec3 world, float hx, float hy, float strength) {
  vec3 dx = dFdx(world);
  vec3 dy = dFdy(world);
  vec3 r1 = cross(dy, n);
  vec3 r2 = cross(n, dx);
  float det = dot(dx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2) * (strength / max(abs(det), 1e-12));
  // A slope past about 50 degrees is finer than the pixel or a mistake: eased off so it cannot sparkle.
  return normalize(n - grad * inversesqrt(1.0 + 0.7 * dot(grad, grad)));
}

// A normal bent by a height in meters, with no need of tangents.
vec3 reliefNormal(vec3 n, vec3 world, float height, float strength) {
  return reliefTilt(n, world, dFdx(height), dFdy(height), strength);
}

// Half the reach of one pixel in a part's own coordinates. A height differenced from one such step back to one ahead fades by itself where it is finer than a pixel.
vec2 reliefReach(vec2 at) {
  vec2 ax = dFdx(at);
  vec2 ay = dFdy(at);
  return max(0.5 * sqrt(ax * ax + ay * ay), vec2(1e-7));
}

// As reliefNormal, for a part that knows the slope of its height in its own coordinates, in meters per unit of 'at'. The screen takes differences in blocks of two pixels, which shows on a fine height; the coordinates themselves run smooth.
vec3 reliefSlope(vec3 n, vec3 world, vec2 at, vec2 slope, float strength) {
  return reliefTilt(n, world, dot(slope, dFdx(at)), dot(slope, dFdy(at)), strength);
}

// The share of the sun a thin tissue passes when 'through' is 1.
const float TISSUE_THROUGH = 0.17;
const float TISSUE_FORWARD = 0.55;
const float TISSUE_BEAM = 5.5;
// Wax: a dielectric of index 1.45.
const float TISSUE_F0 = 0.0337;
const float TISSUE_FUZZ = 0.22;
// The sun on the down of a part that turns away: a soft band, never a line.
const float TISSUE_GLANCE = 0.09;
const float TISSUE_DOWN = 0.14;
// The short down that stands off the outline of a round body, lit from behind: one bright line on the sun's side.
const float TISSUE_EDGE = 1.0;
// A thin part shaded by something this close still gets the sun that came through or round it.
const float TISSUE_LAYER = 1.6;
const float TISSUE_LAYER_M = 0.025;
// The share of the sun a shaded thin tissue gets off its lit neighbors.
const float TISSUE_BOUNCE = 0.06;
// A shadow on the far side of a sheet is seen through the sheet: spread this wide, and wider for what stands off it.
const float TISSUE_SPREAD_M = 0.005;
const float TISSUE_SPREAD_FAR_M = 0.012;
// What hides the sun hides the bright sky round it: the share of that sky left to a part in shade.
const float TISSUE_HID = 0.35;
// The share of the high sky that the down of a sheet scatters to the eye.
const float TISSUE_SLATE = 0.21;
// The share of the sun a clear, moist body sends on from its outline on the sun's side.
const float TISSUE_CLEAR = 0.6;

// The share by which a blade passes more of the sun once the evening has come.
const float TISSUE_LATE = 4.0;

// The evening, from 52 s: the high sky goes out behind the haze and the low sun is all the light a leaf has. Exactly 0 before.
float tissueEvening() {
  return smoothstep(52.0, 55.0, uTime);
}

// A sun no brighter than the sky over it stands in mist or cloud: 0 there, 1 under a clear sun.
float tissueClearSun() {
  return smoothstep(1.5, 5.0, dot(uSunColor, vec3(0.3, 0.6, 0.1)) / max(dot(skyAmbient(vec3(0.0, 1.0, 0.0)), vec3(0.3, 0.6, 0.1)), 1e-4));
}

// With the sun low the sky is bright and warm on its side, dim and cool away from it; thick air evens it. The mean of skyAmbient is kept.
vec3 tissueSky(vec3 n, float shown) {
  vec3 sky = skyAmbient(n);
  float level = (1.0 - n.y * n.y) * (1.0 - uSunDir.y * uSunDir.y);
  float toward = dot(n.xz, uSunDir.xz) * inversesqrt(max(level, 1e-4));
  level *= (1.0 - uSkyEven) * tissueClearSun();
  float side = saturate(0.5 + 0.5 * toward);
#ifndef PLANT_FIELD
  float lum = dot(sky, vec3(0.3, 0.6, 0.1));
  float cool = dot(uSkyZenith, vec3(0.3, 0.6, 0.1));
  sky = mix(sky, uSkyZenith * (lum / max(cool, 1e-4)), 0.35 * level * (1.0 - side) * smoothstep(-0.4, 0.0, n.y));
  // The sky round a low sun takes the sun's own color: the bright side of a round body is warm, not pale.
  vec3 near = uSunColor * (lum / max(dot(uSunColor, vec3(0.3, 0.6, 0.1)), 1e-4));
  return sky * mix(1.0, 0.25, level) + mix(sky, near, 0.6) * (2.4 * side * side * side * level * shown);
#else
  return sky * mix(1.0, 0.25 + 2.4 * side * side * side, level);
#endif
}

${frostGlsl}
${dewGlsl}
${wetGlsl}

vec3 tissueShade(Tissue t, vec3 world, vec3 view, vec2 at, float margin, float clear, float sheet) {
  // Normals handed over on the far side are turned round, not lit from inside.
  float turn = dot(t.face, view) < 0.0 ? -1.0 : 1.0;
  vec3 F = t.face * turn;
  float wet = uPlantWet;
  // How deep the water stands here. A part that does not say where the pixel is wears an even damp film.
  float film = 0.25;
#ifndef PLANT_FIELD
  if (wet > 0.0 && margin >= 0.0) film = sheet > 0.0 ? wetFilm(at, margin) : wetRuns(at);
#endif
  // A film of water fills the fine relief.
  // Rain lands on what faces up: under a leaf the skin is only damp.
  float rained = wet * mix(0.3, 1.0, smoothstep(-0.2, 0.3, F.y));
  vec3 N = normalize(mix(t.normal * turn, F, rained * (WET_LEVEL_THIN + WET_LEVEL_DEEP * film)));
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
  // A soaked blade is clearer: water takes the place of the air in it.
  if (wet > 0.0) through *= 1.0 + WET_SHEER * wet;
  // What a tissue sends back and what it passes on never add up to more than arrives.
  vec3 total = albedo + through;
  float keep = 1.0 / max(1.0, max(total.r, max(total.g, total.b)));
  albedo *= keep;
  through *= keep;
  float rough = t.rough;
  float wax = t.wax;
  float fuzz = t.sheen;

  if (wet > 0.0) albedo = mix(albedo, wetAlbedo(albedo), wet);
  rough = mix(rough, min(rough, mix(WET_ROUGH_THIN, WET_ROUGH_DEEP, film)), rained);
  wax = mix(wax, max(wax, WET_WAX), rained);
  // Wet down lies flat under the water.
  fuzz *= 1.0 - 0.8 * rained;

  float dew = uPlantDew * (1.0 - wet);
  // The mist on both faces of a dry sheet turns back the sun that would cross it; the even light of the sky behind it comes through. Where the skin is damp the mist has run into a clear film and the sun crosses.
  float crossed = 1.0 - DEW_SHADE * dew * sheet * saturate(1.0 - 4.0 * wet);
  fuzz = min(1.0, fuzz + 0.2 * dew * rim);
  float mist = 0.0;
#ifndef PLANT_FIELD
  if (dew > 0.0) {
    mist = dew * (margin >= 0.0 ? dewMist(at, margin) : 0.55);
    // A moist skin is smoother and its wax shows.
    rough = mix(rough, min(rough, DEW_ROUGH), mist);
    wax = mix(wax, max(wax, DEW_WAX), mist);
  }
#endif

  // At the outline the eye meets the tips of the hairs, which the hair part draws, and not the skin: within two pixels of it the sun on the skin fades, so no term can draw a line one pixel wide.
  float fv = abs(dot(F, view));
  float inside = smoothstep(0.4, 2.4, 0.5 * fv / max(fwidth(fv), 1e-5));
  float gf = 1.0 - fv;
  // A round body turns its whole edge to grazing: the sheens of a blade would draw a rail down each side of it.
  vec3 fw = fwidth(F);
  vec3 ww = fwidth(world);
  float blade = 1.0 - smoothstep(15.0, 45.0, sqrt(dot(fw, fw) / max(dot(ww, ww), 1e-12)));
  float soft = gf * gf * inside * blade;

  float frost = uPlantFrost;
  // Rime is seen thick where the eye looks along the face itself, not along each fold of its relief.
  float brink = gf * gf;
  brink *= brink * gf;
  float bloom = frost * (0.08 + 0.26 * saturate(N.y) * saturate(N.y) + 0.34 * brink) * (0.55 + 0.45 * t.sheen);
  float flash = 0.0;
#ifndef PLANT_FIELD
  if (frost > 0.0 && margin >= 0.0) {
    vec2 crust = frostCrust(at, margin, N, F, view, t.sheen, brink);
    bloom = frost * crust.x;
    flash = frost * crust.y;
  }
  // The down of a round body holds rime all over: a frosted stem is paler than its skin. A sheet has its own crust.
  float body = (1.0 - sheet) * (1.0 - blade);
  bloom = min(1.0, bloom + frost * FROST_DOWN * smoothstep(0.4, 0.8, t.sheen) * body);
#endif
  float grey = dot(albedo, vec3(0.3, 0.6, 0.1));
  // A frozen tissue is a cold dark green: its yellow goes and the thin ice over it is blue.
  albedo = mix(albedo, mix(albedo, FROST_COLD * grey, 0.7) * 0.9, frost);
  albedo = mix(albedo, FROST_RIME, bloom);
  // Rime on the sun's side sends most of the sun back before it reaches the blade.
  through *= (1.0 - FROST_SHUT * frost) * (1.0 - 0.65 * bloom);
  rough = mix(rough, 1.0, bloom);
  fuzz = max(fuzz, bloom);
  // Hoar breaks the mirror of the wax: a frozen skin is matt.
  wax *= 1.0 - FROST_MATT * frost;

  float peak = max(through.r, max(through.g, through.b));
  // A thin part is asked on the sun's side, a thick one on the side that is seen.
  vec3 lee = fdl >= 0.0 || peak <= 0.0 ? F : -F;
#ifdef PLANT_FIELD
  float sun = plantSun(world, lee);
  float lit1 = sun;
#else
  // The spread is one or two lookups turned with the sample of the frame: the samples together make the soft edge.
  float spin = 6.2832 * uShutter;
  vec3 t1 = normalize(cross(F, abs(F.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(F, t1);
  vec3 across = t1 * cos(spin) + t2 * sin(spin);
  float lift = uShadowTexelM * 2.5 + 0.25 * TISSUE_SPREAD_M;
  float sun;
  if (peak > 0.0 && fdl < 0.0 && uShadowOn > 0.5) {
    sun = 0.5 * (sunShadow(world + across * TISSUE_SPREAD_M, lee, lift) + sunShadow(world - across * (0.55 * TISSUE_SPREAD_M), lee, lift));
  } else {
    sun = plantSun(world, lee);
  }
  vec3 glow = vec3(sun);
  float reach = 1.0;
  if (peak > 0.0 && sun < 0.98 && uShadowOn > 0.5) {
    float beyond = sunShadow(world + L * TISSUE_LAYER_M + (t2 * cos(spin) - t1 * sin(spin)) * TISSUE_SPREAD_FAR_M, lee, lift);
    glow += min(through * TISSUE_LAYER, vec3(1.0)) * saturate(beyond - sun);
    // The bounce never switches off along a shadow's edge: the creases of the part dim it instead.
    reach = 0.5 + 0.5 * beyond;
  }
  float lit1 = max(glow.r, max(glow.g, glow.b));
#endif
  float open = plantSky(world) * t.occlusion;
  float shown = mix(TISSUE_HID, 1.0, saturate(lit1));
  vec3 skyFront = tissueSky(N, shown);
  vec3 skyBack = tissueSky(-N, shown);
  // What a soaked blade passes is most of all the sky that stands straight behind it.
  if (wet > 0.0) skyBack = mix(skyBack, wetBehind(-view), WET_FORWARD * wet);
  if (dew > 0.0) skyBack = mix(skyBack, dewBehind(), DEW_FORWARD * dew * sheet);

  float back = -(0.65 * fdl + 0.35 * ndl);
  float wrap = saturate((back + 0.35) / 1.35);
  vec3 hue = through / max(peak, 1e-4);
  // A longer path inside the blade deepens the color.
  float slant = saturate(0.6 * (1.0 / max(ndv, 0.3) - 1.0));
  vec3 passed = through * mix(vec3(1.0), hue, 0.85 + 0.15 * slant) * (1.0 - 0.3 * slant);
  // A soaked blade is evenly clear between its veins: what it passes of the sky no longer follows its thin and thick places.
  vec3 evened = (hue * hue * (WET_PASS * smoothstep(0.0, WET_VEIN, peak)) - passed) * (wet * sheet);
  float a4 = against * against;
  a4 *= a4;
  a4 *= a4;
  float sheer = saturate(max(t.through.r, max(t.through.g, t.through.b)) / 0.6);
  // Most of what a sheet passes is spread wide; a blade keeps a share close to the line of the sun, a petal's skin of small domes does not. The parts together stay under what arrives.
  float lobe = (1.0 - TISSUE_FORWARD) + TISSUE_FORWARD * (2.0 * against * against * against + TISSUE_BEAM * (1.0 - sheer) * a4 * a4);
  // In the evening a blade is lit from behind and glows: a petal, far sheerer, is left as it is.
  float dusk = tissueEvening() * (1.0 - sheer) * (1.0 - sheer);
  // What it passes then is the low sun hardly dyed, most where the face stands square to it: gold on one blade, green on the next.
  // Never more than the blade has left after what it returns.
  float room = max((1.0 - max(albedo.r, max(albedo.g, albedo.b))) / max(peak, 1e-4) - 1.0, 0.0);
  vec3 lamp = through * uSunColor * (min(TISSUE_LATE * dusk * (0.2 + 1.6 * wrap * saturate(-ndl)), room) * wrap * lobe * crossed);
  if (dew > 0.0) skyBack *= 1.0 + min(mix(DEW_SHEER, DEW_SHEER_DRY, saturate(1.0 - 4.0 * wet)) * dew * sheet, room);

#ifdef PLANT_FIELD
  vec3 color = albedo * (uSunColor * (max(ndl, 0.0) * sun) + skyFront * open);
  color += passed * (uSunColor * (wrap * lobe * sun * crossed) + skyBack * (open * (0.6 + 0.4 * sun))) + lamp * sun;
  color += (uSunColor * (sun * (0.5 + 0.5 * ndl) * (0.15 + 0.85 * against * against)) + skyFront * (0.5 * open)) * (TISSUE_FUZZ * fuzz * rim);
  // The wax of a shaded leaf mirrors the high sky: the slate in the shade of a field. Broad, and gone at the very edge.
  color += uSkyZenith * (0.8 * wax * open * grazing * (1.0 - rim) * uClosed * (1.0 - dusk));
  return color;
#else
  vec3 H = normalize(L + view);
  float ndh = saturate(dot(N, H));
  float vdh = saturate(dot(view, H));
  float lit = max(ndl, 0.0) * smoothstep(-0.08, 0.12, fdl);

  // The highlight is widened where the normal turns fast or the relief is steep, so it cannot shimmer, and in thick air, where the sun is a wide glow.
  vec3 nx = dFdx(N);
  vec3 ny = dFdy(N);
  float a = max(rough * rough, 0.03);
  float a2 = min(a * a + min(0.5 * (dot(nx, nx) + dot(ny, ny)), 0.2) + 0.6 * (1.0 - saturate(dot(N, F))) + 0.03 * uSkyEven + 0.2 * (1.0 - tissueClearSun()), 1.0);
  a = sqrt(a2);

  float f5 = 1.0 - vdh;
  f5 = f5 * f5 * f5 * f5 * f5;
  float fresnel = TISSUE_F0 + (1.0 - TISSUE_F0) * f5;
  float d = ndh * ndh * (a2 - 1.0) + 1.0;
  float vis = 0.5 / max(lit * (ndv * (1.0 - a) + a) + ndv * (lit * (1.0 - a) + a), 1e-4);
  // The mist of beads that breaks the mirror of the sky breaks the mirror of the sun.
  float gloss = min(wax * fresnel * (a2 / (d * d)) * vis * lit, 2.0) * (1.0 - DEW_BREAK * mist);

  float g5 = grazing * grazing;
  g5 = g5 * g5 * grazing;
  // The rise of the mirror at grazing is a line thinner than a pixel on a small round part: it fades with the outline.
  // A mist of beads breaks the mirror: each bead shows the whole sky, so the rise at grazing goes and the high sky takes the place of the horizon.
  float mirror = wax * (TISSUE_F0 + (max(1.0 - rough, TISSUE_F0) - TISSUE_F0) * g5 * (1.0 - fuzz) * inside * (1.0 - DEW_BREAK * mist));
  vec3 R = reflect(-view, N);
  // Water on a living skin is never one mirror: it stands over cells and hairs, and each small rise shows its own piece of the sky.
  if (rained > 0.0 && margin >= 0.0) R = normalize(R + wetRipple(at, t1, t2) * rained);
  vec3 toSky = normalize(mix(R, N, max(a2, DEW_BREAK * mist)));
  vec3 skyGloss = tissueSky(toSky, shown);
  if (rained > 0.0) skyGloss = mix(skyGloss, wetSky(toSky), rained);

  // What gets under the wax is what the wax did not send back.
  float l5 = 1.0 - max(ndl, 0.0);
  l5 = l5 * l5 * l5 * l5 * l5;
  float enter = 1.0 - wax * (TISSUE_F0 + (1.0 - TISSUE_F0) * l5);
  float under = (1.0 - mirror) * (1.0 - 0.5 * fuzz * rim);
  float skin = mix(1.0, inside, max(fuzz, 0.7) * smoothstep(0.2, 0.8, against));
  // Sun that comes in low, or is seen low, crosses the down on a long path: that light belongs to the hairs, and the skin under them stays in shade.
  skin *= exp(-0.35 * fuzz * (1.0 / max(fv, 0.05) + 1.0 / max(ndl, 0.05) - 2.0));

  float s = dot(L, view) - ndl * ndv;
  float q = s > 0.0 ? max(max(ndl, 0.0), ndv) : 1.0;
  float base = 1.0 / (1.0 + 0.2878 * rough);
  float matte = lit * base * (1.0 + rough * s / max(q, 1e-3));

  // A crease of a bright tissue is lit by its own walls: darker and richer, never grey.
  vec3 buried = vec3(open) / (1.0 - albedo * (1.0 - open) * 0.85);
  float crease = 0.4 + 0.6 * t.occlusion;

  vec3 direct = uSunColor * (sun * crease);
  // The neighbors are taken to be as bright as the part itself: petals light each other far more than leaves do.
  float thin = sheer * min(max(albedo.r, max(albedo.g, albedo.b)) / 0.7, 1.0);
  float shade = 1.0 - saturate(lit1);
  // The neighbors that shade a thin part stand in front of some of its sky.
  float cover = 1.0 - 0.8 * thin * shade;
  vec3 color = albedo * (direct * (matte * enter * under * skin) + skyFront * buried * (under * cover));
  // The evening's high sky is no mirror image worth the name on a blade: the cold face goes with it.
  color += direct * (gloss * skin) + skyGloss * (mirror * open * cover * (1.0 - 0.85 * dusk));
  // What hides the sun hides the brightest of the sky behind as well: a shaded blade does not glow by itself.
  float behind = 0.6 + 0.4 * lit1;
  if (dew > 0.0) behind = mix(behind, DEW_BEHIND, dew * sheet);
  color += passed * (uSunColor * glow * (crease * wrap * lobe * crossed) + skyBack * (open * behind)) + lamp * glow * crease;
  if (wet > 0.0) color += evened * skyBack * (open * behind);
  // In shade a thin, colored tissue is lit by the sun off its neighbors and through them: twice colored, so deep and warm.
  color += albedo * hue * uSunColor * (TISSUE_BOUNCE * crease * thin * reach * shade * under * crossed);
  // Only the side that faces the sun: the far side of a stem stays in shade.
  float catches = smoothstep(-0.3, 0.4, 0.5 * (fdl + ndl)) * (0.15 + 0.85 * against * against);
  vec3 pale = mix(vec3(1.0), albedo / max(max(albedo.r, max(albedo.g, albedo.b)), 1e-3), 0.6);
  color += (direct * (catches * TISSUE_GLANCE * soft) + skyFront * (0.5 * open * TISSUE_FUZZ * rim * inside * blade * cover * (1.0 - 0.7 * dusk))) * pale * fuzz;
  // The down on a blade scatters the sky well before the edge: a soft sheen, paler than the green under it.
  color += skyFront * pale * (TISSUE_DOWN * (1.0 - 0.85 * dusk) * open * fuzz * grazing * grazing * (1.0 - rim) * blade * cover);
  // On the broad face of a sheet the down scatters the high sky: the cool sheen of a dark leaf, the short end most and not dyed by the pigment under it. Only what the tissue neither returns nor passes is there to scatter.
  float up = saturate(0.5 + 0.5 * N.y);
  float spare = 1.0 - keep * max(total.r, max(total.g, total.b));
  color += uSkyZenith * vec3(0.6, 0.85, 1.0) * (TISSUE_SLATE * (1.0 - dusk) * spare * open * fuzz * up * up * (1.0 - rim) * cover * (peak > 0.0 ? 1.0 : 0.0));
  // Set by the angle, not the pixel: on a stem a few pixels wide it is thinner than a pixel and gone.
  color += direct * (TISSUE_EDGE * fuzz * catches * (1.0 - blade) * (1.0 - smoothstep(0.05, 0.4, fv)));
  color += direct * (FROST_FLASH * flash);
  // Which side of the outline the sun is on, as the eye sees it.
  float vl = dot(view, L);
  float side = smoothstep(0.0, 0.6, (fdl - fv * vl) / max(sqrt(max(1.0 - vl * vl, 0.0)), 0.05));
  // The rime on the down of a round body lights up where the sun comes through it: the pale side of a frosted stem.
  color += (direct + skyFront * open) * FROST_RIME * (FROST_SIDE * frost * (0.4 + 0.6 * t.sheen) * body * saturate((1.0 - fv) / 0.6) * side);
  // The sun enters a clear body at its outline and leaves toward the eye: a bright line down the sun's side, near the sun's own color.
  if (clear > 0.0) {
    float line = 1.0 - smoothstep(0.08, 0.45, fv);
    vec3 own = mix(vec3(1.0), albedo / max(max(albedo.r, max(albedo.g, albedo.b)), 1e-3), 0.3);
    color += direct * own * (TISSUE_CLEAR * clear * line * line * side * (0.2 + 0.8 * against * against));
  }
  // The dew returns the light in its own color: a silver over the green, brightest when the light comes from behind and low over the skin. The beads stand on the down and send the light on, not back: seen face on they are the skin's own shade, along the outline they are a bright rim.
  color += (direct * (DEW_SUN * smoothstep(-0.25, 0.35, fdl) * (0.35 + 1.65 * against * against) * (0.03 + 0.97 * rim)) + skyFront * (DEW_SKY * open * (0.3 + 0.7 * grazing))) * (mist * under);
  // On the face of a sheet that sees the light the beads lie open to it: a cold sheen in the light's own color, never on a face turned from it.
  color += direct * (DEW_FACE * sheet * smoothstep(0.0, 0.3, min(ndl, fdl)) * (0.35 + 1.65 * against * against) * (1.0 - rim) * mist * under);

  return color;
#endif
}

vec3 shadeTissue(Tissue t, vec3 world, vec3 view) {
  return tissueShade(t, world, view, vec2(0.0), -1.0, 0.0, 0.0);
}

// As shadeTissue, for a part that knows where on its skin the pixel is: 'at' in meters on the skin, 'margin' from 0 in the middle of a face to 1 at its edge or tip. The states of the skin then have a grain: frost stands in grains and gathers at the margin.
vec3 shadeTissueAt(Tissue t, vec3 world, vec3 view, vec2 at, float margin) {
  return tissueShade(t, world, view, at, saturate(margin), 0.0, 1.0);
}

// As shadeTissueAt, for a round body of clear, moist flesh, such as a young stem: 'clear' from 0 to 1 is how much of the sun its outline passes on toward the eye.
vec3 shadeTissueClear(Tissue t, vec3 world, vec3 view, vec2 at, float margin, float clear) {
  return tissueShade(t, world, view, at, saturate(margin), saturate(clear), 0.0);
}
`
