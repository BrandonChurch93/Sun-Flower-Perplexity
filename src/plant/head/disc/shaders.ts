import { RIM_SHARE, RING_SHARE, RIPE_FROM, RIPENS_S, SHOWN_FROM } from './opening.ts'
import { floretMain } from '../../look/disc.ts'

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
  float s = plantBlend();
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
#define RING_SHARE ${RING_SHARE.toFixed(3)}
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
out float vUnder;
out vec4 vRays;
out vec4 vRing;

void main() {
  float rho = aFloret.x;
  Floor f = floorAt(rho, aFloret.y);
  float w = f.radius * uCell;
  float grown = smoothstep(SHOWN_FROM, SHOWN_FROM + 3.0, f.time);
  float swell = smoothstep(-2.4, 0.0, f.time - aFloret.z);
  float rim = smoothstep(0.55, 0.94, rho);
  float blotch = sin(aFloret.y * 2.0 + rho * 9.0) * sin(aFloret.y * 3.0 - rho * 5.0 + 1.3);
  float h1 = fract(aSeed.x * 17.31 + aSeed.w * 5.71);
  float h2 = fract(aSeed.w * 23.17 + aSeed.x * 3.13);
  float h3 = fract(aSeed.y * 1.618 + aSeed.x * 9.73);
  float ripe = smoothstep(0.0, 1.0, (f.time - aFloret.z + ${(RIPENS_S[0] + RIPENS_S[1]).toFixed(2)} + 0.45 * h3) / ${RIPENS_S[0].toFixed(2)});
  float lump = h2 * sqrt(h2);
  float edge = smoothstep(0.90, 0.945, rho);
  float lip = rho + 0.012 * sin(aFloret.y * 5.0 + 1.0) + 0.009 * sin(aFloret.y * 11.0 + 2.3) + 0.016 * (h3 - 0.5);
  float under = smoothstep(RING_SHARE - 0.005, RING_SHARE + 0.025, lip);
  float tuck = (1.0 - smoothstep(SHOWN_FROM + 6.5, SHOWN_FROM + 9.5, f.time)) * smoothstep(0.76, 0.90, rho) * (0.75 + 0.25 * h1);
  float phase = (f.time - aFloret.z) / aFloret.w;
  float open = smoothstep(0.0, 1.0, phase) * (1.0 - under);
  float lobes = smoothstep(0.1, 0.75, phase) * (1.0 - under);
  float rise = smoothstep(0.18, 1.0, phase) * (1.0 - under);
  float style = smoothstep(0.0, 1.0, (f.time - aFloret.z - aFloret.w - 0.25) / 1.4) * (1.0 - under);
  float late = smoothstep(RIPE_FROM, RIPE_FROM + 4.0, f.time);
  float over = smoothstep(1.0, 9.5, aFloret.z - f.time) * (1.0 - edge) * (1.0 - smoothstep(SHOWN_FROM, SHOWN_FROM + 4.0, f.time));
  float girth = mix((0.86 + 0.14 * h2) * mix(0.84, 0.98, smoothstep(0.0, 0.55, rho)), 1.0, open);

  float tilt = aSeed.w * 6.2832;
  vec3 axis = normalize(f.normal + f.outward * (0.04 + open * (0.07 + 0.24 * rim)) + (f.outward * cos(tilt) + f.tangent * sin(tilt)) * (0.06 + 0.18 * open) * aSeed.x);
  vec3 fx = normalize(f.outward - axis * dot(f.outward, axis));
  vec3 fy = cross(axis, fx);
  float ct = cos(aSeed.y);
  float st = sin(aSeed.y);
  vec3 ex = fx * ct + fy * st;
  vec3 ey = fy * ct - fx * st;

  float middle = smoothstep(0.0, 0.28, rho);
  float tall = w * 1.42 * mix(0.76, 1.04, middle) * aSeed.z * (0.88 + 0.24 * h1) * (1.0 + 0.24 * swell) * grown * (1.0 - 0.16 * uYoung) * (1.0 + 0.08 * blotch) * (1.0 - 0.7 * under) * (1.0 - 0.55 * tuck);
  float tube = w * 2.55 * (0.76 + 0.44 * aSeed.x) * (1.0 + 0.08 * blotch);
  float throat = mix(0.76 * tall, tube, open);
  float rc = w * 0.5;
  float top = throat - 0.05 * tall + rise * w * 1.55 * (0.55 + 0.85 * h1);

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
    float corner = mix(mix(0.90, 1.02, aShape.w), mix(0.94, 1.0, aShape.w), open);
    float r;
    float z;
    if (level < 0.5) {
      r = rc * 1.65;
      z = -0.16 * w * grown;
      normal = radial;
      occ = 0.08;
    } else if (level < 1.5) {
      r = rc * girth * mix(0.88, 0.56 * corner, open);
      z = min(0.42 * tall + 0.4 * w * open, throat);
      normal = radial;
      along = 0.33;
      occ = mix(0.18, 0.22, open);
    } else if (level < 2.5) {
      r = rc * corner * girth * mix(0.70 + 0.06 * h2, 0.72, open);
      z = throat;
      normal = normalize(radial * mix(0.68, 1.0, open) + axis * 0.85 * (1.0 - open));
      along = 0.68;
      occ = mix(0.84, 0.68, open);
    } else {
      float spread = lobes * (1.45 + 0.65 * aSeed.x);
      float reach = w * 0.21;
      r = mix(rc * 0.16 * girth, rc * 0.72 + reach * sin(spread), lobes);
      z = throat + mix(0.36 * tall, reach * cos(spread), lobes);
      normal = normalize(mix(normalize(axis + radial * 0.26), radial * cos(spread) - axis * sin(spread), lobes));
      along = 1.0;
      occ = 1.0;
    }
    local = f.at + radial * r + axis * z;
  } else if (piece < 1.5) {
    vec3 radial = ex * cos(aShape.z + 0.6) + ey * sin(aShape.z + 0.6);
    float r = w * (level < 0.5 ? 0.14 : level < 1.5 ? 0.16 + (0.05 + 0.12 * lump) * rise : level < 2.5 ? 0.17 + (0.09 + 0.16 * lump) * rise : 0.0);
    float z = level < 0.5 ? max(top - 1.55 * w, 0.1 * tall) : level < 1.5 ? max(top - (0.44 + 0.22 * lump) * w, 0.1 * tall) : level < 2.5 ? top : top + (0.11 + (0.16 + 0.26 * lump) * rise) * w;
    r *= 1.0 + rise * (-0.18 + 0.36 * fract(sin(aShape.z * 3.7 + level * 5.3 + aSeed.x * 91.0 + aSeed.w * 37.0) * 43758.5));
    normal = level < 2.5 ? normalize(radial + axis * (level > 1.5 ? 0.55 : 0.1)) : axis;
    along = level / 3.0;
    occ = mix(0.55, 1.0, min(level * 0.5, 1.0));
    around = aShape.z * 0.16;
    local = f.at + radial * r + axis * z;
  } else if (piece < 2.5) {
    float side = aShape.z;
    float bend = style * (2.4 + 1.5 * aSeed.x) * level;
    float arc = style * w * 0.62 / max(style * (2.4 + 1.5 * aSeed.x), 0.05);
    float r = arc * (1.0 - cos(bend));
    float z = top + 0.14 * w + arc * sin(bend) + style * 0.18 * w * level;
    vec3 arm = ex * side;
    float wide = w * 0.085 * (1.0 - 0.45 * level) * min(style * 4.0, 1.0);
    local = f.at + arm * (r + 0.025 * w * style) + axis * z + ey * aShape.w * wide;
    normal = normalize(axis * sin(bend) - arm * cos(bend) + ey * aShape.w * 0.35 + axis * 0.3);
    along = level;
    around = 0.0;
    occ = 1.0;
  } else {
    float lateral = aShape.z;
    float twin = step(3.5, level);
    level -= 4.0 * twin;
    float hs = fract(h3 + 0.37 * twin + 0.61 * h1 * twin);
    float high = mix(tall * 0.96, w * 1.35 * grown, open) * (0.92 + 0.16 * aSeed.w) * (1.0 - 0.24 * twin);
    float lid = tall * (0.98 + 0.12 * aSeed.x) + (0.08 + 0.08 * twin) * w * grown;
    float turn = mix((aSeed.x - 0.5) * 0.8 + 1.9 * twin, 0.45 + (hs - 0.5) * mix(0.7, 0.25, late) + (twin - 0.5) * mix(0.5, 0.2, late), over);
    turn = mix(turn, (twin - 0.5) * 1.1, edge);
    vec3 away = fx * cos(turn) + fy * sin(turn);
    vec3 across = cross(axis, away);
    float far = (1.4 + 1.2 * hs) * (1.0 - 0.25 * twin) * (1.0 + 0.25 * late);
    float x = w * (level < 0.5 ? 0.48 : level < 1.5 ? mix(aShape.w > 0.5 ? 0.52 : 0.40, -0.1, over) : mix(0.36, -far, over));
    float y = w * lateral * (level < 0.5 ? 0.30 : mix(0.24, mix(0.18, 0.14, late), over));
    float z = level < 0.5 ? -0.08 * high : level < 1.5 ? mix(0.58 * high, lid + 0.05 * w * aShape.w, over) : mix(high, lid + 0.04 * w, over);
    local = f.at + away * x + across * y + axis * z;
    normal = normalize(away * mix(0.75, 0.25, over) + across * lateral * 0.6 + axis * mix(0.65, 1.0, over));
    float out0 = level < 0.5 ? rho + 0.2 * uCell : level < 1.5 ? max(rho + 0.9 * uCell, 0.972 + 0.018 * hs) : 0.992 + 0.008 * hs;
    float shift = (twin - 0.5) * 1.1 + (hs - 0.5) * 0.7;
    float aside = w * (shift * (level < 0.5 ? 0.0 : level < 1.5 ? 0.6 : 1.0) + lateral * (level < 0.5 ? 0.5 : 0.8));
    Floor g = floorAt(out0, aFloret.y + aside / max(out0 * f.radius, 1e-6));
    float lift = w * grown * (level < 0.5 ? -0.1 : level < 1.5 ? 0.04 + 0.06 * aShape.w : 0.04);
    local = mix(local, g.at + g.normal * lift, edge);
    normal = normalize(mix(normal, g.normal + g.tangent * lateral * 0.4 + g.outward * 0.2, edge));
    along = level * 0.5;
    occ = level < 0.5 ? 0.05 : level < 1.5 ? mix(0.38, 0.6, over) : mix(mix(0.82, 0.34, open), 1.0, over);
    occ = mix(occ, 0.35, edge);
    state = over;
  }

  occ *= mix(1.0, 0.55 + 0.2 * (1.0 - rho), uCover) * (1.0 - 0.38 * under);
  vec4 world = vec4(plantWorld(local), 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vNormal = plantDirection(normalize(normal));
  vDepth = -view.z;
  vInfo = vec4(piece, along, around, occ);
  vState = vec4(state, rho, aSeed.x, swell);
  vKind = vec4(ripe, lump, 0.68 + 0.64 * h3, h1);
  vUnder = max(piece < 2.5 ? max(under, 0.5 * over * over * over) : under, 0.75 * tuck);
  vec3 outW = plantDirection(f.outward);
  vec3 axW = plantDirection(f.axis);
  vec3 inPlane = uSunDir - axW * dot(uSunDir, axW);
  float sunSide = dot(outW, inPlane) / max(length(inPlane), 1e-4);
  float beside = exp(-max(0.90 - rho, 0.0) / 0.14);
  vRays = vec4(normalize(outW * 0.92 + axW * 0.38), beside * smoothstep(-0.25, 0.95, sunSide) * (1.0 - uCover) * smoothstep(0.0, 0.35, -dot(axW, uSunDir)));
  vRing = vec4(open, rise * (1.0 - style), style, clamp(phase, -8.0, 8.0));
  vMore = vec4(style, -view.z * 2.0 / (projectionMatrix[1][1] * uSize.y * max(plantSize(), 1e-6)), aSeed.w, blotch);
  gl_Position = projectionMatrix * view;
}
`

export const floretFragment = /* glsl */ `
#define RAY_LIGHT 0.55
in vec3 vWorld;
in vec3 vNormal;
in float vDepth;
in vec4 vInfo;
in vec4 vState;
in vec4 vMore;
in vec4 vKind;
in float vUnder;
in vec4 vRays;
in vec4 vRing;

${floretMain}
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
  float rho = vDome.x * 0.95;
  float arms = sin(vDome.y * 21.0 + rho * 38.0) * sin(vDome.y * 13.0 - rho * 46.0);
  float centre = 1.0 - smoothstep(0.22, 0.62, rho);
  vec3 closed = mix(vec3(0.11, 0.062, 0.016), vec3(0.12, 0.175, 0.048), centre);
  closed = mix(closed, vec3(0.18, 0.26, 0.072), max(uYoung, 1.0 - smoothstep(uFront.x - 0.24, uFront.x - 0.05, rho)));
  vec3 opening = vec3(0.14, 0.075, 0.02);
  vec3 flower = mix(vec3(0.15, 0.082, 0.022), vec3(0.44, 0.34, 0.08), 0.35 + 0.35 * arms);
  vec3 albedo = mix(closed, opening, smoothstep(uFront.x - 0.05, uFront.x + 0.05, rho));
  albedo = mix(albedo, flower, smoothstep(uFront.y - 0.06, uFront.y + 0.06, rho));
  Tissue t;
  t.albedo = albedo * (0.82 + 0.28 * arms);
  t.through = vec3(0.03, 0.04, 0.01) * centre;
  t.face = face;
  t.normal = face;
  t.rough = 0.72;
  t.wax = 0.12;
  t.sheen = 0.06;
  t.occlusion = (0.58 + 0.26 * arms) * mix(1.0, 0.42, uCover);
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, vDepth, -1.0);
}
`
