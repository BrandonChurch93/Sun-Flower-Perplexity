import * as THREE from 'three'
import { config, timeOf, type AssetSetId, type Format, type TierId } from '../config.ts'
import { Assets } from '../core/assets.ts'
import { applyLens, cocScalePx, type CameraPose } from '../core/lens.ts'
import { frameSamples } from '../core/sampler.ts'
import { DIAG, shared, type DiagName } from '../core/shading.ts'
import { ShadowMap, type Caster } from '../core/shadow.ts'
import { Stage } from '../core/stage.ts'
import { samplesOf } from '../core/tiers.ts'
import { applyWorld, sunDirection, type WorldDef } from '../core/world.ts'
import { breathe } from '../core/yield.ts'
import { Ground } from '../ground/index.ts'
import { heightAt, plantReach } from '../plant/growth.ts'
import { Plant } from '../plant/index.ts'
import { Post } from '../post/post.ts'
import { Sky } from '../weather/sky.ts'
import { farPlane, nearPlane, rigAt } from './camera.ts'
import { plantInputsAt } from './inputs.ts'
import { worldOf } from './registry.ts'
import { poseAtTime, stateAt, type FrameState } from './state.ts'
import { clampFrame, worldAt } from './timeline.ts'


const GREY = new THREE.Color().setRGB(0.18, 0.18, 0.18)
const BLACK = new THREE.Color().setRGB(0, 0, 0)
const shutterSeconds = config.film.shutterDegrees / 360 / config.film.fps

export class Film {
  readonly stage: Stage
  readonly assets: Assets
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera()
  readonly plant = new Plant()
  readonly ground = new Ground()
  readonly sky = new Sky()
  readonly shadow = new ShadowMap()
  readonly post: Post
  format: Format
  diag: DiagName = 'beauty'
  lastTier: TierId = 'draft'
  lastFrame = -1
  private readonly casters: Caster[]
  private readonly tip = new THREE.Vector3()
  private readonly sun = new THREE.Vector3()
  private readonly center = new THREE.Vector3()
  private loaded: Promise<void> | null = null
  private busy: Promise<void> = Promise.resolve()

  constructor(canvas: HTMLCanvasElement, format: Format, assetSet: AssetSetId) {
    this.format = format
    this.stage = new Stage(canvas, format)
    this.assets = new Assets(this.stage.renderer, assetSet)
    this.post = new Post(format.width, format.height)
    this.scene.add(this.ground.mesh, this.plant.mesh)
    this.scene.matrixWorldAutoUpdate = false
    this.casters = [{ mesh: this.plant.mesh, surface: this.plant.surface }]
    shared.uFocusCoc.value = config.detail.focusCocPx
  }

  load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = (async () => {
        this.ground.load(this.assets)
        for (const w of config.worlds) await this.sky.load(this.assets, worldOf(w.id))
        const total = this.assets.megabytes()
        if (total > this.assets.limitMb()) throw new Error(`the ${this.assets.set} asset set needs ${total.toFixed(0)} MB of textures, over its limit`)
      })()
    }
    return this.loaded
  }

  async setFormat(format: Format): Promise<void> {
    await this.busy
    this.format = format
    this.stage.setSize(format)
    this.post.setSize(format.width, format.height)
  }

  async setAssets(set: AssetSetId): Promise<void> {
    await this.busy
    if (set === this.assets.set && this.loaded) return this.loaded
    this.assets.clear()
    this.sky.clear()
    this.assets.set = set
    this.loaded = null
    await this.load()
  }

  poseAt(time: number): CameraPose {
    return poseAtTime(time, this.tip)
  }

  state(frameIndex: number): FrameState {
    return stateAt(frameIndex)
  }

  renderFrame(frameIndex: number, tier: TierId, pause = false): Promise<void> {
    const job = this.busy.then(() => this.draw(frameIndex, tier, pause))
    this.busy = job.catch(() => undefined)
    return job
  }

  private light(def: WorldDef, pose: CameraPose): boolean {
    if (this.diag === 'plant') {
      shared.uSunColor.value.set(0, 0, 0)
      shared.uSkyZenith.value.set(1, 1, 1)
      shared.uSkyHorizon.value.set(1, 1, 1)
      shared.uGroundBounce.value.set(1, 1, 1)
      shared.uFogDensity.value = 0
      this.sun.set(0, 1, 0)
      return false
    }
    if (this.diag === 'backlight') {
      shared.uSunColor.value.set(5, 5, 5)
      shared.uSkyZenith.value.set(0.12, 0.12, 0.12)
      shared.uSkyHorizon.value.set(0.12, 0.12, 0.12)
      shared.uGroundBounce.value.set(0.12, 0.12, 0.12)
      shared.uFogDensity.value = 0
      this.sun.set(pose.forward.x, 0, pose.forward.z).normalize().multiplyScalar(Math.cos(0.35)).setY(Math.sin(0.35))
      return true
    }
    applyWorld(def)
    sunDirection(def, this.sun)
    return this.sun.y > 0.01 && def.sun.color[0] + def.sun.color[1] + def.sun.color[2] > 0
  }

  private async draw(frameIndex: number, tier: TierId, pause: boolean): Promise<void> {
    if (this.stage.lost) throw new Error('the WebGL context was lost')
    await this.load()
    const frame = clampFrame(frameIndex)
    const time = timeOf(frame)
    const def = worldOf(worldAt(frame))
    const { stage, camera } = this
    const { renderer } = stage
    const count = samplesOf(tier)
    const alone = this.diag === 'plant' || this.diag === 'backlight'
    this.lastTier = tier
    shared.uFrame.value = frame
    shared.uTime.value = time
    shared.uDiag.value = DIAG[this.diag]
    this.sky.setWorld(def)
    this.ground.setState(def.ground)
    this.ground.mesh.visible = !alone
    this.plant.prepare(time, time + shutterSeconds, plantInputsAt(time), plantInputsAt(time + shutterSeconds))
    const height = heightAt(time + shutterSeconds)
    const radius = Math.max(0.012, 0.5 * height + plantReach(time + shutterSeconds) + 0.004)
    this.center.set(0, 0.5 * height, 0)
    stage.accumulator.reset()
    const samples = frameSamples(frame, count)
    for (const s of samples) {
      const at = time + shutterSeconds * s.shutter
      const pose = this.poseAt(at)
      const rig = rigAt(at)
      shared.uShutter.value = s.shutter
      const lit = this.light(def, pose)
      shared.uSunDir.value.copy(this.sun)
      applyLens(camera, pose, { gateMm: config.camera.gateWidthMm, width: stage.width, height: stage.height, near: nearPlane(rig), far: farPlane, pixelX: s.pixelX, pixelY: s.pixelY, lensX: s.lensX, lensY: s.lensY })
      shared.uCamPos.value.copy(camera.position)
      shared.uFocusM.value = pose.focusM
      shared.uCocScale.value = cocScalePx(pose, config.camera.gateWidthMm, stage.width)
      if (lit) this.shadow.render(renderer, this.scene, this.casters, this.sun, alone ? 1 : def.sun.softnessDeg, s.lightX, s.lightY, this.center, radius)
      else this.shadow.off()
      renderer.setRenderTarget(stage.sample)
      renderer.setClearColor(alone ? GREY : BLACK, 0)
      renderer.clear(true, true, false)
      if (!alone) this.sky.render(renderer, stage.sample, camera, s.pixelX, s.pixelY, stage.width, stage.height)
      renderer.render(this.scene, camera)
      stage.accumulator.add(renderer, stage.sample.texture, s.weight)
      if (pause) await breathe()
    }
    this.post.render(renderer, stage.accumulator.texture, def, frame, count, this.diag)
    stage.finish()
    if (stage.lost) throw new Error('the WebGL context was lost')
    this.lastFrame = frame
  }

  // Reads the accumulated frame, before lens and grade, and says where the growing tip landed in it.
  check(frameIndex: number): FrameCheck {
    const frame = clampFrame(frameIndex)
    if (frame !== this.lastFrame) throw new Error(`frame ${frame} is not the frame on the canvas`)
    const { stage } = this
    const { width, height } = stage
    const pixels = new Float32Array(width * height * 4)
    stage.renderer.readRenderTargetPixels(stage.accumulator.target, 0, 0, width, height, pixels)
    let invalid = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (!Number.isFinite(pixels[i]) || !Number.isFinite(pixels[i + 1]) || !Number.isFinite(pixels[i + 2]) || !Number.isFinite(pixels[i + 3])) invalid++
    }
    const pose = this.poseAt(timeOf(frame))
    const v = this.tip.clone().sub(pose.position)
    const depth = v.dot(pose.forward)
    const scale = pose.focalMm / config.camera.gateWidthMm
    const x = 0.5 + (v.dot(pose.right) / depth) * scale
    const y = 0.5 - (v.dot(pose.up) / depth) * scale * (width / height)
    let cocPx = Infinity
    const px = Math.round(x * width - 0.5)
    const py = Math.round((1 - y) * height - 0.5)
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const qx = px + dx
        const qy = py + dy
        if (qx < 0 || qy < 0 || qx >= width || qy >= height) continue
        const a = pixels[(qy * width + qx) * 4 + 3]
        if (Number.isFinite(a) && a < cocPx) cocPx = a
      }
    }
    return { frame, invalid, tip: { x, y, depthM: depth, cocPx: Number.isFinite(cocPx) ? cocPx : -1 } }
  }

  // Counts texels per screen pixel over the textured pixels of the sharp zone. Needs the texels view at one sample.
  texels(frameIndex: number): TexelCheck {
    const frame = clampFrame(frameIndex)
    if (frame !== this.lastFrame) throw new Error(`frame ${frame} is not the frame on the canvas`)
    if (this.diag !== 'texels' || samplesOf(this.lastTier) !== 1) throw new Error('the texel count needs the texels view at the draft tier')
    const { stage } = this
    const { width, height } = stage
    const pixels = new Float32Array(width * height * 4)
    stage.renderer.readRenderTargetPixels(stage.accumulator.target, 0, 0, width, height, pixels)
    let textured = 0
    let soft = 0
    let outside = 0
    for (let i = 3; i < pixels.length; i += 4) {
      const a = pixels[i]
      if (a >= 0) {
        textured++
        if (a < config.detail.minTexelsPerPixel) soft++
      } else if (a < -1.5) outside++
    }
    return { frame, pixels: width * height, textured, soft, texturedOutsideSharpZone: outside, softShare: textured ? soft / textured : 0 }
  }

  textureMb(): number {
    return this.assets.megabytes()
  }
}

export interface TexelCheck { frame: number; pixels: number; textured: number; soft: number; texturedOutsideSharpZone: number; softShare: number }

export interface FrameCheck { frame: number; invalid: number; tip: { x: number; y: number; depthM: number; cocPx: number } }

export type { FrameState }
