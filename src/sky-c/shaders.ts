import { glslCommon } from '../core/shading.ts'
import { windWay } from '../v2/wind.ts'
import { BRIGHT_STAR_COUNT } from './stars.ts'

const ATMO_COMMON = /* glsl */ `
const float PI = 3.14159265359;
const float TAU = 6.28318530718;
const float INV_TAU = 0.15915494309;
const float R_BOTTOM = 6360.0;
const float R_TOP = 6460.0;
const float ATM_H = 100.0;
const float R_OBS = 6360.02;

const vec3 BETA_R = vec3(0.005802, 0.013558, 0.033100);
const float H_RAYLEIGH = 8.0;
const vec3 BETA_M_SCA = vec3(0.0082, 0.0082, 0.0082);
const vec3 BETA_M_EXT = vec3(0.0098, 0.0098, 0.0098);
const float H_MIE = 1.2;
const vec3 BETA_O3 = vec3(0.00145, 0.00410, 0.00017);
const vec3 SKY_SCALE = vec3(2.85, 2.88, 2.98);
const vec3 SUN_IRRAD = vec3(9.90, 9.82, 9.60);
const vec2 WIND_WAY = vec2(${windWay.x.toFixed(5)}, ${windWay.z.toFixed(5)});

vec2 transRMuToUv(float r, float mu) {
  float v = sqrt(clamp((r - R_BOTTOM) / ATM_H, 0.0, 1.0));
  float u = mu >= 0.0
    ? 0.35 + 0.65 * sqrt(clamp(mu, 0.0, 1.0))
    : 0.35 - 0.35 * sqrt(clamp(-mu / 0.25, 0.0, 1.0));
  return vec2(u, v);
}

vec3 sampleTransmittance(sampler2D tTrans, float r, float mu) {
  if (mu < -0.25) return vec3(0.0);
  return texture(tTrans, transRMuToUv(r, mu)).rgb;
}

vec3 sampleMultiScatter(sampler2D tMs, float r, float sunMu) {
  float u = clamp(0.5 + 0.5 * sunMu, 0.0, 1.0);
  float v = sqrt(clamp((r - R_BOTTOM) / ATM_H, 0.0, 1.0));
  return texture(tMs, vec2(u, v)).rgb;
}

float phaseRayleigh(float c) {
  return (3.0 / (16.0 * PI)) * (1.0 + c * c);
}

float phaseHG(float c, float g) {
  float g2 = g * g;
  float d = max(1e-4, 1.0 + g2 - 2.0 * g * c);
  return (1.0 - g2) / (4.0 * PI * d * sqrt(d));
}

float phaseCornette(float c, float g) {
  float g2 = g * g;
  float d = max(1e-4, 1.0 + g2 - 2.0 * g * c);
  return (3.0 / (8.0 * PI)) * ((1.0 - g2) * (1.0 + c * c)) / ((2.0 + g2) * d * sqrt(d));
}

vec2 dirToSkyViewUv(vec3 d) {
  float u = atan(d.x, d.z) * INV_TAU + 0.5;
  float v = d.y >= 0.0
    ? 0.5 + 0.5 * sqrt(clamp(d.y, 0.0, 1.0))
    : 0.5 - 0.5 * sqrt(clamp(-d.y / 0.35, 0.0, 1.0));
  return vec2(u, v);
}

vec3 skyViewUvToDir(vec2 uv) {
  float phi = (uv.x - 0.5) * TAU;
  float dy;
  if (uv.y >= 0.5) {
    float s = (uv.y - 0.5) * 2.0;
    dy = s * s;
  } else {
    float s = (0.5 - uv.y) * 2.0;
    dy = -0.35 * s * s;
  }
  float xz = sqrt(max(0.0, 1.0 - dy * dy));
  return vec3(sin(phi) * xz, dy, cos(phi) * xz);
}

float raySphereExit(float r, float mu, float rad) {
  float disc = r * r * (mu * mu - 1.0) + rad * rad;
  if (disc < 0.0) return -1.0;
  return -r * mu + sqrt(disc);
}

bool rayShellInterval(float r, float mu, float rInner, float rOuter, out float t0, out float t1) {
  float dOut = r * r * (mu * mu - 1.0) + rOuter * rOuter;
  if (dOut <= 0.0) { t0 = 0.0; t1 = 0.0; return false; }
  float sOut = sqrt(dOut);
  float tOutEnter = -r * mu - sOut;
  float tOutExit = -r * mu + sOut;
  if (tOutExit <= 0.0) { t0 = 0.0; t1 = 0.0; return false; }

  float dIn = r * r * (mu * mu - 1.0) + rInner * rInner;
  if (r < rInner) {
    t0 = max(0.0, -r * mu + sqrt(max(0.0, dIn)));
    t1 = tOutExit;
    return t1 > t0;
  }
  if (dIn > 0.0 && mu < 0.0) {
    t0 = max(0.0, tOutEnter);
    t1 = max(0.0, -r * mu - sqrt(dIn));
    return t1 > t0;
  }
  t0 = max(0.0, tOutEnter);
  t1 = tOutExit;
  return t1 > t0;
}
`

export const skyViewFragment = /* glsl */ `
${ATMO_COMMON}
uniform sampler2D tTrans;
uniform sampler2D tMs;
uniform vec3 uSun;
uniform vec3 uMoon;
uniform float uNight;
uniform float uFog;
uniform int uSkySteps;

in vec2 vUv;
layout(location = 0) out vec4 outColor;

void main() {
  vec3 d = skyViewUvToDir(vUv);
  float marchMu = max(d.y, -0.045);
  vec3 rd = normalize(vec3(d.x, marchMu, d.z));

  float maxD = raySphereExit(R_OBS, rd.y, R_TOP);
  if (rd.y < 0.0) {
    float gDisc = R_OBS * R_OBS * (rd.y * rd.y - 1.0) + R_BOTTOM * R_BOTTOM;
    if (gDisc > 0.0) {
      float gHit = -R_OBS * rd.y - sqrt(gDisc);
      if (gHit > 0.0) maxD = min(maxD, gHit);
    }
  }

  float sunElDeg = asin(clamp(uSun.y, -1.0, 1.0)) * (180.0 / PI);
  float twilightOzone = 1.0 + 1.55 * smoothstep(4.5, -5.0, sunElDeg);
  float lowAerosolMask = mix(1.0, smoothstep(0.14, 0.006, max(0.0, rd.y)), smoothstep(2.8, -2.2, sunElDeg));
  float upperTwilightDamp = mix(1.0, smoothstep(0.11, 0.008, max(0.0, rd.y)), smoothstep(1.4, -2.2, sunElDeg));

  int steps = max(12, uSkySteps);
  float invSteps = 1.0 / float(steps);
  vec3 trans = vec3(1.0);
  vec3 lum = vec3(0.0);

  float cosSun = dot(rd, uSun);
  float pr = phaseRayleigh(cosSun);
  float pm = mix(phaseCornette(cosSun, 0.79), phaseHG(cosSun, 0.62), 0.35 * uFog) * lowAerosolMask;
  float pmMist = 0.6 * phaseHG(cosSun, 0.76) + 0.4 * phaseHG(cosSun, 0.32);

  float cosMoon = dot(rd, uMoon);
  float prMoon = phaseRayleigh(cosMoon);
  float pmMoon = phaseCornette(cosMoon, 0.78);

  float prevT = 0.0;
  for (int s = 0; s < 40; s++) {
    if (s >= steps) break;
    float f1 = float(s + 1) * invSteps;
    float nextT = maxD * f1 * f1;
    float dt = nextT - prevT;
    float t = 0.5 * (prevT + nextT);
    prevT = nextT;

    vec3 p = vec3(0.0, R_OBS, 0.0) + rd * t;
    float rs = length(p);
    float h = max(0.0, rs - R_BOTTOM);

    float dr = exp(-h / H_RAYLEIGH);
    float dm = exp(-h / H_MIE) + 0.0014 * exp(-h / 3.6);
    float dMist = uFog * 6.5 * exp(-h / 0.32);
    float do3 = max(0.0, 1.0 - abs(h - 25.0) / 15.0) * twilightOzone;

    vec3 scaR = BETA_R * dr;
    vec3 scaM = BETA_M_SCA * dm;
    vec3 scaMist = vec3(0.085) * dMist;
    vec3 ext = scaR + BETA_M_EXT * dm + scaMist * 1.06 + BETA_O3 * do3;

    vec3 upDir = p / rs;
    float muSun = dot(upDir, uSun);
    vec3 tSun = sampleTransmittance(tTrans, rs, muSun);
    vec3 ms = sampleMultiScatter(tMs, rs, muSun);

    vec3 stepT = exp(-ext * dt);
    vec3 sint = (vec3(1.0) - stepT) / max(ext, vec3(1e-6));

    vec3 single = (scaR * pr + scaM * pm + scaMist * pmMist) * tSun * upperTwilightDamp;
    vec3 multi = (scaR + scaM * lowAerosolMask + scaMist * 0.85) * ms * mix(0.35, 1.0, upperTwilightDamp);
    vec3 scatter = (single + multi) * SKY_SCALE;

    if (uNight > 0.001) {
      float muMoon = dot(upDir, uMoon);
      vec3 tMoon = sampleTransmittance(tTrans, rs, muMoon);
      vec3 moonSca = (scaR * prMoon + (scaM + scaMist * 0.4) * pmMoon) * tMoon * vec3(0.036, 0.052, 0.088);
      scatter += moonSca * uNight;
    }

    lum += trans * scatter * sint;
    trans *= stepT;
  }

  float twiBlue = smoothstep(1.8, -3.2, sunElDeg) * smoothstep(-13.5, -5.2, sunElDeg);
  vec2 flatD = normalize(rd.xz + vec2(1e-6));
  vec2 flatS = normalize(uSun.xz + vec2(1e-6));
  float sunDot = dot(flatD, flatS);
  float azToward = clamp(sunDot * 0.5 + 0.5, 0.0, 1.0);

  if (twiBlue > 0.001) {
    vec3 cobaltDome = mix(vec3(0.032, 0.086, 0.218), vec3(0.014, 0.048, 0.168), pow(clamp(d.y, 0.0, 1.0), 0.36));
    cobaltDome *= mix(0.68, 1.15, azToward);
    lum += cobaltDome * twiBlue * mix(vec3(0.55), vec3(1.0), trans);

    float azGlow = pow(azToward, 4.4);
    float horWedge = exp(-max(0.0, d.y) * 30.0) * smoothstep(-0.035, 0.004, d.y);
    vec3 warmAfterglow = mix(vec3(0.082, 0.038, 0.024), vec3(0.48, 0.132, 0.032), smoothstep(-5.8, -0.8, sunElDeg));
    lum += warmAfterglow * twiBlue * azGlow * horWedge;
  }

  float beltW = smoothstep(4.5, -0.5, sunElDeg) * smoothstep(-7.5, -2.0, sunElDeg);
  if (beltW > 0.001) {
    float antiSun = pow(clamp(-sunDot * 0.5 + 0.5, 0.0, 1.0), 2.4);
    float shadowEdge = smoothstep(-3.0, 2.5, sunElDeg) * 0.02 + smoothstep(2.5, -5.0, sunElDeg) * 0.09;
    float beltBand = exp(-pow((d.y - shadowEdge - 0.035) / 0.045, 2.0));
    float earthShadow = 1.0 - 0.42 * beltW * antiSun * smoothstep(shadowEdge + 0.03, shadowEdge - 0.01, d.y);
    lum *= earthShadow;
    lum += vec3(0.052, 0.026, 0.044) * beltW * antiSun * beltBand;
  }

  float nightFloorW = smoothstep(-2.0, -12.0, sunElDeg);
  vec3 nightSky = mix(vec3(0.0032, 0.0056, 0.0120), vec3(0.0015, 0.0030, 0.0074), pow(clamp(d.y, 0.0, 1.0), 0.5));
  float nightHorGlow = smoothstep(-3.0, -9.5, sunElDeg);
  float nightBand = exp(-max(0.0, d.y) * 14.5) * smoothstep(-0.04, 0.004, d.y);
  vec3 travelGlow = mix(vec3(0.0042, 0.0062, 0.0118), vec3(0.0135, 0.0092, 0.0110), pow(azToward, 3.4)) * pow(azToward, 1.6);
  lum += (nightSky + travelGlow * nightHorGlow * nightBand) * nightFloorW * mix(vec3(0.70), vec3(1.0), trans);

  float belowFade = smoothstep(-0.18, 0.0, d.y);
  lum *= mix(0.72, 1.0, belowFade);

  outColor = vec4(max(lum, vec3(0.0)), 1.0);
}
`

export const cloudPrepareFragment = /* glsl */ `
precision highp sampler3D;
${ATMO_COMMON}

uniform sampler2D tTrans;
uniform sampler2D tSkyView;
uniform sampler3D tShape3D;
uniform sampler3D tDetail3D;
uniform sampler2D tWeather2D;
uniform sampler2D tCirrus2D;

uniform vec3 uPrepForward;
uniform vec3 uPrepRight;
uniform vec3 uPrepUp;
uniform vec2 uPrepTan;

uniform vec3 uSun;
uniform vec3 uMoon;
uniform vec3 uSkyZen;
uniform vec3 uSkyHor;
uniform vec3 uGroundBounceCol;

uniform vec2 uCloudShiftNow;
uniform vec2 uCloudShiftLater;
uniform float uCloudEvolveNow;
uniform float uCloudEvolveLater;

uniform float uCover;
uniform float uOvercast;
uniform float uSunThrough;
uniform float uFog;
uniform float uRain;
uniform float uFlash;
uniform vec3 uFlashDir;
uniform float uBurst;
uniform float uEvening;
uniform float uNight;

uniform int uMaxSteps;
uniform int uLightSteps;
uniform int uShutterTaps;
uniform int uShaftSteps;

in vec2 vUv;
layout(location = 0) out vec4 outColor;

float remap01(float v, float lo, float hi) {
  return clamp((v - lo) / max(1e-4, hi - lo), 0.0, 1.0);
}

float cloudHeightSignal(float hFrac, float heightMod, float overcast) {
  float top = mix(0.36 + 0.64 * heightMod, 0.98, overcast * 0.85);
  float baseRound = smoothstep(0.0, mix(0.13, 0.06, overcast), hFrac);
  float topRound = 1.0 - smoothstep(top * 0.58, top, hFrac);
  return baseRound * topRound;
}

float computeBreakMask(vec2 xz, float evolve, vec3 rayDir, vec4 weather, out float sunBlockBoost) {
  sunBlockBoost = 0.0;
  float cosToSun = dot(rayDir, uSun);
  if (cosToSun < 0.25) return 0.0;

  vec3 sRight = normalize(cross(vec3(0.0, 1.0, 0.0), uSun));
  vec3 sUp = cross(uSun, sRight);
  vec2 sunPlane = vec2(dot(rayDir, sRight), dot(rayDir, sUp));

  vec4 bn1 = texture(tShape3D, vec3(xz * 0.062, evolve * 0.025));
  vec4 bn2 = texture(tShape3D, vec3(xz * 0.16 + 0.37, evolve * 0.045));
  float clumpNoise = 0.42 * weather.r + 0.35 * bn1.r + 0.23 * bn2.g;
  float fineTear = (bn2.b - 0.5) * 0.14 + (bn1.a - 0.5) * 0.10;

  float sunAng = length(vec2(sunPlane.x * 0.86, sunPlane.y * 1.12));
  float warpedSunAng = sunAng + (clumpNoise - 0.5) * 0.12 + fineTear * 0.4;

  if (uSunThrough < 0.55 && uBurst < 0.1 && uCover > 0.06) {
    sunBlockBoost = (1.0 - smoothstep(0.04, 0.16, warpedSunAng)) * clamp((0.55 - uSunThrough) * 1.8, 0.0, 1.0);
  }

  float diag = (sunPlane.x + 0.06) * 0.72 + (sunPlane.y - 0.02) * 1.05;
  float crossAxis = (sunPlane.x + 0.06) * 0.55 - (sunPlane.y - 0.02) * 0.58;
  float swath = 1.0 - smoothstep(0.04, 0.30, abs(diag) + abs(crossAxis) * 0.52 + (bn1.g - 0.5) * 0.22);
  float raggedField = smoothstep(0.32, 0.76, (1.0 - clumpNoise) + fineTear * 1.3 + 0.30 * (1.0 - smoothstep(0.02, 0.18, sunAng)));
  float sunCoreRift = (1.0 - smoothstep(0.014, 0.088, sunAng + fineTear * 0.35)) * 0.86;

  float burstRift = clamp(max(raggedField * swath * 1.05, sunCoreRift), 0.0, 1.0) * uBurst;
  float throughRift = (1.0 - smoothstep(0.020, 0.11, warpedSunAng)) * smoothstep(0.45, 1.0, uSunThrough) * (1.0 - 0.85 * uOvercast + 0.85 * uBurst);
  return clamp(max(burstRift, throughRift * 0.82), 0.0, 1.0);
}

float evalCloudDensityAt(vec3 worldKm, float hBase, float hThickness, vec2 shiftKm, float evolve, vec3 rayDir, bool detailed, out float outBreak) {
  outBreak = 0.0;
  float r = length(worldKm + vec3(0.0, R_BOTTOM, 0.0));
  float h = r - R_BOTTOM;
  float rawHFrac = (h - hBase) / hThickness;
  if (rawHFrac <= -0.05 || rawHFrac >= 1.0) return 0.0;

  float stormW = smoothstep(0.12, 0.62, uOvercast);
  float eveFlat = uEvening * (1.0 - stormW);
  float cRaw = clamp(rawHFrac, 0.0, 1.0);
  vec2 shear = WIND_WAY * (cRaw * cRaw * mix(0.44, 0.75, eveFlat));
  vec2 rawXz = worldKm.xz - shiftKm + shear;
  vec2 windPerp = vec2(-WIND_WAY.y, WIND_WAY.x);
  float wAlong = dot(rawXz, WIND_WAY) * mix(1.0, 0.54, eveFlat);
  float wAcross = dot(rawXz, windPerp) * mix(1.0, 0.82, eveFlat);
  vec2 xz = WIND_WAY * wAlong + windPerp * wAcross;

  vec4 weather = texture(tWeather2D, xz * 0.038 + vec2(evolve * 0.005, -evolve * 0.004));
  float macroWave = texture(tWeather2D, rawXz * 0.019 - vec2(evolve * 0.003, evolve * 0.002)).g;
  float sunBlockBoost;
  float breakMask = computeBreakMask(rawXz, evolve, rayDir, weather, sunBlockBoost);
  outBreak = breakMask;

  float stormBaseLift = stormW * (0.34 * (1.0 - weather.b) + 0.24 * macroWave) * (1.0 - 0.65 * breakMask);
  float hFrac = (rawHFrac - stormBaseLift) / max(0.32, 1.0 - stormBaseLift);
  if (hFrac <= 0.0 || hFrac >= 1.0) return 0.0;

  float fairWeatherCov = clamp(weather.r + sunBlockBoost * 0.42, 0.0, 1.0);
  float stormSheetCov = mix(0.78, 0.99, 0.65 * weather.b + 0.35 * (1.0 - macroWave));
  float effStormCovW = stormW * 0.94 * (1.0 - 0.58 * breakMask);
  float localCov = mix(fairWeatherCov, stormSheetCov, effStormCovW);
  localCov *= (1.0 - 0.88 * breakMask);

  float covFade = smoothstep(0.01, 0.07, uCover);
  float coverageTarget = covFade * clamp(0.34 + pow(uCover, 0.74) * 0.66, 0.0, 1.0);
  float thresh = 1.0 - coverageTarget * 0.90;
  float basePresence = remap01(localCov, thresh, 1.0);
  if (basePresence <= 0.001) return 0.0;

  float hProf = cloudHeightSignal(hFrac, mix(weather.g, 0.22, eveFlat * 0.70), stormW * (1.0 - 0.55 * breakMask));
  if (hProf <= 0.001) return 0.0;

  vec3 shapeUvw = vec3(xz * 0.165, (h - hBase) * 0.20 + evolve * 0.05);
  vec4 shape = texture(tShape3D, shapeUvw);
  float shapeFbm = 0.58 * shape.g + 0.28 * shape.b + 0.14 * shape.a;
  float billow = remap01(shape.r * hProf, (1.0 - shapeFbm) * 0.46, 1.0);
  float dens = remap01(billow, 1.0 - basePresence, 1.0);

  if (stormW > 0.15 && hFrac < 0.48) {
    float scudMask = (1.0 - hFrac / 0.48) * stormW * (1.0 - 0.90 * breakMask);
    float scud = remap01((0.6 * weather.b + 0.4 * (1.0 - macroWave)) * (0.55 * shape.g + 0.45 * shape.b), 0.20, 0.76);
    dens = max(dens, scud * scudMask * 0.88);
  }

  if (dens <= 0.001) return 0.0;

  if (detailed) {
    vec3 detUvw = vec3(xz * 0.78 + vec2(evolve * 0.07, -evolve * 0.05), h * 0.76);
    vec4 det = texture(tDetail3D, detUvw);
    float detFbm = 0.625 * det.r + 0.25 * det.g + 0.125 * det.b;
    float cauliflower = mix(detFbm, 1.0 - detFbm, clamp(hFrac * 1.5, 0.0, 1.0));
    dens = remap01(dens, 0.28 * cauliflower * (1.0 - 0.42 * stormW), 1.0);
  }

  float sunThin = 1.0 - 0.82 * breakMask * smoothstep(0.990, 0.9992, dot(rayDir, uSun));
  float extScale = mix(6.8, 10.6, stormW) * (1.0 - 0.58 * uFog) * sunThin;
  return dens * extScale;
}

float sampleCloudDensity(vec3 worldKm, float hBase, float hThickness, vec3 rayDir, bool detailed, out float outBreak) {
  vec2 deltaShift = uCloudShiftLater - uCloudShiftNow;
  float deltaLen = length(deltaShift);
  if (uShutterTaps <= 1 || deltaLen < 0.003 || !detailed) {
    vec2 midShift = 0.5 * (uCloudShiftNow + uCloudShiftLater);
    float midEv = 0.5 * (uCloudEvolveNow + uCloudEvolveLater);
    return evalCloudDensityAt(worldKm, hBase, hThickness, midShift, midEv, rayDir, detailed, outBreak);
  }
  float sum = 0.0;
  float bSum = 0.0;
  float inv = 1.0 / float(uShutterTaps);
  for (int k = 0; k < 4; k++) {
    if (k >= uShutterTaps) break;
    float fk = (float(k) + 0.5) * inv;
    vec2 sh = mix(uCloudShiftNow, uCloudShiftLater, fk);
    float ev = mix(uCloudEvolveNow, uCloudEvolveLater, fk);
    float bk;
    sum += evalCloudDensityAt(worldKm, hBase, hThickness, sh, ev, rayDir, true, bk);
    bSum += bk;
  }
  outBreak = bSum * inv;
  return sum * inv;
}

void main() {
  vec2 s = vUv * 2.0 - 1.0;
  vec3 d = normalize(uPrepForward + s.x * uPrepTan.x * uPrepRight + s.y * uPrepTan.y * uPrepUp);

  vec3 clearSky = texture(tSkyView, dirToSkyViewUv(d)).rgb;

  if (d.y < -0.04) {
    outColor = vec4(clearSky, 1.0);
    return;
  }

  float marchDy = max(d.y, 0.006);
  vec3 rd = normalize(vec3(d.x, marchDy, d.z));

  float stormW = smoothstep(0.12, 0.62, uOvercast);
  float eveFlat = uEvening * (1.0 - stormW);
  float hBase = mix(mix(1.26, 1.38, eveFlat), 0.92, stormW);
  float hTop = mix(mix(3.25, 2.08, eveFlat), 5.40, stormW);
  float hThickness = hTop - hBase;

  float sunElDeg = asin(clamp(uSun.y, -1.0, 1.0)) * (180.0 / PI);
  float dayLum = smoothstep(-4.5, 8.0, sunElDeg);

  vec3 cloudInscatter = vec3(0.0);
  float cloudTrans = 1.0;
  vec2 midShift = 0.5 * (uCloudShiftNow + uCloudShiftLater);

  float cirrusWeight = clamp(0.05 * smoothstep(0.04, 0.3, uCover) * (1.0 - uOvercast) + 0.24 * uEvening, 0.0, 0.50) * (1.0 - 0.85 * uFog);
  float cirrusT0, cirrusT1;
  vec3 cirrusLum = vec3(0.0);
  float cirrusTrans = 1.0;
  if (cirrusWeight > 0.01 && rayShellInterval(R_OBS, rd.y, R_BOTTOM + 8.6, R_BOTTOM + 9.0, cirrusT0, cirrusT1)) {
    float tc = 0.5 * (cirrusT0 + cirrusT1);
    vec3 pc = rd * tc;
    vec2 cuv = vec2(pc.x * 0.009, pc.z * 0.020) - midShift * 0.0025;
    vec4 cir = texture(tCirrus2D, cuv);
    float cDens = cir.r * smoothstep(0.36, 0.86, cir.b) * cirrusWeight * smoothstep(0.015, 0.14, rd.y);
    if (cDens > 0.002) {
      float pathLen = min(2.0, cirrusT1 - cirrusT0);
      float tauC = cDens * 0.18 * pathLen;
      cirrusTrans = exp(-tauC);

      vec3 pSph = vec3(0.0, R_OBS, 0.0) + pc;
      float rCir = length(pSph);
      float muSunCir = dot(pSph / rCir, uSun);
      vec3 sunAtCir = SUN_IRRAD * sampleTransmittance(tTrans, rCir, muSunCir);

      float cosSun = dot(rd, uSun);
      float hgCir = 0.65 * phaseHG(cosSun, 0.72) + 0.35 * phaseHG(cosSun, -0.22);
      vec3 ambCir = mix(uSkyHor, uSkyZen, 0.60) * 0.22;
      vec3 cScatter = (sunAtCir * hgCir * 1.55 + ambCir) * (1.0 - cirrusTrans);

      float distFade = exp(-tc * 0.014);
      cirrusLum = mix(clearSky * (1.0 - cirrusTrans), cScatter, distFade);
    }
  }

  float t0, t1;
  bool hitShell = (uCover > 0.01 || uOvercast > 0.01) && rayShellInterval(R_OBS, rd.y, R_BOTTOM + hBase * 0.92, R_BOTTOM + hTop, t0, t1);
  if (hitShell && t0 < 120.0) {
    float maxSpanKm = mix(13.5, 9.6, stormW);
    t1 = min(t1, t0 + maxSpanKm);
    if (t1 > t0) {
      int steps = uMaxSteps;
      uvec2 pix = uvec2(gl_FragCoord.xy);
      float ign = fract(52.9829189 * fract(0.06711056 * float(pix.x) + 0.00583715 * float(pix.y)));

      float cosSun = dot(rd, uSun);
      float hgRim = 0.76 * phaseHG(cosSun, 0.85) + 0.24 * phaseHG(cosSun, 0.46);
      float towerPhase = 0.36 * phaseHG(cosSun, 0.24) + 0.64 * phaseHG(cosSun, -0.28);

      float cosMoon = dot(rd, uMoon);
      float phaseMoon = 0.58 * phaseHG(cosMoon, 0.72) + 0.42 / (4.0 * PI);

      float twilightCloudDark = mix(0.11, 1.0, smoothstep(-2.2, 4.2, sunElDeg));
      vec3 flashCenter = uFlashDir * 5.2;

      for (int i = 0; i < 80; i++) {
        if (i >= steps || cloudTrans < 0.005) break;
        float u0 = float(i) / float(steps);
        float u1 = float(i + 1) / float(steps);
        float s0 = pow(u0, 1.36);
        float s1 = pow(u1, 1.36);
        float sMid = mix(s0, s1, 0.26 + 0.48 * ign);
        float t = mix(t0, t1, sMid);
        float dt = (t1 - t0) * (s1 - s0);

        vec3 worldKm = rd * t;
        float localBreak;
        float sigmaE = sampleCloudDensity(worldKm, hBase, hThickness, d, true, localBreak);

        float distClear = stormW * smoothstep(10.5, 25.0, t) * (1.0 - 0.55 * uBurst);
        sigmaE *= (1.0 - 0.72 * distClear);

        if (sigmaE > 0.002) {
          vec3 pSph = vec3(0.0, R_OBS, 0.0) + worldKm;
          float rSample = length(pSph);
          float hFrac = clamp((rSample - R_BOTTOM - hBase) / hThickness, 0.0, 1.0);
          float tauView = -log(max(cloudTrans, 1e-4));

          float tauSun = 0.0;
          float sunStepKm = mix(0.16, 0.34, stormW);
          float lt = 0.07;
          for (int ls = 0; ls < 6; ls++) {
            if (ls >= uLightSteps) break;
            float ds = sunStepKm * (1.0 + 0.36 * float(ls));
            vec3 lp = worldKm + uSun * (lt + 0.5 * ds);
            lt += ds;
            float dummyB;
            tauSun += sampleCloudDensity(lp, hBase, hThickness, normalize(d + uSun * 0.15), false, dummyB) * ds * 1.75;
          }

          float anvilOpticalDepth = stormW * pow(1.0 - hFrac, 0.95) * 18.0 * (1.0 - 0.95 * localBreak);
          tauSun += anvilOpticalDepth;

          float muSunP = dot(pSph / rSample, uSun);
          vec3 sunIrrad = SUN_IRRAD * sampleTransmittance(tTrans, rSample, muSunP);

          float thinEdge = exp(-tauSun * 0.85) * exp(-tauView * 1.15);
          vec3 rimTint = mix(vec3(1.04, 1.02, 1.00), vec3(1.55, 0.90, 0.50), smoothstep(0.28, 0.02, uSun.y));
          vec3 rimSca = sunIrrad * rimTint * thinEdge * hgRim * 1.85;

          float powder = 1.0 - 0.48 * exp(-sigmaE * 1.2) * (1.0 - 0.85 * clamp(cosSun, 0.0, 1.0));
          float towerLit = exp(-tauSun * 1.05) * (0.06 + 0.94 * smoothstep(0.32, 0.84, hFrac)) + 0.05 * exp(-tauSun * 0.45) * smoothstep(0.55, 0.95, hFrac);
          vec3 towerSca = sunIrrad * towerLit * towerPhase * powder * 2.25 * (1.0 - 0.90 * stormW * (1.0 - localBreak));

          vec3 directSca = rimSca + towerSca;

          if (uBurst > 0.01 && (localBreak > 0.01 || cosSun > 0.65)) {
            vec3 goldToPink = mix(vec3(1.85, 1.16, 0.48), vec3(1.48, 0.64, 0.68), smoothstep(0.25, 2.2, tauSun + tauView * 0.55));
            float tornLip = exp(-tauView * 0.78) * exp(-tauSun * 0.38) * (0.28 + 0.72 * localBreak) * uBurst * smoothstep(0.48, 0.996, cosSun);
            directSca += sunIrrad * goldToPink * tornLip * 1.18;
          }

          vec2 cloudCoord = worldKm.xz - midShift;
          vec4 foldTex = texture(tShape3D, vec3(cloudCoord * 0.085, hFrac * 0.48));
          vec4 foldTex2 = texture(tShape3D, vec3(cloudCoord * 0.21 + 0.31, hFrac * 0.80));
          float fairFold = 0.58 + 0.42 * foldTex.g;

          float selfShade = mix(0.04, 1.0, exp(-tauSun * 0.92));
          float vertAmb = smoothstep(0.30, 0.88, hFrac) * selfShade;
          vec3 shadowBellyCol = (uGroundBounceCol * 0.55 + (uSkyZen * 0.22 + uSkyHor * 0.035) * vec3(0.68, 0.86, 1.18)) * fairFold * mix(0.32, 1.0, smoothstep(-2.5, 4.0, sunElDeg));
          vec3 litTopAmb = (uSkyZen * 0.58 + uSkyHor * 0.18) * twilightCloudDark;
          vec3 fairAmb = mix(shadowBellyCol, litTopAmb, vertAmb);

          float rollMacro = 0.60 * foldTex.g + 0.40 * foldTex2.b;
          float vaultFactor = clamp(rollMacro, 0.0, 1.0) * mix(0.35, 1.0, exp(-sigmaE * 0.15));
          float billowDark = mix(0.035, 0.88, pow(vaultFactor, 1.48)) * (0.30 + 0.70 * hFrac);
          vec3 coolSlateRef = mix(uSkyZen, uSkyHor, 0.22) * vec3(0.38, 0.68, 1.06) * 0.68;
          vec3 warmBreakTint = mix(vec3(0.86, 0.94, 1.04), vec3(1.18, 0.98, 0.86), uBurst * smoothstep(0.38, 0.95, cosSun));
          vec3 stormAmb = coolSlateRef * warmBreakTint * billowDark;
          vec3 ambientSca = mix(fairAmb, stormAmb, stormW * (1.0 - 0.30 * localBreak));

          float lowSunBelly = smoothstep(0.22, 0.01, uSun.y) * smoothstep(-0.11, -0.025, uSun.y);
          vec3 lowSunSource = max(sunIrrad, vec3(2.05, 0.50, 0.36) * smoothstep(-0.085, 0.01, uSun.y));
          vec3 underTint = mix(vec3(1.22, 0.68, 0.40), vec3(2.10, 0.46, 0.42), smoothstep(0.05, -0.025, uSun.y));
          float sunSide = pow(clamp(cosSun * 0.5 + 0.5, 0.0, 1.0), 1.95);
          float bellyRimMask = (smoothstep(0.34, 0.0, hFrac) * exp(-tauView * 1.15) + 0.48 * exp(-tauView * 1.85)) * exp(-tauSun * 0.58);
          vec3 bellyWarm = lowSunSource * underTint * bellyRimMask * lowSunBelly * (0.20 + 0.80 * sunSide) * 0.85 * (1.0 - 0.88 * stormW);
          vec3 groundAmb = uGroundBounceCol * (1.0 - hFrac) * 0.32 * (1.0 - 0.85 * stormW);

          vec3 moonSca = vec3(0.0);
          if (uNight > 0.01) {
            float muMoonP = dot(pSph / rSample, uMoon);
            vec3 moonIrrad = vec3(0.006, 0.009, 0.015) * sampleTransmittance(tTrans, rSample, muMoonP) * uNight;
            moonSca = moonIrrad * (exp(-sigmaE * 0.75) * phaseMoon * 1.8 + 0.12 * hFrac);
          }

          vec3 flashEmit = vec3(0.0);
          if (uFlash > 0.001) {
            vec3 dp = (worldKm - flashCenter) * 1.65;
            vec4 fn = texture(tShape3D, vec3(cloudCoord * 0.26, hFrac * 0.7));
            vec4 fn2 = texture(tDetail3D, vec3(cloudCoord * 0.58, hFrac * 1.4));
            vec3 boltWarp = (fn.rgb - 0.5) * 1.25 + (fn2.rgb - 0.5) * 0.52;
            vec3 warpedDp = dp + boltWarp;
            warpedDp.y *= 0.62;
            float dBolt = length(warpedDp);
            float baseSoft = smoothstep(0.0, 0.14, hFrac);
            float hotChannel = exp(-dBolt * 2.25) * baseSoft;
            float vaultGlow = 0.28 * exp(-dBolt * 1.05) * mix(0.4, 1.0, baseSoft);
            float fgScudShadow = mix(0.08, 1.0, exp(-tauView * 0.55) * exp(-sigmaE * 0.22));
            flashEmit = (vec3(1.18, 1.46, 2.04) * hotChannel + vec3(0.46, 0.76, 1.38) * vaultGlow) * uFlash * fgScudShadow * 6.4;
          }

          vec3 totalSca = directSca + ambientSca + bellyWarm + groundAmb + moonSca + flashEmit;

          float airRate = mix(0.015, 0.008, stormW) + 0.16 * uFog;
          float airFade = exp(-t * airRate);
          vec3 horizonAir = mix(clearSky, mix(uSkyHor, uSkyZen, 0.22) * vec3(0.62, 0.82, 1.06) * 0.72, stormW);
          vec3 stepScatter = mix(horizonAir, totalSca, airFade);

          float stepT = exp(-sigmaE * dt);
          float sint = 1.0 - stepT;
          cloudInscatter += cloudTrans * stepScatter * sint;
          cloudTrans *= stepT;
        }
      }
    }
  }

  vec3 subCloudAdd = vec3(0.0);
  float subCloudTrans = 1.0;

  vec3 stormBrightGap = mix(
    mix(uSkyHor, uSkyZen, 0.14) * vec3(0.88, 1.00, 1.12) * 1.32,
    uSkyHor * vec3(1.06, 0.98, 0.92) * 1.05,
    uBurst * smoothstep(-0.2, 0.85, dot(d, uSun))
  );

  if (stormW > 0.18 && d.y < 0.125) {
    vec2 gCoord = (d.xz / max(0.12, length(d.xz))) * 3.2 - midShift * 0.04;
    float gapArch = 0.068 + 0.038 * texture(tWeather2D, gCoord * 0.16).g;
    float band = pow(clamp(1.0 - max(0.0, d.y) / gapArch, 0.0, 1.0), 1.55) * smoothstep(-0.02, 0.001, d.y) * stormW;
    float gapOpen = band * 0.84;
    cloudInscatter = mix(cloudInscatter, stormBrightGap * (1.0 - cloudTrans), gapOpen * 0.82);
    cloudTrans = mix(cloudTrans, max(cloudTrans, gapOpen * 0.70), gapOpen);
  }

  float rainActive = max(uRain, uBurst * 0.62);
  if (rainActive > 0.01 && d.y < 0.19) {
    float burstRightSide = mix(1.0, smoothstep(0.72, 0.12, dot(d, uSun)), uBurst);
    float rainDist = 4.6 / max(0.09, length(d.xz));
    vec2 rPos = d.xz * rainDist - midShift * 0.40;
    vec2 windPerp = vec2(-WIND_WAY.y, WIND_WAY.x);
    float alongCoords = dot(rPos, windPerp) - d.y * 2.1;
    float depthCoords = dot(rPos, WIND_WAY);
    vec2 rUv = vec2(alongCoords * 0.082, depthCoords * 0.045);
    float macroShaft = texture(tWeather2D, rUv).a;
    float fineShaft = texture(tCirrus2D, vec2(alongCoords * 0.30 - d.y * 0.65, d.y * 0.38)).r;
    float vertMask = smoothstep(0.17, 0.025, d.y) * smoothstep(-0.015, 0.001, d.y);
    float curtainPattern = pow(smoothstep(0.36, 0.84, macroShaft), 1.45) * (0.35 + 0.65 * fineShaft);
    float rDens = rainActive * burstRightSide * vertMask * curtainPattern * 1.25;
    float rTrans = exp(-rDens);
    vec3 darkRainCol = mix(uSkyZen, uSkyHor, 0.20) * vec3(0.32, 0.50, 0.72) * 0.32 + vec3(0.48, 0.72, 1.20) * uFlash * 0.14;
    subCloudAdd += darkRainCol * (1.0 - rTrans);
    subCloudTrans *= rTrans;
  }

  float rayStrength = clamp(uCover * (1.0 - 0.92 * stormW) * 0.24 * smoothstep(0.01, 0.06, uSun.y) * smoothstep(0.32, 0.08, uSun.y), 0.0, 0.32) * (1.0 - 0.8 * uFog);
  if (rayStrength > 0.015 && uSun.y > 0.01 && uShaftSteps > 0) {
    uvec2 spix = uvec2(gl_FragCoord.xy);
    float sIgn = fract(52.9829189 * fract(0.06711056 * float(spix.x) + 0.00583715 * float(spix.y)));
    float cosSun = dot(rd, uSun);
    float shaftCone = smoothstep(0.84, 0.996, cosSun);
    if (shaftCone > 0.005) {
      float litSum = 0.0;
      int sSteps = uShaftSteps;
      float maxShaftKm = min(6.5, (hBase * 1.05) / max(0.06, rd.y));
      float midEv = 0.5 * (uCloudEvolveNow + uCloudEvolveLater);
      for (int rs = 0; rs < 12; rs++) {
        if (rs >= sSteps) break;
        float st = maxShaftKm * ((float(rs) + 0.35 + 0.30 * sIgn) / float(sSteps));
        vec3 sp = rd * st;
        float tToCloud = max(0.0, (hBase + 0.24 * hThickness - sp.y) / max(0.04, uSun.y));
        vec3 cHit = sp + uSun * tToCloud;
        float bk;
        float cShadowDens = evalCloudDensityAt(cHit, hBase, hThickness, midShift, midEv, normalize(cHit), false, bk);
        litSum += exp(-cShadowDens * 0.90);
      }
      float shaftLit = litSum / float(sSteps);
      vec3 sunLow = SUN_IRRAD * sampleTransmittance(tTrans, R_OBS + 0.25, max(0.02, uSun.y));
      subCloudAdd += sunLow * shaftCone * shaftLit * rayStrength * 0.028;
    }
  }

  float horAir = smoothstep(0.001, 0.020, d.y);
  vec3 distHorizon = mix(clearSky, stormBrightGap, stormW);
  cloudInscatter = mix(distHorizon * (1.0 - cloudTrans), cloudInscatter, horAir);
  cloudTrans = mix(1.0, cloudTrans, smoothstep(-0.005, 0.005, d.y));

  vec3 stormSkyBg = mix(
    stormBrightGap,
    mix(uSkyZen, uSkyHor, 0.30) * vec3(0.42, 0.68, 0.98) * 0.48,
    smoothstep(0.015, 0.14, max(0.0, d.y))
  );
  vec3 skyBehind = mix(clearSky, stormSkyBg, stormW * (1.0 - 0.82 * uBurst * smoothstep(0.35, 0.92, dot(d, uSun))));
  vec3 bgAfterCirrus = skyBehind * cirrusTrans + cirrusLum;
  vec3 skyWithClouds = bgAfterCirrus * cloudTrans + cloudInscatter;
  vec3 finalRgb = skyWithClouds * subCloudTrans + subCloudAdd;
  float totalTrans = cirrusTrans * cloudTrans * subCloudTrans;

  outColor = vec4(max(finalRgb, vec3(0.0)), clamp(totalTrans, 0.0, 1.0));
}
`

export const mipDownFragment = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uSrcTexel;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

void main() {
  vec2 o = uSrcTexel;
  vec4 c = texture(tSrc, vUv) * 0.25;
  c += texture(tSrc, vUv + vec2(-o.x, -o.y)) * 0.125;
  c += texture(tSrc, vUv + vec2( o.x, -o.y)) * 0.125;
  c += texture(tSrc, vUv + vec2(-o.x,  o.y)) * 0.125;
  c += texture(tSrc, vUv + vec2( o.x,  o.y)) * 0.125;
  c += texture(tSrc, vUv + vec2(-2.0 * o.x, 0.0)) * 0.0625;
  c += texture(tSrc, vUv + vec2( 2.0 * o.x, 0.0)) * 0.0625;
  c += texture(tSrc, vUv + vec2(0.0, -2.0 * o.y)) * 0.0625;
  c += texture(tSrc, vUv + vec2(0.0,  2.0 * o.y)) * 0.0625;
  outColor = c;
}
`

export const skyRenderFragment = /* glsl */ `${glslCommon}
${ATMO_COMMON}

uniform mat4 uCamWorld;
uniform vec4 uRay;
uniform float uPixelAngle;

uniform sampler2D tTrans;
uniform sampler2D tSkyView;
uniform sampler2D tMilkyWay;
uniform sampler2D tPrepared;
uniform sampler2D tMip0;
uniform sampler2D tMip1;
uniform sampler2D tMip2;
uniform sampler2D tMip3;
uniform sampler2D tMip4;

uniform vec3 uPrepForward;
uniform vec3 uPrepRight;
uniform vec3 uPrepUp;
uniform vec2 uPrepTan;
uniform float uPrepPixelAngle;

uniform vec3 uSun;
uniform vec3 uMoon;
uniform float uStarTurn;
uniform float uNightVis;
uniform float uMoonVis;
uniform float uSunVis;
uniform float uSunThrough;
uniform float uOvercast;
uniform float uBurst;
uniform float uFog;

uniform vec4 uStarPosFlux[${BRIGHT_STAR_COUNT}];
uniform vec3 uStarColors[${BRIGHT_STAR_COUNT}];

in vec2 vUv;
layout(location = 0) out vec4 outColor;

const float SUN_RADIUS = 0.0062;
const float MOON_RADIUS = 0.0064;

vec3 rotateAroundAxis(vec3 v, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

vec4 sampleMipChain(vec2 uv, float lod) {
  if (lod <= 0.0) return texture(tPrepared, uv);
  if (lod < 1.0) return mix(texture(tPrepared, uv), texture(tMip0, uv), lod);
  if (lod < 2.0) return mix(texture(tMip0, uv), texture(tMip1, uv), lod - 1.0);
  if (lod < 3.0) return mix(texture(tMip1, uv), texture(tMip2, uv), lod - 2.0);
  if (lod < 4.0) return mix(texture(tMip2, uv), texture(tMip3, uv), lod - 3.0);
  if (lod < 5.0) return mix(texture(tMip3, uv), texture(tMip4, uv), lod - 4.0);
  return texture(tMip4, uv);
}

vec3 hash33(uvec3 q) {
  q = q * uvec3(1597334673U, 3812015801U, 2798796415U);
  uint n = (q.x ^ q.y ^ q.z) * 1597334673U;
  uvec3 r = uvec3(n, n * 16807U + 13U, n * 48271U + 29U);
  r ^= r >> 15;
  r *= 0x846ca68bU;
  r ^= r >> 16;
  return vec3(r & uvec3(0xffffffU)) / float(0xffffffU);
}

vec3 evalProceduralFaintStars(vec3 celDir, float blurRad, float mwBoost) {
  float sharpFade = 1.0 - smoothstep(0.0015, 0.0065, blurRad);
  if (sharpFade <= 0.005) return vec3(0.0);

  float phi = atan(celDir.x, celDir.z) * INV_TAU + 0.5;
  float decUv = clamp(celDir.y * 0.5 + 0.5, 0.001, 0.999);
  vec2 gridSize = vec2(360.0, 180.0);
  vec2 gPos = vec2(phi, decUv) * gridSize;
  ivec2 cell = ivec2(floor(gPos));
  vec2 f = fract(gPos);

  vec3 h = hash33(uvec3(uint(cell.x + 512), uint(cell.y + 512), 17U));
  float prob = mix(0.26, 0.72, mwBoost);
  if (h.x > prob) return vec3(0.0);

  vec3 h2 = hash33(uvec3(uint(cell.x + 2048), uint(cell.y + 2048), 53U));
  vec2 center = vec2(0.24 + 0.52 * h2.x, 0.24 + 0.52 * h2.y);
  float cosLat = sqrt(max(0.06, 1.0 - celDir.y * celDir.y));
  vec2 diffRad = vec2((f.x - center.x) * (TAU / gridSize.x) * cosLat, (f.y - center.y) * (2.0 / gridSize.y));
  float ang = length(diffRad);

  float rDraw = clamp(max(0.0011, 1.25 * uPixelAngle + blurRad), 0.0011, 0.0028);
  if (ang > rDraw * 2.4) return vec3(0.0);

  float magCurve = pow(h.y, 3.2);
  float flux = (0.004 + 0.036 * magCurve) * sharpFade;
  float prof = exp(-2.6 * (ang * ang) / (rDraw * rDraw)) * smoothstep(rDraw * 2.4, rDraw * 1.1, ang);
  vec3 tint = mix(vec3(1.18, 0.94, 0.74), vec3(0.76, 0.92, 1.26), h.z);
  return tint * flux * prof;
}

vec3 evalMoonSurface(vec3 d, vec3 moonDir, float blurRad) {
  float cosM = dot(d, moonDir);
  float ang = acos(clamp(cosM, -1.0, 1.0));

  // Cool silvery-blue atmospheric lunar aureole
  float aureole = 0.048 * exp(-ang * 20.0) + 0.014 * exp(-ang * 5.2);
  vec3 glow = vec3(0.15, 0.22, 0.34) * aureole;

  float rEff = sqrt(MOON_RADIUS * MOON_RADIUS + blurRad * blurRad);
  if (ang > rEff * 1.35 + 2.0 * uPixelAngle) return glow;

  vec3 mRight = normalize(cross(vec3(0.0, 1.0, 0.0), moonDir));
  vec3 mUp = cross(moonDir, mRight);
  vec2 diskPt = vec2(dot(d, mRight), dot(d, mUp)) / max(rEff, 1e-5);
  float rad2 = dot(diskPt, diskPt);

  float detailSharp = mix(0.35, 1.0, MOON_RADIUS / rEff);
  float m1 = exp(-dot(diskPt - vec2(-0.24, 0.22), diskPt - vec2(-0.24, 0.22)) * 5.5);
  float m2 = exp(-dot(diskPt - vec2(0.18, 0.12), diskPt - vec2(0.18, 0.12)) * 7.0);
  float m3 = exp(-dot(diskPt - vec2(0.32, -0.08), diskPt - vec2(0.32, -0.08)) * 8.5);
  float m4 = exp(-dot(diskPt - vec2(-0.12, -0.26), diskPt - vec2(-0.12, -0.26)) * 6.0);
  float maria = clamp(0.45 * m1 + 0.38 * m2 + 0.30 * m3 + 0.28 * m4, 0.0, 0.58) * detailSharp;

  float muDisk = sqrt(max(0.0, 1.0 - min(1.0, rad2)));
  float limb = mix(1.0, 0.70 + 0.30 * pow(muDisk, 0.45), detailSharp);
  float phaseShade = mix(1.0, smoothstep(-0.65, 0.35, diskPt.x * 0.85 + muDisk * 0.55), 0.30 * detailSharp);

  float edgeSoft = max(uPixelAngle * 1.2, blurRad * 0.22 + MOON_RADIUS * 0.06);
  float discMask = 1.0 - smoothstep(rEff - edgeSoft, rEff + edgeSoft, ang);

  float energyScale = (MOON_RADIUS * MOON_RADIUS) / (rEff * rEff);
  vec3 moonAlbedo = mix(vec3(2.65, 2.68, 2.62), vec3(1.48, 1.54, 1.58), maria);
  vec3 disc = moonAlbedo * limb * phaseShade * discMask * energyScale;
  return glow + disc;
}

void main() {
  if (uDiag == 4) {
    outColor = vec4(vec3(0.03), -1.0);
    return;
  }

  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dv = normalize(vec3((ndc.x + uRay.z) * uRay.x, (ndc.y + uRay.w) * uRay.y, -1.0));
  vec3 d = normalize(mat3(uCamWorld) * dv);

  float coc = min(uCocScale / uFocusM, 2048.0);
  float blurRad = 0.5 * coc * uPixelAngle;

  float denom = dot(d, uPrepForward);
  vec3 color;
  float cloudT = 1.0;
  if (denom > 0.05) {
    vec2 plane = vec2(dot(d, uPrepRight), dot(d, uPrepUp)) / (denom * uPrepTan);
    vec2 pUv = plane * 0.5 + 0.5;
    float edgeGuard = smoothstep(0.99, 0.92, max(abs(plane.x), abs(plane.y)));
    if (edgeGuard > 0.001) {
      float blurPrepTexels = blurRad / max(1e-5, uPrepPixelAngle);
      float lod = clamp(log2(max(1.0, blurPrepTexels * 0.95)), 0.0, 5.0);
      vec4 prep = sampleMipChain(clamp(pUv, vec2(0.001), vec2(0.999)), lod);
      vec3 fallback = texture(tSkyView, dirToSkyViewUv(d)).rgb;
      color = mix(fallback, prep.rgb, edgeGuard);
      cloudT = mix(1.0, prep.a, edgeGuard);
    } else {
      color = texture(tSkyView, dirToSkyViewUv(d)).rgb;
    }
  } else {
    color = texture(tSkyView, dirToSkyViewUv(d)).rgb;
  }

  float horClip = smoothstep(-0.005, 0.008, d.y);
  vec3 viewAtmTrans = d.y > -0.05 ? sampleTransmittance(tTrans, R_OBS, max(d.y, 0.025)) : vec3(0.0);

  if (d.y > -0.01 && cloudT > 0.002) {
    const vec3 POLE = vec3(0.0, 0.70710678, 0.70710678);
    vec3 celDir = rotateAroundAxis(d, POLE, -uStarTurn);

    float skyLum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float skyVeil = exp(-skyLum * 185.0);

    vec3 nightAdd = vec3(0.0);
    if (skyVeil > 0.003) {
      float mwU = atan(celDir.x, celDir.z) * INV_TAU + 0.5;
      float mwV = asin(clamp(celDir.y, -1.0, 1.0)) / PI + 0.5;
      vec3 mwTex = texture(tMilkyWay, vec2(mwU, mwV)).rgb;

      float mwVeil = exp(-skyLum * 220.0);
      vec3 mwCol = mix(vec3(0.0038, 0.0056, 0.0098), vec3(0.0086, 0.0076, 0.0074), mwTex.g) * mwTex.r;
      nightAdd += mwCol * mwVeil;

      nightAdd += evalProceduralFaintStars(celDir, blurRad, mwTex.r) * mwVeil;

      float rRef = 0.0056;
      float rStar = max(sqrt(0.0014 * 0.0014 + blurRad * blurRad), 1.35 * uPixelAngle);
      float cosCutoff = cos(min(0.35, rStar * 1.45 + 2.0 * uPixelAngle));
      float areaScale = min((rRef * rRef) / (rStar * rStar), 0.16);
      float bokehBlend = clamp(blurRad / (blurRad + 0.0025), 0.0, 1.0);
      float moonKeepout = smoothstep(0.018, 0.055, acos(clamp(dot(d, uMoon), -1.0, 1.0)));

      for (int i = 0; i < ${BRIGHT_STAR_COUNT}; i++) {
        vec4 sp = uStarPosFlux[i];
        float cs = dot(celDir, sp.xyz);
        if (cs > cosCutoff) {
          float ang = acos(clamp(cs, -1.0, 1.0));
          float uNorm = ang / rStar;
          float airy = exp(-2.4 * uNorm * uNorm);
          float discEdge = max(0.12, (1.6 * uPixelAngle) / rStar);
          float bokehDisc = (1.0 - smoothstep(0.86 - discEdge * 0.5, 1.0 + discEdge, uNorm)) * (1.08 - 0.26 * uNorm * uNorm);
          float prof = mix(airy, bokehDisc, bokehBlend);
          nightAdd += uStarColors[i] * (sp.w * areaScale * prof * mix(1.0, moonKeepout, uMoonVis)) * skyVeil;
        }
      }
    }

    if (uMoonVis > 0.001) {
      nightAdd += evalMoonSurface(d, uMoon, blurRad) * uMoonVis;
    }

    vec3 nightTrans = mix(vec3(0.58, 0.66, 0.78), vec3(1.0), viewAtmTrans);
    color += nightAdd * nightTrans * cloudT * horClip;
  }

  if (uSunVis > 0.001 && d.y > -0.015) {
    float stormBlock = 1.0 - 0.99 * smoothstep(0.58, 0.92, uOvercast) * (1.0 - uBurst);
    float effCloudT = smoothstep(0.02, 0.62, cloudT) * stormBlock;

    float cosS = dot(d, uSun);
    if (cosS > 0.50 && (effCloudT > 0.001 || uFog > 0.05)) {
      float lowEl = clamp(uSun.y, 0.0, 0.25);
      float vertFlatten = mix(1.24, 1.0, smoothstep(0.0, 0.14, lowEl));

      vec3 sRight = normalize(cross(vec3(0.0, 1.0, 0.0), uSun));
      vec3 sUp = cross(uSun, sRight);
      vec2 off = vec2(dot(d, sRight), dot(d, sUp) * vertFlatten);
      float ang = length(off);
      float rEff = sqrt(SUN_RADIUS * SUN_RADIUS + blurRad * blurRad);

      float refractedMu = max(0.004, uSun.y + 0.006 * exp(-max(0.0, uSun.y) * 22.0));
      vec3 sunAtmT = sampleTransmittance(tTrans, R_OBS, refractedMu);
      float mistAtten = exp(-1.62 * uFog);

      float edgeW = max(uPixelAngle * 1.15, rEff * 0.09);
      float discMask = 1.0 - smoothstep(rEff - edgeW, rEff + edgeW, ang);
      if (discMask > 0.0005 && effCloudT > 0.001) {
        float uLimb = clamp(ang / rEff, 0.0, 1.0);
        float muLimb = sqrt(max(0.0, 1.0 - uLimb * uLimb));
        vec3 limbDark = vec3(
          0.42 + 0.58 * pow(muLimb, 0.42),
          0.30 + 0.70 * pow(muLimb, 0.58),
          0.18 + 0.82 * pow(muLimb, 0.78)
        );
        limbDark = mix(vec3(0.76), limbDark, SUN_RADIUS / rEff);
        float energyConserve = (SUN_RADIUS * SUN_RADIUS) / (rEff * rEff);
        vec3 sunRad = SUN_IRRAD * sunAtmT * 82.0 * limbDark * discMask * energyConserve * effCloudT * mistAtten * uSunVis * horClip;
        color += sunRad;
      }

      float realAng = acos(clamp(cosS, -1.0, 1.0));
      float coneFade = smoothstep(0.52, 0.88, cosS);
      float clearCorona = 0.24 * exp(-realAng * 48.0) * (1.0 - 0.65 * uFog) * coneFade;
      float mistHalo = uFog * (0.48 * exp(-realAng * 9.5) + 0.16 * exp(-realAng * 3.4)) * coneFade;
      vec3 coronaTint = SUN_IRRAD * sampleTransmittance(tTrans, R_OBS, max(0.015, uSun.y));
      color += coronaTint * (clearCorona * effCloudT + mistHalo * mix(0.35, 1.0, effCloudT)) * uSunVis * horClip;
    }
  }

  float aFog = uFogDensity * exp(-uFogFalloff * max(uCamPos.y, 0.0));
  float fogDepth = d.y > 1e-3 ? aFog / (uFogFalloff * d.y) : 1e6;
  float fog = 1.0 - exp(-fogDepth);
  color = mix(color, uFogColor + uFogSunTint * pow(saturate(dot(d, uSunDir)), 6.0), fog);

  float grey = dot(color, vec3(0.3, 0.6, 0.1));
  if (uDiag == 7) color = vec3(grey);
  if (uDiag == 5) color = vec3(1.0e4);
  if (uDiag == 6) color = vec3(grey) * 0.5;

  outColor = vec4(color, coc);
}
`
