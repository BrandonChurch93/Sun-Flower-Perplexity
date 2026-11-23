import * as THREE from 'three'
import { config } from '../config.ts'
import type { Assets } from '../core/assets.ts'
import { lerp, smoothstep } from '../core/curves.ts'
import { FullscreenPass } from '../core/fullscreen.ts'
import { shared } from '../core/shading.ts'
import type { RGB } from '../core/world.ts'
import type { Moment, Quality, Sky, SkyLight, View } from '../v2/api.ts'
import { Air } from './air.ts'
import { CLOUD_SIZE, STAR_HEIGHT, STAR_WIDTH, cloudNoise, starMap } from './noise.ts'
import { cloudFragment, displayFragment } from './shader.ts'

const levels = {
  film: { width: 832, height: 512, steps: 60, light: 6 },
  high: { width: 464, height: 288, steps: 46, light: 4 },
  low: { width: 232, height: 144, steps: 27, light: 3 },
}

const qualities = ['low', 'high', 'film'] as const
const north = new THREE.Vector3(0, Math.SQRT1_2, Math.SQRT1_2)
const rgb = (): RGB => [0, 0, 0]
const RAD = Math.PI / 180

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
  private readonly groundSun = rgb()
  private readonly cloudSun = rgb()
  private readonly deck = rgb()
  private readonly moon = rgb()

  async load(renderer: THREE.WebGLRenderer, _assets: Assets): Promise<void> {
    this.air = new Air()
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
      uTravel: { value: new THREE.Vector2() },
      uSmear: { value: new THREE.Vector2() },
      uEvolve: { value: 0 },
      uEyeKm: { value: 0.001 },
      uRealSky: { value: 0 },
      uGolden: { value: 0 },
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
      uFrostFog: { value: 0 },
      uRainFog: { value: 0 },
      uBreak: { value: 0 },
      uMarchFilter: { value: 0 },
      uSunFace: { value: this.sun.clone() },
      uMoon: { value: new THREE.Vector3(0, 0.6, -0.8) },
      uDisc: { value: new THREE.Vector3() },
      uMoonDisc: { value: new THREE.Vector3() },
    })
    const old = renderer.getRenderTarget()
    renderer.initTexture(this.air.texture)
    renderer.initTexture(density)
    renderer.initTexture(stars)
    for (const quality of qualities) renderer.initRenderTarget(this.maps[quality])
    renderer.initRenderTarget(this.primer)
    renderer.setRenderTarget(old)
  }

  warm(renderer: THREE.WebGLRenderer): void {
    const old = renderer.getRenderTarget()
    const u = this.cloud.uniforms
    u.uSteps.value = 3
    u.uLightSteps.value = 2
    for (const quality of qualities) this.cloud.render(renderer, this.maps[quality])
    this.display.render(renderer, this.primer)
    renderer.setRenderTarget(old)
  }

  light(m: Moment, out: SkyLight): SkyLight {
    const e = m.sunElevationDeg
    const d = m.dials
    this.air.sunAt(e, this.groundSun)
    this.air.moonAt(e, this.moon)
    this.air.skyAt(e, 1, Math.PI * 0.5, out.zenith)
    this.air.skyAt(e, 0.023, Math.PI * 0.79, out.horizon)
    this.air.skyAt(e, 0.027, 0, out.horizonSun)
    this.air.deckAt(e, this.deck)
    const over = d.overcast
    const blend = smoothstep(0.40, 1, over)
    const fair = 0.21 * d.cover * (1 - blend)
    const cold = smoothstep(0.25, 0.84, d.fog)
    const burst = d.burst
    const lunar = m.moon.y * 0.018
    for (let c = 0; c < 3; c++) {
      out.direct[c] = this.groundSun[c] + this.moon[c]
      const z = out.zenith[c] + lunar * this.moon[c]
      const h = out.horizon[c] + lunar * this.moon[c] * 2.1
      const s = out.horizonSun[c]
      const tint = this.deck[c]
      const cap = lerp(z * 0.88 + 0.11 * h, tint * 0.90, blend)
      const far = lerp(h * 0.96 + 0.08 * z, tint * (3.15 + (1 - d.rain) * 0.24), blend)
      const facing = lerp(s * 0.94 + h * 0.11, tint * 4.45 + burst * 0.46 * s, blend)
      out.zenith[c] = lerp(lerp(z, cap, blend + fair), z * 0.53 + h * 0.47, cold * 0.61)
      out.horizon[c] = lerp(lerp(h, far, blend + fair * 0.5), z * 0.33 + h * 0.67, cold * 0.63)
      out.horizonSun[c] = lerp(lerp(s, facing, blend * (1 - 0.45 * burst)), z * 0.29 + h * 0.44 + s * 0.27, cold * 0.76)
    }
    return out
  }

  prepare(renderer: THREE.WebGLRenderer, now: Moment, later: Moment, view: View): void {
    const old = renderer.getRenderTarget()
    const pose = view.pose
    const e = (now.sunElevationDeg + later.sunElevationDeg) * 0.5
    const d = now.dials
    const target = this.maps[view.quality]
    const level = levels[view.quality]
    this.sun.copy(now.sun).lerp(later.sun, 0.5).normalize()
    this.bore.setFromMatrix4(this.basis.makeBasis(pose.right, pose.up, pose.forward))
    this.project.copy(this.bore).transpose()
    const tanX = config.camera.gateWidthMm / (2 * pose.focalMm)
    const tanY = tanX * view.height / view.width
    this.extent.set(Math.max(tanX * 1.23, tanX + 0.12), Math.max(tanY * 1.23, tanY + 0.12))
    this.air.skyAt(e, 1, Math.PI * 0.5, this.upper)
    this.air.skyAt(e, 0.03, Math.PI * 0.67, this.lower)
    this.air.sunAt(e, this.groundSun)
    this.air.sunAt(e, this.cloudSun, true)
    this.air.moonAt(e, this.moon)
    this.air.deckAt(e, this.deck)
    const night = smoothstep(-2.6, -12.6, e)
    const u = this.cloud.uniforms
    u.uElevation.value = e
    u.uEyeKm.value = 0.001 * pose.position.y
    u.uRayLight.value.copy(this.sun)
    u.uRayLight.value.y = Math.max(-0.024, this.sun.y)
    u.uRayLight.value.normalize()
    u.uCloudLight.value.fromArray(this.cloudSun)
    u.uCloudLight.value.x += this.moon[0] * 0.18
    u.uCloudLight.value.y += this.moon[1] * 0.18
    u.uCloudLight.value.z += this.moon[2] * 0.18
    u.uUpper.value.fromArray(this.upper)
    u.uLower.value.fromArray(this.lower)
    u.uDeck.value.fromArray(this.deck)
    u.uFlash.value.copy(now.flashAt)
    // The sun clears a local tear before the rest of the front moves off.
    const deckShape = d.overcast + 0.81 * d.burst * (1 - d.overcast)
    u.uWeather.value.set(d.cover, deckShape, d.sunThrough, d.fog)
    u.uEffects.value.set(d.evening, d.rain, d.flash, d.burst)
    u.uGolden.value = d.evening * smoothstep(-0.015, 0.035, this.sun.y) * (1 - smoothstep(0.15, 0.26, this.sun.y))
    u.uTravel.value.set((now.cloud.shiftX + later.cloud.shiftX) * 0.5, (now.cloud.shiftZ + later.cloud.shiftZ) * 0.5)
    u.uSmear.value.set(later.cloud.shiftX - now.cloud.shiftX, later.cloud.shiftZ - now.cloud.shiftZ)
    u.uEvolve.value = 0.5 * (now.cloud.evolve + later.cloud.evolve)
    u.uRealSky.value = 0.5 * (now.t + later.t)
    u.uSteps.value = level.steps
    u.uLightSteps.value = level.light
    this.cloud.render(renderer, target)
    renderer.setRenderTarget(old)
    const v = this.display.uniforms
    v.tSky.value = target.texture
    v.uMapSize.value.set(level.width, level.height)
    v.uElevation.value = e
    v.uNight.value = night
    v.uFrostFog.value = d.fog
    v.uRainFog.value = d.rain * d.overcast
    v.uBreak.value = d.burst
    v.uMarchFilter.value = view.quality === 'film' ? 0.42 + 0.42 * d.overcast : 0.20 + 0.33 * d.overcast
    v.uSunFace.value.copy(this.sun)
    v.uSunFace.value.y += RAD * 0.33 * (1 - smoothstep(-0.6, 3.8, e))
    v.uSunFace.value.normalize()
    v.uMoon.value.copy(now.moon)
    v.uMoonDisc.value.fromArray(this.moon).multiplyScalar(2.3)
    v.uDisc.value.fromArray(this.groundSun).multiplyScalar(87 * (1 - 0.22 * d.fog) * smoothstep(0, 0.025, d.sunThrough))
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
    return (this.air.bytes + CLOUD_SIZE ** 3 * 4 + (STAR_WIDTH * STAR_HEIGHT * 4 + area * 8) * 4 / 3 + 16 * 16 * 8) / (1024 * 1024)
  }
}

export function make(): Sky {
  return new FieldSky()
}
