import { glslCommon } from '../core/shading.ts'
import { glslAir } from './atmosphere.ts'

const head = /* glsl */ `precision highp sampler3D;
${glslCommon}
${glslAir}
`

// The view of the clear sky for this instant: azimuth from the sun across, elevation with more rows near the horizon.
export const SKYVIEW_W = 192
export const SKYVIEW_H = 108

export const glslSkyView = /* glsl */ `
uniform sampler2D uSkyView;
vec2 skyViewUv(vec3 d, vec3 sun) {
  float el = asin(clamp(d.y, -1.0, 1.0));
  vec2 a = normalize(d.xz + vec2(1e-6, 0.0));
  vec2 b = normalize(sun.xz + vec2(1e-6, 0.0));
  float phi = acos(clamp(dot(a, b), -1.0, 1.0));
  float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / (0.5 * PI));
  vec2 uv = vec2(phi / PI, v);
  return (uv * vec2(${SKYVIEW_W - 1}.0, ${SKYVIEW_H - 1}.0) + 0.5) / vec2(${SKYVIEW_W}.0, ${SKYVIEW_H}.0);
}
vec3 skyView(vec3 d, vec3 sun) {
  vec3 q = d;
  q.y = max(q.y, 0.0005);
  return textureLod(uSkyView, skyViewUv(normalize(q), sun), 0.0).rgb;
}
`

export const skyViewFragment = /* glsl */ `${head}
uniform vec3 uSun;
uniform float uGain;
uniform vec3 uNightZenith;
uniform vec3 uNightHorizon;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

void main() {
  vec2 uv = (vUv * vec2(${SKYVIEW_W}.0, ${SKYVIEW_H}.0) - 0.5) / vec2(${SKYVIEW_W - 1}.0, ${SKYVIEW_H - 1}.0);
  float phi = uv.x * PI;
  float s = uv.y * 2.0 - 1.0;
  float el = sign(s) * s * s * 0.5 * PI;
  vec2 sunFlat = normalize(uSun.xz + vec2(1e-6, 0.0));
  float muS = uSun.y;
  float cs = sqrt(max(0.0, 1.0 - muS * muS));
  float mu = sin(el);
  float ce = cos(el);
  float nu = mu * muS + ce * cs * cos(phi);
  float r = RG + CAM_KM;
  float tg = toGround(r, mu);
  float tMax = tg > 0.0 ? tg : toTop(r, mu);
  vec3 T = vec3(1.0);
  vec3 L = vec3(0.0);
  float pr = phaseRayleigh(nu);
  float pm = phaseMie(nu, MIE_G);
  float prev = 0.0;
  const int N = 40;
  for (int i = 0; i < N; i++) {
    float a = float(i + 1) / float(N);
    float tNext = tMax * a * a;
    float dt = tNext - prev;
    float t = prev + 0.5 * dt;
    prev = tNext;
    float ri = sqrt(t * t + 2.0 * r * mu * t + r * r);
    float h = ri - RG;
    float muSi = (r * muS + t * nu) / ri;
    vec3 sun = sunTrans(ri, muSi);
    vec3 ms = multiple(ri, muSi);
    vec3 ext = airExtinction(h);
    vec3 sr = RAYLEIGH * exp(-h / RAYLEIGH_H);
    float sm = MIE_SCATTER * exp(-h / MIE_H);
    vec3 S = sun * (sr * pr + sm * pm) + ms * (sr + sm);
    vec3 st = exp(-ext * dt);
    L += T * S * (1.0 - st) / max(ext, vec3(1e-9));
    T *= st;
  }
  L *= SOLAR * uGain;
  float up = saturate(mu);
  L += mix(uNightHorizon, uNightZenith, pow(up, 0.5));
  outColor = vec4(L, 1.0);
}
`

// The clouds of the part of the sky this frame will see, marched once a frame.
export const cloudFragment = /* glsl */ `${head}
${glslSkyView}
uniform sampler3D uShape;
uniform sampler3D uDetail;
uniform mat3 uBasis;
uniform vec2 uTan;
uniform vec3 uSun;
uniform vec3 uMoon;
uniform vec3 uMoonLight;
uniform vec2 uShift;
uniform vec2 uSmear;
uniform float uEvolve;
uniform float uCover;
uniform float uOvercast;
uniform float uRain;
uniform float uFlash;
uniform vec3 uFlashAt;
uniform float uBurst;
uniform float uSunThrough;
uniform float uEvening;
uniform float uFog;
uniform float uGain;
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
uniform int uSteps;
uniform int uLightSteps;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

float cloudBase;
float cloudTop;
float coverHere;
float nearSun;
float deckWeather;

float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }

float weather(vec2 xz) {
  vec4 w = textureLod(uShape, vec3(xz.x / 36.0, uEvolve * 0.11, xz.y / 36.0), 0.0);
  vec4 v = textureLod(uShape, vec3(xz.x / 11.0 + 0.3, uEvolve * 0.23 + 0.5, xz.y / 11.0 + 0.7), 0.0);
  return saturate(w.r * 0.7 + v.g * 0.45 - 0.08);
}

float altitude(vec3 p) { return length(p + vec3(0.0, RG + CAM_KM, 0.0)) - RG; }

float density(vec3 p, float h, bool detail, vec2 smear) {
  vec2 xz = p.xz - uShift - smear;
  float w = weather(xz);
  float c = saturate(remap(w, 1.0 - coverHere, 1.0, 0.0, 1.0));
  float ov2 = uOvercast * uOvercast;
  c = mix(c, saturate(remap(w, 0.1, 0.75, 0.45, 1.0)) * saturate(coverHere * 1.4 - 0.2), ov2);
  deckWeather = w;
  vec4 lumps = textureLod(uShape, vec3(xz.x / 3.2, 0.31 + uEvolve * 0.05, xz.y / 3.2), 0.0);
  float under = ((lumps.r - 0.55) * 0.9 + (w - 0.5) * 0.8) * uOvercast;
  float hn = (h - cloudBase - under) / (cloudTop - cloudBase);
  if (hn < 0.0 || hn > 1.0) return 0.0;
  float topAt = mix(0.25, 1.0, c * c);
  float grad = saturate(hn / 0.07) * saturate((topAt - hn) / max(0.45 * topAt, 0.05));
  vec3 q = vec3(xz.x, h - uEvolve * 0.35, xz.y);
  vec4 s = textureLod(uShape, q / 5.0, 0.0);
  float fbm = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
  float shape = saturate(remap(s.r, fbm - 1.0, 1.0, 0.0, 1.0));
  float d = saturate(remap(shape * grad, 1.0 - c, 1.0, 0.0, 1.0)) * c;
  d *= mix(1.0, 0.3 + 0.7 * smoothstep(0.15, 0.8, w), ov2);
  if (detail && d > 0.0) {
    vec3 dq = vec3(xz.x, h - uEvolve * 0.9, xz.y) / 0.75;
    vec4 n = textureLod(uDetail, dq, 0.0);
    float df = n.r * 0.625 + n.g * 0.25 + n.b * 0.125;
    df = mix(df, 1.0 - df, saturate(hn * 4.0));
    d = saturate(remap(d, df * 0.42 * (1.0 - 0.4 * uOvercast), 1.0, 0.0, 1.0));
    d = pow(d, 0.75);
  }
  return d;
}

vec2 sphere(vec3 o, vec3 d, float R) {
  float b = dot(o, d);
  float c = dot(o, o) - R * R;
  float disc = b * b - c;
  if (disc < 0.0) return vec2(-1.0);
  float s = sqrt(disc);
  return vec2(-b - s, -b + s);
}

vec3 sunAt(vec3 p) {
  vec3 x = p + vec3(0.0, RG + CAM_KM, 0.0);
  float r = length(x);
  return SOLAR * sunTrans(r, dot(x / r, uSun));
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 d = normalize(uBasis * vec3(ndc.x * uTan.x, ndc.y * uTan.y, 1.0));
  vec3 sky = skyView(d, uSun);
  if (d.y < -0.02) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float dither = hash21(floor(vUv * vec2(4096.0)) + float(uFrame % 64) * 13.17);

  cloudBase = mix(1.5, 1.05, uOvercast);
  cloudTop = cloudBase + mix(2.2, 6.0, uOvercast);
  float toward = dot(d, uSun);
  float rag = textureLod(uShape, vec3(d.x * 3.0, d.y * 3.0 + uEvolve * 0.05, d.z * 3.0), 0.0).r;
  nearSun = smoothstep(cos(radians(9.0)), cos(radians(2.5)), toward + (rag - 0.5) * 0.012);
  float open = max(uSunThrough, uBurst);
  float closing = smoothstep(0.05, 0.35, uCover);
  coverHere = mix(0.26, 1.08, pow(uCover, 0.75));
  coverHere = mix(coverHere, mix(coverHere, 0.7 + 0.4 * (1.0 - uSunThrough), closing) * (1.0 - open * 0.85), nearSun);
  coverHere *= 1.0 - uBurst * smoothstep(cos(radians(14.0)), cos(radians(4.0)), toward + (rag - 0.5) * 0.05);

  vec3 o = vec3(0.0, RG + CAM_KM, 0.0);
  vec2 hb = sphere(o, d, RG + cloudBase - 0.3);
  vec2 ht = sphere(o, d, RG + cloudTop);
  float t0 = max(hb.y, 0.0);
  float t1 = ht.y;
  float span = min(t1 - t0, mix(12.0, 22.0, uOvercast));
  float far = mix(110.0, 70.0, uOvercast);

  vec3 L = vec3(0.0);
  float T = 1.0;
  float depthSum = 0.0;
  float weightSum = 0.0;

  float rainTop = cloudBase;
  if (uRain > 0.0 && d.y < 0.25) {
    float tr = min(t0, 40.0);
    const int RN = 8;
    float dtr = (tr - 1.0) / float(RN);
    for (int i = 0; i < RN; i++) {
      float t = 1.0 + (float(i) + dither) * dtr;
      vec3 p = d * t;
      float h = altitude(p);
      if (h > rainTop) break;
      vec2 xz = p.xz - uShift;
      float w = weather(xz + vec2(h * 0.6, 0.0));
      float col = smoothstep(0.35, 0.75, w);
      float streak = textureLod(uShape, vec3(xz.x / 2.5 + h * 0.15, 0.6, xz.y / 2.5), 0.0).g;
      float sigma = uRain * col * (0.25 + 0.75 * streak) * 0.09 * smoothstep(rainTop, rainTop * 0.6, h);
      vec3 lit = mix(uAmbBottom, uAmbTop, 0.6) * 0.8;
      float st = exp(-sigma * dtr);
      L += T * lit * (1.0 - st);
      depthSum += T * (1.0 - st) * t;
      weightSum += T * (1.0 - st);
      T *= st;
    }
  }

  if (t0 < far && t1 > t0) {
    int n = uSteps;
    float dt = span / float(n);
    float sigmaK = mix(80.0, 70.0, uOvercast);
    float albedo = mix(0.98, 0.9, uOvercast);
    float g = dot(d, uSun);
    float phase = mix(phaseHG(g, 0.82), phaseHG(g, -0.25), 0.35);
    float phase2 = mix(phaseHG(g, 0.4), phaseHG(g, -0.15), 0.4);
    float stormDark = mix(1.0, 0.25, uOvercast);
    vec3 flashP = vec3(0.0);
    if (uFlash > 0.0) {
      vec2 fh = sphere(o, uFlashAt, RG + cloudBase + 1.4);
      flashP = uFlashAt * fh.y;
    }
    float tDither = dither * dt;
    for (int i = 0; i < 256; i++) {
      if (i >= n || T < 0.01) break;
      float t = t0 + tDither + float(i) * dt;
      vec3 p = d * t;
      float h = altitude(p);
      float shutter = fract(dither + float(i) * 0.618034);
      vec2 smear = uSmear * shutter;
      float dens = density(p, h, true, smear);
      if (dens <= 0.001) continue;
      float sigma = dens * sigmaK;
      vec3 sun = sunAt(p);
      float od = 0.0;
      float ls = 0.08;
      vec3 lp = p;
      for (int k = 0; k < 8; k++) {
        if (k >= uLightSteps) break;
        lp += uSun * ls;
        od += density(lp, altitude(lp), false, smear) * ls;
        ls *= 1.9;
      }
      od *= sigmaK;
      float hn = saturate((h - cloudBase) / (cloudTop - cloudBase));
      float beer = exp(-od) * phase + exp(-od * 0.25) * 0.45 * phase2 + exp(-od * 0.06) * 0.2 / (4.0 * PI);
      float powder = mix(1.0, 1.0 - exp(-sigma * 0.12), 0.7 * (1.0 - saturate(g)));
      vec3 sunPart = sun * uGain * 0.5 * beer * powder * stormDark;
      vec3 moonPart = uMoonLight * (exp(-od) + 0.3 * exp(-od * 0.2)) * 0.08;
      vec3 amb = mix(uAmbBottom, uAmbTop, hn) * mix(0.55, 1.0, hn);
      amb = mix(amb, vec3(dot(amb, vec3(0.2126, 0.7152, 0.0722))), 0.75 * uOvercast) * mix(1.0, 0.42, uOvercast) * mix(1.0, 0.6, uOvercast * (1.0 - hn));
      vec3 above = sun * uGain * max(uSun.y, 0.05) * 0.12 * exp(-max(cloudTop - h, 0.0) * mix(1.6, 0.35, smoothstep(0.1, 0.7, 1.0 - deckWeather))) * uOvercast;
      vec3 S = albedo * (sunPart + amb + moonPart + above);
      if (uFlash > 0.0) {
        float fd = length(p - flashP);
        S += uFlash * vec3(0.8, 0.85, 1.0) * (60.0 * exp(-fd * fd / 1.4) + 6.0 * exp(-fd / 2.5));
      }
      float st = exp(-sigma * dt);
      L += T * S * (1.0 - st);
      depthSum += T * (1.0 - st) * t;
      weightSum += T * (1.0 - st);
      T *= st;
    }
  }

  float cirrusOn = mix(0.12, 1.0, uEvening) * (1.0 - uOvercast) * (1.0 - smoothstep(0.3, 0.7, uFog));
  if (cirrusOn > 0.0 && T > 0.01) {
    vec2 hc = sphere(o, d, RG + 7.5);
    float tc = hc.y;
    if (tc > 0.0 && tc < 220.0) {
      vec3 p = d * tc;
      vec2 xz = p.xz - uShift * 1.4;
      vec4 a = textureLod(uShape, vec3(xz.x / 40.0 + xz.y / 120.0, uEvolve * 0.04 + 0.2, xz.y / 9.0), 0.0);
      vec4 b = textureLod(uDetail, vec3(xz.x / 6.0, uEvolve * 0.1, xz.y / 1.8), 0.0);
      float m = a.r * 0.75 + b.g * 0.35;
      float c = smoothstep(0.62 - 0.22 * cirrusOn, 0.95, m) * cirrusOn;
      float alpha = 1.0 - exp(-c * 1.6);
      vec3 sun = sunAt(p);
      vec3 lit = sun * uGain * 0.5 * (phaseHG(dot(d, uSun), 0.6) * 0.7 + 0.03) + uAmbTop * 0.8;
      float air = exp(-tc / 160.0);
      vec3 cl = lit * air + sky * (1.0 - air);
      L += T * cl * alpha;
      depthSum += T * alpha * min(tc, 60.0);
      weightSum += T * alpha;
      T *= 1.0 - alpha;
    }
  }

  if (weightSum > 1e-5) {
    float dist = depthSum / weightSum;
    float hm = 0.5 * cloudBase;
    vec3 ext = (RAYLEIGH * exp(-hm / RAYLEIGH_H) + MIE_EXTINCT * exp(-hm / MIE_H)) * (0.7 + 1.2 * uRain + 2.0 * uFog);
    vec3 air = exp(-ext * dist);
    L = L * air + sky * (1.0 - T) * (1.0 - air);
  }
  T = saturate((T - 0.01) / 0.99);
  outColor = vec4(L, T);
}
`

// One sample of the sky behind everything: the clear air, the stars and the moon, the prepared clouds, the sun's disc, the mist and the shared fog.
export const skyFragment = /* glsl */ `${head}
${glslSkyView}
uniform sampler2D uClouds;
uniform mat4 uCamWorld;
uniform vec4 uRay;
uniform float uPixelAngle;
uniform mat3 uBasisT;
uniform vec2 uTan;
uniform float uCloudPixel;
uniform vec3 uSun;
uniform vec3 uMoon;
uniform vec3 uMoonColor;
uniform vec3 uPole;
uniform float uStarTurn;
uniform float uStars;
uniform float uDisc;
uniform float uMist;
uniform vec3 uMistColor;
uniform vec3 uHalo;
uniform float uThrough;
uniform float uGain;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

vec3 rotateAbout(vec3 v, vec3 k, float a) {
  float c = cos(a);
  float s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}

vec3 starField(vec3 d, float sigma) {
  vec3 q = rotateAbout(d, uPole, -uStarTurn);
  vec3 a = abs(q);
  vec2 f;
  float face;
  if (a.x >= a.y && a.x >= a.z) { f = q.yz / a.x; face = q.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z) { f = q.xz / a.y; face = q.y > 0.0 ? 2.0 : 3.0; }
  else { f = q.xy / a.z; face = q.z > 0.0 ? 4.0 : 5.0; }
  const float N = 300.0;
  vec2 g = (f * 0.5 + 0.5) * N;
  vec3 sum = vec3(0.0);
  vec2 c = floor(g);
  float h = hash31(vec3(c, face));
  if (h < 0.34) {
    float h2 = hash31(vec3(c + 0.37, face + 11.0));
    float h3 = hash31(vec3(c + 0.71, face + 23.0));
    float h4 = hash31(vec3(c + 0.13, face + 31.0));
    vec2 at = c + 0.25 + 0.5 * vec2(h2, h3);
    float dist = length(g - at) * (2.0 / N);
    float mag = pow(h4, 10.0) * 0.8 + pow(h4, 3.0) * 0.05 + 0.006;
    float temp = hash31(vec3(c + 0.53, face + 41.0));
    vec3 tint = temp < 0.2 ? vec3(0.75, 0.85, 1.25) : temp < 0.55 ? vec3(1.0) : temp < 0.85 ? vec3(1.12, 1.0, 0.82) : vec3(1.3, 0.88, 0.62);
    sum += tint * mag * exp(-0.5 * dist * dist / (sigma * sigma)) * min(1.0, (0.0008 * 0.0008) / (sigma * sigma));
  }
  vec3 band = normalize(vec3(0.35, 0.25, -0.9));
  float lat = dot(q, band);
  float mw = exp(-lat * lat * 30.0);
  sum += vec3(0.0016, 0.0018, 0.0024) * mw;
  return sum;
}

vec4 clouds(vec3 d, float blur) {
  vec3 c = uBasisT * d;
  if (c.z <= 0.01) return vec4(0.0, 0.0, 0.0, 1.0);
  vec2 uv = vec2(c.x / c.z / uTan.x, c.y / c.z / uTan.y) * 0.5 + 0.5;
  float px = max(blur / uCloudPixel, 1.0);
  float lod = log2(px);
  if (lod < 1.0) return textureLod(uClouds, uv, 0.0);
  vec2 r = vec2(1.0, uTan.x / uTan.y) * (blur / (2.0 * uTan.x)) * 0.5;
  float l = max(lod - 1.0, 0.0);
  vec4 s = textureLod(uClouds, uv + vec2(r.x, r.y * 0.3), l);
  s += textureLod(uClouds, uv + vec2(-r.x * 0.3, r.y), l);
  s += textureLod(uClouds, uv + vec2(-r.x, -r.y * 0.3), l);
  s += textureLod(uClouds, uv + vec2(r.x * 0.3, -r.y), l);
  return s * 0.25;
}

float refraction(float elDeg) {
  float h = max(elDeg, -1.0);
  return (1.0 / tan(radians(h + 7.31 / (h + 4.4)))) / 60.0;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dv = normalize(vec3((ndc.x + uRay.z) * uRay.x, (ndc.y + uRay.w) * uRay.y, -1.0));
  vec3 d = normalize(mat3(uCamWorld) * dv);
  float coc = min(uCocScale / uFocusM, 2048.0);
  float blur = 0.5 * coc * uPixelAngle;
  vec3 color = skyView(d, uSun);
  float above = smoothstep(-0.004, 0.004, d.y);
  vec3 airUp = transmittance(RG + CAM_KM, max(d.y, 0.0));
  if (uStars > 0.0) {
    float sigma = max(uPixelAngle * 0.5, min(blur, uPixelAngle * 1.1));
    color += starField(d, sigma) * airUp * above * uStars;
  }
  float moonAngle = acos(clamp(dot(d, uMoon), -1.0, 1.0));
  float moonR = 0.0047;
  float mr = sqrt(moonR * moonR + blur * blur);
  float moonDisc = 1.0 - smoothstep(mr * 0.92, mr * 1.04 + uPixelAngle, moonAngle);
  if (moonDisc > 0.0) {
    vec3 m = d - uMoon * dot(d, uMoon);
    vec3 lit = normalize(uSun - uMoon * dot(uSun, uMoon) + vec3(1e-5));
    float x = dot(m, lit) / mr;
    float shade = smoothstep(-0.95, -0.7, x);
    vec2 mq = vec2(dot(m, normalize(cross(uMoon, vec3(0.0, 1.0, 0.0)))), m.y) / moonR;
    float mare = 0.8 + 0.2 * valueNoise(mq * 2.5 + 3.0);
    color += uMoonColor * moonDisc * shade * mare * (moonR * moonR) / (mr * mr) * airUp;
  }
  color += uMoonColor * 0.0015 * exp(-moonAngle * 30.0) * above;

  vec4 cl = clouds(d, blur);
  float cloudT = cl.a;
  color = color * cl.a + cl.rgb;

  float elDeg = degrees(asin(clamp(d.y, -1.0, 1.0)));
  float sunElDeg = degrees(asin(clamp(uSun.y, -1.0, 1.0)));
  float trueEl = elDeg - refraction(elDeg);
  vec2 dFlat = normalize(d.xz + vec2(1e-6, 0.0));
  vec2 sFlat = normalize(uSun.xz + vec2(1e-6, 0.0));
  float dAz = atan(dFlat.x * sFlat.y - dFlat.y * sFlat.x, dot(dFlat, sFlat));
  float sunTrueEl = sunElDeg;
  vec2 off = vec2(dAz * cos(radians(sunElDeg)), radians(trueEl - sunTrueEl));
  float angle = length(off);
  float mistWide = uMist * 0.02;
  float r = sqrt(SUN_RADIUS * SUN_RADIUS + blur * blur + mistWide * mistWide);
  float disc = 1.0 - smoothstep(r * 0.9, r * 1.05 + uPixelAngle, angle);
  if (disc > 0.0) {
    float mu = sqrt(max(0.0, 1.0 - min(angle / SUN_RADIUS, 1.0) * min(angle / SUN_RADIUS, 1.0)));
    vec3 limb = pow(vec3(mu), vec3(0.38, 0.5, 0.65)) * 0.85 + 0.15;
    limb = mix(limb, vec3(1.0), saturate(blur / SUN_RADIUS));
    vec3 tr = sunTrans(RG + CAM_KM, sin(radians(max(trueEl, -2.0))));
    color += SOLAR * tr * uDisc * limb * disc * (SUN_RADIUS * SUN_RADIUS) / (r * r) * cloudT * uThrough * above;
  }

  if (uMist > 0.0) {
    float toward = dot(d, uSun);
    float up = max(d.y, 0.0);
    vec3 mist = uMistColor * (1.0 - 0.25 * pow(up, 0.6)) + uHalo * (phaseHG(toward, 0.75) * 0.5 + phaseHG(toward, 0.95) * 0.25);
    float m = uMist * mix(1.0, 0.82, pow(up, 0.5));
    color = mix(color, mist, m);
  }

  float a = uFogDensity * exp(-uFogFalloff * max(uCamPos.y, 0.0));
  float depth = d.y > 1e-3 ? a / (uFogFalloff * d.y) : 1e6;
  float fog = 1.0 - exp(-depth);
  color = mix(color, uFogColor + uFogSunTint * pow(saturate(dot(d, uSunDir)), 6.0), fog);
  float grey = dot(color, vec3(0.3, 0.6, 0.1));
  if (uDiag == 7) color = vec3(1.0, 0.0, 0.6);
  if (uDiag == 4) { outColor = vec4(vec3(0.03), -1.0); return; }
  if (uDiag == 5) color = vec3(1.0e4);
  if (uDiag == 6) color = vec3(grey) * 0.5;
  outColor = vec4(color, coc);
}
`
