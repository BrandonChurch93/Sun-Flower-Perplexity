import * as THREE from 'three'
import { config, frameCount } from '../config.ts'
import type { Assets } from '../core/assets.ts'
import { lerp, smoothstep } from '../core/curves.ts'
import { FullscreenPass } from '../core/fullscreen.ts'
import { shared } from '../core/shading.ts'
import type { RGB } from '../core/world.ts'
import type { Moment, Quality, Sky, SkyLight, View } from '../v2/api.ts'
import { blankMoment, momentAt, shutterSeconds } from '../v2/now.ts'
import { rigAtFilm } from '../v2/rig.ts'
import { Air } from './air.ts'
import { lunarShutter, MOON_SHUTTER, quickMoonFrames } from './moon.ts'
import { STAR_MAP_HEIGHT, STAR_MAP_WIDTH, starMap } from './night/index.ts'
import { CLOUD_SIZE, cloudNoise } from './noise.ts'
import { cloudFragment, displayFragment } from './shader.ts'
import { sunsetAmount, sunsetDuskAt, SunsetMeter, sunsetPhotoAt } from './sunset.ts'

const levels = {
  film: { width: 832, height: 512, steps: 60, light: 6 },
  high: { width: 464, height: 288, steps: 46, light: 4 },
  low: { width: 232, height: 144, steps: 27, light: 3 },
}

const qualities = ['low', 'high', 'film'] as const
const north = new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2)
const rgb = (): RGB => [0, 0, 0]
const RAD = Math.PI / 180
const FROST = [0.82, 0.94, 1.11] as const
const Y = [0.2126, 0.7152, 0.0722] as const
const LOW_COOL = [0.67, 1.08, 1.46] as const
const OPEN_DOME = [0.014, 0.058, 0.108] as const
const EVENING_DOME = [0.61, 1.04, 1.64] as const
const EVENING_GLOW = [0.24, 0.056, 0.011] as const
const WET_SLATE = [0.74, 1.038, 1.39] as const
const WET_BLUE = [0.57, 1.062, 1.65] as const
const luminance = (c: RGB): number => Y[0] * c[0] + Y[1] * c[1] + Y[2] * c[2]
// The wet air redistributes diffuse radiance from the dome to the low sky.
// Both the directional light taps and the drawing use this angular profile.
const wetShape = (up: number): number => 0.32 + 0.85 * Math.exp(-16 * up)
const WET_HORIZON = wetShape(0.023)
const WET_SUNWARD = wetShape(0.027)
const WET_ZENITH = wetShape(1)
const WET_NORM = 0.5 * WET_HORIZON + 0.2 * WET_SUNWARD + 0.3 * WET_ZENITH
const wetHazeAt = (wet: number, e: number): number =>
  0.95 * smoothstep(0.25, 0.38, wet) * (1 - smoothstep(-0.9, 5.8, e))
const wetBlueAt = (e: number): number => 1 - smoothstep(-11, -3, e)
const diffuse = (light: SkyLight): number =>
  (0.5 * luminance(light.band ?? light.horizon) + 0.2 * luminance(light.horizonSun) + 0.3 * luminance(light.zenith)) / WET_NORM
const wetColour = (b: number, c: number): number => lerp(WET_SLATE[c], WET_BLUE[c], b)

function coolDay(e: number, over: number, fog: number, evening: number, burst: number): number {
  return smoothstep(-0.65, 1.7, e) * (1 - smoothstep(13, 21, e)) * (1 - evening) * (1 - over) * (1 - fog) * (1 - burst)
}

function openingAt(bar: number): number {
  return 1 - smoothstep(0.84, 1.27, bar)
}

function lastLightAt(elevation: number, evening: number): number {
  return evening * (1 - smoothstep(0.4, 2.7, elevation))
}

// The high sheets enter gradually over the last lapse and take over on
// the crane. They stay in the air through dusk, night, and dawn.
function eveningStreaksAt(m: Moment): number {
  const b = m.bar
  const short = 0.64 * smoothstep(53, 54.1, b) * (1 - smoothstep(55.7, 57, b))
  const long = smoothstep(65, 65.35, b) * (1 - smoothstep(75, 75.25, b))
  return Math.max(short, long) * (1 - smoothstep(0.10, 0.27, m.dials.overcast))
}

// Under a remaining deck, high sun transmission means a local opening
// persists after the lens burst falls, not that the whole deck goes clear.
function tearAt(overcast: number, through: number, burst: number): number {
  return Math.max(burst, 0.69 * smoothstep(0.18, 0.51, overcast) * smoothstep(0.80, 0.90, through))
}

// Expose clear paths alongside the obscured volume during its opening.
function tearAttack(through: number, burst: number): number {
  return Math.min(burst, through / 0.90) * (1 - smoothstep(0.75, 0.899, through))
}

function atlas(width: number, height: number, mip: boolean): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    minFilter: mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: mip,
    depthBuffer: false,
    stencilBuffer: false,
  })
}

class FieldSky implements Sky {
  private air!: Air
  private sunsetMeter!: SunsetMeter
  private cloud!: FullscreenPass
  private display!: FullscreenPass
  private maps!: Record<Quality, THREE.WebGLRenderTarget>
  private primer!: THREE.WebGLRenderTarget
  private readonly basis = new THREE.Matrix4()
  private readonly turn = new THREE.Matrix4()
  private readonly bore = new THREE.Matrix3()
  private readonly project = new THREE.Matrix3()
  private readonly stellar = new THREE.Matrix3()
  private readonly extent = new THREE.Vector2(0.68, 0.47)
  private readonly sun = new THREE.Vector3(0, 0.4, -0.9165)
  private readonly upper = rgb()
  private readonly lower = rgb()
  private readonly mist = rgb()
  private readonly groundSun = rgb()
  private readonly cloudSun = rgb()
  private readonly sunsetPhoto = rgb()
  private readonly deck = rgb()
  private readonly moon = rgb()
  private readonly lunarVisibility = new Float32Array(frameCount).fill(-1)

  async load(renderer: THREE.WebGLRenderer, _assets: Assets): Promise<void> {
    this.air = new Air()
    this.sunsetMeter = new SunsetMeter()
    const density = cloudNoise()
    const stars = starMap()
    this.maps = {
      film: atlas(levels.film.width, levels.film.height, true),
      high: atlas(levels.high.width, levels.high.height, true),
      low: atlas(levels.low.width, levels.low.height, true),
    }
    this.primer = atlas(16, 16, false)
    this.cloud = new FullscreenPass(cloudFragment, {
      tAir: { value: this.air.texture },
      tCloud: { value: density },
      uBore: { value: this.bore },
      uExtent: { value: this.extent },
      uSun: { value: this.sun },
      uElevation: { value: 24 },
      uRayLight: { value: this.sun.clone() },
      uCloudLight: { value: new THREE.Vector3(3, 2, 1) },
      uUpper: { value: new THREE.Vector3(0.3, 0.6, 1.45) },
      uLower: { value: new THREE.Vector3(1, 1, 1) },
      uDeck: { value: new THREE.Vector3(0.1, 0.12, 0.15) },
      uFlash: { value: this.sun.clone() },
      uWeather: { value: new THREE.Vector4(0.2, 0.0, 1.0, 0.0) },
      uEffects: { value: new THREE.Vector4() },
      uTearAttack: { value: 0 },
      uLunarMeter: { value: 0 },
      uTravel: { value: new THREE.Vector2() },
      uSmear: { value: new THREE.Vector2() },
      uEvolve: { value: 0 },
      uEyeKm: { value: 0.001 },
      uRealSky: { value: 0 },
      uGolden: { value: 0 },
      uLate: { value: 0 },
      uStreaks: { value: 0 },
      uSideBanks: { value: 0 },
      uWetHaze: { value: 0 },
      uWetDome: { value: new THREE.Vector3() },
      uDawn: { value: 0 },
      uOpening: { value: 0 },
      uFirstBlue: { value: 0 },
      uCoolDay: { value: 0 },
      uFinale: { value: 0 },
      uFinaleDusk: { value: 0 },
      uMist: { value: new THREE.Vector3() },
      uSteps: { value: 3 },
      uLightSteps: { value: 2 },
    })
    this.display = new FullscreenPass(displayFragment, {
      ...shared,
      tSky: { value: this.maps.high.texture },
      tStars: { value: stars },
      uCamWorld: { value: new THREE.Matrix4() },
      uProject: { value: this.project },
      uStellar: { value: this.stellar },
      uExtent: { value: this.extent },
      uMapSize: { value: new THREE.Vector2(levels.high.width, levels.high.height) },
      uRay: { value: new THREE.Vector4(0.6, 0.35, 0, 0) },
      uPixelAngle: { value: 0.001 },
      uElevation: { value: 25 },
      uNight: { value: 0 },
      uLunarNight: { value: 0 },
      uFrostFog: { value: 0 },
      uFrostPhoto: { value: new THREE.Vector3() },
      uRainFog: { value: 0 },
      uBreak: { value: 0 },
      uSolarDeck: { value: 0 },
      uEnding: { value: 0 },
      uPhotoMix: { value: 0 },
      uFinaleDusk: { value: 0 },
      uMarchFilter: { value: 0 },
      uSunFace: { value: this.sun.clone() },
      uMoon: { value: new THREE.Vector3(0, 0.6, -0.8) },
      uDisc: { value: new THREE.Vector3() },
      uMoonDisc: { value: new THREE.Vector3() },
      uLunarVisibility: { value: -1 },
    })
    const old = renderer.getRenderTarget()
    renderer.initTexture(this.air.texture)
    renderer.initTexture(density)
    renderer.initTexture(stars)
    for (const quality of qualities) renderer.initRenderTarget(this.maps[quality])
    renderer.initRenderTarget(this.primer)
    renderer.setRenderTarget(old)
    this.prime(renderer)
    this.bakeLunarVisibility(renderer)
  }

  // Both programs, the screen triangle and the atlas mip chains already
  // exist when load resolves, even for a caller that skips film warm-up.
  warm(_renderer: THREE.WebGLRenderer): void {}

  private prime(renderer: THREE.WebGLRenderer): void {
    const old = renderer.getRenderTarget()
    const u = this.cloud.uniforms
    u.uSteps.value = 3
    u.uLightSteps.value = 2
    for (const quality of qualities) this.cloud.render(renderer, this.maps[quality])
    this.display.render(renderer, this.primer)
    renderer.setRenderTarget(old)
  }

  private bakeLunarVisibility(renderer: THREE.WebGLRenderer): void {
    // This readback is solely a photographic mask for the small disc.
    // The scene's light and exposure never refer to it or to any GPU data.
    const old = renderer.getRenderTarget()
    const size = 5
    const sample = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false, stencilBuffer: false })
    const bytes = new Uint8Array(size * size * 4)
    const now = blankMoment()
    const later = blankMoment()
    const light: SkyLight = { direct: rgb(), horizon: rgb(), horizonSun: rgb(), zenith: rgb() }
    const fps = config.film.fps
    const elevation = new Float32Array(frameCount)
    const raw = new Float32Array(frameCount)
    const right = new THREE.Vector3().crossVectors(now.moon, new THREE.Vector3(0, 1, 0)).normalize()
    const up = new THREE.Vector3().crossVectors(right, now.moon)
    this.bore.setFromMatrix4(this.basis.makeBasis(right, up, now.moon))
    this.extent.set(0.008, 0.008)
    for (let f = 0; f < frameCount; f++) elevation[f] = momentAt(f / fps, now).sunElevationDeg
    const u = this.cloud.uniforms
    u.uLunarMeter.value = 1
    try {
      for (const [first, last] of quickMoonFrames(elevation, fps)) {
        for (let f = Math.max(0, first - MOON_SHUTTER); f <= Math.min(frameCount - 1, last + MOON_SHUTTER); f++) {
          momentAt(f / fps, now)
          momentAt(f / fps + shutterSeconds, later)
          this.setCloud(now, later, rigAtFilm(now.t).heightM, this.light(now, light), (now.sunElevationDeg + later.sunElevationDeg) * 0.5, levels.film)
          this.cloud.render(renderer, sample)
          renderer.readRenderTargetPixels(sample, 0, 0, size, size, bytes)
          let total = 0
          let count = 0
          for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            if ((x - 2) ** 2 + (y - 2) ** 2 > 4) continue
            total += bytes[4 * (y * size + x)]
            count++
          }
          raw[f] = total / (255 * count)
        }
        lunarShutter(raw, this.lunarVisibility, first, last)
      }
    } finally {
      u.uLunarMeter.value = 0
      renderer.setRenderTarget(old)
      sample.dispose()
    }
  }

  light(m: Moment, out: SkyLight): SkyLight {
    const e = m.sunElevationDeg
    const d = m.dials
    const wetHaze = wetHazeAt(d.wet, e)
    const moonClarity = 1 - 0.76 * wetHaze
    this.air.sunAt(e, this.groundSun)
    this.air.moonAt(e, this.moon)
    this.air.skyAt(e, 1, Math.PI * 0.5, out.zenith)
    this.air.skyAt(e, 0.023, Math.PI * 0.79, out.horizon)
    this.air.skyAt(e, 0.027, 0, out.horizonSun)
    this.air.deckAt(e, this.deck)
    const over = d.overcast
    const blend = smoothstep(0.40, 1, over)
    const sheets = eveningStreaksAt(m)
    const fair = 0.21 * d.cover * (1 - blend) * (1 - 0.82 * sheets)
    const cold = smoothstep(0.25, 0.84, d.fog)
    const burst = tearAt(over, d.sunThrough, d.burst)
    const exposed = tearAttack(d.sunThrough, d.burst)
    const lunar = m.moon.y * 0.018
    const mistLevel = 0.59 * (out.horizonSun[0] * Y[0] + out.horizonSun[1] * Y[1] + out.horizonSun[2] * Y[2])
    const lowCool = coolDay(e, over, d.fog, d.evening, burst)
    const first = openingAt(m.bar)
    const last = sunsetAmount(m.bar)
    const sheetCool = sheets * (1 - last)
    const reflected = sheetCool * (1 - smoothstep(-3.1, -0.20, e))
      * Math.exp(-((0.027 * 37) ** 2) - 21 * (1 - Math.cos(Math.asin(0.027) - e * RAD)))
    const zLum = Y[0] * out.zenith[0] + Y[1] * out.zenith[1] + Y[2] * out.zenith[2]
    const hLum = Y[0] * out.horizon[0] + Y[1] * out.horizon[1] + Y[2] * out.horizon[2]
    const band = out.band ??= rgb()
    for (let c = 0; c < 3; c++) {
      out.direct[c] = this.groundSun[c] + this.moon[c] * moonClarity
      const z = out.zenith[c] + lunar * this.moon[c] * moonClarity
      const h = out.horizon[c] + lunar * this.moon[c] * 2.1 * moonClarity
      const s = out.horizonSun[c]
      const tint = this.deck[c]
      const cap = lerp(z * 0.88 + 0.11 * h, tint * 0.90, blend)
      const far = lerp(h * 0.96 + 0.08 * z, tint * (3.15 + (1 - d.rain) * 0.24), blend)
      const facing = lerp(s * 0.94 + h * 0.11, tint * 4.45 + burst * 0.46 * s, blend)
      out.zenith[c] = lerp(lerp(z, cap, blend + fair), mistLevel * FROST[c] * 0.91, cold * 0.64)
      out.horizon[c] = lerp(lerp(h, far, blend + fair * 0.5), mistLevel * FROST[c] * 0.88, cold * 0.60)
      out.horizonSun[c] = lerp(lerp(s, facing, blend * (1 - 0.45 * burst)), mistLevel * (c === 0 ? 1.39 : c === 1 ? 1.19 : 1.07), cold * 0.76)
      // Only the sun-facing sector sees this extra clear air and warm edge.
      out.horizonSun[c] += exposed * blend * (0.043 * s + 0.014 * this.groundSun[c])
      out.zenith[c] = lerp(out.zenith[c], zLum * LOW_COOL[c] * 1.12, 0.54 * lowCool)
      out.horizon[c] = lerp(out.horizon[c], hLum * LOW_COOL[c] * 1.16, 0.65 * lowCool)
      out.zenith[c] = lerp(out.zenith[c], zLum * EVENING_DOME[c], 0.57 * sheetCool)
      out.horizon[c] = lerp(out.horizon[c], hLum * EVENING_DOME[c], 0.20 * sheetCool)
      out.horizonSun[c] += EVENING_GLOW[c] * reflected
      out.zenith[c] = lerp(out.zenith[c], OPEN_DOME[c] * 0.56, first)
      out.horizon[c] = lerp(out.horizon[c], OPEN_DOME[c] * 1.7, first)
      out.horizonSun[c] = lerp(out.horizonSun[c], OPEN_DOME[c] * (c === 0 ? 3.0 : 1.95), 0.75 * first)
      band[c] = out.horizon[c]
    }
    if (last > 0) this.sunsetMeter.blend(sunsetDuskAt(e), last, out, band)
    if (wetHaze > 0) {
      const b = wetBlueAt(e)
      const energy = diffuse(out) / (
        Y[0] * wetColour(b, 0) + Y[1] * wetColour(b, 1) + Y[2] * wetColour(b, 2)
      )
      for (let c = 0; c < 3; c++) {
        const haze = energy * wetColour(b, c)
        out.zenith[c] = lerp(out.zenith[c], haze * WET_ZENITH, wetHaze)
        out.horizon[c] = lerp(out.horizon[c], haze * WET_HORIZON, wetHaze)
        out.horizonSun[c] = lerp(out.horizonSun[c], haze * WET_SUNWARD, wetHaze)
        band[c] = lerp(band[c], haze * WET_HORIZON, wetHaze)
      }
    }
    return out
  }

  // The photographed centre at mid-shutter, including refraction. The
  // lens calls this independently of prepare(); the key light stays geometric.
  face(now: Moment, later: Moment, out: THREE.Vector3): THREE.Vector3 {
    const e = (now.sunElevationDeg + later.sunElevationDeg) * 0.5
    const ending = lastLightAt(e, now.dials.evening)
    const lift = (0.33 + 0.64 * ending) * smoothstep(-1.7, -0.6, e) * (1 - smoothstep(-0.6, 3.8, e))
    out.copy(now.sun).lerp(later.sun, 0.5).normalize()
    // The last clock marks already place the seen sun against the ridge.
    // Ease out the generic low-sun refraction during that handoff.
    out.y += RAD * lift * (1 - sunsetAmount(now.bar))
    return out.normalize()
  }

  private setCloud(now: Moment, later: Moment, eyeM: number, light: SkyLight, e: number, level: typeof levels.film): void {
    const d = now.dials
    const wetHaze = wetHazeAt(d.wet, e)
    const moonClarity = 1 - 0.76 * wetHaze
    const tear = tearAt(d.overcast, d.sunThrough, d.burst)
    this.sun.copy(now.sun).lerp(later.sun, 0.5).normalize()
    this.air.skyAt(e, 1, Math.PI * 0.5, this.upper)
    this.air.skyAt(e, 0.03, Math.PI * 0.67, this.lower)
    this.air.skyAt(e, 0.027, 0, this.mist)
    const mistLevel = 0.59 * (this.mist[0] * Y[0] + this.mist[1] * Y[1] + this.mist[2] * Y[2])
    this.air.sunAt(e, this.groundSun)
    this.air.sunAt(e, this.cloudSun, true)
    this.air.moonAt(e, this.moon)
    this.air.deckAt(e, this.deck)
    const ending = lastLightAt(e, d.evening)
    const dawn = (1 - smoothstep(0.22, 0.68, d.lapse)) * (1 - d.evening) * (1 - d.overcast) * (1 - d.fog)
      * smoothstep(-3.2, 0.7, e) * (1 - smoothstep(2.9, 10.5, e))
    const u = this.cloud.uniforms
    u.uElevation.value = e
    u.uEyeKm.value = 0.001 * eyeM
    u.uRayLight.value.copy(this.sun)
    u.uRayLight.value.y = Math.max(-0.024, this.sun.y)
    u.uRayLight.value.normalize()
    u.uCloudLight.value.fromArray(this.cloudSun)
    u.uCloudLight.value.x += this.moon[0] * 0.18 * moonClarity
    u.uCloudLight.value.y += this.moon[1] * 0.18 * moonClarity
    u.uCloudLight.value.z += this.moon[2] * 0.18 * moonClarity
    u.uUpper.value.fromArray(this.upper)
    u.uLower.value.fromArray(this.lower)
    u.uDeck.value.fromArray(this.deck)
    u.uFlash.value.copy(now.flashAt)
    // The dials open a local tear before the rest of the front moves off.
    const deckShape = d.overcast + 0.81 * tear * (1 - d.overcast)
    u.uWeather.value.set(d.cover, deckShape, d.sunThrough, d.fog)
    u.uEffects.value.set(d.evening, d.rain, d.flash, tear)
    u.uTearAttack.value = tearAttack(d.sunThrough, d.burst)
    u.uGolden.value = d.evening * smoothstep(-0.015, 0.035, this.sun.y) * (1 - smoothstep(0.15, 0.26, this.sun.y))
    u.uLate.value = ending * smoothstep(-10.0, -3.9, e)
    u.uStreaks.value = eveningStreaksAt(now)
    u.uSideBanks.value = smoothstep(66.35, 67, now.bar) * (1 - smoothstep(71, 71.85, now.bar))
    u.uWetHaze.value = wetHaze
    if (wetHaze > 0) {
      const b = wetBlueAt(e)
      const tint = u.uWetDome.value.set(wetColour(b, 0), wetColour(b, 1), wetColour(b, 2))
      tint.multiplyScalar(diffuse(light) / (Y[0] * tint.x + Y[1] * tint.y + Y[2] * tint.z))
    }
    u.uDawn.value = dawn
    u.uOpening.value = 1 - smoothstep(1.34, 1.92, now.t)
    u.uFirstBlue.value = openingAt(now.bar)
    u.uCoolDay.value = coolDay(e, d.overcast, d.fog, d.evening, d.burst)
    u.uFinale.value = sunsetAmount(now.bar)
    u.uFinaleDusk.value = sunsetDuskAt(e)
    u.uMist.value.set(mistLevel * FROST[0], mistLevel * FROST[1], mistLevel * FROST[2])
    u.uTravel.value.set((now.cloud.shiftX + later.cloud.shiftX) * 0.5, (now.cloud.shiftZ + later.cloud.shiftZ) * 0.5)
    u.uSmear.value.set(later.cloud.shiftX - now.cloud.shiftX, later.cloud.shiftZ - now.cloud.shiftZ)
    u.uEvolve.value = 0.5 * (now.cloud.evolve + later.cloud.evolve)
    u.uRealSky.value = 0.5 * (now.t + later.t)
    u.uSteps.value = level.steps
    u.uLightSteps.value = level.light
  }

  prepare(renderer: THREE.WebGLRenderer, now: Moment, later: Moment, view: View): void {
    const old = renderer.getRenderTarget()
    const pose = view.pose
    const e = (now.sunElevationDeg + later.sunElevationDeg) * 0.5
    const d = now.dials
    const moonClarity = 1 - 0.76 * wetHazeAt(d.wet, e)
    const tear = tearAt(d.overcast, d.sunThrough, d.burst)
    const target = this.maps[view.quality]
    const level = levels[view.quality]
    this.bore.setFromMatrix4(this.basis.makeBasis(pose.right, pose.up, pose.forward))
    this.project.copy(this.bore).transpose()
    const tanX = config.camera.gateWidthMm / (2 * pose.focalMm)
    const tanY = tanX * view.height / view.width
    this.extent.set(Math.max(tanX * 1.23, tanX + 0.12), Math.max(tanY * 1.23, tanY + 0.12))
    this.setCloud(now, later, pose.position.y, view.light, e, level)
    this.cloud.render(renderer, target)
    renderer.setRenderTarget(old)
    const u = this.cloud.uniforms
    const night = smoothstep(-2.6, -12.6, e)
    const ending = lastLightAt(e, d.evening)
    const v = this.display.uniforms
    v.tSky.value = target.texture
    v.uMapSize.value.set(level.width, level.height)
    v.uElevation.value = e
    // Stars need clear air as well as a hole in the cloud. Residual storm
    // moisture lingers after the rain dial falls, and dims point sources
    // and the galaxy without relaxing the cloud transmission mask.
    const starClarity = 1 - 0.985 * smoothstep(0.24, 0.45, d.wet)
    v.uNight.value = Math.max(night, 0.20 * u.uFirstBlue.value * (1 - smoothstep(-5, -3, e))) * starClarity
    v.uLunarNight.value = night
    v.uFrostFog.value = d.fog
    // Only the close glass resolves the scattered sun as a separate soft
    // image in the mist. Select it optically, not by film time or shot ID.
    const close = smoothstep(76, 92, pose.focalMm) * (1 - smoothstep(0.265, 0.40, pose.focusM))
    const mistPhoto = close * smoothstep(0.15, 0.35, d.fog) * (1 - smoothstep(0.25, 0.55, d.overcast))
    const thinning = smoothstep(0.20, 0.88, d.sunThrough)
    const pale = u.uMist.value
    v.uFrostPhoto.value.set(mistPhoto, thinning, Y[0] * pale.x + Y[1] * pale.y + Y[2] * pale.z)
    v.uRainFog.value = d.rain * d.overcast
    v.uBreak.value = tear
    v.uSolarDeck.value = smoothstep(0.26, 0.49, d.overcast)
    v.uEnding.value = ending
    const finale = sunsetAmount(now.bar)
    v.uPhotoMix.value = finale
    v.uFinaleDusk.value = u.uFinaleDusk.value
    const darkDeck = smoothstep(0.42, 0.84, d.overcast) * (1 - d.flash) * (1 - tear)
    v.uMarchFilter.value = (view.quality === 'film' ? 0.42 + 0.42 * d.overcast : 0.20 + 0.33 * d.overcast)
      + 0.46 * darkDeck
    this.face(now, later, v.uSunFace.value)
    v.uMoon.value.copy(now.moon)
    v.uMoonDisc.value.fromArray(this.moon).multiplyScalar(2.3 * moonClarity)
    v.uLunarVisibility.value = this.lunarVisibility[now.frame] ?? -1
    const visibleDisk = smoothstep(0, 0.025, d.sunThrough)
    const glancing = ending * smoothstep(-0.79, -0.23, e) * (1 - smoothstep(0.2, 1.4, e))
    const disc = v.uDisc.value.fromArray(this.groundSun).multiplyScalar(49 * (1 - 0.44 * d.fog) * visibleDisk)
    const peach = (0.35 * u.uDawn.value + 0.40 * d.evening + 0.58 * d.fog) * disc.x
    disc.y += peach * 0.44 + 4.2 * glancing
    disc.z += peach * 0.18 + 0.70 * glancing
    disc.x += 13.5 * glancing
    if (finale > 0) {
      // Radiance before grade, not a display swatch. Decouple it from
      // the dim horizon so the glass receives a real over-white source.
      const photo = sunsetPhotoAt(v.uFinaleDusk.value, visibleDisk, this.sunsetPhoto)
      disc.set(
        lerp(disc.x, photo[0], finale),
        lerp(disc.y, photo[1], finale),
        lerp(disc.z, photo[2], finale),
      )
    }
    this.stellar.setFromMatrix4(this.turn.makeRotationAxis(north, -now.starTurn - 0.18))
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, camera: THREE.PerspectiveCamera, pixelX: number, pixelY: number, width: number, height: number): void {
    const u = this.display.uniforms
    const e = camera.projectionMatrix.elements
    u.uCamWorld.value.copy(camera.matrixWorld)
    u.uRay.value.set(1 / e[0], 1 / e[5], 2 * pixelX / width, 2 * pixelY / height)
    u.uPixelAngle.value = 2 / (e[0] * width)
    this.display.render(renderer, target)
  }

  megabytes(): number {
    const area = qualities.reduce((n, q) => n + levels[q].width * levels[q].height, 0)
    return (this.air.bytes + CLOUD_SIZE ** 3 * 4 + STAR_MAP_WIDTH * STAR_MAP_HEIGHT * 4 + area * 8 * 4 / 3 + 16 * 16 * 8) / (1024 * 1024)
  }
}

export function make(): Sky {
  return new FieldSky()
}
