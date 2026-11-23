import { glslCommon } from '../core/shading.ts'
import { airGlsl } from './air.ts'
import { nightGlsl } from './night/index.ts'
import { sunsetGlsl } from './sunset.ts'

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
uniform float uTearAttack;
uniform float uLunarMeter;
uniform vec2 uTravel;
uniform vec2 uSmear;
uniform float uEvolve;
uniform float uEyeKm;
uniform float uRealSky;
uniform float uGolden;
uniform float uLate;
uniform float uStreaks;
uniform float uSideBanks;
uniform float uWetHaze;
uniform vec3 uWetDome;
uniform float uDawn;
uniform float uOpening;
uniform float uFirstBlue;
uniform float uCoolDay;
uniform float uFinale;
uniform float uFinaleDusk;
uniform vec3 uMist;
uniform int uSteps;
uniform int uLightSteps;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

const float CURVE = 1.0 / 12742.0;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float sat(float a) { return clamp(a, 0.0, 1.0); }
float squared(float x) { return x * x; }
${sunsetGlsl}
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
  float dark = (1.0 - smoothstep(-13.0, -5.0, uElevation)) * (1.0 - shape);
  vec2 field = w * vec2(mix(0.074 - 0.017 * towers, 0.045, shape), mix(0.089 - 0.019 * towers, 0.081, shape))
    * mix(vec2(1.0), vec2(0.48, 1.57), dark);
  return f(vec3(field.x + 0.37, 0.13 * h + 0.055 * uEvolve, field.y + 0.68));
}

float riftAperture(vec3 p, vec3 d, float rough, float tear) {
  vec3 h = normalize(vec3(uSun.z, 0.0, -uSun.x) + vec3(1e-7));
  vec3 v = cross(uSun, h);
  vec2 q = vec2(dot(d, h), dot(d, v));
  // Storm layers break at different heights. Shear the opening through the
  // volume instead of cutting the same silhouette at every depth.
  float level = heightAt(p);
  q += vec2(0.031, -0.018) * clamp(level - 2.0, -1.0, 2.0) * tear;
  vec2 seam = vec2(0.91 * q.x + 0.41 * q.y, -0.41 * q.x + 0.91 * q.y);
  float width = 0.047 + 0.028 * tear;
  float crag = sin(49.0 * seam.x + 12.0 * seam.y) * sin(19.0 * seam.y + 2.4 * level);
  float lip = sin(31.0 * seam.x + 42.0 * seam.y + 0.82 * level) * (0.023 * tear);
  float notch = (rough - 0.48) * min(1.0, 5.0 * length(q));
  float wavering = 0.011 * sin(86.0 * seam.x - 7.0 * seam.y + level)
    + 0.020 * sin(41.0 * seam.x - 9.0 * seam.y - level * 1.9);
  float slashed = abs(seam.y + lip + wavering) / width;
  float tail = abs(seam.x + 0.071) / (4.65 * width);
  float outline = slashed + pow(tail, 1.9);
  outline += min(1.0, 13.0 * length(q)) * (0.44 * crag + 4.4 * notch);
  outline += (0.17 + 0.27 * smoothstep(0.03, 0.20, abs(seam.x))) * sin(137.0 * seam.x + 23.0 * seam.y + 3.2 * level);
  return 1.0 - smoothstep(0.27, 1.30, outline);
}

float toGap(vec3 p, vec3 d, float rough) {
  float phi = max(0.0, 1.0 - dot(d, uSun));
  // Small, interrupted gaps in fair cloud: the transparent part widens and
  // wanders with depth without carving the same circle through every layer.
  float widthNoise = mix(0.76, 1.28, smoothstep(0.33, 0.69, rough));
  float ordinary = exp(-phi / (mix(0.00228, 0.0044, uGolden) * widthNoise));
  if (uEffects.w < 0.001 || phi > 0.10) return ordinary;
  ordinary = mix(ordinary, exp(-phi / 0.00105), uEffects.w);
  float torn = riftAperture(p, d, rough, uEffects.w) * smoothstep(0.0, 0.67, uEffects.w);
  // As the burst falls, the held opening is a slit through several
  // translucent layers, not a circular hole around the sun. The round
  // component becomes a low, wide penumbra that cannot clear the deck.
  float settled = smoothstep(0.915, 0.952, uWeather.z) * (1.0 - smoothstep(0.70, 0.91, uEffects.w));
  float penumbra = exp(-phi / (0.00185 * widthNoise));
  float porous = 0.23 * penumbra + (0.87 - 0.23 * penumbra) * torn;
  return mix(max(ordinary, torn), porous, settled);
}

float profile(vec4 field, float tv, float storm) {
  float roll = smoothstep(0.34, 0.68, 0.55 * field.r + 0.34 * field.g + 0.11 * field.b);
  float fold = smoothstep(0.22, 0.73, 0.53 * field.g + 0.47 * field.b);
  float floorShape = 0.009 + storm * (0.40 * roll + 0.13 * field.r + 0.16 * fold);
  float cap = smoothstep(0.29, 0.67, field.r + 0.23 * (field.g - 0.5) + 0.15 * (field.b - 0.5));
  float tower = mix(0.28 + 0.68 * cap, 0.77 + 0.31 * field.g, storm);
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
  float nightThinning = 0.118 * (1.0 - smoothstep(-13.0, -4.5, uElevation)) * (1.0 - st);
  float cutoff = mix(0.629 - 0.35 * pow(uWeather.x, 1.2) - 0.031 * uEffects.x + nightThinning, 0.273 - 0.09 * uWeather.x, st);
  cutoff += 0.063 * smoothstep(0.16, 0.28, uWeather.x) * (1.0 - st);
  cutoff += 0.26 * uFinale * (1.0 - st);
  gap = toGap(p, eyeRay, 0.38 * shape.g + 0.62 * shape.b);
  float clear = uWeather.z;
  float aperture = smoothstep(0.58, 1.0, clear + 0.21 * uEffects.w);
  float forced = (0.21 + 0.36 * st) * max(0.0, 0.66 - clear);
  // At the break, densityAt will thin the clouds. Preserve some underlying
  // structure here so erosion does not collapse the faces to a hard outline.
  float opening = aperture * mix(gap * 0.99, smoothstep(0.30, 0.77, gap) * 0.86, uEffects.w);
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
      small += (grit - 0.47) * mix(0.035, 0.13, uWeather.y) * nearCloud * (1.0 - smoothstep(0.53, 0.83, sc));
    }
  }
  textureValue.y = 0.32 * textureValue.y + 0.68 * small;
  float contrast = max(uWeather.y, smoothstep(0.12, 0.40, uWeather.x));
  float bite = (mix(0.41, 0.32, uWeather.y) + mix(0.21, 0.34, uWeather.y) * nearCloud * contrast) * max(0.06, 0.94 - 1.22 * small);
  float body = max(0.0, sc - bite + (small - 0.48) * (0.52 + 1.05 * uWeather.y) * nearCloud * contrast) * profileWeight;
  float softWindow = gap * 0.84;
  float tornWindow = smoothstep(0.31, 0.80, gap);
  float sunFilter = mix(1.0, 0.009 + 0.99 * squared(1.0 - uWeather.z), mix(softWindow, tornWindow, uEffects.w));
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
  float fairEvening = smoothstep(0.010, 0.045, uSun.y) * (1.0 - smoothstep(0.058, 0.20, uSun.y));
  fairEvening *= (1.0 - smoothstep(0.22, 0.35, uWeather.x)) * smoothstep(0.23, 0.44, -uSun.x);
  float weather = (0.09 + 0.75 * uEffects.x + 0.26 * uWeather.x + 0.43 * fairEvening) * (1.0 - st) * (1.0 - uWeather.w) * (1.0 - uFinale);
  if (weather < 0.013 || d.y < 0.006) return air;
  float t = foot(6.2, d);
  vec2 p = rotateCloud(d.xz * t - uTravel * 1.32);
  vec4 a = f(vec3(0.029 * p.x + 0.17, 0.073 * uEvolve + 0.42, 0.12 * p.y));
  vec4 b = f(vec3(0.092 * p.x + 0.55, 0.067 * uEvolve, 0.26 * p.y + 0.72));
  float shape = 0.67 * a.r + 0.23 * a.g + 0.1 * a.b;
  float coverage = (weather * 0.84) * smoothstep(0.48 - 0.085 * uEffects.x - 0.062 * fairEvening, 0.74, shape - 0.16 * (1.0 - b.b));
  coverage *= 1.0 - exp(-17.0 * max(d.y, 0.0));
  float lighting = smoothstep(-11.0, 3.0, uElevation);
  float warm = 1.0 - smoothstep(2.0, 22.0, uElevation);
  vec3 ambient = uUpper * (0.38 + 0.54 * a.a) + vec3(0.011, 0.014, 0.021) * lighting;
  vec3 tint = mix(vec3(1.0, 0.95, 0.9), vec3(1.0, 0.37, 0.27), warm);
  vec3 light = ambient + tint * uCloudLight * (0.016 + 0.055 * pow(sat(mu), 33.0)) * (0.30 + 0.70 * b.r);
  light = mix(light, dot(light, LUMA) * vec3(0.81, 1.07, 1.31), uCoolDay * (1.0 - smoothstep(0.906, 0.988, mu)));
  return mix(air, light, coverage);
}

vec3 lateCirrus(vec3 d, vec3 sky, float theta) {
  // Thin streaming sheets on different levels. Their near sides stay dark;
  // the perforated lower edges still catch light after the ridge hides the sun.
  vec3 reflected = mix(vec3(0.26, 0.034, 0.071), vec3(0.36, 0.115, 0.073), uFinale) * (0.17 + 0.83 * exp(-theta * 10.0));
  float low = exp(-squared((d.y - 0.051) * mix(13.0, 26.0, uFinale)));
  vec3 air = sky * mix(mix(vec3(1.02, 0.77, 1.18), vec3(0.76, 0.97, 1.30), smoothstep(0.055, 0.36, d.y)), vec3(1.0), uFinale);
  air += reflected * low * mix(0.39, 0.018, uFinale);
  for (int i = 0; i < 2; i++) {
    float k = float(i);
    float t = foot(4.4 + 2.0 * k, d);
    vec2 p = rotateCloud(d.xz * min(t, 240.0) - uTravel * (1.1 + 0.1 * k));
    vec3 broad = f(vec3(p.x * 0.019 + 0.69 * k, 0.63 + 0.22 * k + 0.019 * uEvolve, p.y * 0.032)).rgb;
    vec3 q = vec3(p.x * (0.016 + 0.006 * k) + 0.71 * k, 0.24 + 0.37 * k + 0.043 * uEvolve,
      p.y * (0.096 + 0.029 * k) + (broad.g - 0.5) * 0.65);
    q.z *= mix(1.0, 1.55, uFinale);
    vec4 roll = f(q);
    float filaments = f(q * vec3(2.27, 1.0, 2.8) + vec3(0.59, 0.17, 0.49)).g;
    float textureValue = 0.74 * roll.r + 0.26 * filaments;
    float shape = smoothstep(0.49 + 0.028 * k, 0.71, textureValue) * smoothstep(0.24, 0.66, broad.r) * smoothstep(0.018, 0.065, d.y);
    shape *= mix(1.0, low * (1.0 - smoothstep(0.046, 0.108, d.y)) * smoothstep(0.48, 0.65, textureValue), uFinale);
    float edge = exp(-squared((textureValue - mix(0.53, 0.56, uFinale) - 0.025 * k) * mix(14.0, 20.0, uFinale)));
    vec3 shaded = air * mix(vec3(0.27, 0.39, 0.59), vec3(0.45, 0.53, 0.69), uFinale)
      + reflected * edge * mix(0.93 + 0.87 * low, 0.32 + 0.44 * low, uFinale);
    air = mix(air, shaded, shape * (0.83 - 0.19 * k));
  }
  return air;
}

// Three advecting banks of shallow, nearly horizontal cloud, lit along
// their lower faces. Elevation and azimuth are world directions, not UVs.
vec4 eveningStreaks(vec3 d, vec3 sky, float theta) {
  float elevation = max(0.0, d.y);
  float cool = 0.60 * (1.0 - uFinale) * (1.0 - exp(-17.0 * elevation)) * smoothstep(0.016, 0.10, theta);
  vec3 air = mix(sky, dot(sky, LUMA) * vec3(0.61, 1.04, 1.64), cool);
  float afterglow = (1.0 - uFinale) * (1.0 - smoothstep(-3.1, -0.20, uElevation));
  air += vec3(0.24, 0.056, 0.011) * exp(-squared(elevation * 37.0) - 21.0 * theta) * afterglow;
  float limit = mix(0.171, 0.119, uFinale);
  if (d.y < 0.006 || d.y > limit) return vec4(air, 1.0);
  float az = atan(d.x, -d.z);
  float drift = 0.0042 * (0.69 * uTravel.x - 0.31 * uTravel.y);
  float along = az - drift;
  float lit = smoothstep(-12.0, -5.5, uElevation) * (1.0 - smoothstep(6.0, 17.0, uElevation));
  vec3 red = vec3(0.32, 0.083, 0.037) * lit * (0.35 + 0.65 * exp(-15.0 * theta));
  vec3 edgeSun = mix(vec3(0.25, 0.061, 0.009), vec3(0.143, 0.032, 0.038), uFinaleDusk);
  red = mix(red, edgeSun * (0.25 + 0.75 * exp(-9.0 * theta)), uFinale);
  float clearDisk = 1.0 - 0.80 * exp(-1840.0 * theta) * smoothstep(-1.0, 0.0, uElevation);
  vec3 outAir = air;
  float transmission = 1.0;
  for (int i = 0; i < 5; i++) {
    bool sideBank = i >= 3;
    if (sideBank && uSideBanks <= 0.001) break;
    float k = float(i);
    float centre = sideBank ? (i == 3 ? -0.96 : -0.61) : (i == 1 ? -0.20 : (i == 0 ? -0.69 : -0.61));
    float span = sideBank ? (i == 3 ? 0.17 : 0.13) : (i == 0 ? 0.49 : (i == 1 ? 0.37 : 0.30));
    float strip = (along - centre) / span;
    if (abs(strip) > 1.13) continue;
    vec4 flow = f(vec3(0.68 * along + 0.217 * k, 0.24 + 0.141 * k + 0.022 * uEvolve, 0.58 + k * 0.83));
    float run = 1.0 - smoothstep(0.19, 1.03, abs(strip + 0.28 * (flow.a - 0.5)));
    vec3 ribs = f(vec3(2.68 * along - 0.48 * k, 0.41 + k * 0.29 + 0.023 * uEvolve, flow.a * 0.26 + 0.87)).rgb;
    float clumps = smoothstep(0.27, 0.67, 0.39 * flow.r + 0.61 * ribs.r);
    float level = (sideBank ? (i == 3 ? 0.046 : 0.059) : (i == 0 ? 0.028 : (i == 1 ? mix(0.073, 0.060, uFinale) : mix(0.131, 0.094, uFinale))))
      + (0.028 - 0.003 * k) * (flow.g - 0.5) + 0.015 * (ribs.b - 0.5)
      + (sideBank ? 0.0055 : 0.012 + 0.005 * k) * sin(6.1 * along + 2.41 * k) + 0.006 * sin(13.5 * along - 1.64 * k);
    float width = (0.0065 + 0.012 * clumps) * (0.59 + 0.41 * run) * (1.0 - 0.073 * k) * mix(1.0, 0.78, uFinale);
    float y = (d.y - level) / width;
    if (abs(y) > 2.2) continue;
    float wisp = f(vec3(1.46 * along + 0.77 * k, 0.11 + 0.057 * y, 0.43 + 0.19 * k + 0.024 * uEvolve)).g;
    float mass = (0.21 + 0.79 * clumps) * run * clearDisk * (1.0 - smoothstep(limit - 0.019, limit, d.y));
    mass = min(1.0, mass * (1.0 + 0.48 * uFinale));
    if (sideBank) mass *= 0.93 * uSideBanks;
    float ragged = 0.66 * (wisp - 0.5) + 0.32 * (ribs.g - 0.5);
    float cloud = exp(-1.08 * squared(y - 0.32 + ragged)) * mass * (0.69 + 0.31 * wisp);
    float underside = exp(-3.6 * squared(y + 0.55 + 1.25 * ragged)) * mass;
    vec3 body = air * vec3(0.26, 0.38, 0.58) + vec3(0.003, 0.006, 0.010);
    body = mix(body, air * vec3(0.13, 0.16, 0.27) + vec3(0.011, 0.013, 0.027), uFinale);
    outAir = mix(outAir, body, 0.94 * cloud) + red * (0.018 * cloud + (sideBank ? 1.50 : 1.13) * underside) * (0.34 + 0.66 * wisp);
    transmission *= 1.0 - 0.88 * cloud;
  }
  return vec4(outAir, transmission);
}

void main() {
  vec3 d = normalize(uBore * vec3((vUv * 2.0 - 1.0) * uExtent, 1.0));
  float st = uWeather.y;
  float sunBreak = uEffects.w;
  float mu = dot(d, uSun);
  float angle = max(0.0, 1.0 - mu);
  float up = max(0.0, d.y);
  float goldenAir = uGolden * exp(-angle * 20.0);
  vec3 clear = airAt(d);
  clear *= mix(vec3(1.0), vec3(1.08, 0.95, 0.79), goldenAir);
  float dawnGlow = uDawn * exp(-angle * 27.0) * exp(-11.0 * max(0.0, d.y));
  clear *= mix(vec3(1.0), vec3(1.18, 1.04, 0.77), 0.69 * dawnGlow);
  clear += uDawn * vec3(0.19, 0.093, 0.016) * exp(-angle * 45.0) * exp(-5.0 * max(0.0, d.y));
  float earlySide = 1.0 - exp(-angle * 13.0);
  clear *= mix(vec3(1.0), vec3(0.61, 1.02, 1.20), uOpening * (0.23 + 0.77 * smoothstep(0.004, 0.15, d.y))
    * (0.59 + 0.41 * earlySide) * (1.0 - uDawn));
  float dayTower = smoothstep(0.102, 0.29, uSun.y);
  float blueWindow = dayTower * (1.0 - st) * smoothstep(0.027, 0.23, d.y) * (1.0 - smoothstep(0.89, 0.998, mu));
  clear *= mix(vec3(1.0), vec3(0.38, 0.59, 0.68), blueWindow);
  float coolSide = uCoolDay * smoothstep(0.004, 0.080, angle) * (0.71 + 0.29 * smoothstep(-0.005, 0.12, d.y));
  vec3 sideColour = mix(vec3(0.82, 1.10, 1.28), vec3(0.59, 1.09, 1.47), smoothstep(0.015, 0.19, d.y));
  clear = mix(clear, sideColour * dot(clear, LUMA) * 1.43, coolSide);
  vec3 firstBlue = vec3(0.008, 0.046, 0.090) * (0.70 + 0.30 * exp(-7.0 * up));
  firstBlue += vec3(0.025, 0.042, 0.048) * exp(-19.0 * up);
  firstBlue += vec3(0.25, 0.091, 0.057) * exp(-squared((d.y - 0.017) * 47.0) - 125.0 * angle);
  clear = mix(clear, firstBlue, uFirstBlue);
  vec2 around = normalize(d.xz + vec2(1e-7));
  if (uFinale > 0.0) {
    float cosAzimuth = clamp(dot(around, normalize(uSun.xz + vec2(1e-7))), -1.0, 1.0);
    clear = mix(clear, sunsetSkyAt(up, cosAzimuth, uFinaleDusk), uFinale);
  }
  float hazeStrength = exp(-max(0.0, d.y) * 20.0);
  vec4 heads = f(vec3(around.x * 0.82 - 0.032 * uTravel.x, 0.21 + around.y * 0.68, 0.41 + 0.023 * uEvolve));
  vec4 scallops = f(vec3(around.x * 1.86 - 0.035 * uTravel.x, 0.46 + around.y * 1.38, 0.54 + 0.031 * uEvolve));
  float distantSlot = smoothstep(0.26, 0.77, 0.57 * heads.r + 0.26 * heads.g + 0.17 * scallops.r);
  vec3 slateHaze = uDeck * (0.43 + (1.54 + 1.55 * distantSlot) * hazeStrength);
  float crest = 0.016 + 0.037 * distantSlot + 0.076 * (heads.b - 0.39) + 0.058 * (scallops.g - 0.43);
  float opening = 1.0 - smoothstep(crest - 0.014, crest + 0.028, d.y);
  float distantLight = 0.31 + 0.69 * exp(-angle * 11.0);
  float patchHaze = opening * (7.8 + 24.0 * distantSlot * distantSlot) * distantLight * (0.79 + 0.49 * scallops.r)
    * mix(0.87, 1.0, uEffects.y) * (1.0 - 0.47 * sunBreak);
  vec3 gradedGap = dot(uDeck, vec3(0.2126, 0.7152, 0.0722)) * vec3(1.24, 1.18, 1.12);
  vec3 air = mix(clear, slateHaze, min(1.0, st * 1.01));
  float broad = exp(-max(0.0, d.y) * 19.0);
  // The underside in the film camera is only the bottom fifteen degrees
  // of sky. Intersect separate suspended banks there rather than reading
  // one low lobe as a flat ceiling. The stretched fields are in cloud km.
  float stacked = 0.0;
  float seamLight = 0.0;
  float lowBank = 0.0;
  float riftLight = 0.0;
  if (st > 0.01) {
    vec2 a = rotateCloud(d.xz * min(72.0, foot(1.39, d)) - uTravel);
    vec2 b = rotateCloud(d.xz * min(96.0, foot(2.34, d)) - uTravel * 1.12);
    vec4 apron = f(vec3(0.048 * a.x + 0.29, 0.19 + 0.033 * uEvolve, 0.079 * a.y + 0.22));
    vec4 ridge = f(vec3(0.060 * b.x - 0.17, 0.38 + 0.039 * uEvolve, 0.091 * b.y + 0.77));
    float outer = smoothstep(0.32, 0.68, 0.68 * apron.r + 0.32 * apron.g);
    float upper = smoothstep(0.32, 0.70, 0.73 * ridge.r + 0.27 * ridge.g);
    float scallopedBase = 0.032 + 0.043 * outer + 0.044 * (apron.b - 0.42);
    float apronTop = 0.145 + 0.098 * outer + 0.053 * (ridge.g - 0.5);
    float apronBody = smoothstep(scallopedBase, scallopedBase + 0.046, d.y) * (1.0 - smoothstep(apronTop, apronTop + 0.064, d.y));
    float upperBody = smoothstep(0.097 + 0.073 * upper, 0.166 + 0.085 * upper, d.y);
    stacked = apronBody * outer * (0.83 + 0.17 * ridge.b) + upperBody * 0.62 * upper;
    seamLight = exp(-squared((d.y - apronTop + 0.021) * 31.0)) * outer * (0.34 + 0.66 * upper)
      + 0.31 * exp(-squared((d.y - scallopedBase - 0.027) * 35.0)) * (1.0 - outer) * upper;
    vec4 mass = f(vec3(a.x * 0.017 + 0.62, 0.41 + 0.025 * uEvolve, a.y * 0.039 + 0.37));
    float fold = smoothstep(0.30, 0.62, 0.80 * mass.r + 0.20 * apron.g);
    float underside = 0.061 + 0.082 * fold + 0.051 * (apron.r - 0.35) + 0.032 * (ridge.b - 0.45);
    lowBank = (0.26 + 0.74 * fold) * smoothstep(underside, underside + 0.055, d.y);
    seamLight += (0.21 + 0.64 * apron.g) * exp(-squared((d.y - underside - 0.013) * 31.0));
    float breadth = 0.077 + 0.172 * ridge.g + 0.060 * (mass.b - 0.44);
    riftLight = exp(-squared((d.y - breadth) * (18.0 + 9.0 * apron.r))) * smoothstep(0.30, 0.68, 0.53 * apron.b + 0.47 * mass.g);
  }
  vec3 sky = air;
  if (uStreaks < 0.999) {
    sky = thinClouds(d, air, mu);
    if (uLate > 0.001) sky = mix(sky, lateCirrus(d, sky, angle), uLate);
  }
  float sheetTransmission = 1.0;
  if (uStreaks > 0.001) {
    vec4 sheets = eveningStreaks(d, air, angle);
    sky = mix(sky, sheets.rgb, uStreaks);
    sheetTransmission = mix(1.0, sheets.a, uStreaks);
  }
  float through = 1.0;
  vec3 radiation = vec3(0.0);
  float base = mix(1.38, 0.86, st);
  float dark = (1.0 - smoothstep(-13.0, -5.0, uElevation)) * (1.0 - st);
  float dep = mix((1.52 + 1.49 * smoothstep(0.13, 0.40, uWeather.x)) * (1.0 - 0.25 * uLate) * mix(1.0, 0.36, dark), 3.55, st);
  float start = foot(base, d);
  float stop = min(foot(base + dep, d), mix(133.0, 119.0, st));
  float span = stop - start;
  float flashDot = max(0.0, 1.0 - dot(d, uFlash));
  float lateStrike = smoothstep(-0.29, -0.06, uFlash.x);
  float envelope = 1.0 - smoothstep(mix(0.023, 0.037, lateStrike), mix(0.073, 0.093, lateStrike), flashDot);
  bool strike = uEffects.z > 0.0004 && envelope > 0.0;
  // Refine the integration only round a strong stroke. At ten degrees up,
  // a normal cloud step crosses the lit layer in too few samples and its
  // edge shows a succession of nearly horizontal march contours.
  float flashDetail = smoothstep(0.008, 0.48, uEffects.z) * (1.0 - smoothstep(0.024, 0.062, flashDot));
  int steps = uSteps + int(floor(1.42 * float(uSteps) * flashDetail + 0.5));
  float dt = 1.0 / float(steps);
  vec3 source = vec3(0.0);
  vec3 strikeSide = vec3(0.0);
  vec3 strikeUp = vec3(0.0);
  if (strike) {
    source = uFlash * foot(mix(2.16, 1.72, lateStrike), uFlash);
    strikeSide = normalize(vec3(uFlash.z, 0.0, -uFlash.x));
    strikeUp = cross(uFlash, strikeSide);
  }

  if (uStreaks < 0.999 && span > 0.0 && d.y > -0.018) {
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
    float ceilingLight = 0.14 + 2.38 * well * well + 0.46 * smoothstep(0.29, 0.69, belly.g);
    vec3 sunSide = normalize(vec3(uSun.z, 0.0, -uSun.x) + vec3(1e-7));
    float lowerDistance = (d.y - uSun.y + 0.122 + 0.035 * (pocket.g - 0.5)) * 31.0;
    float sideDistance = (dot(d, sunSide) - 0.102) * 11.0;
    float roseLight = sunBreak * (1.0 - smoothstep(3.1, 8.0, uElevation))
      * exp(-lowerDistance * lowerDistance - sideDistance * sideDistance)
      * smoothstep(0.17, 0.60, 0.55 * belly.r + 0.45 * pocket.g);
    for (int i = 0; i < 146; i++) {
      if (i >= steps || through < 0.009) break;
      float dither = fract(jitter + float(i) * 0.61803399);
      float offset = mix(0.29 + 0.43 * region, 0.15 + 0.70 * dither, mix(0.70, 0.67, st));
      offset = mix(offset, 0.36 + 0.28 * dither, envelope * 0.87 * smoothstep(0.17, 0.65, uEffects.z));
      float k = (float(i) + offset) * dt;
      float at = start + span * (k * (1.0 - concentrated) + k * k * concentrated);
      float center = (float(i) + 0.5) * dt;
      float ds = span * dt * (1.0 - concentrated + 2.0 * center * concentrated);
      vec3 p = d * at;
      float gap;
      vec2 relief;
      float density = densityAt(p, d, at, base, dep, gap, relief);
      density *= 1.0 - uFinale * (0.73 + 0.27 * smoothstep(0.04, 0.112, d.y));
      density *= 1.0 - uStreaks;
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
      float froth = smoothstep(0.28, 0.68, 0.58 * relief.y + 0.42 * relief.x);
      float bellyShade = 0.068 + (3.60 * rollDepth * rollDepth + 0.26 * hanging + 0.10 * top) * buried;
      bellyShade *= (0.53 + 0.88 * froth) * (0.69 + 0.59 * well);
      vec3 enclosed = uDeck * bellyShade * (0.76 + 0.64 * sheltered) * ceilingLight;
      enclosed *= 1.0 - (0.57 * clamp(stacked, 0.0, 1.0) + 0.32 * lowBank) * (1.0 - 0.64 * sunBreak);
      enclosed += uDeck * seamLight * (0.61 + 1.70 * rollDepth * froth) * (1.0 - 0.72 * sunBreak);
      enclosed += uDeck * vec3(0.76, 1.04, 1.27) * riftLight * (0.33 + 1.17 * rollDepth) * (1.0 - 0.83 * sunBreak);
      enclosed *= mix(vec3(1.0), vec3(0.70, 0.91, 1.09), sunBreak);
      vec3 beforeSun = highHint * (0.49 + 0.97 * top) * (0.61 + 0.91 * vein) * occlusion;
      vec3 daylight = (uUpper * vec3(0.086, 0.13, 0.193) + ambientGrey * 0.036 + 0.026 * uLower) * (0.51 + 0.60 * vein) * (0.49 + 0.51 * occlusion);
      daylight += ambientGrey * crown * (0.10 + 0.40 * occlusion);
      vec3 dome = mix(mix(beforeSun, daylight, dayTower), enclosed, st);
      vec3 bounce = uLower * vec3(0.143, 0.124, 0.109) * (1.0 - st) * (1.0 - top) * (1.0 - 0.67 * dayTower);
      float sunVisible = mix(1.0, 0.016 + 0.13 * sunBreak * smoothstep(0.39, 0.81, gap), st)
        * (1.0 - 0.73 * sunBreak * (1.0 - gap));
      vec3 beam = uCloudLight * (side + forward) * lit * powder * sunVisible * mix(1.0, 0.31 + 0.69 * crown, dayTower * (1.0 - st));
      beam += uCloudLight * (1.0 - st) * dayTower * (0.008 + 0.48 * crown) * (0.86 + 0.23 * vein) * pow(lit, 0.72) * exp(-0.23 * density);
      float underside = (1.0 - smoothstep(0.008, 0.31, uSun.y)) * (1.0 - top);
      beam *= 1.0 + 0.38 * underside * (0.21 + 0.79 * pow(sat(mu), 12.0));
      float lowSun = (1.0 - smoothstep(0.062, 0.36, uSun.y)) * (1.0 - st);
      float litSkin = exp(-0.60 * density) * (0.25 + 0.75 * vein);
      beam *= 1.0 - 0.48 * lowSun * (1.0 - litSkin);
      beam += uCloudLight * vec3(1.10, 0.82, 0.52) * (1.0 - st) * exp(-angle * 41.0)
        * (0.10 + 0.31 * uDawn + 0.19 * uGolden) * litSkin * (0.32 * lit + 0.68 * exp(-0.40 * shade));
      if (sunBreak > 0.001 || uGolden > 0.001) {
        // A broad penumbra and illuminated thin cloud faces, not a highlight
        // at a fixed contour of the opening. Dense faces stay cool and dark.
        float skin = exp(-0.38 * density) * (0.38 + 0.62 * vein);
        float softLit = 0.25 * lit + 0.75 * exp(-0.36 * shade);
        vec3 gold = uCloudLight * vec3(1.10, 0.80, 0.53);
        float facingRim = (0.44 + 0.56 * smoothstep(0.19, 0.66, relief.x));
        float rim = smoothstep(0.25, 0.57, gap) * (1.0 - smoothstep(0.66, 0.92, gap));
        rim *= (0.22 + 1.40 * vein * vein) * (1.0 - exp(-1.75 * density)) * exp(-0.53 * density) * facingRim;
        beam += gold * (0.79 * sunBreak * exp(-angle * 19.0) * rim * softLit + skin * softLit * (0.31 * goldenAir * (0.56 + 0.44 * underside)));
        beam += uCloudLight * vec3(0.82, 0.16, 0.25) * (0.74 * roseLight * skin * (0.37 + 0.63 * softLit));
        dome *= mix(vec3(1.0), vec3(0.76, 0.93, 1.15), uGolden * (1.0 - 0.58 * goldenAir));
      }
      vec3 cloud = dome * powder + bounce + beam;
      float cream = smoothstep(0.026, 0.24, dot(beam, LUMA)) * (1.0 - 0.51 * smoothstep(0.015, 0.095, angle));
      float bright = mix(dot(cloud, LUMA), dot(clear, LUMA) * 0.86, (0.28 + 0.13 * coolSide) * (1.0 - 0.66 * cream));
      vec3 cooled = bright * mix(vec3(0.73, 1.04, 1.30), vec3(1.11, 1.04, 0.87), cream) * (1.43 + 0.28 * cream);
      cloud = mix(cloud, cooled, uCoolDay * (0.73 + 0.27 * smoothstep(0.010, 0.079, angle)));
      cloud *= mix(vec3(1.0), vec3(0.73, 0.61, 0.91), uLate * (1.0 - uFinale));
      if (uLate > 0.001) {
        vec3 embers = vec3(0.37, 0.035, 0.095) * smoothstep(-6.2, -0.2, uElevation);
        cloud += embers * uLate * (1.0 - uFinale) * exp(-angle * 10.0) * exp(-0.38 * shade) * litSkin * (0.46 + 0.72 * underside);
      }
      if (strike) {
        // Two buried segments light different faces. Both are behind the
        // first layer and neither is drawn directly.
        vec3 delta = p - source;
        vec3 local = vec3(dot(delta, strikeSide), dot(delta, strikeUp), dot(delta, uFlash));
        local.xy *= mix(vec2(1.0), vec2(0.55, 0.76), lateStrike);
        float x = 0.83 * local.x + 0.55 * local.y;
        float y = -0.55 * local.x + 0.83 * local.y;
        float veinY = y + 0.16 * x * x - 0.31;
        float mainLight = 0.72 * x * x + 4.35 * veinY * veinY + 0.23 * local.z * local.z;
        vec3 branch = vec3((x - 0.82) * 1.07, (y + 0.67) * 1.9, (local.z + 0.16) * 0.49);
        float spread = exp(-0.94 * mainLight) + 0.64 * exp(-dot(branch, branch));
        if (spread > 0.003) {
          vec3 mid = p - delta * 0.28;
          vec4 blocker = weatherField(mid, heightAt(mid));
          float fold = smoothstep(0.41, 0.65, 0.47 * blocker.r + 0.31 * blocker.g + 0.22 * blocker.b);
          float transport = exp(-(0.36 + 1.65 * fold) * min(length(delta) * 0.46, 1.9));
          float face = (0.18 + 3.01 * froth * (0.34 + 0.66 * froth)) * exp(-0.40 * density);
          float spill = mix(0.08, 0.15, lateStrike) * exp(-mainLight * 0.45);
          cloud += uEffects.z * envelope * smoothstep(0.003, 0.035, spread)
            * (vec3(0.29, 0.64, 0.91) * spill + vec3(0.69, 0.91, 1.08) * spread * transport * face * mix(4.3, 5.2, lateStrike));
        }
      }
      float haze = 1.0 - exp(-at * acrossAir);
      vec3 lost = mix(clear * (0.66 + 0.21 * forward), slateHaze * (0.35 + 0.50 * broad) + gradedGap * patchHaze * 0.22, st);
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
  // Look into clean blue air through a torn aperture, not into a cream
  // stencil. The local hot centre is added below, behind the same volume.
  vec3 coolWindow = clear * vec3(0.38, 0.69, 1.09);
  sky = mix(sky, coolWindow, sunBreak * exp(-angle * 47.0) * 0.89);
  // Very spare cloud at the start. The macro lens then has no broad cloudy
  // patch to smear into a plate, but the thin horizon haze is still there.
  vec3 result = mix(radiation + through * sky, clear, uOpening * (0.83 + 0.14 * smoothstep(0.035, 0.15, d.y)));
  result += gradedGap * patchHaze * st * (0.23 + 0.66 * through);
  if (uEffects.y > 0.01 && d.y < 0.29 && d.y > -0.009) {
    float tilt = d.y * 0.25;
    vec2 slant = around + tilt * vec2(around.y, -around.x);
    vec3 adv = vec3(slant.x * 1.21 - 0.027 * uTravel.x, 0.247 + 0.009 * uRealSky, 0.071 * uEvolve + slant.y * 0.85);
    vec4 veil = f(adv);
    float band = smoothstep(0.31, 0.72, 0.63 * veil.r + 0.37 * veil.g);
    vec4 strands = f(vec3(slant.x * 2.63 + d.y * (veil.b - 0.5) * 0.085, 0.181 + d.y * 0.11, 0.71 + uRealSky * 0.012 + slant.y * 1.4));
    float streaks = 0.68 * strands.g + 0.32 * strands.b;
    band *= 0.24 + 1.02 * smoothstep(0.26, 0.76, streaks);
    float lengthOfRain = 0.051 + 0.16 * veil.g * veil.g + 0.065 * streaks;
    float ceiling = 1.0 - smoothstep(lengthOfRain - 0.023, lengthOfRain + 0.048, d.y);
    float trailing = 0.35 + 0.65 * smoothstep(0.014 + 0.040 * strands.g, 0.073 + 0.045 * strands.b, d.y);
    float rain = band * ceiling * trailing * uEffects.y * (0.60 + 0.34 * opening) * smoothstep(-0.014, 0.018, d.y);
    vec3 curtain = uDeck * (0.43 + 1.15 * veil.g);
    result = mix(result, curtain, rain);
  }
  // Foreground cloud opacity attenuates the lit air behind the bank as
  // well as the cloud's own light. Preserve the separate lightning spill.
  float bankMask = st * (1.0 - 0.90 * sunBreak) * (1.0 - 0.82 * uEffects.z);
  result *= 1.0 - bankMask * ((0.25 + 0.12 * (1.0 - riftLight)) * lowBank + 0.16 * clamp(stacked, 0.0, 1.0));
  float openPaths = 0.0;
  if (uTearAttack > 0.0 && angle < 0.045 && span > 0.0) {
    // Resolve partially open paths in parallel with the obscured volume.
    // Both banks must open along this ray to show the hot core behind them.
    vec3 low = d * (start + 0.26 * span);
    vec3 high = d * (start + 0.59 * span);
    vec4 a = weatherField(low, heightAt(low));
    vec4 b = weatherField(high, heightAt(high));
    float scale = 0.77 + 0.23 * sunBreak;
    float edge = riftAperture(low, d, 0.38 * a.g + 0.62 * a.b, scale)
      * riftAperture(high, d, 0.38 * b.g + 0.62 * b.b, scale);
    openPaths = uTearAttack * smoothstep(0.06, 0.88, edge);
    result = mix(result, coolWindow, openPaths);
    float rim = smoothstep(0.03, 0.42, edge) * (1.0 - smoothstep(0.44, 0.89, edge));
    rim *= (1.0 - through) * (0.33 + 0.67 * smoothstep(0.26, 0.76, 0.63 * a.g + 0.37 * b.b));
    result += uCloudLight * vec3(0.12, 0.082, 0.049) * uTearAttack * rim * exp(-angle * 29.0);
  }
  if (sunBreak > 0.0) {
    float nearSun = 0.048 * exp(-angle * 1880.0) + 0.19 * exp(-angle * 13300.0);
    float hotPaths = mix(sunBreak * through * through, 1.0, openPaths);
    result += uCloudLight * vec3(1.11, 0.84, 0.61) * nearSun * hotPaths;
  }
  // Forward scatter is wider than the photosphere and survives in torn
  // wisps around it, rather than painting a pale dot onto opaque cloud.
  float fairGlow = (1.0 - st) * (1.0 - uWeather.w) * smoothstep(0.6, 10.5, uElevation);
  fairGlow = max(fairGlow, (0.58 * uGolden + 0.52 * uDawn) * (1.0 - st));
  vec3 warmSun = mix(uCloudLight, vec3(uCloudLight.r, uCloudLight.r * 0.69, uCloudLight.r * 0.39), 0.47);
  result += warmSun * fairGlow * (0.064 * exp(-angle * 104.0) + 0.045 * exp(-angle * 1420.0)) * (0.19 + 0.81 * through) * (1.0 - uFirstBlue) * (1.0 - uFinale);
  float frost = smoothstep(0.07, 0.87, uWeather.w);
  if (frost > 0.0) {
    float high = smoothstep(-0.01, 0.30, d.y);
    float toward = exp(-angle * 31.0);
    vec3 quiet = uMist * mix(vec3(0.80, 0.82, 0.87), vec3(0.81, 0.91, 1.07), high);
    quiet = mix(quiet, uMist * vec3(1.45, 1.22, 0.97), toward * (1.0 - 0.51 * high));
    float hazeGlow = 0.036 * exp(-angle * 94.0) + 0.106 * exp(-angle * 970.0);
    result = mix(result, quiet, frost * 0.96) + uCloudLight.r * vec3(1.0, 0.61, 0.38) * hazeGlow * frost;
  }
  // Low light in the wet air is predominantly diffuse. It softens both
  // faces of the receding cloud but cannot open a hole in its opacity.
  if (uWetHaze > 0.0) {
    vec3 mist = uWetDome * (0.32 + 0.85 * exp(-16.0 * up)) * (0.96 + 0.04 * through);
    result = mix(result, mist, uWetHaze);
  }
  float transmission = clamp(mix(through * sheetTransmission, 1.0, uFirstBlue * 0.93), 0.0, 1.0);
  if (uLunarMeter > 0.5) {
    float wash = 1.0 - smoothstep(0.015, 0.093, dot(result, vec3(0.21, 0.72, 0.07)));
    outColor = vec4(transmission * wash, 0.0, 0.0, 1.0);
  } else {
    outColor = vec4(result, transmission);
  }
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
uniform float uLunarNight;
uniform float uFrostFog;
uniform float uRainFog;
uniform float uBreak;
uniform float uSolarDeck;
uniform float uEnding;
uniform float uPhotoMix;
uniform float uMarchFilter;
uniform vec3 uSunFace;
uniform vec3 uMoon;
uniform vec3 uDisc;
uniform vec3 uMoonDisc;
uniform float uLunarVisibility;
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

${nightGlsl}

vec3 sunAt(vec3 d, float blur) {
  float mu = dot(d, uSunFace);
  if (mu < 0.949) return vec3(0.0);
  const float sr = 0.00465;
  vec3 h = normalize(vec3(uSunFace.z, 0.0, -uSunFace.x) + vec3(1e-7));
  vec3 v = cross(uSunFace, h);
  vec2 xy = vec2(dot(d, h), dot(d, v));
  float squash = mix(0.65 - 0.15 * uEnding, 1.0, smoothstep(0.06, 3.8, uElevation));
  float frost = smoothstep(0.15, 0.92, uFrostFog);
  float fogBlur = frost * (0.0085 + 0.011 * frost);
  vec2 r = sqrt(vec2(sr * sr, sr * sr * squash * squash) + blur * blur + fogBlur * fogBlur);
  vec2 p = xy / r;
  float x = length(p);
  float spread = uPixelAngle * 0.52 / max(r.x, 1e-5) + 0.12 * frost + 0.029;
  float disk = 1.0 - smoothstep(0.98 - spread, 1.0 + spread, x);
  float limb = mix(0.62 + 0.38 * sqrt(max(0.0, 1.0 - x * x)), 0.89, smoothstep(0.002, 0.015, blur));
  float energy = squash * sr * sr / (r.x * r.y);
  float local = textureLod(tSky, where(d), 0.44).a;
  float center = textureLod(tSky, where(uSunFace), 0.5).a;
  float rupture = smoothstep(0.06, 0.85, uBreak);
  float broken = exp(-dot(p, p) * 0.34);
  float mist = exp(-0.89 * dot(p, p));
  // A held deck still diffuses the photosphere after the lens fan falls.
  float diffuse = max(rupture, 0.997 * uSolarDeck * smoothstep(0.07, 0.65, uBreak));
  float photo = disk * limb + 0.19 * exp(-dot(p, p) / 3.6);
  float glow = mix(mix(mix(disk * limb, 0.30 * mist, frost), photo, uPhotoMix), 0.003 * broken, diffuse);
  float visible = mix(center, local * smoothstep(0.12, 0.81, local) * smoothstep(0.17, 0.80, uBreak), uSolarDeck);
  return uDisc * visible * energy * glow * smoothstep(-0.003, 0.0011, d.y) * smoothstep(-1.35, -0.20, uElevation);
}

vec3 moonAt(vec3 d, vec3 air, float blur, float visible) {
  float n = dot(d, uMoon);
  if (uLunarNight < 0.001 || n < 0.968) return vec3(0.0);
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
  float local = visible * wash;
  float disc = uLunarVisibility < 0.0 ? local : uLunarVisibility;
  return uMoonDisc * (disc * phase * detail * edge * (0.0054 * 0.0054 / (r * r)) + local * glow);
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dv = normalize(vec3((ndc.x + uRay.z) * uRay.x, (ndc.y + uRay.w) * uRay.y, -1.0));
  vec3 d = normalize(mat3(uCamWorld) * dv);
  float coc = min(uCocScale / uFocusM, 2048.0);
  float blur = 0.5 * coc * uPixelAngle;
  vec4 sky = skyLookup(d, blur);
  float stellarBlur = min(blur, 0.52 * uPixelAngle);
  float cloudTransmission = textureLod(tSky, where(d), 0.0).a;
  float stellarTransmission = cloudTransmission * smoothstep(0.08, 0.78, cloudTransmission);
  vec3 color = sky.rgb + starsAt(d, sky.rgb, stellarTransmission, stellarBlur) + moonAt(d, sky.rgb, blur, sky.a) + sunAt(d, blur);
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
