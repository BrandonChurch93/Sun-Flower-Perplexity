import type { RGB } from '../core/world.ts'

// The air in kilometres, after Hillaire 2020 and Bruneton 2017: one table of transmittance, one of multiple scattering, both made on the processor.
export const RG = 6360
export const RT = 6460
export const CAM_KM = 0.002
const HAZE = 2.6
export const RAYLEIGH: RGB = [5.802e-3, 13.558e-3, 33.1e-3]
export const RAYLEIGH_H = 8
export const MIE_SCATTER = 3.996e-3 * HAZE
export const MIE_EXTINCT = 4.4e-3 * HAZE
export const MIE_H = 1.2
export const MIE_G = 0.8
export const OZONE: RGB = [0.65e-3, 1.881e-3, 0.085e-3]
const ALBEDO = 0.25
// The sun above the air, chosen so that a white card facing a sun 60 degrees up reads 10.
export const SOLAR: RGB = [10.6, 10.6, 10.2]
export const SUN_RADIUS = 0.00465

export const T_W = 256
export const T_H = 64
export const M_N = 32

const H = Math.sqrt(RT * RT - RG * RG)

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function toTop(r: number, mu: number): number {
  const disc = r * r * (mu * mu - 1) + RT * RT
  return Math.max(0, -r * mu + Math.sqrt(Math.max(disc, 0)))
}

function toGround(r: number, mu: number): number {
  const disc = r * r * (mu * mu - 1) + RG * RG
  if (disc < 0 || mu > 0) return -1
  const t = -r * mu - Math.sqrt(disc)
  return t > 0 ? t : -1
}

function extinction(h: number, out: RGB): RGB {
  const ray = Math.exp(-h / RAYLEIGH_H)
  const mie = Math.exp(-h / MIE_H)
  const oz = Math.max(0, 1 - Math.abs(h - 25) / 15)
  for (let i = 0; i < 3; i++) out[i] = RAYLEIGH[i] * ray + MIE_EXTINCT * mie + OZONE[i] * oz
  return out
}

export interface Tables {
  transmittance: Float32Array
  multiple: Float32Array
}

const scratch: RGB = [0, 0, 0]

function transmittanceAt(r: number, mu: number, out: RGB): RGB {
  const d = toTop(r, mu)
  const n = 48
  const dt = d / n
  let a = 0
  let b = 0
  let c = 0
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * dt
    const ri = Math.sqrt(t * t + 2 * r * mu * t + r * r)
    extinction(ri - RG, scratch)
    a += scratch[0] * dt
    b += scratch[1] * dt
    c += scratch[2] * dt
  }
  out[0] = Math.exp(-a)
  out[1] = Math.exp(-b)
  out[2] = Math.exp(-c)
  return out
}

export function transmittanceUv(r: number, mu: number): [number, number] {
  const rho = Math.sqrt(Math.max(0, r * r - RG * RG))
  const d = toTop(r, mu)
  const dMin = RT - r
  const dMax = rho + H
  const xm = dMax > dMin ? (d - dMin) / (dMax - dMin) : 0
  return [Math.min(1, Math.max(0, xm)), rho / H]
}

export class Atmosphere {
  readonly transmittance = new Float32Array(T_W * T_H * 4)
  readonly multiple = new Float32Array(M_N * M_N * 4)

  constructor() {
    const out: RGB = [0, 0, 0]
    for (let y = 0; y < T_H; y++) {
      for (let x = 0; x < T_W; x++) {
        const xm = x / (T_W - 1)
        const xr = y / (T_H - 1)
        const rho = H * xr
        const r = Math.sqrt(rho * rho + RG * RG)
        const dMin = RT - r
        const dMax = rho + H
        const d = dMin + xm * (dMax - dMin)
        const mu = d === 0 ? 1 : Math.max(-1, Math.min(1, (H * H - rho * rho - d * d) / (2 * r * d)))
        transmittanceAt(r, mu, out)
        const k = (y * T_W + x) * 4
        this.transmittance[k] = out[0]
        this.transmittance[k + 1] = out[1]
        this.transmittance[k + 2] = out[2]
        this.transmittance[k + 3] = 1
      }
    }
    this.makeMultiple()
  }

  // The transmittance toward the top of the air, from the table.
  t(r: number, mu: number, out: RGB): RGB {
    const [u, v] = transmittanceUv(r, mu)
    const fx = u * (T_W - 1)
    const fy = v * (T_H - 1)
    const x0 = Math.min(T_W - 2, Math.floor(fx))
    const y0 = Math.min(T_H - 2, Math.floor(fy))
    const ax = fx - x0
    const ay = fy - y0
    const T = this.transmittance
    for (let i = 0; i < 3; i++) {
      const a = T[(y0 * T_W + x0) * 4 + i]
      const b = T[(y0 * T_W + x0 + 1) * 4 + i]
      const c = T[((y0 + 1) * T_W + x0) * 4 + i]
      const e = T[((y0 + 1) * T_W + x0 + 1) * 4 + i]
      out[i] = (a + (b - a) * ax) * (1 - ay) + (c + (e - c) * ax) * ay
    }
    return out
  }

  // The sun seen from a point: hidden by the Earth below its horizon, softly over the width of the disc.
  sunT(r: number, muS: number, out: RGB): RGB {
    this.t(r, muS, out)
    const sinH = RG / r
    const muH = -Math.sqrt(Math.max(0, 1 - sinH * sinH))
    const f = smooth(-SUN_RADIUS, SUN_RADIUS, muS - muH)
    out[0] *= f
    out[1] *= f
    out[2] *= f
    return out
  }

  ms(r: number, muS: number, out: RGB): RGB {
    const u = (muS * 0.5 + 0.5) * (M_N - 1)
    const v = Math.min(1, Math.max(0, (r - RG) / (RT - RG))) * (M_N - 1)
    const x0 = Math.min(M_N - 2, Math.floor(u))
    const y0 = Math.min(M_N - 2, Math.floor(v))
    const ax = u - x0
    const ay = v - y0
    const M = this.multiple
    for (let i = 0; i < 3; i++) {
      const a = M[(y0 * M_N + x0) * 4 + i]
      const b = M[(y0 * M_N + x0 + 1) * 4 + i]
      const c = M[((y0 + 1) * M_N + x0) * 4 + i]
      const e = M[((y0 + 1) * M_N + x0 + 1) * 4 + i]
      out[i] = (a + (b - a) * ax) * (1 - ay) + (c + (e - c) * ax) * ay
    }
    return out
  }

  private makeMultiple(): void {
    const dirs = 64
    const steps = 20
    const sun: RGB = [0, 0, 0]
    const ext: RGB = [0, 0, 0]
    for (let y = 0; y < M_N; y++) {
      for (let x = 0; x < M_N; x++) {
        const muS = (x / (M_N - 1)) * 2 - 1
        const r = RG + Math.max(0.01, (y / (M_N - 1)) * (RT - RG) - 0.01)
        const l2: RGB = [0, 0, 0]
        const fms: RGB = [0, 0, 0]
        const sx = Math.sqrt(Math.max(0, 1 - muS * muS))
        for (let k = 0; k < dirs; k++) {
          const cz = 1 - (2 * (k + 0.5)) / dirs
          const sz = Math.sqrt(1 - cz * cz)
          const phi = k * 2.399963
          const dx = sz * Math.cos(phi)
          const dy = cz
          const nu = dx * sx + dy * muS
          const tg = toGround(r, dy)
          const tMax = tg > 0 ? tg : toTop(r, dy)
          const dt = tMax / steps
          const T: RGB = [1, 1, 1]
          for (let s = 0; s < steps; s++) {
            const t = (s + 0.5) * dt
            const ri = Math.sqrt(t * t + 2 * r * dy * t + r * r)
            const h = ri - RG
            const muSi = (r * muS + t * nu) / ri
            this.sunT(ri, muSi, sun)
            extinction(h, ext)
            const ray = Math.exp(-h / RAYLEIGH_H)
            const mie = Math.exp(-h / MIE_H) * MIE_SCATTER
            for (let i = 0; i < 3; i++) {
              const sigS = RAYLEIGH[i] * ray + mie
              const step = Math.exp(-ext[i] * dt)
              const integ = (1 - step) / Math.max(ext[i], 1e-9)
              l2[i] += (T[i] * sigS * sun[i] * integ) / (4 * Math.PI)
              fms[i] += T[i] * sigS * integ
              T[i] *= step
            }
          }
          if (tg > 0) {
            const muG = (r * muS + tg * nu) / RG
            this.sunT(RG, muS * 0 + muG, sun)
            for (let i = 0; i < 3; i++) l2[i] += (T[i] * sun[i] * Math.max(muG, 0) * ALBEDO) / Math.PI
          }
        }
        const k = (y * M_N + x) * 4
        for (let i = 0; i < 3; i++) {
          const L = l2[i] / dirs
          const f = fms[i] / dirs
          this.multiple[k + i] = L / (1 - f)
        }
        this.multiple[k + 3] = 1
      }
    }
  }

  // The radiance of the clear sky in a direction given by its cosine to the zenith and to the sun, for a sun of irradiance 1.
  radiance(mu: number, muS: number, nu: number, out: RGB): RGB {
    const r = RG + CAM_KM
    const tg = toGround(r, mu)
    const tMax = tg > 0 ? tg : toTop(r, mu)
    const n = 40
    const T: RGB = [1, 1, 1]
    const sun: RGB = [0, 0, 0]
    const ms: RGB = [0, 0, 0]
    const ext: RGB = [0, 0, 0]
    out[0] = out[1] = out[2] = 0
    const pr = (3 / (16 * Math.PI)) * (1 + nu * nu)
    const g = MIE_G
    const pm = ((3 / (8 * Math.PI)) * ((1 - g * g) * (1 + nu * nu))) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * nu, 1.5))
    let prev = 0
    for (let s = 0; s < n; s++) {
      const a = (s + 1) / n
      const tNext = tMax * a * a
      const dt = tNext - prev
      const t = prev + 0.5 * dt
      prev = tNext
      const ri = Math.sqrt(t * t + 2 * r * mu * t + r * r)
      const h = ri - RG
      const muSi = (r * muS + t * nu) / ri
      this.sunT(ri, muSi, sun)
      this.ms(ri, muSi, ms)
      extinction(h, ext)
      const ray = Math.exp(-h / RAYLEIGH_H)
      const mie = Math.exp(-h / MIE_H) * MIE_SCATTER
      for (let i = 0; i < 3; i++) {
        const sr = RAYLEIGH[i] * ray
        const S = sun[i] * (sr * pr + mie * pm) + ms[i] * (sr + mie)
        const step = Math.exp(-ext[i] * dt)
        out[i] += (T[i] * S * (1 - step)) / Math.max(ext[i], 1e-9)
        T[i] *= step
      }
    }
    return out
  }
}

// The light of the clear sky by the sun's height, a row every quarter degree from 20 under the horizon to straight up.
export const ROW_FROM = -20
export const ROW_STEP = 0.25
export const ROWS = Math.round((90 - ROW_FROM) / ROW_STEP) + 1
export const LOOK_DEG = 3

export interface ClearRows {
  direct: Float32Array
  zenith: Float32Array
  horizon: Float32Array
  horizonSun: Float32Array
}

export function clearRows(air: Atmosphere): ClearRows {
  const rows: ClearRows = { direct: new Float32Array(ROWS * 3), zenith: new Float32Array(ROWS * 3), horizon: new Float32Array(ROWS * 3), horizonSun: new Float32Array(ROWS * 3) }
  const c: RGB = [0, 0, 0]
  const lowMu = Math.sin((LOOK_DEG * Math.PI) / 180)
  const lowCos = Math.cos((LOOK_DEG * Math.PI) / 180)
  for (let i = 0; i < ROWS; i++) {
    const e = ((ROW_FROM + i * ROW_STEP) * Math.PI) / 180
    const muS = Math.sin(e)
    const cs = Math.cos(e)
    air.sunT(RG + CAM_KM, muS, c)
    for (let k = 0; k < 3; k++) rows.direct[i * 3 + k] = c[k] * SOLAR[k]
    air.radiance(1, muS, muS, c)
    for (let k = 0; k < 3; k++) rows.zenith[i * 3 + k] = c[k] * SOLAR[k]
    air.radiance(lowMu, muS, lowMu * muS - lowCos * cs, c)
    for (let k = 0; k < 3; k++) rows.horizon[i * 3 + k] = c[k] * SOLAR[k]
    air.radiance(lowMu, muS, lowMu * muS + lowCos * cs, c)
    for (let k = 0; k < 3; k++) rows.horizonSun[i * 3 + k] = c[k] * SOLAR[k]
  }
  return rows
}

export function row(table: Float32Array, elevationDeg: number, out: RGB): RGB {
  const x = Math.min(ROWS - 1, Math.max(0, (elevationDeg - ROW_FROM) / ROW_STEP))
  const i = Math.min(ROWS - 2, Math.floor(x))
  const a = x - i
  for (let k = 0; k < 3; k++) out[k] = table[i * 3 + k] + (table[(i + 1) * 3 + k] - table[i * 3 + k]) * a
  return out
}

export const glslAir = /* glsl */ `
const float RG = ${RG.toFixed(1)};
const float RT = ${RT.toFixed(1)};
const float CAM_KM = ${CAM_KM};
const vec3 RAYLEIGH = vec3(${RAYLEIGH.map((v) => v.toExponential(4)).join(', ')});
const float RAYLEIGH_H = ${RAYLEIGH_H.toFixed(2)};
const float MIE_SCATTER = ${MIE_SCATTER.toExponential(4)};
const float MIE_EXTINCT = ${MIE_EXTINCT.toExponential(4)};
const float MIE_H = ${MIE_H.toFixed(3)};
const float MIE_G = ${MIE_G.toFixed(3)};
const vec3 OZONE = vec3(${OZONE.map((v) => v.toExponential(4)).join(', ')});
const vec3 SOLAR = vec3(${SOLAR.map((v) => v.toFixed(3)).join(', ')});
const float SUN_RADIUS = ${SUN_RADIUS};
const float PI = 3.14159265;
uniform sampler2D uTrans;
uniform sampler2D uMulti;

float toTop(float r, float mu) {
  float disc = r * r * (mu * mu - 1.0) + RT * RT;
  return max(0.0, -r * mu + sqrt(max(disc, 0.0)));
}
float toGround(float r, float mu) {
  float disc = r * r * (mu * mu - 1.0) + RG * RG;
  if (disc < 0.0 || mu > 0.0) return -1.0;
  float t = -r * mu - sqrt(disc);
  return t > 0.0 ? t : -1.0;
}
vec3 airExtinction(float h) {
  return RAYLEIGH * exp(-h / RAYLEIGH_H) + MIE_EXTINCT * exp(-h / MIE_H) + OZONE * max(0.0, 1.0 - abs(h - 25.0) / 15.0);
}
vec3 transmittance(float r, float mu) {
  float H = sqrt(RT * RT - RG * RG);
  float rho = sqrt(max(0.0, r * r - RG * RG));
  float d = toTop(r, mu);
  float dMin = RT - r;
  float dMax = rho + H;
  vec2 uv = vec2(saturate((d - dMin) / max(dMax - dMin, 1e-6)), rho / H);
  uv = (uv * vec2(${T_W - 1}.0, ${T_H - 1}.0) + 0.5) / vec2(${T_W}.0, ${T_H}.0);
  return textureLod(uTrans, uv, 0.0).rgb;
}
vec3 sunTrans(float r, float muS) {
  float sinH = RG / r;
  float muH = -sqrt(max(0.0, 1.0 - sinH * sinH));
  return transmittance(r, muS) * smoothstep(-SUN_RADIUS, SUN_RADIUS, muS - muH);
}
vec3 multiple(float r, float muS) {
  vec2 uv = vec2(muS * 0.5 + 0.5, saturate((r - RG) / (RT - RG)));
  uv = (uv * ${M_N - 1}.0 + 0.5) / ${M_N}.0;
  return textureLod(uMulti, uv, 0.0).rgb;
}
float phaseRayleigh(float nu) { return 3.0 / (16.0 * PI) * (1.0 + nu * nu); }
float phaseMie(float nu, float g) {
  return 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + nu * nu)) / ((2.0 + g * g) * pow(max(1.0 + g * g - 2.0 * g * nu, 1e-4), 1.5));
}
float phaseHG(float c, float g) { return (1.0 - g * g) / (4.0 * PI * pow(max(1.0 + g * g - 2.0 * g * c, 1e-4), 1.5)); }
`
