import { glslCommon } from '../core/shading.ts'
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
const vec3 BETA_M_SCA = vec3(0.0165, 0.0165, 0.0165);
const vec3 BETA_M_EXT = vec3(0.0192, 0.0192, 0.0192);
const float H_MIE = 1.2;
const vec3 BETA_O3 = vec3(0.00088, 0.00254, 0.000115);
const vec3 SKY_SCALE = vec3(2.75, 2.78, 2.85);
const vec3 SUN_IRRAD = vec3(9.85, 9.80, 9.60);

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

  int steps = max(12, uSkySteps);
  float invSteps = 1.0 / float(steps);
  vec3 trans = vec3(1.0);
  vec3 lum = vec3(0.0);

  float cosSun = dot(rd, uSun);
  float pr = phaseRayleigh(cosSun);
  float pm = mix(phaseCornette(cosSun, 0.78), phaseHG(cosSun, 0.62), 0.35 * uFog);
  float pmMist = 0.6 * phaseHG(cosSun, 0.76) + 0.4 * phaseHG(cosSun, 0.32);

  float cosMoon = dot(rd, uMoon);
  float prMoon = phaseRayleigh(cosMoon);
  float pmMoon = phaseCornette(cosMoon, 0.76);

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
    float dm = exp(-h / H_MIE) + 0.018 * exp(-h / 5.5);
    float dMist = uFog * 6.5 * exp(-h / 0.32);
    float do3 = max(0.0, 1.0 - abs(h - 25.0) / 15.0);

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

    vec3 single = (scaR * pr + scaM * pm + scaMist * pmMist) * tSun;
    vec3 multi = (scaR + scaM + scaMist * 0.85) * ms;
    vec3 scatter = (single + multi) * SKY_SCALE;

    if (uNight > 0.001) {
      float muMoon = dot(upDir, uMoon);
      vec3 tMoon = sampleTransmittance(tTrans, rs, muMoon);
      vec3 moonSca = (scaR * prMoon + (scaM + scaMist * 0.4) * pmMoon) * tMoon * vec3(0.048, 0.055, 0.072);
      scatter += moonSca * uNight;
    }

    lum += trans * scatter * sint;
    trans *= stepT;
  }

  float nightFloorW = smoothstep(-1.5, -12.5, asin(clamp(uSun.y, -1.0, 1.0)) * (180.0 / PI));
  vec3 nightSky = mix(vec3(0.0038, 0.0063, 0.0108), vec3(0.0019, 0.0034, 0.0062), pow(clamp(d.y, 0.0, 1.0), 0.55));
  lum += nightSky * nightFloorW * trans;

  // Smooth ground-limb continuation when looking slightly below mathematical horizon
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

in vec2 vUv;
layout(location = 0) out vec4 outColor;

float remap01(float v, float lo, float hi) {
  return clamp((v - lo) / max(1e-4, hi - lo), 0.0, 1.0);
}

float cloudHeightSignal(float hFrac, float heightMod, float overcast) {
  float top = mix(0.32 + 0.68 * heightMod, 0.96, overcast * 0.8);
  float baseRound = smoothstep(0.0, mix(0.14, 0.07, overcast), hFrac);
  float topRound = 1.0 - smoothstep(top * 0.62, top, hFrac);
  return baseRound * topRound;
}

float evalCloudDensityAt(vec3 worldKm, float hBase, float hThickness, vec2 shiftKm, float evolve, vec3 rayDir, bool detailed) {
  float r = length(worldKm + vec3(0.0, R_BOTTOM, 0.0));
  float h = r - R_BOTTOM;
  float hFrac = (h - hBase) / hThickness;
  if (hFrac <= 0.0 || hFrac >= 1.0) return 0.0;

  // Wind shear tilts cumulus tops forward along drift track
  vec2 driftDir = vec2(0.66913, 0.74314);
  vec2 shear = driftDir * (hFrac * hFrac * 0.55);
  vec2 xz = worldKm.xz - shiftKm + shear;

  vec4 weather = texture(tWeather2D, xz * 0.022 + vec2(evolve * 0.004, -evolve * 0.003));
  float localCov = mix(weather.r, mix(0.76, 0.96, weather.b), uOvercast * 0.82);

  // Ragged cloud break around the sun during burst, plus sunThrough tunnel clearing
  float cosToSun = dot(rayDir, uSun);
  if (uBurst > 0.001 || (uCover > 0.2 && uSunThrough > 0.02)) {
    vec4 breakNoise = texture(tShape3D, vec3(xz * 0.11, evolve * 0.03));
    float warp = (breakNoise.r - 0.5) * 0.14 + (weather.b - 0.5) * 0.09;
    float ang = acos(clamp(cosToSun, -1.0, 1.0)) + warp;
    float burstHole = (1.0 - smoothstep(0.08, 0.30 + 0.12 * uBurst, ang)) * uBurst;
    float throughHole = (1.0 - smoothstep(0.015, 0.075, ang)) * uSunThrough * (1.0 - 0.55 * uOvercast + 0.55 * uBurst);
    localCov *= (1.0 - 0.92 * max(burstHole, throughHole * 0.72));
  }

  float coverageTarget = clamp(uCover * 1.18, 0.0, 1.0);
  float basePresence = remap01(localCov, 1.0 - coverageTarget * 0.92, 1.0);
  if (basePresence <= 0.001) return 0.0;

  float hProf = cloudHeightSignal(hFrac, weather.g, uOvercast);
  if (hProf <= 0.001) return 0.0;

  vec3 shapeUvw = vec3(xz * 0.135, (h - hBase) * 0.16 + evolve * 0.055);
  vec4 shape = texture(tShape3D, shapeUvw);
  float shapeFbm = 0.60 * shape.g + 0.28 * shape.b + 0.12 * shape.a;
  float baseCloud = remap01(shape.r * hProf, (1.0 - shapeFbm) * 0.48, 1.0);
  float dens = remap01(baseCloud, 1.0 - basePresence, 1.0);

  // Low dark storm scud pockets under heavy overcast
  if (uOvercast > 0.25 && hFrac < 0.32) {
    float scudMask = (1.0 - hFrac / 0.32) * uOvercast;
    float scud = remap01(weather.b * shape.g, 0.28, 0.82);
    dens = max(dens, scud * scudMask * 0.65);
  }

  if (dens <= 0.001) return 0.0;

  if (detailed) {
    vec3 detUvw = vec3(xz * 0.68 + vec2(evolve * 0.09, -evolve * 0.07), h * 0.72);
    vec4 det = texture(tDetail3D, detUvw);
    float detFbm = 0.625 * det.r + 0.25 * det.g + 0.125 * det.b;
    float erode = mix(detFbm, 1.0 - detFbm, clamp(hFrac * 1.8, 0.0, 1.0));
    dens = remap01(dens, 0.30 * erode * (1.0 - 0.45 * uOvercast), 1.0);
  }

  float extScale = mix(2.6, 4.2, uOvercast) * (1.0 - 0.55 * uFog);
  return dens * extScale;
}

float sampleCloudDensity(vec3 worldKm, float hBase, float hThickness, vec3 rayDir, bool detailed) {
  vec2 deltaShift = uCloudShiftLater - uCloudShiftNow;
  float deltaLen = length(deltaShift);
  if (uShutterTaps <= 1 || deltaLen < 0.003 || !detailed) {
    vec2 midShift = 0.5 * (uCloudShiftNow + uCloudShiftLater);
    float midEv = 0.5 * (uCloudEvolveNow + uCloudEvolveLater);
    return evalCloudDensityAt(worldKm, hBase, hThickness, midShift, midEv, rayDir, detailed);
  }
  float sum = 0.0;
  float inv = 1.0 / float(uShutterTaps);
  for (int k = 0; k < 4; k++) {
    if (k >= uShutterTaps) break;
    float fk = (float(k) + 0.5) * inv;
    vec2 sh = mix(uCloudShiftNow, uCloudShiftLater, fk);
    float ev = mix(uCloudEvolveNow, uCloudEvolveLater, fk);
    sum += evalCloudDensityAt(worldKm, hBase, hThickness, sh, ev, rayDir, true);
  }
  return sum * inv;
}

void main() {
  vec2 s = vUv * 2.0 - 1.0;
  vec3 d = normalize(uPrepForward + s.x * uPrepTan.x * uPrepRight + s.y * uPrepTan.y * uPrepUp);

  vec3 clearSky = texture(tSkyView, dirToSkyViewUv(d)).rgb;

  // Above-horizon check; rays aimed into ground still return clean horizon air + cloudT=1
  if (d.y < -0.04) {
    outColor = vec4(clearSky, 1.0);
    return;
  }

  float marchDy = max(d.y, 0.008);
  vec3 rd = normalize(vec3(d.x, marchDy, d.z));

  float hBase = mix(1.52, 1.02, uOvercast);
  float hTop = mix(3.25, 5.65, uOvercast);
  float hThickness = hTop - hBase;

  vec3 cloudInscatter = vec3(0.0);
  float cloudTrans = 1.0;

  // High altitude cirrus layer at 8.6 km (amplified in evening and fair transitions)
  float cirrusWeight = clamp(0.18 + 0.82 * uEvening + 0.22 * uCover * (1.0 - uOvercast), 0.0, 1.0) * (1.0 - 0.85 * uFog);
  float cirrusT0, cirrusT1;
  vec3 cirrusLum = vec3(0.0);
  float cirrusTrans = 1.0;
  if (cirrusWeight > 0.01 && rayShellInterval(R_OBS, rd.y, R_BOTTOM + 8.5, R_BOTTOM + 9.1, cirrusT0, cirrusT1)) {
    float tc = 0.5 * (cirrusT0 + cirrusT1);
    vec3 pc = rd * tc;
    vec2 midShift = 0.5 * (uCloudShiftNow + uCloudShiftLater);
    vec2 cuv = pc.xz * 0.016 - midShift * 0.005;
    vec4 cir = texture(tCirrus2D, cuv);
    float cDens = cir.r * (0.65 + 0.35 * cir.g) * cirrusWeight * smoothstep(0.01, 0.12, rd.y);
    if (cDens > 0.002) {
      float pathLen = min(3.8, (cirrusT1 - cirrusT0));
      float tauC = cDens * 0.55 * pathLen;
      cirrusTrans = exp(-tauC);

      vec3 pSph = vec3(0.0, R_OBS, 0.0) + pc;
      float rCir = length(pSph);
      float muSunCir = dot(pSph / rCir, uSun);
      vec3 sunAtCir = SUN_IRRAD * sampleTransmittance(tTrans, rCir, muSunCir);

      float cosSun = dot(rd, uSun);
      float hgCir = 0.68 * phaseHG(cosSun, 0.74) + 0.32 * phaseHG(cosSun, -0.25);
      vec3 ambCir = mix(uSkyHor, uSkyZen, 0.45) * 0.55;
      vec3 cScatter = (sunAtCir * hgCir * 2.1 + ambCir) * (1.0 - cirrusTrans);

      float distFade = exp(-tc * 0.012);
      cirrusLum = mix(clearSky * (1.0 - cirrusTrans), cScatter, distFade);
    }
  }

  // Main 3D volumetric cumulus and storm layer
  float t0, t1;
  bool hitShell = (uCover > 0.01 || uOvercast > 0.01) && rayShellInterval(R_OBS, rd.y, R_BOTTOM + hBase, R_BOTTOM + hTop, t0, t1);
  if (hitShell) {
    t1 = min(t1, 48.0);
    if (t1 > t0) {
      int steps = uMaxSteps;
      float dtBase = (t1 - t0) / float(steps);

      // Interleaved blue-like jitter only at tiny amplitude to avoid banding without visible stipple
      uvec2 pix = uvec2(gl_FragCoord.xy);
      float ign = fract(52.9829189 * fract(0.06711056 * float(pix.x) + 0.00583715 * float(pix.y)));

      float cosSun = dot(rd, uSun);
      float hgFront = phaseHG(cosSun, 0.78);
      float hgMid = phaseHG(cosSun, 0.38);
      float hgBack = phaseHG(cosSun, -0.28);
      float phase0 = 0.52 * hgFront + 0.33 * hgMid + 0.15 * hgBack;
      float phase1 = 0.45 * phaseHG(cosSun, 0.32) + 0.55 / (4.0 * PI);

      float cosMoon = dot(rd, uMoon);
      float phaseMoon = 0.6 * phaseHG(cosMoon, 0.70) + 0.4 / (4.0 * PI);

      // 3D intra-cloud lightning core position inside storm deck along uFlashDir
      float flashDistKm = 5.4;
      vec3 flashCenter = uFlashDir * flashDistKm;

      for (int i = 0; i < 72; i++) {
        if (i >= steps || cloudTrans < 0.008) break;
        float fi = (float(i) + 0.2 + 0.6 * ign) / float(steps);
        // Slightly denser steps near camera, stretched far away
        float t = mix(t0, t1, fi);
        float dt = dtBase;

        vec3 worldKm = rd * t;
        float sigmaE = sampleCloudDensity(worldKm, hBase, hTop - hBase, d, true);

        if (sigmaE > 0.002) {
          vec3 pSph = vec3(0.0, R_OBS, 0.0) + worldKm;
          float rSample = length(pSph);
          float hFrac = clamp((rSample - R_BOTTOM - hBase) / hThickness, 0.0, 1.0);

          // March toward sun for optical depth (direct + multi-scattering)
          float tauSun = 0.0;
          float sunStepKm = mix(0.20, 0.38, uOvercast);
          for (int ls = 0; ls < 6; ls++) {
            if (ls >= uLightSteps) break;
            float lt = (float(ls) + 0.6) * sunStepKm * (1.0 + 0.45 * float(ls));
            vec3 lp = worldKm + uSun * lt;
            tauSun += sampleCloudDensity(lp, hBase, hTop - hBase, d, false) * sunStepKm * (1.0 + 0.45 * float(ls));
          }

          // Directed sunThrough clears excessive shadow along the sun cone during breaks
          float sunAlign = smoothstep(0.92, 0.998, cosSun);
          tauSun *= mix(1.0, 0.28, sunAlign * uSunThrough * (0.35 + 0.65 * uBurst));

          float muSunP = dot(pSph / rSample, uSun);
          vec3 sunIrrad = SUN_IRRAD * sampleTransmittance(tTrans, rSample, muSunP);

          // Schneider powder + dual-octave multiple scattering approximation
          float powder = 1.0 - 0.58 * exp(-sigmaE * 1.6) * (1.0 - 0.7 * clamp(cosSun, 0.0, 1.0));
          float beers0 = exp(-tauSun);
          float beers1 = exp(-tauSun * 0.26) * 0.68;
          float beers2 = exp(-tauSun * 0.08) * 0.28;

          vec3 directSca = sunIrrad * (beers0 * phase0 * powder + beers1 * phase1 + beers2 * (0.25 / PI)) * 3.1;

          // Ambient sky dome + warm sunset underside & ground bounce
          float stormDark = mix(1.0, 0.26, uOvercast);
          vec3 topAmb = mix(uSkyZen, uSkyHor, 0.38) * (0.35 + 0.75 * hFrac) * stormDark;
          // Under heavy storm deck, thin vaults transmit cool pewter upper skylight while ridges stay dark charcoal
          float vaultTrans = exp(-sigmaE * 0.55) * (0.35 + 0.65 * hFrac);
          vec3 stormStructure = mix(uSkyHor, uSkyZen, 0.5) * uOvercast * vaultTrans * 0.42;

          // Low sun illuminates cloud bellies from below; ground bounce warms bases by day
          float lowSunBelly = smoothstep(0.28, -0.02, uSun.y) * smoothstep(-0.08, 0.02, uSun.y);
          vec3 bellyWarm = sunIrrad * (1.0 - hFrac) * exp(-tauSun * 0.32) * lowSunBelly * 0.42;
          vec3 groundAmb = uGroundBounceCol * (1.0 - hFrac) * 0.85;

          // Lunar cloud lighting at night
          vec3 moonSca = vec3(0.0);
          if (uNight > 0.01) {
            float muMoonP = dot(pSph / rSample, uMoon);
            vec3 moonIrrad = vec3(0.24, 0.26, 0.32) * sampleTransmittance(tTrans, rSample, muMoonP) * uNight;
            moonSca = moonIrrad * (exp(-sigmaE * 0.8) * phaseMoon * 2.4 + 0.14 * hFrac);
          }

          // Internal 3D lightning discharge inside the storm cloud
          vec3 flashEmit = vec3(0.0);
          if (uFlash > 0.001) {
            vec3 dp = worldKm - flashCenter;
            // Branching modulation from 3D cloud shape
            vec4 fn = texture(tShape3D, worldKm * 0.18);
            float dCore = length(dp + (fn.rgb - 0.5) * 1.35);
            float coreGlow = exp(-dCore * 0.62) + 0.28 * exp(-dCore * 0.18);
            float internalTrans = exp(-sigmaE * 0.42);
            flashEmit = vec3(0.68, 0.86, 1.42) * uFlash * coreGlow * internalTrans * 7.5;
          }

          vec3 totalSca = directSca + topAmb + stormStructure + bellyWarm + groundAmb + moonSca + flashEmit;

          // Aerial perspective between cloud sample at distance t and observer
          float airFade = exp(-t * (0.022 + 0.16 * uFog + 0.045 * uRain));
          vec3 stepScatter = mix(clearSky, totalSca, airFade);

          float stepT = exp(-sigmaE * dt);
          float sint = (1.0 - stepT);
          cloudInscatter += cloudTrans * stepScatter * sint;
          cloudTrans *= stepT;
        }
      }
    }
  }

  // Sub-cloud crepuscular shafts & distant rain curtains
  vec3 subCloudAdd = vec3(0.0);
  float subCloudTrans = 1.0;

  // Distant rain curtains (virga/rain shafts beneath storm base)
  if (uRain > 0.01 && d.y < 0.26) {
    vec2 midShift = 0.5 * (uCloudShiftNow + uCloudShiftLater);
    float rainDist = 4.2 / max(0.08, length(d.xz));
    vec2 rPos = d.xz * rainDist - midShift * 0.45;
    // Vertically sheared curtain streaks
    vec2 rUv = vec2(rPos.x * 0.055 + d.y * 0.18, rPos.y * 0.055);
    float curtain = texture(tWeather2D, rUv).a;
    float fineStreak = texture(tCirrus2D, vec2(rUv.x * 3.2, d.y * 0.8)).g;
    float vertMask = smoothstep(0.25, 0.04, d.y) * smoothstep(-0.02, 0.01, d.y);
    float rDens = uRain * vertMask * smoothstep(0.32, 0.85, curtain) * (0.65 + 0.35 * fineStreak) * 0.58;
    float rTrans = exp(-rDens);
    vec3 rainCol = mix(uSkyHor, uSkyZen, 0.35) * 0.82 + vec3(0.55, 0.72, 1.15) * uFlash * 0.25;
    subCloudAdd += rainCol * (1.0 - rTrans);
    subCloudTrans *= rTrans;
  }

  // Crepuscular god rays when sun shines through broken clouds or burst gap
  float rayStrength = clamp((uBurst * 1.15 + uCover * (1.0 - 0.65 * uOvercast) * 0.55) * smoothstep(0.0, 0.06, uSun.y), 0.0, 1.2) * (1.0 - 0.7 * uFog);
  if (rayStrength > 0.02 && uSun.y > 0.01) {
    float cosSun = dot(rd, uSun);
    float shaftPhase = phaseHG(cosSun, 0.76);
    if (shaftPhase > 0.08) {
      float litSum = 0.0;
      const int SHAFT_STEPS = 6;
      float maxShaftKm = min(7.0, hBase / max(0.06, rd.y));
      vec2 midShift = 0.5 * (uCloudShiftNow + uCloudShiftLater);
      float midEv = 0.5 * (uCloudEvolveNow + uCloudEvolveLater);
      for (int rs = 0; rs < SHAFT_STEPS; rs++) {
        float st = maxShaftKm * ((float(rs) + 0.5) / float(SHAFT_STEPS));
        vec3 sp = rd * st;
        float tToCloud = (hBase + 0.35 * hThickness - sp.y) / max(0.04, uSun.y);
        vec3 cHit = sp + uSun * tToCloud;
        float cShadowDens = evalCloudDensityAt(cHit, hBase, hThickness, midShift, midEv, normalize(cHit), false);
        litSum += exp(-cShadowDens * 0.85);
      }
      float shaftLit = litSum / float(SHAFT_STEPS);
      vec3 sunLow = SUN_IRRAD * sampleTransmittance(tTrans, R_OBS + 0.3, uSun.y);
      subCloudAdd += sunLow * shaftPhase * shaftLit * rayStrength * 0.075;
    }
  }

  // Smooth horizon softening so far clouds blend cleanly into distant air
  float horAir = smoothstep(0.004, 0.065, d.y);
  cloudInscatter = mix(clearSky * (1.0 - cloudTrans), cloudInscatter, horAir);
  cloudTrans = mix(1.0, cloudTrans, smoothstep(-0.002, 0.028, d.y));

  // Composite: high cirrus behind main cloud deck, then sub-cloud rain/shafts in front
  vec3 bgAfterCirrus = clearSky * cirrusTrans + cirrusLum;
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
uniform float uBurst;
uniform float uFog;

uniform vec4 uStarPosFlux[${BRIGHT_STAR_COUNT}];
uniform vec3 uStarColors[${BRIGHT_STAR_COUNT}];

in vec2 vUv;
layout(location = 0) out vec4 outColor;

const float SUN_RADIUS = 0.0052;
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

vec3 evalProceduralFaintStars(vec3 celDir, float rStar, float blurRad, float mwBoost) {
  float rRef = 0.00105;
  float rEff = sqrt(rRef * rRef + blurRad * blurRad);
  float areaDilute = (rRef * rRef) / (rEff * rEff);
  // When blurred heavily, faint stars merge smoothly into Milky Way glow
  if (areaDilute < 0.015) return vec3(0.0);

  vec3 scaled = celDir * 88.0;
  ivec3 cell = ivec3(floor(scaled));
  vec3 h = hash33(uvec3(cell + ivec3(1024)));
  float prob = mix(0.24, 0.58, mwBoost);
  if (h.x > prob) return vec3(0.0);

  vec3 starCenter = normalize(vec3(cell) + 0.18 + 0.64 * hash33(uvec3(cell + ivec3(4096))));
  float ang = acos(clamp(dot(celDir, starCenter), -1.0, 1.0));
  float rDraw = max(rEff, 1.35 * uPixelAngle);
  if (ang > rDraw * 2.4) return vec3(0.0);

  float magCurve = pow(h.y, 4.2);
  float flux = (0.04 + 0.95 * magCurve) * (rRef * rRef) / (rDraw * rDraw);
  float prof = exp(-2.2 * (ang * ang) / (rDraw * rDraw));
  vec3 tint = mix(vec3(1.22, 0.92, 0.68), vec3(0.78, 0.92, 1.25), h.z);
  return tint * flux * prof;
}

vec3 evalMoonSurface(vec3 d, vec3 moonDir, float blurRad) {
  float cosM = dot(d, moonDir);
  float ang = acos(clamp(cosM, -1.0, 1.0));

  // Soft atmospheric lunar aureole around the moon
  float aureole = 0.032 * exp(-ang * 24.0) + 0.0085 * exp(-ang * 6.5);
  vec3 glow = vec3(0.16, 0.21, 0.30) * aureole;

  float rEff = sqrt(MOON_RADIUS * MOON_RADIUS + blurRad * blurRad);
  if (ang > rEff * 1.35 + 2.0 * uPixelAngle) return glow;

  // Orthonormal frame on lunar disc for Mare surface pattern
  vec3 mRight = normalize(cross(vec3(0.0, 1.0, 0.0), moonDir));
  vec3 mUp = cross(moonDir, mRight);
  vec2 diskPt = vec2(dot(d, mRight), dot(d, mUp)) / max(rEff, 1e-5);
  float rad2 = dot(diskPt, diskPt);

  // Subtle lunar maria shading (softened naturally as blurRad grows)
  float detailSharp = MOON_RADIUS / rEff;
  float m1 = exp(-dot(diskPt - vec2(-0.24, 0.22), diskPt - vec2(-0.24, 0.22)) * 5.5);
  float m2 = exp(-dot(diskPt - vec2(0.18, 0.12), diskPt - vec2(0.18, 0.12)) * 7.0);
  float m3 = exp(-dot(diskPt - vec2(0.32, -0.08), diskPt - vec2(0.32, -0.08)) * 8.5);
  float m4 = exp(-dot(diskPt - vec2(-0.12, -0.26), diskPt - vec2(-0.12, -0.26)) * 6.0);
  float maria = clamp(0.42 * m1 + 0.35 * m2 + 0.28 * m3 + 0.25 * m4, 0.0, 0.55) * detailSharp;

  // Gibbous phase illumination + subtle limb softening
  float muDisk = sqrt(max(0.0, 1.0 - min(1.0, rad2)));
  float limb = mix(1.0, 0.72 + 0.28 * pow(muDisk, 0.45), detailSharp);
  float phaseShade = mix(1.0, smoothstep(-0.65, 0.35, diskPt.x * 0.85 + muDisk * 0.55), 0.32 * detailSharp);

  float edgeSoft = max(uPixelAngle * 1.2, blurRad * 0.28 + MOON_RADIUS * 0.06);
  float discMask = 1.0 - smoothstep(rEff - edgeSoft, rEff + edgeSoft, ang);

  float energyScale = (MOON_RADIUS * MOON_RADIUS) / (rEff * rEff);
  vec3 moonAlbedo = mix(vec3(2.85, 2.78, 2.58), vec3(1.65, 1.66, 1.62), maria);
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

  // Project sample ray onto prepared sky-cloud frustum
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

  float horClip = smoothstep(-0.005, 0.006, d.y);
  vec3 viewAtmTrans = d.y > -0.05 ? sampleTransmittance(tTrans, R_OBS, max(d.y, 0.005)) : vec3(0.0);

  // Stars, Milky Way, and Moon
  if ((uNightVis > 0.001 || uMoonVis > 0.001) && d.y > -0.01) {
    // Rotate celestial dome around 45N celestial pole: (0, sin45, cos45)
    const vec3 POLE = vec3(0.0, 0.70710678, 0.70710678);
    // Negative rotation moves stars East (+x) to West (-x) across the southern sky as starTurn advances
    vec3 celDir = rotateAroundAxis(d, POLE, -uStarTurn);

    vec3 nightAdd = vec3(0.0);
    if (uNightVis > 0.001) {
      float mwU = atan(celDir.x, celDir.z) * INV_TAU + 0.5;
      float mwV = asin(clamp(celDir.y, -1.0, 1.0)) / PI + 0.5;
      vec3 mwTex = texture(tMilkyWay, vec2(mwU, mwV)).rgb;

      vec3 mwCol = mix(vec3(0.0024, 0.0034, 0.0056), vec3(0.0058, 0.0050, 0.0046), mwTex.g) * mwTex.r;
      nightAdd += mwCol * uNightVis;

      // Procedural faint star field
      nightAdd += evalProceduralFaintStars(celDir, uPixelAngle, blurRad, mwTex.r) * uNightVis;

      // 64 real catalog bright stars with exact circular optical bokeh / Airy profile
      float rRef = 0.00115;
      float rStar = max(sqrt(rRef * rRef + blurRad * blurRad), 1.35 * uPixelAngle);
      float cosCutoff = cos(min(0.35, rStar * 1.45 + 2.0 * uPixelAngle));
      float areaScale = (rRef * rRef) / (rStar * rStar);
      float bokehBlend = clamp(blurRad / (blurRad + 0.0025), 0.0, 1.0);

      for (int i = 0; i < ${BRIGHT_STAR_COUNT}; i++) {
        vec4 sp = uStarPosFlux[i];
        float cs = dot(celDir, sp.xyz);
        if (cs > cosCutoff) {
          float ang = acos(clamp(cs, -1.0, 1.0));
          float uNorm = ang / rStar;
          // Sharp view: crisp Gaussian-Airy jewel; blurred macro view: soft-rimmed optical bokeh disc
          float airy = exp(-2.4 * uNorm * uNorm);
          float discEdge = max(0.08, (1.4 * uPixelAngle) / rStar);
          float bokehDisc = (1.0 - smoothstep(1.0 - discEdge, 1.0 + discEdge, uNorm)) * (0.86 + 0.24 * smoothstep(0.55, 0.95, uNorm));
          float prof = mix(airy, bokehDisc, bokehBlend);
          nightAdd += uStarColors[i] * (sp.w * areaScale * prof) * uNightVis;
        }
      }
    }

    if (uMoonVis > 0.001) {
      nightAdd += evalMoonSurface(d, uMoon, blurRad) * uMoonVis;
    }

    color += nightAdd * viewAtmTrans * cloudT * horClip;
  }

  // Limb-darkened, horizon-refraction-flattened Sun disc + misty solar aureole
  if (uSunVis > 0.001 && d.y > -0.015) {
    // Horizon atmospheric refraction compresses vertical apparent solar disc near horizon
    float lowEl = clamp(uSun.y, 0.0, 0.25);
    float vertFlatten = mix(1.24, 1.0, smoothstep(0.0, 0.14, lowEl));

    vec3 sRight = normalize(cross(vec3(0.0, 1.0, 0.0), uSun));
    vec3 sUp = cross(uSun, sRight);
    float cosS = dot(d, uSun);
    if (cosS > 0.85) {
      vec2 off = vec2(dot(d, sRight), dot(d, sUp) * vertFlatten);
      float ang = length(off);
      float rEff = sqrt(SUN_RADIUS * SUN_RADIUS + blurRad * blurRad);

      float edgeW = max(uPixelAngle * 1.15, rEff * 0.08);
      float discMask = 1.0 - smoothstep(rEff - edgeW, rEff + edgeW, ang);
      if (discMask > 0.0005) {
        float uLimb = clamp(ang / rEff, 0.0, 1.0);
        float muLimb = sqrt(max(0.0, 1.0 - uLimb * uLimb));
        // Wavelength-dependent solar limb darkening: redder toward the solar limb
        vec3 limbDark = vec3(
          0.42 + 0.58 * pow(muLimb, 0.42),
          0.30 + 0.70 * pow(muLimb, 0.58),
          0.18 + 0.82 * pow(muLimb, 0.78)
        );
        float detailFade = SUN_RADIUS / rEff;
        limbDark = mix(vec3(0.76), limbDark, detailFade);

        float refractedMu = max(0.004, uSun.y + 0.006 * exp(-max(0.0, uSun.y) * 22.0));
        vec3 sunAtmT = sampleTransmittance(tTrans, R_OBS, refractedMu);
        float mistAtten = exp(-2.2 * uFog);
        float effCloudT = mix(cloudT, max(cloudT, uSunThrough * 0.82), 0.45 + 0.55 * uBurst);
        float energyConserve = (SUN_RADIUS * SUN_RADIUS) / (rEff * rEff);

        vec3 sunRad = SUN_IRRAD * sunAtmT * 86.0 * limbDark * discMask * energyConserve * effCloudT * mistAtten * uSunVis * horClip;
        color += sunRad;
      }

      // Soft warm solar halo in thick morning frost mist
      if (uFog > 0.02) {
        float realAng = acos(clamp(cosS, -1.0, 1.0));
        float mistHalo = uFog * (0.55 * exp(-realAng * 9.5) + 0.18 * exp(-realAng * 3.2));
        vec3 sunHaloTint = SUN_IRRAD * sampleTransmittance(tTrans, R_OBS, max(0.015, uSun.y));
        color += sunHaloTint * mistHalo * mix(0.35, 1.0, cloudT) * uSunVis * horClip;
      }
    }
  }

  // Shared ground fog at end so land and sky meet cleanly at the horizon
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
