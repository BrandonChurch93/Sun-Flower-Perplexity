import { RIM_SHARE, RIPE_FROM, SHOWN_FROM } from './opening.ts'

// The head's frame at both ends of the shutter, and the floor of the head as `floorAt` in the skeleton gives it.
const headGlsl = /* glsl */ `
uniform vec3 uHC[2];
uniform vec3 uHA[2];
uniform vec3 uHP[2];
uniform vec3 uHQ[2];
uniform vec3 uHS[2];
uniform vec2 uFloor;
uniform float uCell;

struct Floor { vec3 at; vec3 normal; vec3 outward; vec3 tangent; vec3 axis; float radius; float time; };

Floor floorAt(float rho, float theta) {
#ifdef PLANT_FIELD
  float s = 0.0;
#else
  float s = uShutter;
#endif
  vec3 c = mix(uHC[0], uHC[1], s);
  vec3 a = normalize(mix(uHA[0], uHA[1], s));
  vec3 p = normalize(mix(uHP[0], uHP[1], s));
  vec3 q = normalize(mix(uHQ[0], uHQ[1], s));
  vec3 size = mix(uHS[0], uHS[1], s);
  Floor f;
  f.axis = a;
  f.radius = size.x;
  f.time = size.z;
  f.outward = p * cos(theta) + q * sin(theta);
  f.tangent = cross(a, f.outward);
  float up = size.y * (uFloor.x + uFloor.y * (1.0 - rho * rho));
  f.at = c + f.outward * (rho * size.x) + a * up;
  float slope = 2.0 * size.y * uFloor.y * rho / max(size.x, 1e-6);
  f.normal = normalize(a + f.outward * slope);
  return f;
}
`

export const floretVertex = /* glsl */ `
#define SHOWN_FROM ${SHOWN_FROM.toFixed(3)}
#define RIPE_FROM ${RIPE_FROM.toFixed(3)}
#define RIM_SHARE ${RIM_SHARE.toFixed(3)}
in vec4 aShape;
in vec4 aFloret;
in vec4 aSeed;
uniform float uCover;
uniform float uYoung;
${headGlsl}
out vec3 vWorld;
out vec3 vNormal;
out float vDepth;
out vec4 vInfo;
out vec4 vState;
out vec4 vMore;
out vec4 vKind;

void main() {
  float rho = aFloret.x;
  Floor f = floorAt(rho, aFloret.y);
  float w = f.radius * uCell;
  float grown = smoothstep(SHOWN_FROM, SHOWN_FROM + 3.0, f.time);
  float phase = (f.time - aFloret.z) / aFloret.w;
  float open = smoothstep(0.0, 1.0, phase);
  float lobes = smoothstep(0.1, 0.75, phase);
  float rise = smoothstep(0.2, 1.05, phase);
  float style = smoothstep(0.0, 1.0, (f.time - aFloret.z - aFloret.w - 0.2) / 2.0);
  float swell = smoothstep(-6.0, 0.0, f.time - aFloret.z);
  float rim = smoothstep(0.55, 0.93, rho);
  float blotch = sin(aFloret.y * 2.0 + rho * 9.0) * sin(aFloret.y * 3.0 - rho * 5.0 + 1.3);
  float h1 = fract(aSeed.x * 17.31 + aSeed.w * 5.71);
  float h2 = fract(aSeed.w * 23.17 + aSeed.x * 3.13);
  float h3 = fract(aSeed.y * 1.618 + aSeed.x * 9.73);
  float ripe = smoothstep(0.0, 1.0, (f.time - RIPE_FROM - 1.9 * (1.0 - rho / RIM_SHARE) - 0.8 * h3) / 2.0);
  float lump = h2 * h2 * sqrt(h2);
  float edge = smoothstep(0.85, 0.915, rho);

  float tilt = aSeed.w * 6.2832;
  vec3 axis = normalize(f.normal + f.outward * (0.05 + open * (0.06 + 0.22 * rim)) + (f.outward * cos(tilt) + f.tangent * sin(tilt)) * (0.17 + 0.28 * open) * aSeed.x);
  vec3 fx = normalize(f.outward - axis * dot(f.outward, axis));
  vec3 fy = cross(axis, fx);
  float ct = cos(aSeed.y);
  float st = sin(aSeed.y);
  vec3 ex = fx * ct + fy * st;
  vec3 ey = fy * ct - fx * st;

  float middle = smoothstep(0.0, 0.24, rho);
  float tall = w * 1.2 * mix(0.45, 1.0, middle) * aSeed.z * (0.68 + 0.64 * h1) * (1.0 + 0.22 * swell) * grown * (1.0 - 0.25 * uYoung) * (1.0 + 0.1 * blotch);
  float tube = w * 2.6 * (0.72 + 0.5 * aSeed.x) * (1.0 + 0.1 * blotch);
  float throat = mix(0.78 * tall, tube, open);
  float rc = w * 0.66;
  float top = throat - 0.12 * tall + rise * w * 1.3 * (0.45 + 1.1 * h1);

  float piece = aShape.x;
  float level = aShape.y;
  vec3 local;
  vec3 normal;
  float along = 0.0;
  float around = aShape.w;
  float occ = 1.0;
  float state = open;

  if (piece < 0.5) {
    vec3 radial = ex * cos(aShape.z) + ey * sin(aShape.z);
    float corner = mix(mix(0.82, 1.0, aShape.w), mix(0.94, 1.0, aShape.w), open);
    float r;
    float z;
    if (level < 0.5) {
      // The foot is the widest part: the feet of neighbors run into each other and no floor shows between them.
      r = rc * 1.25;
      z = -0.18 * w * grown;
      normal = radial;
      occ = 0.06;
    } else if (level < 1.5) {
      r = rc * mix(mix(1.06, 0.93, ripe), 0.4 * corner, open);
      z = min(0.45 * tall + 0.4 * w * open, throat);
      normal = radial;
      along = 0.33;
      occ = mix(mix(0.24, 0.1, ripe), 0.14, open);
    } else if (level < 2.5) {
      r = rc * corner * mix(0.6 + 0.32 * h2 + 0.2 * (1.0 - ripe), 0.56, open);
      z = throat;
      normal = normalize(radial + axis * 0.55 * (1.0 - open));
      along = 0.66;
      occ = mix(mix(0.6, 0.4, ripe), 0.7, open);
    } else {
      float spread = lobes * (1.5 + 0.7 * aSeed.x);
      float reach = w * 0.52;
      r = lobes * (rc * 0.56 + reach * sin(spread));
      z = throat + mix(0.22 * tall, reach * cos(spread), lobes);
      normal = normalize(mix(axis, radial * cos(spread) - axis * sin(spread), lobes));
      along = 1.0;
      occ = 1.0;
    }
    local = f.at + radial * r + axis * z;
  } else if (piece < 1.5) {
    vec3 radial = ex * cos(aShape.z + 0.6) + ey * sin(aShape.z + 0.6);
    float r = w * (level < 0.5 ? 0.19 : level < 1.5 ? 0.27 + (0.03 + 0.3 * lump) * rise : level < 2.5 ? 0.24 + (0.04 + 0.5 * lump) * rise : 0.0);
    float z = level < 0.5 ? max(top - 1.7 * w, 0.1 * tall) : level < 1.5 ? max(top - (0.5 + 0.3 * lump) * w, 0.1 * tall) : level < 2.5 ? top : top + (0.08 + (0.17 + 0.45 * lump) * rise) * w;
    normal = level < 2.5 ? radial : axis;
    along = level / 3.0;
    occ = mix(0.45, 1.0, min(level * 0.5, 1.0));
    around = aShape.z * 0.16;
    local = f.at + radial * r + axis * z;
  } else if (piece < 2.5) {
    float side = aShape.z;
    float bend = style * (2.6 + 1.6 * aSeed.x) * level;
    float arc = style * w * 0.8 / max(style * (2.6 + 1.6 * aSeed.x), 0.05);
    float r = arc * (1.0 - cos(bend));
    float z = top + 0.15 * w + arc * sin(bend) + style * 0.22 * w * level;
    vec3 arm = ex * side;
    float wide = w * 0.095 * (1.0 - 0.55 * level) * min(style * 4.0, 1.0);
    local = f.at + arm * (r + 0.03 * w * style) + axis * z + ey * aShape.w * wide;
    normal = axis * sin(bend) - arm * cos(bend) + ey * aShape.w * 0.3;
    along = level;
    around = 0.0;
    occ = 1.0;
  } else {
    float lateral = aShape.z;
    float twin = step(3.5, level);
    level -= 4.0 * twin;
    float hs = fract(h3 + 0.37 * twin + 0.61 * h1 * twin);
    // Over florets that are still far from opening the scales lie inward across their neighbors, a thatch of fine green points.
    float over = smoothstep(1.0, 9.5, aFloret.z - f.time) * (1.0 - edge);
    float high = w * 1.4 * (0.9 + 0.2 * aSeed.w) * (1.0 + 0.12 * swell) * grown * (1.0 - 0.3 * twin);
    float lid = tall * (0.98 + 0.14 * aSeed.x) + (0.12 + 0.1 * twin) * w * grown;
    float turn = mix((aSeed.x - 0.5) * 1.2 + 1.9 * twin, (hs - 0.5) * 0.8 + (twin - 0.5) * 0.4, over);
    turn = mix(turn, (twin - 0.5) * 1.1, edge);
    vec3 away = fx * cos(turn) + fy * sin(turn);
    vec3 across = cross(axis, away);
    float far = (0.95 + 1.0 * hs) * (1.0 - 0.25 * twin);
    float x = w * (level < 0.5 ? 0.52 : level < 1.5 ? mix(aShape.w > 0.5 ? 0.58 : 0.42, -0.1, over) : mix(0.4, -far, over));
    float y = w * lateral * (level < 0.5 ? 0.34 : mix(0.27, 0.07, over));
    float z = level < 0.5 ? -0.08 * high : level < 1.5 ? mix(0.62 * high, lid + 0.06 * w * aShape.w, over) : mix(high, lid + 0.05 * w, over);
    local = f.at + away * x + across * y + axis * z;
    normal = normalize(away * mix(1.0, 0.25, over) + across * lateral * 0.7 + axis * mix(0.35, 1.0, over));
    // At the rim the scales lie outward on the floor, out to the feet of the rays.
    float out0 = level < 0.5 ? rho + 0.2 * uCell : level < 1.5 ? max(rho + 0.9 * uCell, 0.972 + 0.018 * hs) : 0.992 + 0.008 * hs;
    float shift = (twin - 0.5) * 1.1 + (hs - 0.5) * 0.7;
    float aside = w * (shift * (level < 0.5 ? 0.0 : level < 1.5 ? 0.6 : 1.0) + lateral * (level < 0.5 ? 0.5 : 0.8));
    Floor g = floorAt(out0, aFloret.y + aside / max(out0 * f.radius, 1e-6));
    float lift = w * grown * (level < 0.5 ? -0.1 : level < 1.5 ? 0.1 + 0.12 * aShape.w : 0.08);
    local = mix(local, g.at + g.normal * lift, edge);
    normal = normalize(mix(normal, g.normal + g.tangent * lateral * 0.4 + g.outward * 0.2, edge));
    along = level * 0.5;
    occ = level < 0.5 ? 0.03 : level < 1.5 ? mix(0.22, 0.6, over) : mix(mix(0.8, 0.3, open), 1.0, over);
    occ = mix(occ, 0.3, edge);
    state = over;
  }

  occ *= mix(1.0, 0.7 + 0.2 * (1.0 - rho), uCover);
  vec4 world = vec4(plantWorld(local), 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vNormal = plantDirection(normalize(normal));
  vDepth = -view.z;
  vInfo = vec4(piece, along, around, occ);
  vState = vec4(state, rho, aSeed.x, swell);
  vKind = vec4(ripe, lump, 0.62 + 0.76 * h3, h1);
  vMore = vec4(style, -view.z * 2.0 / (projectionMatrix[1][1] * uSize.y * max(plantSize(), 1e-6)), aSeed.w, blotch);
  gl_Position = projectionMatrix * view;
}
`

export const floretFragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in float vDepth;
in vec4 vInfo;
in vec4 vState;
in vec4 vMore;
in vec4 vKind;

void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  if (dot(face, view) < 0.0) face = -face;
  float piece = vInfo.x;
  float along = vInfo.y;
  float around = vInfo.z;
  float open = vState.x;
  float rho = vState.y;
  float seed = vState.z;
  float swell = vState.w;
  // Fine marks fade once a pixel is wider than they are.
  float fine = saturate(0.0011 / max(vMore.y, 1e-6) - 0.6);
  float coarse = smoothstep(0.0007, 0.002, vMore.y);
  float grain = mix(0.5, valueNoise(vec2(around * 4.0 + seed * 61.0, along * 9.0 + vMore.z * 37.0)), fine);

  float ripe = vKind.x;
  float tone = vKind.z * (1.0 + 0.25 * vMore.w);
  float centre = 1.0 - smoothstep(0.3, 0.85, rho);

  Tissue t;
  t.through = vec3(0.0);
  t.rough = 0.7;
  t.wax = 0.3;
  t.sheen = 0.15;
  vec3 pollen = vec3(0.86, 0.39, 0.065) * (0.7 + 0.6 * vKind.w);

  if (piece < 0.5) {
    float ridge = around * around * mix(0.35, 1.0, smoothstep(0.3, 0.7, along));
    vec3 dark = mix(vec3(0.085, 0.06, 0.012), vec3(0.07, 0.1, 0.015), centre);
    vec3 pale = mix(vec3(0.31, 0.24, 0.035), vec3(0.2, 0.29, 0.045), centre);
    vec3 ochre = vec3(0.3, 0.185, 0.03);
    dark = mix(dark, ochre * 0.3, swell * (1.0 - centre));
    pale = mix(pale, ochre, swell * (1.0 - centre));
    vec3 closed = mix(dark, pale, ridge);
    vec3 young = mix(vec3(0.19, 0.33, 0.065), vec3(0.52, 0.72, 0.18), ridge);
    young = mix(young, vec3(0.78, 0.84, 0.22), smoothstep(0.75, 1.0, along) * 0.7);
    closed = mix(young, closed, ripe) * tone;
    vec3 flower = mix(vec3(0.1, 0.048, 0.015), vec3(0.2, 0.095, 0.022), smoothstep(0.3, 0.7, along));
    flower = mix(flower, vec3(0.075, 0.028, 0.013), smoothstep(0.78, 1.0, along) * 0.85);
    flower = mix(flower, pollen, 0.25 * smoothstep(0.55, 0.75, grain) * smoothstep(0.5, 1.0, along));
    float bloom = smoothstep(0.05, 0.6, open);
    t.albedo = mix(closed, flower * (0.8 + 0.4 * seed), bloom);
    t.through = vec3(0.16, 0.065, 0.01) * bloom * smoothstep(0.6, 0.8, along);
  } else if (piece < 1.5) {
    // A share of the florets have shed their pollen or not yet pushed it out: dark spikes among the lumps.
    float laden = smoothstep(0.12, 0.3, vKind.y + 0.25 * seed) * (1.0 - 0.9 * vMore.x);
    laden *= mix(1.0, smoothstep(0.5, 0.7, vKind.w), smoothstep(0.885, 0.915, rho));
    float clot = valueNoise(vec2(around * 2.3 + seed * 17.0, along * 3.1 + vMore.z * 23.0));
    float dust = smoothstep(0.38, 0.62, along + 0.4 * (grain - 0.5) + 0.3 * vKind.y) * laden;
    dust = max(dust, 0.5 * smoothstep(0.62, 0.8, grain) * fine * laden);
    dust *= (1.0 - 0.6 * coarse) * (0.45 + 0.55 * smoothstep(0.25, 0.6, clot));
    t.albedo = mix(vec3(0.05, 0.02, 0.018) * (0.7 + 0.6 * grain), pollen * (0.8 + 0.4 * grain), dust);
    t.rough = mix(0.5, 1.0, dust);
    t.wax = mix(0.35, 0.0, dust);
    t.sheen = mix(0.15, 0.35, dust);
    t.through = pollen * dust * 0.3;
  } else if (piece < 2.5) {
    t.albedo = mix(vec3(0.7, 0.42, 0.07), pollen, 0.5 * grain);
    t.through = vec3(0.5, 0.28, 0.04);
    t.rough = 1.0;
    t.wax = 0.0;
    t.sheen = 0.6;
  } else {
    vec3 young = mix(vec3(0.22, 0.37, 0.09), vec3(0.62, 0.74, 0.2), along);
    vec3 green = mix(vec3(0.075, 0.09, 0.03), mix(vec3(0.05, 0.105, 0.02), vec3(0.17, 0.27, 0.055), along), open);
    vec3 dry = vec3(0.1, 0.062, 0.024);
    vec3 grownUp = mix(green, dry, smoothstep(0.55, 1.0, along) * (1.0 - open));
    t.albedo = mix(young, grownUp, ripe) * (0.85 + 0.3 * around) * tone;
    t.through = vec3(0.1, 0.16, 0.025);
    t.sheen = 0.4;
  }

  t.albedo = mix(t.albedo, t.albedo * 0.55, uPlantWet);
  t.wax = mix(t.wax, 0.9, uPlantWet);
  t.albedo = mix(t.albedo, vec3(0.82, 0.86, 0.9), uPlantFrost * 0.6 * saturate(face.y * 0.5 + 0.6));
  t.face = face;
  t.normal = face;
  t.occlusion = vInfo.w;
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, vDepth, -1.0);
}
`

export const fieldVertex = /* glsl */ `
in vec2 aDome;
${headGlsl}
out vec3 vWorld;
out vec3 vNormal;
out float vDepth;
out vec2 vDome;

void main() {
  Floor f = floorAt(aDome.x * 0.97, aDome.y);
  vec3 local = f.at + f.normal * f.radius * (0.05 + 0.05 * smoothstep(0.55, 0.85, aDome.x) * (1.0 - smoothstep(0.9, 1.0, aDome.x)));
  vec4 world = vec4(plantWorld(local), 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vNormal = plantDirection(f.normal);
  vDepth = -view.z;
  vDome = aDome;
  gl_Position = projectionMatrix * view;
}
`

export const fieldFragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in float vDepth;
in vec2 vDome;
uniform vec2 uFront;
uniform float uYoung;
uniform float uCover;

void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  if (dot(face, view) < 0.0) face = -face;
  float rho = vDome.x * 0.93;
  float arms = sin(vDome.y * 21.0 + rho * 38.0) * sin(vDome.y * 13.0 - rho * 46.0);
  float centre = 1.0 - smoothstep(0.08, 0.58, rho);
  vec3 closed = mix(vec3(0.06, 0.04, 0.019), vec3(0.055, 0.075, 0.024), centre);
  closed = mix(closed, vec3(0.17, 0.23, 0.075), uYoung);
  vec3 opening = vec3(0.12, 0.068, 0.02);
  vec3 flower = vec3(0.17, 0.085, 0.024);
  vec3 albedo = mix(closed, opening, smoothstep(uFront.x - 0.06, uFront.x + 0.06, rho));
  albedo = mix(albedo, flower, smoothstep(uFront.y - 0.06, uFront.y + 0.06, rho));
  Tissue t;
  t.albedo = albedo * (0.8 + 0.3 * arms);
  t.through = vec3(0.0);
  t.face = face;
  t.normal = face;
  t.rough = 0.9;
  t.wax = 0.05;
  t.sheen = 0.5;
  t.occlusion = (0.55 + 0.25 * arms) * mix(1.0, 0.4, uCover);
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, vDepth, -1.0);
}
`
