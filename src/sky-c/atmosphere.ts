import * as THREE from 'three'
import { clamp, lerp, smoothstep } from '../core/curves.ts'
import type { RGB } from '../core/world.ts'
import type { Moment, SkyLight } from '../v2/api.ts'

export const R_BOTTOM = 6360.0
export const R_TOP = 6460.0
export const ATM_H = R_TOP - R_BOTTOM
export const R_OBS = R_BOTTOM + 0.02

export const BETA_R: RGB = [0.005802, 0.013558, 0.0331]
export const H_RAYLEIGH = 8.0
export const BETA_M_SCA: RGB = [0.0165, 0.0165, 0.0165]
export const BETA_M_EXT: RGB = [0.0192, 0.0192, 0.0192]
export const H_MIE = 1.2
export const BETA_O3: RGB = [0.00088, 0.00254, 0.000115]
export const GROUND_ALBEDO: RGB = [0.12, 0.1, 0.07]

export const SUN_IRRADIANCE: RGB = [9.85, 9.8, 9.6]
export const SKY_RADIANCE_SCALE: RGB = [2.75, 2.78, 2.85]
export const MOON_DIRECT: RGB = [0.19, 0.2, 0.23]
export const NIGHT_ZENITH: RGB = [0.0019, 0.0034, 0.0062]
export const NIGHT_HORIZON: RGB = [0.0038, 0.0063, 0.0108]

export const TRANS_W = 256
export const TRANS_H = 64
export const MS_SIZE = 32

const RAD = Math.PI / 180

function mediumAt(h: number, scaR: RGB, scaM: RGB, ext: RGB): void {
  const hc = Math.max(0, h)
  const dr = Math.exp(-hc / H_RAYLEIGH)
  const dm = Math.exp(-hc / H_MIE)
  const do3 = Math.max(0, 1 - Math.abs(hc - 25.0) / 15.0)
  for (let i = 0; i < 3; i++) {
    scaR[i] = BETA_R[i] * dr
    scaM[i] = BETA_M_SCA[i] * dm
    ext[i] = scaR[i] + BETA_M_EXT[i] * dm + BETA_O3[i] * do3
  }
}

function raySphereTop(r: number, mu: number): number {
  const disc = r * r * (mu * mu - 1) + R_TOP * R_TOP
  return Math.max(0, -r * mu + Math.sqrt(Math.max(0, disc)))
}

function raySphereGround(r: number, mu: number): number {
  if (mu >= 0) return -1
  const disc = r * r * (mu * mu - 1) + R_BOTTOM * R_BOTTOM
  if (disc < 0) return -1
  const d = -r * mu - Math.sqrt(disc)
  return d >= 0 ? d : -1
}

export function uvToTransmittanceRMu(u: number, v: number): [number, number] {
  const r = R_BOTTOM + ATM_H * v * v
  let mu: number
  if (u >= 0.35) {
    const t = (u - 0.35) / 0.65
    mu = t * t
  } else {
    const t = (0.35 - u) / 0.35
    mu = -0.25 * t * t
  }
  return [r, mu]
}

export function transmittanceRMuToUv(r: number, mu: number): [number, number] {
  const v = Math.sqrt(clamp((r - R_BOTTOM) / ATM_H, 0, 1))
  let u: number
  if (mu >= 0) {
    u = 0.35 + 0.65 * Math.sqrt(clamp(mu, 0, 1))
  } else {
    u = 0.35 - 0.35 * Math.sqrt(clamp(-mu / 0.25, 0, 1))
  }
  return [u, v]
}

function phaseRayleigh(c: number): number {
  return (3 / (16 * Math.PI)) * (1 + c * c)
}

function phaseMie(c: number, g = 0.8): number {
  const g2 = g * g
  const denom = Math.pow(Math.max(1e-4, 1 + g2 - 2 * g * c), 1.5)
  return (3 / (8 * Math.PI)) * (((1 - g2) * (1 + c * c)) / ((2 + g2) * denom))
}

const LIGHT_TABLE_N = 256
const EL_MIN = -18
const EL_MAX = 65

export interface AtmosphereTables {
  transData: Float32Array
  msData: Float32Array
  transTexture: THREE.DataTexture
  msTexture: THREE.DataTexture
  zenithTable: Float32Array
  horizonTable: Float32Array
  horizonSunTable: Float32Array
  directTable: Float32Array
}

export function sampleTrans(data: Float32Array, r: number, mu: number, out: RGB): RGB {
  if (mu < -0.25) {
    out[0] = out[1] = out[2] = 0
    return out
  }
  const [u, v] = transmittanceRMuToUv(r, mu)
  const fx = clamp(u, 0, 1) * (TRANS_W - 1)
  const fy = clamp(v, 0, 1) * (TRANS_H - 1)
  const x0 = Math.min(TRANS_W - 2, Math.floor(fx))
  const y0 = Math.min(TRANS_H - 2, Math.floor(fy))
  const tx = fx - x0
  const ty = fy - y0
  const i00 = (y0 * TRANS_W + x0) * 4
  const i10 = i00 + 4
  const i01 = i00 + TRANS_W * 4
  const i11 = i01 + 4
  for (let c = 0; c < 3; c++) {
    const a = data[i00 + c] + (data[i10 + c] - data[i00 + c]) * tx
    const b = data[i01 + c] + (data[i11 + c] - data[i01 + c]) * tx
    out[c] = a + (b - a) * ty
  }
  return out
}

function sampleMs(data: Float32Array, r: number, sunMu: number, out: RGB): RGB {
  const u = clamp(0.5 + 0.5 * sunMu, 0, 1)
  const v = Math.sqrt(clamp((r - R_BOTTOM) / ATM_H, 0, 1))
  const fx = u * (MS_SIZE - 1)
  const fy = v * (MS_SIZE - 1)
  const x0 = Math.min(MS_SIZE - 2, Math.floor(fx))
  const y0 = Math.min(MS_SIZE - 2, Math.floor(fy))
  const tx = fx - x0
  const ty = fy - y0
  const i00 = (y0 * MS_SIZE + x0) * 4
  const i10 = i00 + 4
  const i01 = i00 + MS_SIZE * 4
  const i11 = i01 + 4
  for (let c = 0; c < 3; c++) {
    const a = data[i00 + c] + (data[i10 + c] - data[i00 + c]) * tx
    const b = data[i01 + c] + (data[i11 + c] - data[i01 + c]) * tx
    out[c] = a + (b - a) * ty
  }
  return out
}

export function buildAtmosphereTables(renderer: THREE.WebGLRenderer): AtmosphereTables {
  const transData = new Float32Array(TRANS_W * TRANS_H * 4)
  const scaR: RGB = [0, 0, 0]
  const scaM: RGB = [0, 0, 0]
  const ext: RGB = [0, 0, 0]

  for (let y = 0; y < TRANS_H; y++) {
    const v = y / (TRANS_H - 1)
    for (let x = 0; x < TRANS_W; x++) {
      const u = x / (TRANS_W - 1)
      const [r, mu] = uvToTransmittanceRMu(u, v)
      const dTop = raySphereTop(r, mu)
      let limb = 1
      if (mu < 0) {
        const rMin = r * Math.sqrt(Math.max(0, 1 - mu * mu))
        limb = smoothstep(R_BOTTOM - 2.4, R_BOTTOM + 0.6, rMin)
      }
      const steps = 40
      const dt = dTop / steps
      let tau0 = 0
      let tau1 = 0
      let tau2 = 0
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) * dt
        const rs = Math.sqrt(r * r + t * t + 2 * r * mu * t)
        mediumAt(rs - R_BOTTOM, scaR, scaM, ext)
        tau0 += ext[0] * dt
        tau1 += ext[1] * dt
        tau2 += ext[2] * dt
      }
      const idx = (y * TRANS_W + x) * 4
      transData[idx] = Math.exp(-tau0) * limb
      transData[idx + 1] = Math.exp(-tau1) * limb
      transData[idx + 2] = Math.exp(-tau2) * limb
      transData[idx + 3] = 1
    }
  }

  const msData = new Float32Array(MS_SIZE * MS_SIZE * 4)
  const dirs = 64
  const golden = Math.PI * (3 - Math.sqrt(5))
  const tSun: RGB = [0, 0, 0]
  const tGround: RGB = [0, 0, 0]

  for (let y = 0; y < MS_SIZE; y++) {
    const v = y / (MS_SIZE - 1)
    const r = R_BOTTOM + ATM_H * v * v
    for (let x = 0; x < MS_SIZE; x++) {
      const u = x / (MS_SIZE - 1)
      const sunMu = u * 2 - 1
      const sunSin = Math.sqrt(Math.max(0, 1 - sunMu * sunMu))
      const l2: RGB = [0, 0, 0]
      const fms: RGB = [0, 0, 0]
      const dOmega = (4 * Math.PI) / dirs

      for (let d = 0; d < dirs; d++) {
        const dz = 1 - (2 * (d + 0.5)) / dirs
        const drad = Math.sqrt(Math.max(0, 1 - dz * dz))
        const phi = d * golden
        const dx = Math.cos(phi) * drad
        const dy = dz
        const gHit = raySphereGround(r, dy)
        const maxD = gHit > 0 ? gHit : raySphereTop(r, dy)
        const steps = 20
        const dt = maxD / steps
        const tr: RGB = [1, 1, 1]
        const cosTheta = dx * sunSin + dy * sunMu
        const pr = phaseRayleigh(cosTheta)
        const pm = phaseMie(cosTheta, 0.8)

        for (let s = 0; s < steps; s++) {
          const t = (s + 0.5) * dt
          const rs = Math.sqrt(r * r + t * t + 2 * r * dy * t)
          mediumAt(rs - R_BOTTOM, scaR, scaM, ext)
          const upX = (dx * t) / rs
          const upY = (r + dy * t) / rs
          const muS = upX * sunSin + upY * sunMu
          sampleTrans(transData, rs, muS, tSun)
          for (let c = 0; c < 3; c++) {
            const stepT = Math.exp(-ext[c] * dt)
            const sint = ext[c] > 1e-6 ? (1 - stepT) / ext[c] : dt
            const sca = scaR[c] + scaM[c]
            const ph = scaR[c] * pr + scaM[c] * pm
            l2[c] += tr[c] * ph * tSun[c] * sint * (dOmega / (4 * Math.PI))
            fms[c] += tr[c] * (sca / (4 * Math.PI)) * sint * dOmega
            tr[c] *= stepT
          }
        }
        if (gHit > 0 && sunMu > 0) {
          const upX = (dx * gHit) / R_BOTTOM
          const upY = (r + dy * gHit) / R_BOTTOM
          const muG = Math.max(0, upX * sunSin + upY * sunMu)
          sampleTrans(transData, R_BOTTOM + 0.01, muG, tGround)
          for (let c = 0; c < 3; c++) {
            l2[c] += tr[c] * (GROUND_ALBEDO[c] / Math.PI) * muG * tGround[c] * (dOmega / (4 * Math.PI))
          }
        }
      }

      const idx = (y * MS_SIZE + x) * 4
      for (let c = 0; c < 3; c++) {
        msData[idx + c] = l2[c] / Math.max(0.05, 1 - fms[c])
      }
      msData[idx + 3] = 1
    }
  }

  const zenithTable = new Float32Array(LIGHT_TABLE_N * 3)
  const horizonTable = new Float32Array(LIGHT_TABLE_N * 3)
  const horizonSunTable = new Float32Array(LIGHT_TABLE_N * 3)
  const directTable = new Float32Array(LIGHT_TABLE_N * 3)
  const msVal: RGB = [0, 0, 0]

  const integrateSkyRay = (dx: number, dy: number, dz: number, sx: number, sy: number, sz: number, out: RGB): void => {
    const maxD = raySphereTop(R_OBS, dy)
    const steps = 36
    const dt = maxD / steps
    const tr: RGB = [1, 1, 1]
    out[0] = out[1] = out[2] = 0
    const cosTheta = dx * sx + dy * sy + dz * sz
    const pr = phaseRayleigh(cosTheta)
    const pm = phaseMie(cosTheta, 0.78)
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) * dt
      const px = dx * t
      const py = R_OBS + dy * t
      const pz = dz * t
      const rs = Math.hypot(px, py, pz)
      mediumAt(rs - R_BOTTOM, scaR, scaM, ext)
      const muS = (px * sx + py * sy + pz * sz) / rs
      sampleTrans(transData, rs, muS, tSun)
      sampleMs(msData, rs, muS, msVal)
      for (let c = 0; c < 3; c++) {
        const stepT = Math.exp(-ext[c] * dt)
        const sint = ext[c] > 1e-6 ? (1 - stepT) / ext[c] : dt
        const single = (scaR[c] * pr + scaM[c] * pm) * tSun[c]
        const multi = (scaR[c] + scaM[c]) * msVal[c]
        out[c] += tr[c] * (single + multi) * sint * SKY_RADIANCE_SCALE[c]
        tr[c] *= stepT
      }
    }
  }

  const tmp: RGB = [0, 0, 0]
  const hEl = 4.5 * RAD
  const cosH = Math.cos(hEl)
  const sinH = Math.sin(hEl)
  const awayAz = 135 * RAD

  for (let i = 0; i < LIGHT_TABLE_N; i++) {
    const elDeg = EL_MIN + ((EL_MAX - EL_MIN) * i) / (LIGHT_TABLE_N - 1)
    const el = elDeg * RAD
    const sy = Math.sin(el)
    const sx = Math.cos(el)
    const nightW = smoothstep(-2, -13, elDeg)

    integrateSkyRay(0, 1, 0, sx, sy, 0, tmp)
    for (let c = 0; c < 3; c++) zenithTable[i * 3 + c] = tmp[c] + NIGHT_ZENITH[c] * nightW

    integrateSkyRay(Math.cos(awayAz) * cosH, sinH, Math.sin(awayAz) * cosH, sx, sy, 0, tmp)
    for (let c = 0; c < 3; c++) horizonTable[i * 3 + c] = tmp[c] + NIGHT_HORIZON[c] * nightW

    integrateSkyRay(cosH, sinH, 0, sx, sy, 0, tmp)
    for (let c = 0; c < 3; c++) horizonSunTable[i * 3 + c] = tmp[c] + NIGHT_HORIZON[c] * nightW

    const refractedEl = elDeg + 0.35 * Math.exp(-Math.max(0, elDeg + 1.5) * 0.4)
    const muDir = Math.sin(refractedEl * RAD)
    sampleTrans(transData, R_OBS, muDir, tmp)
    const sunUp = smoothstep(-1.1, 0.25, elDeg)
    for (let c = 0; c < 3; c++) directTable[i * 3 + c] = SUN_IRRADIANCE[c] * tmp[c] * sunUp
  }

  const transTexture = new THREE.DataTexture(transData, TRANS_W, TRANS_H, THREE.RGBAFormat, THREE.FloatType)
  transTexture.minFilter = THREE.LinearFilter
  transTexture.magFilter = THREE.LinearFilter
  transTexture.wrapS = THREE.ClampToEdgeWrapping
  transTexture.wrapT = THREE.ClampToEdgeWrapping
  transTexture.generateMipmaps = false
  transTexture.colorSpace = THREE.NoColorSpace
  transTexture.needsUpdate = true
  renderer.initTexture(transTexture)

  const msTexture = new THREE.DataTexture(msData, MS_SIZE, MS_SIZE, THREE.RGBAFormat, THREE.FloatType)
  msTexture.minFilter = THREE.LinearFilter
  msTexture.magFilter = THREE.LinearFilter
  msTexture.wrapS = THREE.ClampToEdgeWrapping
  msTexture.wrapT = THREE.ClampToEdgeWrapping
  msTexture.generateMipmaps = false
  msTexture.colorSpace = THREE.NoColorSpace
  msTexture.needsUpdate = true
  renderer.initTexture(msTexture)

  return { transData, msData, transTexture, msTexture, zenithTable, horizonTable, horizonSunTable, directTable }
}

function readCurve(table: Float32Array, elDeg: number, out: RGB): void {
  const f = clamp((elDeg - EL_MIN) / (EL_MAX - EL_MIN), 0, 1) * (LIGHT_TABLE_N - 1)
  const i0 = Math.min(LIGHT_TABLE_N - 2, Math.floor(f))
  const t = f - i0
  const a = i0 * 3
  const b = a + 3
  out[0] = table[a] + (table[b] - table[a]) * t
  out[1] = table[a + 1] + (table[b + 1] - table[a + 1]) * t
  out[2] = table[a + 2] + (table[b + 2] - table[a + 2]) * t
}

export function evaluateSkyLight(tables: AtmosphereTables, m: Moment, out: SkyLight): SkyLight {
  const e = m.sunElevationDeg
  const d = m.dials
  readCurve(tables.zenithTable, e, out.zenith)
  readCurve(tables.horizonTable, e, out.horizon)
  readCurve(tables.horizonSunTable, e, out.horizonSun)

  if (m.lightKind === 'moon') {
    out.direct[0] = MOON_DIRECT[0]
    out.direct[1] = MOON_DIRECT[1]
    out.direct[2] = MOON_DIRECT[2]
  } else {
    readCurve(tables.directTable, e, out.direct)
  }

  const skyMeanLum =
    0.2126 * (0.4 * out.zenith[0] + 0.6 * out.horizon[0]) +
    0.7152 * (0.4 * out.zenith[1] + 0.6 * out.horizon[1]) +
    0.0722 * (0.4 * out.zenith[2] + 0.6 * out.horizon[2])
  const sunHorizLum =
    (0.2126 * out.direct[0] + 0.7152 * out.direct[1] + 0.0722 * out.direct[2]) * Math.max(0, Math.sin(Math.max(0, e) * RAD))
  const totalTop = skyMeanLum + 0.22 * sunHorizLum

  const stormAtten = lerp(0.62, 0.14, d.overcast)
  const deckBase = totalTop * stormAtten
  const closed = clamp(d.cover * 1.12 - 0.1) * lerp(0.45, 1.0, d.overcast)
  const veil = clamp(d.fog)
  const flashLift = d.flash * 0.08 * Math.max(0.05, totalTop)

  for (let i = 0; i < 3; i++) {
    const stormTint = i === 0 ? 0.88 : i === 1 ? 0.99 : 1.16
    const flashTint = i === 0 ? 0.72 : i === 1 ? 0.92 : 1.35
    out.zenith[i] = lerp(out.zenith[i], deckBase * stormTint * 0.88, closed) + flashLift * flashTint * 0.7
    out.horizon[i] = lerp(out.horizon[i], deckBase * stormTint * 1.24, closed * 0.88) + flashLift * flashTint * 0.45
    const breakWarm = d.burst * out.direct[i] * 0.22
    out.horizonSun[i] = lerp(out.horizonSun[i], deckBase * stormTint * 1.32, closed * (1 - 0.55 * d.burst)) + breakWarm + flashLift * flashTint * 0.6

    const mistEven = 0.45 * out.zenith[i] + 0.55 * out.horizon[i]
    const mistSun = mistEven + 0.18 * out.direct[i] * veil
    out.zenith[i] = lerp(out.zenith[i], mistEven * 1.05, veil * 0.88)
    out.horizon[i] = lerp(out.horizon[i], mistEven * 1.12, veil * 0.76)
    out.horizonSun[i] = lerp(out.horizonSun[i], mistSun, veil * 0.68)
  }

  return out
}
