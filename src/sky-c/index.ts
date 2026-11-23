import * as THREE from 'three'
import { config } from '../config.ts'
import type { Assets } from '../core/assets.ts'
import { smoothstep } from '../core/curves.ts'
import { FullscreenPass } from '../core/fullscreen.ts'
import { shared } from '../core/shading.ts'
import type { Moment, Quality, Sky, SkyLight, View } from '../v2/api.ts'
import { type AtmosphereTables, buildAtmosphereTables, evaluateSkyLight, TRANS_H, TRANS_W, MS_SIZE } from './atmosphere.ts'
import { buildCloudTextures, type CloudTextures } from './noise.ts'
import { cloudPrepareFragment, mipDownFragment, skyRenderFragment, skyViewFragment } from './shaders.ts'
import { BRIGHT_STAR_COUNT, buildStarAssets, type StarAssets } from './stars.ts'

const SKY_VIEW_W = 256
const SKY_VIEW_H = 128

const FILM_W = 1600
const FILM_H = 900
const HIGH_W = 960
const HIGH_H = 540
const LOW_W = 480
const LOW_H = 270

const MIP_SIZES: readonly [number, number][] = [
  [480, 270],
  [240, 135],
  [120, 68],
  [60, 34],
  [30, 17],
]

function makeHalfTarget(w: number, h: number, wrapS: THREE.Wrapping = THREE.ClampToEdgeWrapping): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  })
  rt.texture.colorSpace = THREE.NoColorSpace
  return rt
}

class VolumetricSky implements Sky {
  private tables: AtmosphereTables | null = null
  private clouds: CloudTextures | null = null
  private stars: StarAssets | null = null

  private skyViewTarget: THREE.WebGLRenderTarget | null = null
  private filmTarget: THREE.WebGLRenderTarget | null = null
  private highTarget: THREE.WebGLRenderTarget | null = null
  private lowTarget: THREE.WebGLRenderTarget | null = null
  private mips: THREE.WebGLRenderTarget[] = []

  private skyViewPass: FullscreenPass | null = null
  private cloudPreparePass: FullscreenPass | null = null
  private mipDownPass: FullscreenPass | null = null
  private skyRenderPass: FullscreenPass | null = null

  private totalBytes = 0
  private readonly scratchLight: SkyLight = {
    direct: [0, 0, 0],
    zenith: [0, 0, 0],
    horizon: [0, 0, 0],
    horizonSun: [0, 0, 0],
  }
  private readonly midSun = new THREE.Vector3(0, 1, 0)

  async load(renderer: THREE.WebGLRenderer, _assets: Assets): Promise<void> {
    this.tables = buildAtmosphereTables(renderer)
    this.clouds = buildCloudTextures(renderer)
    this.stars = buildStarAssets(renderer)

    this.skyViewTarget = makeHalfTarget(SKY_VIEW_W, SKY_VIEW_H, THREE.RepeatWrapping)
    this.filmTarget = makeHalfTarget(FILM_W, FILM_H)
    this.highTarget = makeHalfTarget(HIGH_W, HIGH_H)
    this.lowTarget = makeHalfTarget(LOW_W, LOW_H)
    this.mips = MIP_SIZES.map(([w, h]) => makeHalfTarget(w, h))

    const starPosVecs: THREE.Vector4[] = []
    const starColVecs: THREE.Vector3[] = []
    for (let i = 0; i < BRIGHT_STAR_COUNT; i++) {
      const p = this.stars.starDirsAndFlux
      const c = this.stars.starColors
      starPosVecs.push(new THREE.Vector4(p[i * 4], p[i * 4 + 1], p[i * 4 + 2], p[i * 4 + 3]))
      starColVecs.push(new THREE.Vector3(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]))
    }

    this.skyViewPass = new FullscreenPass(skyViewFragment, {
      tTrans: { value: this.tables.transTexture },
      tMs: { value: this.tables.msTexture },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uMoon: { value: new THREE.Vector3(0, 0.3, -0.95) },
      uNight: { value: 0 },
      uFog: { value: 0 },
      uSkySteps: { value: 32 },
    })

    this.cloudPreparePass = new FullscreenPass(cloudPrepareFragment, {
      tTrans: { value: this.tables.transTexture },
      tSkyView: { value: this.skyViewTarget.texture },
      tShape3D: { value: this.clouds.shape3D },
      tDetail3D: { value: this.clouds.detail3D },
      tWeather2D: { value: this.clouds.weather2D },
      tCirrus2D: { value: this.clouds.cirrus2D },
      uPrepForward: { value: new THREE.Vector3(0, 0, -1) },
      uPrepRight: { value: new THREE.Vector3(1, 0, 0) },
      uPrepUp: { value: new THREE.Vector3(0, 1, 0) },
      uPrepTan: { value: new THREE.Vector2(0.8, 0.5) },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uMoon: { value: new THREE.Vector3(0, 0.3, -0.95) },
      uSkyZen: { value: new THREE.Vector3(0.3, 0.6, 1.4) },
      uSkyHor: { value: new THREE.Vector3(1.9, 2.3, 2.8) },
      uGroundBounceCol: { value: new THREE.Vector3(0.08, 0.07, 0.05) },
      uCloudShiftNow: { value: new THREE.Vector2(0, 0) },
      uCloudShiftLater: { value: new THREE.Vector2(0, 0) },
      uCloudEvolveNow: { value: 0 },
      uCloudEvolveLater: { value: 0 },
      uCover: { value: 0.25 },
      uOvercast: { value: 0 },
      uSunThrough: { value: 1 },
      uFog: { value: 0 },
      uRain: { value: 0 },
      uFlash: { value: 0 },
      uFlashDir: { value: new THREE.Vector3(0, 0.3, -0.95) },
      uBurst: { value: 0 },
      uEvening: { value: 0 },
      uNight: { value: 0 },
      uMaxSteps: { value: 48 },
      uLightSteps: { value: 5 },
      uShutterTaps: { value: 1 },
    })

    this.mipDownPass = new FullscreenPass(mipDownFragment, {
      tSrc: { value: this.highTarget.texture },
      uSrcTexel: { value: new THREE.Vector2(1 / HIGH_W, 1 / HIGH_H) },
    })

    this.skyRenderPass = new FullscreenPass(skyRenderFragment, {
      ...shared,
      uCamWorld: { value: new THREE.Matrix4() },
      uRay: { value: new THREE.Vector4(0.5, 0.3, 0, 0) },
      uPixelAngle: { value: 0.001 },
      tTrans: { value: this.tables.transTexture },
      tSkyView: { value: this.skyViewTarget.texture },
      tMilkyWay: { value: this.stars.milkyWayTexture },
      tPrepared: { value: this.highTarget.texture },
      tMip0: { value: this.mips[0].texture },
      tMip1: { value: this.mips[1].texture },
      tMip2: { value: this.mips[2].texture },
      tMip3: { value: this.mips[3].texture },
      tMip4: { value: this.mips[4].texture },
      uPrepForward: { value: new THREE.Vector3(0, 0, -1) },
      uPrepRight: { value: new THREE.Vector3(1, 0, 0) },
      uPrepUp: { value: new THREE.Vector3(0, 1, 0) },
      uPrepTan: { value: new THREE.Vector2(0.8, 0.5) },
      uPrepPixelAngle: { value: 0.0015 },
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uMoon: { value: new THREE.Vector3(0, 0.3, -0.95) },
      uStarTurn: { value: 0 },
      uNightVis: { value: 0 },
      uMoonVis: { value: 0 },
      uSunVis: { value: 1 },
      uSunThrough: { value: 1 },
      uBurst: { value: 0 },
      uFog: { value: 0 },
      uStarPosFlux: { value: starPosVecs },
      uStarColors: { value: starColVecs },
    })

    const lutBytes = TRANS_W * TRANS_H * 16 + MS_SIZE * MS_SIZE * 16
    const rtBytes =
      (SKY_VIEW_W * SKY_VIEW_H +
        FILM_W * FILM_H +
        HIGH_W * HIGH_H +
        LOW_W * LOW_H +
        MIP_SIZES.reduce((acc, [w, h]) => acc + w * h, 0)) *
      8
    this.totalBytes = lutBytes + rtBytes + this.clouds.byteCount + this.stars.byteCount
  }

  warm(renderer: THREE.WebGLRenderer): void {
    if (!this.skyViewPass || !this.cloudPreparePass || !this.mipDownPass || !this.skyRenderPass) return
    if (!this.skyViewTarget || !this.filmTarget || !this.highTarget || !this.lowTarget) return

    const prev = renderer.getRenderTarget()
    this.skyViewPass.render(renderer, this.skyViewTarget)
    this.cloudPreparePass.render(renderer, this.filmTarget)
    this.cloudPreparePass.render(renderer, this.highTarget)
    this.cloudPreparePass.render(renderer, this.lowTarget)
    this.buildMipChain(renderer, this.highTarget)
    this.skyRenderPass.render(renderer, this.mips[0])
    this.buildMipChain(renderer, this.highTarget)
    renderer.setRenderTarget(prev)
  }

  private targetForQuality(q: Quality): THREE.WebGLRenderTarget {
    if (q === 'film') return this.filmTarget as THREE.WebGLRenderTarget
    if (q === 'low') return this.lowTarget as THREE.WebGLRenderTarget
    return this.highTarget as THREE.WebGLRenderTarget
  }

  private buildMipChain(renderer: THREE.WebGLRenderer, base: THREE.WebGLRenderTarget): void {
    const pass = this.mipDownPass as FullscreenPass
    let srcTex = base.texture
    let sw = base.width
    let sh = base.height
    for (let i = 0; i < this.mips.length; i++) {
      pass.uniforms.tSrc.value = srcTex
      pass.uniforms.uSrcTexel.value.set(1 / sw, 1 / sh)
      pass.render(renderer, this.mips[i])
      srcTex = this.mips[i].texture
      sw = this.mips[i].width
      sh = this.mips[i].height
    }
  }

  light(moment: Moment, out: SkyLight): SkyLight {
    if (!this.tables) return out
    return evaluateSkyLight(this.tables, moment, out)
  }

  prepare(renderer: THREE.WebGLRenderer, now: Moment, later: Moment, view: View): void {
    if (!this.skyViewPass || !this.cloudPreparePass || !this.skyRenderPass || !this.skyViewTarget) return

    const prev = renderer.getRenderTarget()
    const q = view.quality
    const prepTarget = this.targetForQuality(q)
    const l = this.light(now, this.scratchLight)
    const d = now.dials

    this.midSun.copy(now.sun).lerp(later.sun, 0.5).normalize()
    const midStarTurn = 0.5 * (now.starTurn + later.starTurn)

    // 1. Update Sky-View LUT
    const svu = this.skyViewPass.uniforms
    svu.uSun.value.copy(this.midSun)
    svu.uMoon.value.copy(now.moon)
    svu.uNight.value = now.night
    svu.uFog.value = d.fog
    svu.uSkySteps.value = q === 'film' ? 36 : q === 'high' ? 28 : 20
    this.skyViewPass.render(renderer, this.skyViewTarget)

    // 2. Camera frustum with guard band so lens jitter and blur circles remain inside prepared sky
    const pose = view.pose
    const halfTanX = (0.5 * config.camera.gateWidthMm) / Math.max(8, pose.focalMm)
    const aspect = view.height / Math.max(1, view.width)
    const halfTanY = halfTanX * aspect
    const prepTanX = halfTanX * 1.14 + 0.11
    const prepTanY = halfTanY * 1.14 + 0.11

    // 3. Render volumetric clouds, cirrus, rain curtains, shafts, and lightning
    const cpu = this.cloudPreparePass.uniforms
    cpu.uPrepForward.value.copy(pose.forward)
    cpu.uPrepRight.value.copy(pose.right)
    cpu.uPrepUp.value.copy(pose.up)
    cpu.uPrepTan.value.set(prepTanX, prepTanY)
    cpu.uSun.value.copy(this.midSun)
    cpu.uMoon.value.copy(now.moon)
    cpu.uSkyZen.value.fromArray(l.zenith)
    cpu.uSkyHor.value.fromArray(l.horizon)

    const sunHor = Math.max(0, this.midSun.y)
    cpu.uGroundBounceCol.value.set(
      0.11 * (l.direct[0] * sunHor * d.sunThrough + l.horizon[0] * 0.65),
      0.095 * (l.direct[1] * sunHor * d.sunThrough + l.horizon[1] * 0.65),
      0.068 * (l.direct[2] * sunHor * d.sunThrough + l.horizon[2] * 0.65),
    )

    cpu.uCloudShiftNow.value.set(now.cloud.shiftX, now.cloud.shiftZ)
    cpu.uCloudShiftLater.value.set(later.cloud.shiftX, later.cloud.shiftZ)
    cpu.uCloudEvolveNow.value = now.cloud.evolve
    cpu.uCloudEvolveLater.value = later.cloud.evolve

    cpu.uCover.value = d.cover
    cpu.uOvercast.value = d.overcast
    cpu.uSunThrough.value = d.sunThrough
    cpu.uFog.value = d.fog
    cpu.uRain.value = d.rain
    cpu.uFlash.value = d.flash
    cpu.uFlashDir.value.copy(now.flashAt)
    cpu.uBurst.value = d.burst
    cpu.uEvening.value = d.evening
    cpu.uNight.value = now.night

    cpu.uMaxSteps.value = q === 'film' ? 64 : q === 'high' ? 44 : 26
    cpu.uLightSteps.value = q === 'film' ? 6 : q === 'high' ? 5 : 4
    cpu.uShutterTaps.value = q === 'film' ? 3 : q === 'high' ? 2 : 1

    this.cloudPreparePass.render(renderer, prepTarget)

    // 4. Build smooth mip chain for lens out-of-focus sky sampling
    this.buildMipChain(renderer, prepTarget)

    // 5. Bind per-frame uniforms for fast per-sample render()
    const sru = this.skyRenderPass.uniforms
    sru.tPrepared.value = prepTarget.texture
    sru.uPrepForward.value.copy(pose.forward)
    sru.uPrepRight.value.copy(pose.right)
    sru.uPrepUp.value.copy(pose.up)
    sru.uPrepTan.value.set(prepTanX, prepTanY)
    sru.uPrepPixelAngle.value = (2 * prepTanX) / prepTarget.width
    sru.uSun.value.copy(this.midSun)
    sru.uMoon.value.copy(now.moon)
    sru.uStarTurn.value = midStarTurn

    // Stars emerge through civil-to-nautical twilight; moon visible through deep twilight and night
    sru.uNightVis.value = smoothstep(-3.2, -11.0, now.sunElevationDeg)
    sru.uMoonVis.value = smoothstep(-0.5, -6.5, now.sunElevationDeg)
    sru.uSunVis.value = smoothstep(-0.95, 0.15, now.sunElevationDeg)
    sru.uSunThrough.value = d.sunThrough
    sru.uBurst.value = d.burst
    sru.uFog.value = d.fog

    renderer.setRenderTarget(prev)
  }

  render(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    camera: THREE.PerspectiveCamera,
    pixelX: number,
    pixelY: number,
    width: number,
    height: number,
  ): void {
    const pass = this.skyRenderPass
    if (!pass) return
    const u = pass.uniforms
    const e = camera.projectionMatrix.elements
    u.uCamWorld.value.copy(camera.matrixWorld)
    u.uRay.value.set(1 / e[0], 1 / e[5], (2 * pixelX) / width, (2 * pixelY) / height)
    u.uPixelAngle.value = 2 / (e[0] * width)
    pass.render(renderer, target)
  }

  megabytes(): number {
    return this.totalBytes / (1024 * 1024)
  }
}

export function make(): Sky {
  return new VolumetricSky()
}
