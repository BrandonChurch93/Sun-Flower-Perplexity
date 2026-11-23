import { lerp, smoothstep } from '../core/curves.ts'
import type { RGB } from '../core/world.ts'
import type { SkyLight } from '../v2/api.ts'

export const sunsetAmount = (bar: number): number => smoothstep(65, 67, bar)
// The last sun sets behind the ridge, while it is still above the
// mathematical horizon. Deep evening is lit by that lower sun.
export const sunsetDuskAt = (elevation: number): number => 1 - smoothstep(0.95, 2.04, elevation)

export function sunsetPhotoAt(dusk: number, transmission: number, out: RGB): RGB {
  // The low air takes green and blue out of the photosphere, while its
  // red channel stays over white. This is radiance for the lens, not a
  // display swatch; the diffuse air has its own angular colours.
  const ember = smoothstep(0.56, 0.94, dusk)
  const red = lerp(2.8, 1.60, dusk) * transmission
  out[0] = red
  out[1] = red * lerp(lerp(0.80, 0.15, dusk), 0.038, ember)
  out[2] = red * lerp(lerp(0.42, 0.019, dusk), 0.002, ember)
  return out
}

// Let skylight, the thin aerosol layer and its higher rose seam have
// different scales. The light taps sample exactly this same angular model.
const DEEP = [0.010, 0.026, 0.038] as const
const BLUE = [0.0025, 0.011, 0.029] as const
const LOW = [0.045, 0.064, 0.069] as const
const COOL = [0.016, 0.037, 0.062] as const
const ATTENUATED = [0.78, 0.10, 0.06] as const
const GOLD = [0.37, 0.166, 0.057] as const
const EMBER = [0.172, 0.018, 0.005] as const
const HAZE = [0.179, 0.109, 0.052] as const
const AUBURN = [0.072, 0.0075, 0.0017] as const
const GLOW = [0.215, 0.021, 0.0026] as const
const PEACH = [0.067, 0.041, 0.032] as const
const ROSE = [0.058, 0.024, 0.037] as const

export function sunsetSkyAt(up: number, cosAzimuth: number, dusk: number, out: RGB): RGB {
  const az = 1 - cosAzimuth
  const towards = Math.exp(-32 * az)
  const width = lerp(0.037 + 0.033 * towards, 0.017 + 0.024 * towards, dusk)
  const band = (0.04 + 0.96 * towards) * Math.exp(-((up / width) ** 2))
  const hazeY = lerp(0.032, 0.018, dusk)
  const hazeW = lerp(0.112, 0.048, dusk)
  const haze = Math.exp(-69 * az - ((up - hazeY) / hazeW) ** 2)
  // A warm aerosol lobe remains on the solar bearing as the belt cools.
  // It has already dropped to about a third at five degrees either side.
  const glow = dusk * Math.exp(-274 * az - ((up - 0.020) / 0.051) ** 2)
  const seamY = lerp(0.058, 0.043, dusk) + 0.008 * towards
  const seamW = lerp(0.031, 0.025, dusk)
  const rose = (0.25 + 0.75 * Math.exp(-8 * az)) * (1 - 0.82 * dusk * Math.exp(-46 * az))
    * Math.exp(-(((up - seamY) / seamW) ** 2))
  const lift = Math.exp(-9.7 * up)
  // The longest, warmest paths screen the blue fill in the belt,
  // without taking the rose edge off the clouds or darkening the dome.
  const path = dusk * Math.exp(-29 * az - (up / 0.063) ** 2)
  for (let c = 0; c < 3; c++) {
    const dome = lerp(lerp(DEEP[c], BLUE[c], dusk), lerp(LOW[c], COOL[c], dusk), lift)
      * lerp(1, ATTENUATED[c], path)
    out[c] = dome + lerp(GOLD[c], EMBER[c], dusk) * band + lerp(HAZE[c], AUBURN[c], dusk) * haze
      + GLOW[c] * glow + lerp(PEACH[c], ROSE[c], dusk) * rose
  }
  return out
}

const METER_STEPS = 512
const COMPASS_SAMPLES = 64
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
vec3 sunsetSkyAt(float up, float cosAzimuth, float dusk) {
  float az = 1.0 - cosAzimuth;
  float towards = exp(-32.0 * az);
  float width = mix(0.037 + 0.033 * towards, 0.017 + 0.024 * towards, dusk);
  float band = (0.04 + 0.96 * towards) * exp(-squared(up / width));
  float hazeY = mix(0.032, 0.018, dusk);
  float hazeW = mix(0.112, 0.048, dusk);
  float haze = exp(-69.0 * az - squared((up - hazeY) / hazeW));
  float glow = dusk * exp(-274.0 * az - squared((up - 0.020) / 0.051));
  float seamY = mix(0.058, 0.043, dusk) + 0.008 * towards;
  float seamW = mix(0.031, 0.025, dusk);
  float rose = (0.25 + 0.75 * exp(-8.0 * az)) * (1.0 - 0.82 * dusk * exp(-46.0 * az))
    * exp(-squared((up - seamY) / seamW));
  float path = dusk * exp(-29.0 * az - squared(up / 0.063));
  vec3 dome = mix(mix(${gl(DEEP)}, ${gl(BLUE)}, dusk), mix(${gl(LOW)}, ${gl(COOL)}, dusk), exp(-9.7 * up))
    * mix(vec3(1.0), ${gl(ATTENUATED)}, path);
  return dome + mix(${gl(GOLD)}, ${gl(EMBER)}, dusk) * band + mix(${gl(HAZE)}, ${gl(AUBURN)}, dusk) * haze
    + ${gl(GLOW)} * glow + mix(${gl(PEACH)}, ${gl(ROSE)}, dusk) * rose;
}
`
