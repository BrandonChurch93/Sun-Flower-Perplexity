import { lerp, smoothstep } from '../core/curves.ts'
import type { RGB } from '../core/world.ts'
import type { SkyLight } from '../v2/api.ts'

export const sunsetAmount = (bar: number): number => smoothstep(65, 67, bar)
export const afterSunset = (elevation: number): number => 1 - smoothstep(-3.4, 0.23, elevation)

// Let skylight, the thin aerosol layer and its higher rose seam have
// different scales. The light taps sample exactly this same angular model.
const DEEP = [0.0038, 0.018, 0.042] as const
const LOW = [0.018, 0.055, 0.110] as const
const LOW_FILTER = [0.83, 0.68, 0.40] as const
const DUSK = [0.53, 0.67, 0.75] as const
const ORANGE = [0.47, 0.072, 0.013] as const
const EMBER = [0.255, 0.035, 0.006] as const
const ROSE = [0.074, 0.023, 0.034] as const

export function sunsetSkyAt(up: number, cosAzimuth: number, after: number, out: RGB): RGB {
  const az = 1 - cosAzimuth
  const towards = Math.exp(-5.4 * az)
  const width = lerp(0.037 + 0.025 * towards, 0.027 + 0.017 * towards, after)
  const warm = Math.exp(-((up / width) ** 2))
  const band = (0.22 + 0.78 * towards) * warm
  const seamY = lerp(0.046 + 0.019 * towards, 0.034 + 0.014 * towards, after)
  const seamW = lerp(0.023, 0.020, after)
  const rose = (0.38 + 0.62 * towards) * Math.exp(-(((up - seamY) / seamW) ** 2))
  const opposing = (az * 0.5) ** 3 * Math.exp(-(((up - 0.13) / 0.051) ** 2)) * (0.24 + 0.58 * after)
  const lift = Math.exp(-8.6 * up)
  for (let c = 0; c < 3; c++) {
    const dome = lerp(DEEP[c], LOW[c], lift) * lerp(1, LOW_FILTER[c], warm) * lerp(1, DUSK[c], after)
    out[c] = dome + lerp(ORANGE[c], EMBER[c], after) * band + ROSE[c] * (rose + opposing)
  }
  return out
}

const METER_STEPS = 128
const COMPASS_SAMPLES = 32
const TAP_UP = [1, 0.10, 0.027, 0.023] as const
const TAP_AZ = [0, 0, 1, Math.cos(Math.PI * 0.79)] as const
const TAPS = ['zenith', 'horizon', 'horizonSun', 'band'] as const
const STRIDE = TAPS.length * 3

export class SunsetMeter {
  private readonly levels = new Float32Array((METER_STEPS + 1) * STRIDE)

  constructor() {
    const sample: RGB = [0, 0, 0]
    const compass: RGB = [0, 0, 0]
    const azimuth = Array.from({ length: COMPASS_SAMPLES }, (_, i) => Math.cos(i * 2 * Math.PI / COMPASS_SAMPLES))
    for (let i = 0; i <= METER_STEPS; i++) {
      for (let j = 0; j < TAPS.length; j++) {
        const offset = i * STRIDE + j * 3
        if (TAPS[j] === 'horizon') {
          // Air and upright faces see the whole compass above the orange
          // band. The exposure meter still sees the narrow band itself.
          compass.fill(0)
          for (const az of azimuth) {
            sunsetSkyAt(TAP_UP[j], az, i / METER_STEPS, sample)
            for (let c = 0; c < 3; c++) compass[c] += sample[c] / COMPASS_SAMPLES
          }
          this.levels.set(compass, offset)
        } else {
          sunsetSkyAt(TAP_UP[j], TAP_AZ[j], i / METER_STEPS, sample)
          this.levels.set(sample, offset)
        }
      }
    }
  }

  blend(after: number, amount: number, out: SkyLight, band: RGB): void {
    const step = after * METER_STEPS
    const i = Math.min(METER_STEPS - 1, Math.floor(step))
    for (let j = 0; j < TAPS.length; j++) {
      const tap = TAPS[j]
      const into = tap === 'band' ? band : out[tap]
      for (let c = 0; c < 3; c++) {
        const k = i * STRIDE + j * 3 + c
        into[c] = lerp(into[c], lerp(this.levels[k], this.levels[k + STRIDE], step - i), amount)
      }
    }
  }
}

const gl = (v: readonly number[]) => `vec3(${v.join(', ')})`
export const sunsetGlsl = /* glsl */ `
vec3 sunsetSkyAt(float up, float cosAzimuth, float after) {
  float az = 1.0 - cosAzimuth;
  float towards = exp(-5.4 * az);
  float width = mix(0.037 + 0.025 * towards, 0.027 + 0.017 * towards, after);
  float warm = exp(-squared(up / width));
  float band = (0.22 + 0.78 * towards) * warm;
  float seamY = mix(0.046 + 0.019 * towards, 0.034 + 0.014 * towards, after);
  float seamW = mix(0.023, 0.020, after);
  float rose = (0.38 + 0.62 * towards) * exp(-squared((up - seamY) / seamW));
  float opposing = pow(az * 0.5, 3.0) * exp(-squared((up - 0.13) / 0.051)) * (0.24 + 0.58 * after);
  vec3 dome = mix(${gl(DEEP)}, ${gl(LOW)}, exp(-8.6 * up)) * mix(vec3(1.0), ${gl(LOW_FILTER)}, warm) * mix(vec3(1.0), ${gl(DUSK)}, after);
  return dome + mix(${gl(ORANGE)}, ${gl(EMBER)}, after) * band + ${gl(ROSE)} * (rose + opposing);
}
`
