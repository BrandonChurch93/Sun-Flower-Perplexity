import * as THREE from 'three'
import { clamp, lerp, smoothstep } from '../core/curves.ts'
import type { RGB } from '../core/world.ts'

const R = 6371
const TOP = 92
const TX = 144
const TY = 96
const MX = 32
const MY = 20
const SKY_X = 48
const SKY_Y = 42
const SKY_N = 89
const RAD = Math.PI / 180
const EYE = 0.003
const SUN = 10

const RAY: RGB = [0.0050, 0.0116, 0.0276]
const MIE: RGB = [0.023, 0.0245, 0.0265]
const OZONE: RGB = [0.00056, 0.0015, 0.00022]
const AIRGLOW: RGB = [0.00155, 0.00240, 0.00455]
const CAL: RGB = [0.72, 0.92, 1.19]
const LOW_AEROSOL: RGB = [1.02, 0.84, 1.26]

const rgb = (): RGB => [0, 0, 0]
const lum = (a: RGB): number => a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722
const sunset = (i: number): number => i < 65 ? (i - 32) * 0.75 : 24 + (i - 64) * 2.75
const sunIndex = (e: number): number => clamp(e <= 24 ? 32 + e / 0.75 : 64 + (e - 24) / 2.75, 0, SKY_N - 1)
const rDensity = (h: number): number => Math.exp(-h / 8.0)
const mDensity = (h: number): number => Math.exp(-h / 1.24)
const oDensity = (h: number): number => Math.max(0, 1 - Math.abs(h - 24) / 16)
const phaseR = (nu: number): number => (3 / (16 * Math.PI)) * (1 + nu * nu)
const G = 0.79
const phaseM = (nu: number): number => ((3 / (8 * Math.PI)) * (1 - G * G) / (2 + G * G)) * (1 + nu * nu) / ((1 + G * G - 2 * G * nu) ** 1.5)

const horizon = (h: number): number => -Math.sqrt(h * (2 * R + h)) / (R + h)
const altitude = (h: number, mu: number, t: number): number => Math.max(0, Math.sqrt((R + h) ** 2 + 2 * (R + h) * mu * t + t * t) - R)

function distance(h: number, mu: number, boundary: number, far: boolean): number {
  const r = R + h
  const b = r * mu
  const root = Math.sqrt(Math.max(0, b * b + (boundary - h) * (2 * R + boundary + h)))
  return Math.max(0, -b + (far ? root : -root))
}

function read(table: Float32Array, width: number, height: number, x: number, y: number, out: RGB): void {
  const a = clamp(x, 0, width - 1)
  const b = clamp(y, 0, height - 1)
  const ax = Math.min(width - 2, Math.floor(a))
  const by = Math.min(height - 2, Math.floor(b))
  const fx = a - ax
  const fy = b - by
  const i = (by * width + ax) * 3
  const j = i + width * 3
  for (let c = 0; c < 3; c++) out[c] = lerp(lerp(table[i + c], table[i + 3 + c], fx), lerp(table[j + c], table[j + 3 + c], fx), fy)
}

export class Air {
  private readonly transmittance = new Float32Array(TX * TY * 3)
  private readonly multiple = new Float32Array(MX * MY * 3)
  private readonly sky = new Float32Array(SKY_X * SKY_Y * SKY_N * 3)
  private readonly directTable = new Float32Array(SKY_N * 3)
  private readonly cloudTable = new Float32Array(SKY_N * 3)
  private readonly tap = rgb()
  readonly texture: THREE.DataTexture

  constructor() {
    this.makeTransmittance()
    this.makeMultiple()
    this.makeSky()
    const data = new Uint16Array(SKY_X * SKY_Y * SKY_N * 4)
    for (let i = 0; i < data.length / 4; i++) {
      for (let c = 0; c < 3; c++) data[i * 4 + c] = THREE.DataUtils.toHalfFloat(this.sky[i * 3 + c])
      data[i * 4 + 3] = THREE.DataUtils.toHalfFloat(1)
    }
    this.texture = new THREE.DataTexture(data, SKY_X, SKY_Y * SKY_N, THREE.RGBAFormat, THREE.HalfFloatType)
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter
    this.texture.needsUpdate = true
  }

  get bytes(): number { return SKY_X * SKY_Y * SKY_N * 8 }

  private makeTransmittance(): void {
    const steps = 64
    for (let y = 0; y < TY; y++) {
      const h = TOP * (y / (TY - 1)) ** 2
      const m = horizon(h)
      for (let x = 0; x < TX; x++) {
        const mu = lerp(m, 1, (x / (TX - 1)) ** 2)
        const end = distance(h, mu, TOP, true)
        let r = 0, g = 0, o = 0
        for (let k = 0; k < steps; k++) {
          const at = altitude(h, mu, end * ((k + 0.5) / steps) ** 2)
          const dt = end * (2 * k + 1) / (steps * steps)
          r += rDensity(at) * dt
          g += mDensity(at) * dt
          o += oDensity(at) * dt
        }
        const i = (y * TX + x) * 3
        for (let c = 0; c < 3; c++) this.transmittance[i + c] = Math.exp(-(RAY[c] * r + MIE[c] * g + OZONE[c] * o))
      }
    }
  }

  private transmission(h: number, mu: number, out: RGB): void {
    const m = horizon(h)
    const visible = smoothstep(m - 0.0028, m + 0.0008, mu)
    if (visible <= 0) {
      out[0] = out[1] = out[2] = 0
      return
    }
    read(this.transmittance, TX, TY, Math.sqrt(Math.max(0, (mu - m) / (1 - m))) * (TX - 1), Math.sqrt(h / TOP) * (TY - 1), out)
    out[0] *= visible
    out[1] *= visible
    out[2] *= visible
  }

  private makeMultiple(): void {
    const rayCount = 20
    const steps = 19
    const first = rgb()
    const transfer = rgb()
    const through = rgb()
    const top = rgb()
    const ground = rgb()
    for (let y = 0; y < MY; y++) {
      const h = TOP * (y / (MY - 1)) ** 2 + EYE
      for (let x = 0; x < MX; x++) {
        const sun = Math.sin(lerp(-0.37, Math.PI * 0.5, x / (MX - 1)))
        first.fill(0)
        transfer.fill(0)
        for (let a = 0; a < rayCount; a++) {
          const mu = 2 * (a + 0.5) / rayCount - 1
          const dSun = mu * sun + Math.sqrt((1 - mu * mu) * (1 - sun * sun)) * Math.cos(a * 2.3999632297)
          const groundHit = mu < horizon(h)
          const end = distance(h, mu, groundHit ? 0 : TOP, !groundHit)
          through.fill(1)
          for (let i = 0; i < steps; i++) {
            const t = end * ((i + 0.5) / steps) ** 2
            const at = altitude(h, mu, t)
            const dt = end * (2 * i + 1) / (steps * steps)
            const localSun = ((R + h) * sun + t * dSun) / (R + at)
            this.transmission(at, localSun, top)
            const dr = rDensity(at)
            const dm = mDensity(at)
            const oz = oDensity(at)
            for (let c = 0; c < 3; c++) {
              const s = RAY[c] * dr + MIE[c] * dm * 0.87
              const e = RAY[c] * dr + MIE[c] * dm + OZONE[c] * oz
              const tr = Math.exp(-e * dt)
              const f = through[c] * (1 - tr) / Math.max(1e-12, e)
              first[c] += f * s * top[c] / (4 * Math.PI)
              transfer[c] += f * s
              through[c] *= tr
            }
          }
          if (groundHit) {
            const localSun = ((R + h) * sun + end * dSun) / R
            this.transmission(0, localSun, ground)
            for (let c = 0; c < 3; c++) first[c] += through[c] * 0.12 / Math.PI * Math.max(0, localSun) * ground[c]
          }
        }
        const i = (y * MX + x) * 3
        for (let c = 0; c < 3; c++) this.multiple[i + c] = first[c] / rayCount / Math.max(0.12, 1 - transfer[c] / rayCount)
      }
    }
  }

  private makeSky(): void {
    const steps = 34
    const trans = rgb()
    const multi = rgb()
    const through = rgb()
    const radiance = rgb()
    for (let s = 0; s < SKY_N; s++) {
      const e = sunset(s)
      const muSun = Math.sin(e * RAD)
      const flatSun = Math.cos(e * RAD)
      this.transmission(EYE, Math.sin(Math.max(e, 0.23) * RAD), trans)
      const surfaceSlant = Math.exp(-Math.max(0.0, e) / 3.6)
      for (let c = 0; c < 3; c++) this.directTable[s * 3 + c] = SUN * trans[c] * Math.exp(-LOW_AEROSOL[c] * surfaceSlant) * smoothstep(-0.91, 0.20, e)
      this.transmission(2.1, muSun, trans)
      for (let c = 0; c < 3; c++) this.cloudTable[s * 3 + c] = SUN * trans[c]
      const dusk = smoothstep(-13.8, -2.3, e)
      const remnant = smoothstep(-0.8, -8.6, e)
      const high = smoothstep(-1.2, 19, e)
      const scatterUnit = 1 + 2.82 * smoothstep(7, 56, e)
      for (let y = 0; y < SKY_Y; y++) {
        const mu = (y / (SKY_Y - 1)) ** 2.25
        const flat = Math.sqrt(1 - mu * mu)
        const end = distance(EYE, mu, TOP, true)
        for (let x = 0; x < SKY_X; x++) {
          const az = Math.PI * (x / (SKY_X - 1)) ** 1.72
          const nu = clamp(mu * muSun + flat * flatSun * Math.cos(az), -1, 1)
          const rp = phaseR(nu)
          const mp = phaseM(nu) * (0.43 + 0.30 * high)
          through.fill(1)
          radiance.fill(0)
          for (let i = 0; i < steps; i++) {
            const t = end * ((i + 0.5) / steps) ** 2
            const at = altitude(EYE, mu, t)
            const dt = end * (2 * i + 1) / (steps * steps)
            const localSun = clamp(((R + EYE) * muSun + t * nu) / (R + at), -1, 1)
            this.transmission(at, localSun, trans)
            read(this.multiple, MX, MY, ((Math.asin(localSun) + 0.37) / (Math.PI * 0.5 + 0.37)) * (MX - 1), Math.sqrt(at / TOP) * (MY - 1), multi)
            const dr = rDensity(at)
            const dm = mDensity(at)
            const oz = oDensity(at)
            for (let c = 0; c < 3; c++) {
              const kr = RAY[c] * dr
              const km = MIE[c] * dm
              const ext = kr + km + OZONE[c] * oz
              const tr = Math.exp(-ext * dt)
              const f = through[c] * (1 - tr) / Math.max(1e-12, ext)
              radiance[c] += f * ((kr * rp + 0.87 * km * mp) * trans[c] + (kr + 0.87 * km) * multi[c])
              through[c] *= tr
            }
          }
          const i = ((s * SKY_Y + y) * SKY_X + x) * 3
          const nightRise = 1 + 1.35 * Math.exp(-mu * 12)
          const after = dusk * (1 - high)
          const blue = after * Math.exp(-mu * 2.9) * (0.66 + 0.34 * Math.cos(az / 2) ** 2)
          const dawn = after * Math.exp(-mu * (13.9 + 3.75 * Math.max(0, -e))) * Math.exp(-az * az * (1.5 + 0.64 * Math.max(-e, 0)))
          const belt = after * Math.exp(-(((mu - Math.max(0.045, 0.108 - 0.012 * e)) / 0.065) ** 2)) * Math.sin(az / 2) ** 5
          // The low, lingering part of twilight is advected by the same azimuth
          // as the sunlight. It survives the darkest night without lifting the zenith.
          const rim = remnant * Math.exp(-mu * 27) * (0.09 + 0.91 * Math.exp(-az * az * 8.5))
          const corrective: RGB = [
            0.67 * dawn + 0.085 * belt + 0.012 * blue + 0.034 * rim,
            0.192 * dawn + 0.034 * belt + 0.059 * blue + 0.018 * rim,
            0.078 * dawn + 0.057 * belt + 0.159 * blue + 0.031 * rim,
          ]
          for (let c = 0; c < 3; c++) {
            this.sky[i + c] = radiance[c] * SUN * CAL[c] * scatterUnit + AIRGLOW[c] * nightRise + corrective[c]
          }
        }
      }
    }
  }

  private atSlice(slice: number, up: number, azimuth: number, channel: number): number {
    const x = (azimuth / Math.PI) ** (1 / 1.72) * (SKY_X - 1)
    const y = up ** (1 / 2.25) * (SKY_Y - 1)
    const ix = Math.min(SKY_X - 2, Math.floor(x))
    const iy = Math.min(SKY_Y - 2, Math.floor(y))
    const a = ((slice * SKY_Y + iy) * SKY_X + ix) * 3 + channel
    const b = a + SKY_X * 3
    return lerp(lerp(this.sky[a], this.sky[a + 3], x - ix), lerp(this.sky[b], this.sky[b + 3], x - ix), y - iy)
  }

  skyAt(e: number, up: number, azimuth: number, out: RGB): RGB {
    const s = sunIndex(e)
    const ix = Math.min(SKY_N - 2, Math.floor(s))
    for (let c = 0; c < 3; c++) out[c] = lerp(this.atSlice(ix, up, azimuth, c), this.atSlice(ix + 1, up, azimuth, c), s - ix)
    return out
  }

  sunAt(e: number, out: RGB, elevated = false): RGB {
    const s = sunIndex(e)
    const ix = Math.min(SKY_N - 2, Math.floor(s))
    const table = elevated ? this.cloudTable : this.directTable
    for (let c = 0; c < 3; c++) out[c] = lerp(table[ix * 3 + c], table[(ix + 1) * 3 + c], s - ix)
    return out
  }

  moonAt(e: number, out: RGB): RGB {
    const f = smoothstep(-3.3, -12.4, e)
    out[0] = f * 0.19
    out[1] = f * 0.20
    out[2] = f * 0.23
    return out
  }

  deckAt(e: number, out: RGB): RGB {
    this.skyAt(e, 0.055, Math.PI * 0.7, this.tap)
    const value = lum(this.tap)
    const level = 0.033 + value * 0.13
    out[0] = level * 0.41
    out[1] = level * 0.86
    out[2] = level * 0.97
    return out
  }
}

export const airGlsl = /* glsl */ `
uniform sampler2D tAir;
uniform float uElevation;
uniform vec3 uSun;

vec3 airAt(vec3 d) {
  float si = clamp(uElevation <= 24.0 ? 32.0 + uElevation / 0.75 : 64.0 + (uElevation - 24.0) / 2.75, 0.0, ${SKY_N - 1}.0);
  float r = floor(si);
  vec2 ds = normalize(uSun.xz + vec2(1e-7));
  float da = acos(clamp(dot(normalize(d.xz + vec2(1e-7)), ds), -1.0, 1.0));
  float az = pow(da / ${Math.PI}, ${1 / 1.72});
  float up = pow(max(d.y, 0.0), ${1 / 2.25});
  float y = 0.5 + up * ${SKY_Y - 1}.0 + r * ${SKY_Y}.0;
  vec2 st = vec2((0.5 + az * ${SKY_X - 1}.0) / ${SKY_X}.0, y / ${SKY_Y * SKY_N}.0);
  return mix(texture(tAir, st).rgb, texture(tAir, st + vec2(0.0, ${1 / SKY_N})).rgb, fract(si));
}
`
