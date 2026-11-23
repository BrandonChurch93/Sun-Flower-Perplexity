import * as THREE from 'three'
import { config } from '../config.ts'
import type { Assets } from '../core/assets.ts'
import { clamp, lerp, smoothstep } from '../core/curves.ts'
import { FullscreenPass } from '../core/fullscreen.ts'
import { shared } from '../core/shading.ts'
import type { RGB } from '../core/world.ts'
import type { Moment, Quality, Sky, SkyLight, View } from '../v2/api.ts'
import { shutterSeconds } from '../v2/now.ts'
import { Atmosphere, clearRows, M_N, row, T_H, T_W, type ClearRows } from './atmosphere.ts'
import { detailNoise, shapeNoise } from './noise.ts'
import { cloudFragment, skyFragment, SKYVIEW_H, SKYVIEW_W, skyViewFragment } from './shaders.ts'

// The model's sky is brighter than the single sun of the tables would make it, so that the fill on the plant matches the film's units.
const GAIN = 2.2
const NIGHT_ZENITH: RGB = [0.0018, 0.0034, 0.006]
const NIGHT_HORIZON: RGB = [0.004, 0.0065, 0.011]
const MOON: RGB = [0.19, 0.2, 0.23]
const DISC = 90
// The prepared clouds see a little more than the frame, so that every sample of the frame finds them.
const MARGIN = 1.18
const PLAN: Record<Quality, { width: number; height: number; steps: number; light: number }> = {
  film: { width: 1600, height: 900, steps: 96, light: 6 },
  high: { width: 960, height: 540, steps: 48, light: 5 },
  low: { width: 480, height: 270, steps: 32, light: 4 },
}
const QUALITIES: Quality[] = ['film', 'high', 'low']
const SHAPE_N = 64
const DETAIL_N = 32
const POLE = new THREE.Vector3(0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4))

// Twilight is lifted above what the single scattering of the model gives, so that the blue hour reads brighter than the moonlit night.
const gainAt = (e: number): number => GAIN * Math.pow(10, 2 * smoothstep(0.5, -6, e))
const lum = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

function halfTexture(data: Float32Array, w: number, h: number): THREE.DataTexture {
  const half = new Uint16Array(data.length)
  for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i])
  const t = new THREE.DataTexture(half, w, h, THREE.RGBAFormat, THREE.HalfFloatType)
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  t.wrapS = THREE.ClampToEdgeWrapping
  t.wrapT = THREE.ClampToEdgeWrapping
  t.generateMipmaps = false
  t.needsUpdate = true
  return t
}

function volume(data: Uint8Array, n: number): THREE.Data3DTexture {
  const t = new THREE.Data3DTexture(data, n, n, n)
  t.format = THREE.RGBAFormat
  t.type = THREE.UnsignedByteType
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.wrapR = THREE.RepeatWrapping
  t.generateMipmaps = false
  t.unpackAlignment = 1
  t.needsUpdate = true
  return t
}

function target(w: number, h: number, mips: boolean): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: mips,
    minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  })
}

class PhysicalSky implements Sky {
  private rows: ClearRows | null = null
  private trans: THREE.DataTexture | null = null
  private multi: THREE.DataTexture | null = null
  private shape: THREE.Data3DTexture | null = null
  private detail: THREE.Data3DTexture | null = null
  private skyViewTarget: THREE.WebGLRenderTarget | null = null
  private cloudTargets = new Map<Quality, THREE.WebGLRenderTarget>()
  private warmTarget: THREE.WebGLRenderTarget | null = null
  private skyViewPass: FullscreenPass | null = null
  private cloudPass: FullscreenPass | null = null
  private skyPass: FullscreenPass | null = null
  private bytes = 0
  private readonly clear: SkyLight = { direct: [0, 0, 0], zenith: [0, 0, 0], horizon: [0, 0, 0], horizonSun: [0, 0, 0] }
  private readonly lit: SkyLight = { direct: [0, 0, 0], zenith: [0, 0, 0], horizon: [0, 0, 0], horizonSun: [0, 0, 0] }
  private readonly basis = new THREE.Matrix3()
  private readonly basisT = new THREE.Matrix3()

  async load(renderer: THREE.WebGLRenderer, _assets: Assets): Promise<void> {
    const air = new Atmosphere()
    this.rows = clearRows(air)
    this.trans = halfTexture(air.transmittance, T_W, T_H)
    this.multi = halfTexture(air.multiple, M_N, M_N)
    this.shape = volume(shapeNoise(SHAPE_N), SHAPE_N)
    this.detail = volume(detailNoise(DETAIL_N), DETAIL_N)
    this.bytes = (T_W * T_H + M_N * M_N) * 8 + SHAPE_N ** 3 * 4 + DETAIL_N ** 3 * 4
    this.skyViewTarget = target(SKYVIEW_W, SKYVIEW_H, false)
    this.bytes += SKYVIEW_W * SKYVIEW_H * 8
    for (const q of QUALITIES) {
      const p = PLAN[q]
      this.cloudTargets.set(q, target(p.width, p.height, true))
      this.bytes += p.width * p.height * 8 * 1.34
    }
    this.warmTarget = target(16, 16, false)
    const air2 = { uTrans: { value: this.trans }, uMulti: { value: this.multi } }
    this.skyViewPass = new FullscreenPass(skyViewFragment, {
      ...shared,
      ...air2,
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uGain: { value: GAIN },
      uNightZenith: { value: new THREE.Vector3().fromArray(NIGHT_ZENITH) },
      uNightHorizon: { value: new THREE.Vector3().fromArray(NIGHT_HORIZON) },
    })
    this.cloudPass = new FullscreenPass(cloudFragment, {
      ...shared,
      ...air2,
      uSkyView: { value: this.skyViewTarget.texture },
      uShape: { value: this.shape },
      uDetail: { value: this.detail },
      uBasis: { value: new THREE.Matrix3() },
      uTan: { value: new THREE.Vector2(1, 1) },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uMoon: { value: new THREE.Vector3(0, 1, 0) },
      uMoonLight: { value: new THREE.Vector3() },
      uShift: { value: new THREE.Vector2() },
      uSmear: { value: new THREE.Vector2() },
      uEvolve: { value: 0 },
      uCover: { value: 0 },
      uOvercast: { value: 0 },
      uRain: { value: 0 },
      uFlash: { value: 0 },
      uFlashAt: { value: new THREE.Vector3(0, 1, 0) },
      uBurst: { value: 0 },
      uSunThrough: { value: 1 },
      uEvening: { value: 0 },
      uFog: { value: 0 },
      uGain: { value: GAIN },
      uAmbTop: { value: new THREE.Vector3() },
      uAmbBottom: { value: new THREE.Vector3() },
      uSteps: { value: 48 },
      uLightSteps: { value: 5 },
    })
    this.skyPass = new FullscreenPass(skyFragment, {
      ...shared,
      ...air2,
      uSkyView: { value: this.skyViewTarget.texture },
      uClouds: { value: this.cloudTargets.get('high')?.texture ?? null },
      uCamWorld: { value: new THREE.Matrix4() },
      uRay: { value: new THREE.Vector4() },
      uPixelAngle: { value: 0.001 },
      uBasisT: { value: new THREE.Matrix3() },
      uTan: { value: new THREE.Vector2(1, 1) },
      uCloudPixel: { value: 0.001 },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uMoon: { value: new THREE.Vector3(0, 1, 0) },
      uMoonColor: { value: new THREE.Vector3() },
      uPole: { value: POLE.clone() },
      uStarTurn: { value: 0 },
      uStars: { value: 1 },
      uDisc: { value: DISC },
      uMist: { value: 0 },
      uMistColor: { value: new THREE.Vector3() },
      uHalo: { value: new THREE.Vector3() },
      uThrough: { value: 1 },
      uGain: { value: GAIN },
    })
    this.warm(renderer)
  }

  warm(renderer: THREE.WebGLRenderer): void {
    const previous = renderer.getRenderTarget()
    ;(this.skyViewPass as FullscreenPass).render(renderer, this.skyViewTarget)
    for (const q of QUALITIES) {
      const t = this.cloudTargets.get(q) as THREE.WebGLRenderTarget
      const u = (this.cloudPass as FullscreenPass).uniforms
      u.uSteps.value = 1
      u.uLightSteps.value = 1
      ;(this.cloudPass as FullscreenPass).render(renderer, t)
      ;(this.skyPass as FullscreenPass).uniforms.uClouds.value = t.texture
      ;(this.skyPass as FullscreenPass).render(renderer, this.warmTarget)
    }
    renderer.setRenderTarget(previous)
  }

  private clearAt(m: Moment, out: SkyLight): SkyLight {
    const rows = this.rows as ClearRows
    const e = m.sunElevationDeg
    row(rows.direct, e, out.direct)
    row(rows.zenith, e, out.zenith)
    row(rows.horizon, e, out.horizon)
    row(rows.horizonSun, e, out.horizonSun)
    const g = gainAt(e)
    for (let i = 0; i < 3; i++) {
      out.zenith[i] = out.zenith[i] * g + NIGHT_ZENITH[i]
      out.horizon[i] = out.horizon[i] * g + NIGHT_HORIZON[i] * 0.95 + NIGHT_ZENITH[i] * 0.05
      out.horizonSun[i] = out.horizonSun[i] * g + NIGHT_HORIZON[i] * 0.95 + NIGHT_ZENITH[i] * 0.05
    }
    if (m.lightKind === 'moon') for (let i = 0; i < 3; i++) out.direct[i] = MOON[i] * smoothstep(5, 9, -e)
    return out
  }

  light(m: Moment, out: SkyLight): SkyLight {
    this.clearAt(m, out)
    const d = m.dials
    const sunY = Math.max(Math.sin((m.sunElevationDeg * Math.PI) / 180), 0)
    const sky = 0.5 * (lum(out.zenith) + lum(out.horizon))
    const sunOn = m.lightKind === 'moon' ? 0 : lum(out.direct) * sunY
    const deck = (sunOn * lerp(0.09, 0.012, d.overcast) + sky * lerp(0.9, 0.35, d.overcast)) * lerp(1, 0.55, d.overcast)
    const cover = clamp(d.cover * 1.1 - 0.12) * lerp(0.55, 1, d.overcast)
    for (let i = 0; i < 3; i++) {
      const tint = i === 0 ? 0.95 : i === 1 ? 1 : 1.08
      out.zenith[i] = lerp(out.zenith[i], deck * tint, cover)
      out.horizon[i] = lerp(out.horizon[i], deck * tint * 1.25, cover * 0.85)
      out.horizonSun[i] = lerp(out.horizonSun[i], deck * tint * 1.45, cover * 0.85)
    }
    const veil = smoothstep(0.15, 0.9, d.fog) * 0.9
    const mist = lerp(lum(out.horizon), lum(out.horizonSun), 0.35)
    for (let i = 0; i < 3; i++) {
      const tint = out.horizon[i] / Math.max(lum(out.horizon), 1e-6)
      const even = mist * lerp(1, tint, 0.5)
      out.zenith[i] = lerp(out.zenith[i], even * 0.8, veil)
      out.horizon[i] = lerp(out.horizon[i], even, veil)
      out.horizonSun[i] = lerp(out.horizonSun[i], even * 1.6, veil * 0.6)
    }
    return out
  }

  prepare(renderer: THREE.WebGLRenderer, now: Moment, later: Moment, view: View): void {
    const d = now.dials
    const clear = this.clearAt(now, this.clear)
    const lit = this.light(now, this.lit)
    const sv = this.skyViewPass as FullscreenPass
    sv.uniforms.uSun.value.copy(now.sun)
    const g = gainAt(now.sunElevationDeg)
    sv.uniforms.uGain.value = g
    sv.render(renderer, this.skyViewTarget)

    const plan = PLAN[view.quality]
    const cloudTarget = this.cloudTargets.get(view.quality) as THREE.WebGLRenderTarget
    const pose = view.pose
    const tanX = ((0.5 * config.camera.gateWidthMm) / pose.focalMm) * MARGIN
    const tanY = (tanX * plan.height) / plan.width
    const viewTanY = ((0.5 * config.camera.gateWidthMm) / pose.focalMm) * (view.height / view.width) * MARGIN
    const ty = Math.max(tanY, viewTanY)
    const tx = (ty * plan.width) / plan.height
    this.basis.set(pose.right.x, pose.up.x, pose.forward.x, pose.right.y, pose.up.y, pose.forward.y, pose.right.z, pose.up.z, pose.forward.z)
    this.basisT.copy(this.basis).transpose()
    const u = (this.cloudPass as FullscreenPass).uniforms
    u.uBasis.value.copy(this.basis)
    u.uTan.value.set(tx, ty)
    u.uSun.value.copy(now.sun)
    u.uMoon.value.copy(now.moon)
    const moonUp = smoothstep(4, 10, -now.sunElevationDeg)
    u.uMoonLight.value.set(MOON[0] * moonUp, MOON[1] * moonUp, MOON[2] * moonUp)
    u.uShift.value.set(now.cloud.shiftX, now.cloud.shiftZ)
    u.uSmear.value.set(now.cloud.speedX * shutterSeconds, now.cloud.speedZ * shutterSeconds)
    u.uEvolve.value = now.cloud.evolve
    u.uCover.value = d.cover
    u.uOvercast.value = d.overcast
    u.uRain.value = d.rain
    u.uFlash.value = Math.max(d.flash, later.dials.flash)
    u.uFlashAt.value.copy(now.flashAt)
    u.uBurst.value = d.burst
    u.uSunThrough.value = d.sunThrough
    u.uEvening.value = d.evening
    u.uFog.value = d.fog
    const sunY = Math.max(now.sun.y, 0)
    u.uAmbTop.value.set(0.45 * clear.zenith[0] + 0.35 * clear.horizon[0] + 0.2 * clear.horizonSun[0], 0.45 * clear.zenith[1] + 0.35 * clear.horizon[1] + 0.2 * clear.horizonSun[1], 0.45 * clear.zenith[2] + 0.35 * clear.horizon[2] + 0.2 * clear.horizonSun[2])
    const ground = 0.18
    u.uAmbBottom.value.set(
      ground * (clear.direct[0] * sunY / Math.PI + lit.horizon[0]),
      ground * (clear.direct[1] * sunY / Math.PI + lit.horizon[1]),
      ground * (clear.direct[2] * sunY / Math.PI + lit.horizon[2]),
    )
    u.uGain.value = g
    u.uSteps.value = plan.steps
    u.uLightSteps.value = plan.light
    ;(this.cloudPass as FullscreenPass).render(renderer, cloudTarget)

    const s = (this.skyPass as FullscreenPass).uniforms
    s.uClouds.value = cloudTarget.texture
    s.uBasisT.value.copy(this.basisT)
    s.uTan.value.set(tx, ty)
    s.uCloudPixel.value = (2 * tx) / plan.width
    s.uSun.value.copy(now.sun)
    s.uMoon.value.copy(now.moon)
    const moonGlow = 18 * smoothstep(-2, 6, -now.sunElevationDeg)
    s.uMoonColor.value.set(MOON[0] * moonGlow, MOON[1] * moonGlow, MOON[2] * moonGlow * 1.05)
    s.uStarTurn.value = now.starTurn
    s.uStars.value = now.sunElevationDeg < 4 ? 1 : 0
    const mist = smoothstep(0.15, 0.9, d.fog) * 0.92
    s.uMist.value = mist
    s.uMistColor.value.set(lit.horizon[0], lit.horizon[1], lit.horizon[2])
    const halo = now.lightKind === 'sun' ? 1 : 0
    s.uHalo.value.set(clear.direct[0] * halo * 0.5, clear.direct[1] * halo * 0.5, clear.direct[2] * halo * 0.5)
    s.uThrough.value = lerp(1, d.sunThrough, smoothstep(0.1, 0.5, d.fog))
    renderer.setRenderTarget(null)
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, camera: THREE.PerspectiveCamera, pixelX: number, pixelY: number, width: number, height: number): void {
    const pass = this.skyPass as FullscreenPass
    const u = pass.uniforms
    const e = camera.projectionMatrix.elements
    u.uCamWorld.value.copy(camera.matrixWorld)
    u.uRay.value.set(1 / e[0], 1 / e[5], (2 * pixelX) / width, (2 * pixelY) / height)
    u.uPixelAngle.value = 2 / (e[0] * width)
    pass.render(renderer, target)
  }

  megabytes(): number {
    return this.bytes / (1024 * 1024)
  }
}

export function make(): Sky {
  return new PhysicalSky()
}
