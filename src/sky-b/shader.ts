import { glslCommon } from '../core/shading.ts'
import { airGlsl } from './air.ts'
import { STAR_WIDTH } from './noise.ts'

export const cloudFragment = /* glsl */ `
precision highp sampler3D;
${airGlsl}
uniform sampler3D tCloud;
uniform mat3 uBore;
uniform vec2 uExtent;
uniform vec3 uRayLight;
uniform vec3 uCloudLight;
uniform vec3 uUpper;
uniform vec3 uLower;
uniform vec3 uDeck;
uniform vec3 uFlash;
uniform vec4 uWeather;
uniform vec4 uEffects;
uniform vec2 uTravel;
uniform vec2 uSmear;
uniform float uEvolve;
uniform float uEyeKm;
uniform float uRealSky;
uniform float uGolden;
uniform int uSteps;
uniform int uLightSteps;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

const float CURVE = 1.0 / 12742.0;

float sat(float a) { return clamp(a, 0.0, 1.0); }
vec4 f(vec3 p) { return texture(tCloud, p); }
vec2 rotateCloud(vec2 a) { return vec2(0.937 * a.x + 0.35 * a.y, -0.35 * a.x + 0.937 * a.y); }

float rayHash(uvec2 pixel) {
  uint n = (pixel.x + 4099u * pixel.y) * 747796405u + 2891336453u;
  uint w = ((n >> ((n >> 28u) + 4u)) ^ n) * 277803737u;
  return float(((w >> 22u) ^ w) >> 8u) * (1.0 / 16777216.0);
}

float foot(float level, vec3 d) {
  float q = max(1e-9, dot(d.xz, d.xz) * CURVE);
  float h = max(0.002, level - uEyeKm);
  return 2.0 * h / max(0.000001, d.y + sqrt(d.y * d.y + 4.0 * q * h));
}

float heightAt(vec3 p) {
  return p.y + uEyeKm + CURVE * dot(p.xz, p.xz);
}

vec4 weatherField(vec3 p, float h) {
  vec2 w = rotateCloud(p.xz - uTravel + vec2(0.28, 0.12) * h);
  float shape = uWeather.y;
  float towers = smoothstep(0.16, 0.38, uWeather.x);
  vec2 field = w * vec2(mix(0.074 - 0.017 * towers, 0.045, shape), mix(0.089 - 0.019 * towers, 0.081, shape));
  return f(vec3(field.x + 0.37, 0.13 * h + 0.055 * uEvolve, field.y + 0.68));
}

float toGap(vec3 p, vec3 d, float rough) {
  float phi = max(0.0, 1.0 - dot(d, uSun));
  float ordinary = exp(-phi / mix(0.00228, 0.0044, uGolden));
  if (uEffects.w < 0.001 || phi > 0.10) return ordinary;
  ordinary = mix(ordinary, exp(-phi / 0.00105), uEffects.w);
  vec3 h = normalize(vec3(uSun.z, 0.0, -uSun.x) + vec3(1e-7));
  vec3 v = cross(uSun, h);
  vec2 q = vec2(dot(d, h), dot(d, v));
  // Storm layers break at different heights. Shear the opening through the
  // volume instead of cutting the same silhouette at every depth.
  float level = heightAt(p);
  q += vec2(0.031, -0.018) * clamp(level - 2.0, -1.0, 2.0) * uEffects.w;
  vec2 seam = vec2(0.79 * q.x + 0.61 * q.y, -0.61 * q.x + 0.79 * q.y);
  float width = 0.047 + 0.028 * uEffects.w;
  float crag = sin(49.0 * seam.x + 12.0 * seam.y) * sin(19.0 * seam.y + 2.4 * level);
  float lip = sin(31.0 * seam.x + 42.0 * seam.y + 0.82 * level) * (0.023 * uEffects.w);
  float notch = (rough - 0.48) * min(1.0, 5.0 * length(q));
  float outline = length(vec2(seam.x / (2.9 * width), (seam.y + lip) / width));
  outline += min(1.0, 10.0 * length(q)) * (0.29 * crag + 2.70 * notch);
  float torn = 1.0 - smoothstep(0.15, 1.62, outline);
  return max(ordinary, torn * smoothstep(0.0, 0.67, uEffects.w));
}

float profile(vec4 field, float tv, float storm) {
  float roll = smoothstep(0.34, 0.68, 0.55 * field.r + 0.34 * field.g + 0.11 * field.b);
  float floorShape = 0.009 + storm * (0.47 * roll + 0.13 * field.r);
  float cap = smoothstep(0.29, 0.67, field.r + 0.23 * (field.g - 0.5) + 0.15 * (field.b - 0.5));
  float tower = mix(0.29 + 0.76 * cap, 0.77 + 0.31 * field.g, storm);
  float bottom = smoothstep(floorShape, floorShape + mix(0.045, 0.073, storm), tv);
  float top = 1.0 - smoothstep(tower - mix(0.18, 0.29, storm), tower, tv);
  float middle = mix(1.1 - 0.43 * tv, 0.95 + 0.32 * tv, storm);
  return bottom * top * middle;
}

float scaffold(vec3 p, vec3 eyeRay, float base, float depth, out vec4 shape, out float floorWeight, out float gap) {
  float h = heightAt(p);
  float st = uWeather.y;
  float tv = (h - base) / depth;
  shape = weatherField(p, h);
  floorWeight = profile(shape, tv, st);
  float synoptic = mix(shape.r, 0.72 * shape.r + 0.28 * shape.g, st);
  float nightThinning = 0.084 * (1.0 - smoothstep(-13.0, -4.5, uElevation)) * (1.0 - st);
  float cutoff = mix(0.629 - 0.35 * pow(uWeather.x, 1.2) - 0.031 * uEffects.x + nightThinning, 0.273 - 0.09 * uWeather.x, st);
  cutoff += 0.063 * smoothstep(0.16, 0.28, uWeather.x) * (1.0 - st);
  gap = toGap(p, eyeRay, 0.38 * shape.g + 0.62 * shape.b);
  float clear = uWeather.z;
  float aperture = smoothstep(0.58, 1.0, clear + 0.21 * uEffects.w);
  float forced = (0.21 + 0.36 * st) * max(0.0, 0.66 - clear);
  // At the break, densityAt will thin the clouds. Preserve some underlying
  // structure here so erosion does not collapse the faces to a hard outline.
  float opening = aperture * gap * mix(0.99, 0.54, uEffects.w);
  return ((synoptic - cutoff + 0.37 * (shape.g - 0.48) + 0.11 * (shape.b - 0.47)) * 3.08 + forced * gap) * (1.0 - opening);
}

float densityAt(vec3 p, vec3 d, float t, float base, float dep, out float gap, out vec2 textureValue) {
  vec4 shape;
  float profileWeight;
  float sc = scaffold(p, d, base, dep, shape, profileWeight, gap);
  textureValue = vec2(shape.g, shape.b);
  if (sc < 0.012 || profileWeight < 0.004) return 0.0;
  float at = heightAt(p);
  vec2 q = rotateCloud(p.xz - uTravel);
  float nearCloud = 1.0 - smoothstep(13.0, 38.0, t);
  float billowScale = mix(0.229, 0.285, uWeather.y);
  vec2 motion = rotateCloud(uSmear) * billowScale;
  vec3 w = vec3(q.x * billowScale, 0.29 * at - uEvolve * 0.067, q.y * billowScale) + vec3(0.16, 0.07, 0.15);
  float small = 0.49;
  if (t < 49.0) {
    vec2 fine = f(w - vec3(motion.x, 0.0, motion.y) * 0.34).ba;
    if (dot(motion, motion) > 0.000001) fine = 0.5 * (fine + f(w + vec3(motion.x, 0.0, motion.y) * 0.34).ba);
    small = mix(small, 0.19 + 0.52 * fine.x + 0.11 * fine.y, 1.0 - smoothstep(15.0, 49.0, t));
    if (t < 32.0 && sc < 0.83) {
      float grit = f(w * 2.38 + vec3(0.31, 0.12, 0.52)).a;
      small += (grit - 0.47) * 0.13 * nearCloud * (1.0 - smoothstep(0.53, 0.83, sc));
    }
  }
  textureValue.y = 0.32 * textureValue.y + 0.68 * small;
  float contrast = max(uWeather.y, smoothstep(0.12, 0.40, uWeather.x));
  float bite = (mix(0.41, 0.32, uWeather.y) + 0.34 * nearCloud * contrast) * max(0.06, 0.94 - 1.22 * small);
  float body = max(0.0, sc - bite + (small - 0.48) * 0.73 * nearCloud * contrast) * profileWeight;
  float sunFilter = mix(1.0, 0.009 + 0.99 * (1.0 - uWeather.z) * (1.0 - uWeather.z), gap * (0.84 + 0.16 * uEffects.w));
  float fog = 1.0 - 0.87 * smoothstep(0.14, 0.85, uWeather.w);
  return (body + 1.35 * body * body) * sunFilter * fog * mix(6.2, 3.7, uWeather.y);
}

float shadowAt(vec3 p, vec3 d, float base, float dep) {
  float depth = 0.0;
  for (int j = 0; j < 6; j++) {
    if (j >= uLightSteps) break;
    float k = (float(j) + 0.75) / float(uLightSteps);
    float stepKm = mix(0.15, 0.95 + 1.25 * uWeather.y, k * k);
    vec3 q = p + uRayLight * (stepKm + 2.9 * k * k);
    vec4 field;
    float prof;
    float gap;
    float s = scaffold(q, d, base, dep, field, prof, gap);
    float wash = mix(1.0, 0.06 + 0.94 * (1.0 - uWeather.z), gap);
    depth += max(0.0, s - 0.12) * prof * (stepKm + 0.16) * wash;
  }
  return depth * mix(2.6, 3.0, uWeather.y);
}

vec3 thinClouds(vec3 d, vec3 air, float mu) {
  float st = uWeather.y;
  float weather = (0.09 + 0.75 * uEffects.x + 0.26 * uWeather.x) * (1.0 - st) * (1.0 - uWeather.w);
  if (weather < 0.013 || d.y < 0.006) return air;
  float t = foot(6.2, d);
  vec2 p = rotateCloud(d.xz * t - uTravel * 1.32);
  vec4 a = f(vec3(0.029 * p.x + 0.17, 0.073 * uEvolve + 0.42, 0.12 * p.y));
  vec4 b = f(vec3(0.092 * p.x + 0.55, 0.067 * uEvolve, 0.26 * p.y + 0.72));
  float shape = 0.67 * a.r + 0.23 * a.g + 0.1 * a.b;
  float coverage = (weather * 0.84) * smoothstep(0.48 - 0.085 * uEffects.x, 0.74, shape - 0.16 * (1.0 - b.b));
  coverage *= 1.0 - exp(-17.0 * max(d.y, 0.0));
  float lighting = smoothstep(-11.0, 3.0, uElevation);
  float warm = 1.0 - smoothstep(2.0, 22.0, uElevation);
  vec3 ambient = uUpper * (0.38 + 0.54 * a.a) + vec3(0.011, 0.014, 0.021) * lighting;
  vec3 tint = mix(vec3(1.0, 0.95, 0.9), vec3(1.0, 0.37, 0.27), warm);
  vec3 light = ambient + tint * uCloudLight * (0.016 + 0.055 * pow(sat(mu), 33.0)) * (0.30 + 0.70 * b.r);
  return mix(air, light, coverage);
}

void main() {
  vec3 d = normalize(uBore * vec3((vUv * 2.0 - 1.0) * uExtent, 1.0));
  float st = uWeather.y;
  float sunBreak = uEffects.w;
  float mu = dot(d, uSun);
  float angle = max(0.0, 1.0 - mu);
  float goldenAir = uGolden * exp(-angle * 20.0);
  float breakGlow = sunBreak * exp(-angle * 57.0);
  vec3 clear = airAt(d);
  clear *= mix(vec3(1.0), vec3(1.08, 0.95, 0.79), goldenAir);
  float dayTower = smoothstep(0.102, 0.29, uSun.y);
  float blueWindow = dayTower * (1.0 - st) * smoothstep(0.027, 0.23, d.y) * (1.0 - smoothstep(0.89, 0.998, mu));
  clear *= mix(vec3(1.0), vec3(0.38, 0.59, 0.68), blueWindow);
  vec2 around = normalize(d.xz + vec2(1e-7));
  float hazeStrength = exp(-max(0.0, d.y) * 14.0);
  vec4 heads = f(vec3(around.x * 0.82 - 0.032 * uTravel.x, 0.21 + around.y * 0.68, 0.41 + 0.023 * uEvolve));
  float distantSlot = smoothstep(0.32, 0.73, 0.76 * heads.r + 0.24 * heads.g);
  vec3 slateHaze = uDeck * (0.48 + (2.7 + 2.4 * distantSlot) * hazeStrength);
  float crest = 0.058 + 0.046 * distantSlot + 0.053 * (heads.b - 0.44);
  float opening = 1.0 - smoothstep(crest - 0.039, crest + 0.048, d.y);
  float distantLight = 0.64 + 0.36 * exp(-max(0.0, 1.0 - mu) * 9.8);
  float patchHaze = opening * (13.0 + 19.5 * distantSlot) * distantLight * mix(0.72, 1.0, uEffects.y) * (1.0 - 0.28 * sunBreak);
  vec3 gradedGap = dot(uDeck, vec3(0.2126, 0.7152, 0.0722)) * vec3(1.17, 1.11, 1.02);
  vec3 air = mix(clear, slateHaze, min(1.0, st * 1.01));
  float broad = exp(-max(0.0, d.y) * 19.0);
  vec3 sky = thinClouds(d, air, mu);
  float through = 1.0;
  vec3 radiation = vec3(0.0);
  float base = mix(1.38, 0.86, st);
  float dep = mix(1.65 + 1.61 * smoothstep(0.13, 0.40, uWeather.x), 3.55, st);
  float start = foot(base, d);
  float stop = min(foot(base + dep, d), mix(109.0, 119.0, st));
  float span = stop - start;
  float dt = 1.0 / float(uSteps);
  float flashDot = max(0.0, 1.0 - dot(d, uFlash));
  float flashHalo = 0.0;
  float flashCore = 0.0;
  float flashDepth = 0.0;
  if (uEffects.z > 0.0004 && flashDot < 0.095) {
    // A source inside the deck, at the shared strike direction. Fractured
    // bright cloud faces around it, not a bolt or a painted circle.
    flashDepth = foot(2.05, uFlash);
    vec3 crossFlash = normalize(vec3(uFlash.z, 0.0, -uFlash.x));
    vec2 q = vec2(dot(d, crossFlash), dot(d, cross(uFlash, crossFlash)));
    vec2 slant = vec2(0.91 * q.x + 0.42 * q.y, -0.42 * q.x + 0.91 * q.y);
    vec4 corona = f(d * 2.9 + vec3(0.31, 0.21, uEvolve * 0.02 + 0.17));
    float fray = smoothstep(0.33, 0.70, 0.60 * corona.r + 0.25 * corona.g + 0.15 * corona.b);
    float radius = length(slant * vec2(38.0, 50.0));
    flashHalo = uEffects.z * exp(-flashDot * 126.0) * (0.42 + 0.53 * fray);
    flashCore = uEffects.z * exp(-radius * radius / (0.72 + 0.72 * fray));
  }

  if (span > 0.0 && d.y > -0.018) {
    float region = f(d * 0.24 + vec3(0.13, 0.02, 0.59)).g;
    // Stratified depth jitter removes coherent contours without a repeated
    // screen tile. Spatial only: no history or frame-dependent seed.
    float jitter = rayHash(uvec2(gl_FragCoord.xy));
    float forward = 0.25 / (1.0 + 89.0 * angle) + 0.53 / ((1.0 + 550.0 * angle) * (1.0 + 550.0 * angle));
    float sunHigh = smoothstep(0.037, 0.33, uSun.y);
    float side = (0.037 + 0.065 * sunHigh) * (0.70 + 0.30 * sat(0.5 + 0.5 * mu));
    vec3 ambientGrey = vec3(dot(uUpper, vec3(0.2126, 0.7152, 0.0722)));
    vec3 highHint = mix(uUpper, ambientGrey, 0.44) * 0.55 + 0.16 * uLower;
    float acrossAir = mix(0.0105, 0.016, st) + uWeather.w * 0.045;
    float horizonD = 0.001;
    float concentrated = mix(0.48, 0.72, st);
    float lowDeck = start + min(4.8, span * 0.24);
    vec3 lobe = d * lowDeck;
    vec4 belly = weatherField(lobe, heightAt(lobe));
    // Irregular wide wells of light in the storm volume, separate from the
    // fine erosion. This is sampled in cloud space and advects with the deck.
    vec3 pocketPos = d * (start + min(5.1, span * 0.33));
    vec2 deckPos = rotateCloud(pocketPos.xz - uTravel);
    vec4 pocket = f(vec3(deckPos.x * 0.053 + 0.32, heightAt(pocketPos) * 0.18 + 0.08, deckPos.y * 0.073 - 0.19));
    float well = smoothstep(0.27, 0.66, 0.58 * pocket.r + 0.42 * pocket.g);
    float ceilingLight = 0.09 + 2.4 * well * well + 0.49 * smoothstep(0.29, 0.69, belly.g);
    vec3 sunSide = normalize(vec3(uSun.z, 0.0, -uSun.x) + vec3(1e-7));
    float lowerDistance = (d.y - uSun.y + 0.133 + 0.031 * (pocket.g - 0.5)) * 28.0;
    float sideDistance = (dot(d, sunSide) - 0.102) * 11.0;
    float roseLight = sunBreak * exp(-lowerDistance * lowerDistance - sideDistance * sideDistance)
      * smoothstep(0.17, 0.60, 0.55 * belly.r + 0.45 * pocket.g);
    for (int i = 0; i < 60; i++) {
      if (i >= uSteps || through < 0.009) break;
      float offset = mix(0.13 + 0.73 * region, 0.04 + 0.92 * fract(jitter + float(i) * 0.61803399), mix(0.70, 0.96, st));
      float k = (float(i) + offset) * dt;
      float at = start + span * (k * (1.0 - concentrated) + k * k * concentrated);
      float center = (float(i) + 0.5) * dt;
      float ds = span * dt * (1.0 - concentrated + 2.0 * center * concentrated);
      vec3 p = d * at;
      float gap;
      vec2 relief;
      float density = densityAt(p, d, at, base, dep, gap, relief);
      if (density < 0.009) continue;
      float shade = shadowAt(p, d, base, dep);
      float lit = 0.82 * exp(-shade) + 0.18 * exp(-0.51 * shade);
      float top = sat((heightAt(p) - base) / dep);
      float powder = 0.44 + 0.56 * exp(-0.52 * density);
      float occlusion = 0.45 + 0.55 * exp(-0.59 * shade);
      float vein = smoothstep(0.33, 0.65, 0.45 * relief.x + 0.55 * relief.y);
      float hanging = 1.0 - smoothstep(0.30, 0.71, relief.x);
      float crown = smoothstep(0.13, 0.64, top);
      float sheltered = 1.0 - smoothstep(0.038, 0.30, d.y);
      float buried = exp(-density * 0.18) * (0.40 + 0.60 * occlusion);
      float rollDepth = smoothstep(0.25, 0.61, 0.57 * relief.x + 0.43 * relief.y);
      float bellyShade = 0.12 + (2.33 * rollDepth * rollDepth + 0.37 * hanging + 0.08 * top) * buried;
      vec3 enclosed = uDeck * bellyShade * (0.76 + 0.64 * sheltered) * ceilingLight;
      enclosed *= mix(vec3(1.0), vec3(0.72, 0.99, 1.22), sunBreak);
      vec3 beforeSun = highHint * (0.49 + 0.97 * top) * (0.61 + 0.91 * vein) * occlusion;
      vec3 daylight = (uUpper * vec3(0.086, 0.13, 0.193) + ambientGrey * 0.036 + 0.026 * uLower) * (0.51 + 0.60 * vein) * (0.49 + 0.51 * occlusion);
      daylight += ambientGrey * crown * (0.10 + 0.40 * occlusion);
      vec3 dome = mix(mix(beforeSun, daylight, dayTower), enclosed, st);
      vec3 bounce = uLower * vec3(0.143, 0.124, 0.109) * (1.0 - st) * (1.0 - top) * (1.0 - 0.67 * dayTower);
      float sunVisible = mix(1.0, 0.017 + 0.86 * sunBreak * gap, st);
      vec3 beam = uCloudLight * (side + forward) * lit * powder * sunVisible * mix(1.0, 0.31 + 0.69 * crown, dayTower * (1.0 - st));
      beam += uCloudLight * (1.0 - st) * dayTower * (0.008 + 0.48 * crown) * (0.86 + 0.23 * vein) * pow(lit, 0.72) * exp(-0.23 * density);
      float underside = (1.0 - smoothstep(0.008, 0.31, uSun.y)) * (1.0 - top);
      beam *= 1.0 + 0.49 * underside * (0.21 + 0.79 * pow(sat(mu), 12.0));
      if (sunBreak > 0.001 || uGolden > 0.001) {
        // A broad penumbra and illuminated thin cloud faces, not a highlight
        // at a fixed contour of the opening. Dense faces stay cool and dark.
        float skin = exp(-0.38 * density) * (0.38 + 0.62 * vein);
        float softLit = 0.25 * lit + 0.75 * exp(-0.36 * shade);
        vec3 gold = uCloudLight * vec3(1.04, 0.77, 0.54);
        beam += gold * skin * softLit * (0.29 * breakGlow + 0.31 * goldenAir * (0.56 + 0.44 * underside));
        beam += uCloudLight * vec3(0.73, 0.15, 0.21) * (0.44 * roseLight * skin * softLit);
        dome *= mix(vec3(1.0), vec3(0.76, 0.93, 1.15), uGolden * (1.0 - 0.58 * goldenAir));
      }
      vec3 cloud = dome * powder + bounce + beam;
      if (flashDepth > 0.0) {
        float nearStrike = exp(-0.17 * abs(at - flashDepth));
        float channel = smoothstep(0.34, 0.66, 0.47 * relief.x + 0.53 * relief.y);
        float litFace = (0.48 + 1.25 * channel) * (0.49 + 0.51 * exp(-0.55 * density));
        cloud += nearStrike * (vec3(0.36, 0.65, 1.0) * flashHalo * (0.23 + 0.72 * litFace)
          + vec3(0.77, 0.90, 1.0) * flashCore * (1.10 + 4.2 * litFace));
      }
      float haze = 1.0 - exp(-at * acrossAir);
      vec3 lost = mix(clear * (0.66 + 0.21 * forward), slateHaze * (0.35 + 0.50 * broad) + gradedGap * patchHaze * 0.39, st);
      cloud = mix(cloud, lost, haze);
      float stepA = 1.0 - exp(-density * ds);
      radiation += through * stepA * cloud;
      through *= 1.0 - stepA;
      horizonD = max(horizonD, density);
    }
    if (st > 0.02) {
      float throughDeck = 1.0 - exp(-(0.32 + 2.97 * max(d.y, 0.0)) * st * horizonD);
      sky = mix(sky, uDeck * (0.74 + 0.38 * broad), throughDeck);
    }
  }
  // Warm air seen beyond the tear, only where the volume transmits it.
  sky = mix(sky, clear * vec3(0.95, 0.73, 0.52), breakGlow * 0.91);
  vec3 result = radiation + through * sky;
  result += gradedGap * patchHaze * st * (0.35 + 0.57 * through);
  if (uEffects.y > 0.01 && d.y < 0.29 && d.y > -0.009) {
    float tilt = d.y * 0.25;
    vec2 slant = around + tilt * vec2(around.y, -around.x);
    vec3 adv = vec3(slant.x * 1.21 - 0.027 * uTravel.x, 0.247 + 0.009 * uRealSky, 0.071 * uEvolve + slant.y * 0.85);
    vec4 veil = f(adv);
    float band = smoothstep(0.41, 0.65, 0.67 * veil.r + 0.33 * veil.g);
    vec4 strands = f(vec3(slant.x * 2.63 + d.y * (veil.b - 0.5) * 0.085, 0.181 + d.y * 0.11, 0.71 + uRealSky * 0.012 + slant.y * 1.4));
    float streaks = 0.68 * strands.g + 0.32 * strands.b;
    band *= 0.43 + 0.72 * smoothstep(0.27, 0.73, streaks);
    float ceiling = 1.0 - smoothstep(0.082 + 0.14 * veil.g, 0.118 + 0.16 * veil.g, d.y);
    float rain = band * ceiling * uEffects.y * (0.38 + 0.19 * opening) * smoothstep(-0.012, 0.021, d.y);
    vec3 curtain = uDeck * (0.30 + 0.58 * veil.g);
    result = mix(result, curtain, rain);
  }
  if (sunBreak > 0.0) {
    float nearSun = exp(-max(0.0, 1.0 - mu) * 140.0);
    result += uCloudLight * vec3(1.04, 0.79, 0.60) * sunBreak * nearSun * (0.017 + 0.09 * through);
  }
  float frost = smoothstep(0.07, 0.87, uWeather.w);
  if (frost > 0.0) {
    float theta = max(0.0, 1.0 - mu);
    vec3 quiet = mix(uLower * 0.86, uUpper * 1.18, smoothstep(-0.01, 0.38, d.y));
    float hazeGlow = (0.068 * exp(-theta * 54.0) + 0.032 * exp(-theta * 498.0)) * (0.45 + 0.55 * uWeather.z);
    result = mix(result, quiet, frost * 0.88) + uCloudLight * hazeGlow * frost;
  }
  float direct = mix(through, uWeather.z, smoothstep(0.992, 0.99992, mu));
  outColor = vec4(result, clamp(direct, 0.0, 1.0));
}
`

export const displayFragment = /* glsl */ `${glslCommon}
uniform sampler2D tSky;
uniform sampler2D tStars;
uniform mat4 uCamWorld;
uniform mat3 uProject;
uniform mat3 uStellar;
uniform vec2 uExtent;
uniform vec2 uMapSize;
uniform vec4 uRay;
uniform float uPixelAngle;
uniform float uElevation;
uniform float uNight;
uniform float uFrostFog;
uniform float uRainFog;
uniform float uMarchFilter;
uniform vec3 uSunFace;
uniform vec3 uMoon;
uniform vec3 uDisc;
uniform vec3 uMoonDisc;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

vec2 where(vec3 d) {
  vec3 w = uProject * d;
  return 0.5 + w.xy / max(0.05, w.z) / uExtent * 0.5;
}

vec4 skyLookup(vec3 d, float blur) {
  vec2 uv = where(d);
  float rad = blur * 0.5 * length(uMapSize / uExtent) * 0.7;
  // Suppress variance from the finite atlas sampling; this is independent
  // of the lens's circle of confusion.
  float lod = clamp(log2(max(1.0, rad * 0.92)), uMarchFilter, 8.0);
  if (rad < 1.3) return textureLod(tSky, uv, lod);
  vec2 spread = blur * 0.19 / uExtent;
  return 0.40 * textureLod(tSky, uv, lod)
    + 0.15 * (textureLod(tSky, uv + vec2(spread.x, 0.0), lod) + textureLod(tSky, uv - vec2(spread.x, 0.0), lod)
    + textureLod(tSky, uv + vec2(0.0, spread.y), lod) + textureLod(tSky, uv - vec2(0.0, spread.y), lod));
}

vec3 starsAt(vec3 d, vec3 air, float visible, float blur) {
  if (uNight <= 0.0001 || d.y < 0.0 || visible < 0.003) return vec3(0.0);
  vec3 w = normalize(uStellar * d);
  float pi = 3.1415926536;
  float longitude = atan(w.x, w.z) / (2.0 * pi);
  float latitude = asin(clamp(w.y, -1.0, 1.0)) / pi;
  vec2 uv = vec2(longitude, latitude + 0.5);
  float lens = min(blur, 1.35 * uPixelAngle);
  float lod = clamp(log2(max(1.0, (uPixelAngle + 0.35 * lens) * ${STAR_WIDTH}.0 / 6.2831853)), 0.0, 3.4);
  vec3 stars = textureLod(tStars, uv, lod).rgb;
  float g = dot(w, vec3(-0.802, 0.197, 0.565));
  float clouds = 0.6 * valueNoise(vec2(longitude + 0.29, latitude + 0.23) * 44.0)
    + 0.30 * valueNoise(vec2(longitude + 0.29, latitude + 0.23) * 126.0)
    + 0.10 * valueNoise(vec2(longitude + 0.29, latitude + 0.23) * 261.0);
  float darkRiver = exp(-pow((g - 0.018 * sin(47.0 * longitude) - 0.021 * clouds) * 32.0, 2.0));
  float milky = exp(-g * g * 115.0) * pow(clouds, 1.9) * (1.0 - 0.65 * darkRiver);
  float extinction = exp(-0.022 / max(0.019, d.y)) * smoothstep(0.002, 0.03, d.y);
  float wash = 1.0 - smoothstep(0.008, 0.058, dot(air, vec3(0.21, 0.72, 0.07)));
  return (stars * 0.20 + vec3(0.0145, 0.0145, 0.021) * milky) * extinction * wash * visible * uNight;
}

vec3 sunAt(vec3 d, float blur) {
  float mu = dot(d, uSunFace);
  if (mu < 0.949) return vec3(0.0);
  const float sr = 0.00465;
  vec3 h = normalize(vec3(uSunFace.z, 0.0, -uSunFace.x) + vec3(1e-7));
  vec3 v = cross(uSunFace, h);
  vec2 xy = vec2(dot(d, h), dot(d, v));
  float squash = mix(0.65, 1.0, smoothstep(0.06, 3.8, uElevation));
  float frost = smoothstep(0.15, 0.92, uFrostFog);
  float fogBlur = frost * (0.0055 + 0.004 * frost);
  vec2 r = sqrt(vec2(sr * sr, sr * sr * squash * squash) + blur * blur + fogBlur * fogBlur);
  vec2 p = xy / r;
  float x = length(p);
  float spread = uPixelAngle * 0.52 / max(r.x, 1e-5) + 0.12 * frost + 0.029;
  float disk = 1.0 - smoothstep(0.98 - spread, 1.0 + spread, x);
  float limb = mix(0.62 + 0.38 * sqrt(max(0.0, 1.0 - x * x)), 0.89, smoothstep(0.002, 0.015, blur));
  float energy = squash * sr * sr / (r.x * r.y);
  vec3 center = textureLod(tSky, where(uSunFace), 0.0).aaa;
  return uDisc * center * energy * disk * limb * smoothstep(-0.003, 0.0011, d.y);
}

vec3 moonAt(vec3 d, vec3 air, float blur, float visible) {
  float n = dot(d, uMoon);
  if (uNight < 0.001 || n < 0.968) return vec3(0.0);
  vec3 u = normalize(cross(uMoon, vec3(0.0, 1.0, 0.0)));
  vec3 v = cross(uMoon, u);
  float r = sqrt(0.0054 * 0.0054 + blur * blur);
  vec2 xy = vec2(dot(d, u), dot(d, v)) / r;
  float radius = length(xy);
  float edge = 1.0 - smoothstep(1.0 - uPixelAngle / r, 1.0 + uPixelAngle / r, radius);
  float phase = smoothstep(-0.11, 0.15, 0.64 * xy.x + 0.26 * xy.y + 0.62 * sqrt(max(0.0, 1.0 - radius * radius)));
  float detail = 0.75 + 0.25 * valueNoise(xy * 5.1 + 0.52);
  float glow = 0.0084 * exp(-(1.0 - n) * 127.0) + 0.035 * exp(-(1.0 - n) * 1760.0);
  float wash = 1.0 - smoothstep(0.015, 0.093, dot(air, vec3(0.21, 0.72, 0.07)));
  return uMoonDisc * visible * wash * (phase * detail * edge * (0.0054 * 0.0054 / (r * r)) + glow);
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dv = normalize(vec3((ndc.x + uRay.z) * uRay.x, (ndc.y + uRay.w) * uRay.y, -1.0));
  vec3 d = normalize(mat3(uCamWorld) * dv);
  float coc = min(uCocScale / uFocusM, 2048.0);
  float blur = 0.5 * coc * uPixelAngle;
  vec4 sky = skyLookup(d, blur);
  vec3 color = sky.rgb + starsAt(d, sky.rgb, sky.a, blur) + moonAt(d, sky.rgb, blur, sky.a) + sunAt(d, blur);
  float a = uFogDensity * exp(-uFogFalloff * max(uCamPos.y, 0.0));
  float depth = d.y > 1e-3 ? a / (uFogFalloff * d.y) : 1e6;
  // The atlas already contains the lit rain curtain. Keep the shared
  // ground-fog value at the skyline, but don't apply an infinitely thick
  // second curtain to the opening above it.
  float above = smoothstep(0.003, 0.047, d.y);
  float fog = (1.0 - exp(-depth)) * (1.0 - 0.66 * uRainFog * above);
  color = mix(color, uFogColor + uFogSunTint * pow(saturate(dot(d, uSunDir)), 6.0), fog);
  float grey = dot(color, vec3(0.3, 0.6, 0.1));
  if (uDiag == 7) color = vec3(1.0, 0.0, 0.6);
  if (uDiag == 4) { outColor = vec4(vec3(0.03), -1.0); return; }
  if (uDiag == 5) color = vec3(1.0e4);
  if (uDiag == 6) color = vec3(grey) * 0.5;
  outColor = vec4(color, coc);
}
`
