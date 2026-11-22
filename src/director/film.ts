import * as THREE from 'three'
import { config, timeOf, type AssetSetId, type Format, type TierId } from '../config.ts'
import { Assets } from '../core/assets.ts'
import { lerp, smoothstep } from '../core/curves.ts'
import { applyLens, cocScalePx, type CameraPose } from '../core/lens.ts'
import { frameSamples } from '../core/sampler.ts'
import { DIAG, shared, type DiagName } from '../core/shading.ts'
import { ShadowMap, type Caster } from '../core/shadow.ts'
import { Stage } from '../core/stage.ts'
import { samplesOf } from '../core/tiers.ts'
import { applyWorld, type WorldDef } from '../core/world.ts'
import { breathe } from '../core/yield.ts'
import { Field } from '../field/index.ts'
import { companionPlace, companionVariant } from '../field/layout.ts'
import { Ground } from '../ground/index.ts'
import { carrierAt, focusAt, heightAt, plantReach, type PlantInputs } from '../plant/model.ts'
import { Plant } from '../plant/index.ts'
import { fieldUniforms, stateUniforms } from '../plant/part.ts'
import { Post } from '../post/post.ts'
import { sunInFrame } from '../post/sun.ts'
import type { Moment, Part, Quality, Sky, SkyLight, View } from '../v2/api.ts'
import { tauAt } from '../v2/clock.ts'
import { plantInputsOf } from '../v2/inputs.ts'
import { blankLook, lookAt } from '../v2/look.ts'
import { blankMoment, later, momentAt, now, setNow, shutterSeconds } from '../v2/now.ts'
import { fixedPose, rigAtFilm } from '../v2/rig.ts'
import { views, type FixedView, type ViewName } from '../v2/shots.ts'
import { companionInView, companionMatrix } from './companion.ts'
import { eyeOf, farPlane, nearPlane, orbited, poseOf, type Rig } from './pose.ts'
import { stateAt, type FrameState } from './state.ts'
import { clampFrame } from './timeline.ts'

const GREY = new THREE.Color().setRGB(0.18, 0.18, 0.18)
const BLACK = new THREE.Color().setRGB(0, 0, 0)

const skyModules = import.meta.glob<{ make: () => Sky }>('../sky*/index.ts')
const partModules = import.meta.glob<{ make: () => Part[] }>('../**/onstage.ts', { eager: true })

// The folder a part lives in, as the name it is shown and hidden by: src/weather/rain/onstage.ts is "rain".
const partName = (path: string): string => path.split('/').slice(-2)[0]

export function skyNames(): string[] {
  return Object.keys(skyModules).map((p) => p.split('/').slice(-2)[0])
}

export interface FilmOptions {
  // The folder of the sky to draw: "sky" is the film's own. A sky under trial lives in its own folder beside it.
  sky?: string
  // What is drawn, by name: sky, ground, plant, companion, field, and every part by its folder. Empty draws everything.
  only?: string[]
  view?: ViewName
  quality?: Quality | null
}

export class Film {
  readonly stage: Stage
  readonly assets: Assets
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera()
  readonly plant = new Plant()
  readonly companion = new Plant({ variant: companionVariant, at: companionPlace() })
  readonly field = new Field()
  readonly ground = new Ground()
  readonly shadow = new ShadowMap()
  readonly post: Post
  readonly parts: { name: string; part: Part }[] = []
  readonly look: WorldDef = blankLook()
  readonly skyLight: SkyLight = { direct: [1, 1, 1], zenith: [0.2, 0.3, 0.5], horizon: [0.5, 0.5, 0.5], horizonSun: [0.5, 0.5, 0.5] }
  sky: Sky | null = null
  readonly skyName: string
  format: Format
  diag: DiagName = 'beauty'
  lastTier: TierId = 'draft'
  lastFrame = -1
  quality: Quality | null
  // What the live mode may change: the camera turned about the plant.
  readonly view: FilmView = { azimuthDeg: 0, elevationDeg: 0, dolly: 1, world: null, fixed: null }
  private readonly only: Set<string>
  private readonly casters: Caster[]
  private readonly bothCasters: Caster[]
  private readonly tip = new THREE.Vector3()
  private readonly carrier = new THREE.Vector3()
  private readonly eye = new THREE.Vector3()
  private readonly sun = new THREE.Vector3()
  private readonly center = new THREE.Vector3()
  private readonly middle = new THREE.Vector3()
  private readonly at: Moment = blankMoment()
  private loaded: Promise<void> | null = null
  private busy: Promise<void> = Promise.resolve()

  constructor(canvas: HTMLCanvasElement, format: Format, assetSet: AssetSetId, options: FilmOptions = {}) {
    this.format = format
    this.stage = new Stage(canvas, format)
    this.assets = new Assets(this.stage.renderer, assetSet)
    this.post = new Post(format.width, format.height)
    this.companion.place(companionMatrix())
    this.only = new Set(options.only ?? [])
    this.quality = options.quality ?? null
    this.view.fixed = options.view && options.view !== 'film' ? views[options.view] : null
    const names = skyNames()
    this.skyName = options.sky && names.includes(options.sky) ? options.sky : names.includes('sky') ? 'sky' : names[0]
    this.scene.add(this.ground.mesh, ...this.ground.casters.map((c) => c.mesh), ...this.field.meshes, ...this.companion.meshes, ...this.plant.meshes)
    for (const [path, module] of Object.entries(partModules)) {
      for (const part of module.make()) {
        for (const o of part.objects) o.visible = false
        this.scene.add(...part.objects)
        this.parts.push({ name: partName(path), part })
      }
    }
    this.scene.matrixWorldAutoUpdate = false
    this.casters = [...this.plant.casters, ...this.ground.casters]
    this.bothCasters = [...this.plant.casters, ...this.companion.casters, ...this.ground.casters]
    shared.uFocusCoc.value = config.detail.focusCocPx
  }

  shows(name: string): boolean {
    return this.only.size === 0 || this.only.has(name)
  }

  load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = (async () => {
        const { renderer } = this.stage
        await this.ground.load(this.assets)
        await this.plant.load(this.assets)
        await this.companion.load(this.assets)
        await this.field.load(this.assets)
        const module = await skyModules[`../${this.skyName}/index.ts`]()
        this.sky = module.make()
        await this.sky.load(renderer, this.assets)
        for (const { part } of this.parts) await part.load?.(renderer, this.assets)
        const total = this.assets.megabytes() + this.sky.megabytes()
        if (total > this.assets.limitMb()) throw new Error(`the ${this.assets.set} asset set needs ${total.toFixed(0)} MB of textures, over its limit`)
      })()
    }
    return this.loaded
  }

  // Draws the film's own moments once, so every program is built, every texture is with the graphics card and every buffer exists before the film starts.
  async warm(tier: TierId = 'draft', onStep?: (done: number, of: number) => void): Promise<void> {
    await this.load()
    const { renderer } = this.stage
    this.sky?.warm(renderer)
    for (const { part } of this.parts) part.warm?.(renderer)
    const frames = warmFrames()
    for (let i = 0; i < frames.length; i++) {
      await this.renderFrame(frames[i], tier)
      onStep?.(i + 1, frames.length)
      await breathe()
    }
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
    throw new Error('the asset set is chosen when the page opens')
  }

  private rigOf(seconds: number): Rig {
    const rig = rigAtFilm(seconds)
    const v = this.view
    return v.azimuthDeg === 0 && v.elevationDeg === 0 && v.dolly === 1 ? rig : orbited(rig, v)
  }

  private inputsAt(seconds: number): PlantInputs {
    return plantInputsOf(momentAt(seconds, this.at))
  }

  // The camera at one film second.
  poseAt(seconds: number): CameraPose {
    if (this.view.fixed) return fixedPose(this.view.fixed)
    const rig = this.rigOf(seconds)
    const inputs = this.inputsAt(seconds)
    const tau = tauAt(seconds)
    focusAt(tau, inputs, eyeOf(rig, this.eye), this.tip)
    return poseOf(rig, this.tip, carrierAt(tau, inputs, this.tip, this.carrier))
  }

  private nearAt(seconds: number): number {
    return this.view.fixed ? 0.003 + 0.02 * this.view.fixed.distanceM : nearPlane(this.rigOf(seconds))
  }

  worldIdAt(_frameIndex: number): string {
    return 'place'
  }

  state(frameIndex: number): FrameState {
    return stateAt(frameIndex)
  }

  renderFrame(frameIndex: number, tier: TierId, pause = false): Promise<void> {
    const job = this.busy.then(() => this.draw(frameIndex, tier, pause))
    this.busy = job.catch(() => undefined)
    return job
  }

  private light(def: WorldDef, pose: CameraPose, shutter: number): boolean {
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
    this.sun.copy(now.light).lerp(later.light, shutter).normalize()
    return now.lightKind !== 'none' && this.sun.y > 0.005 && def.sun.color[0] + def.sun.color[1] + def.sun.color[2] > 1e-4
  }

  private async draw(frameIndex: number, tier: TierId, pause: boolean): Promise<void> {
    if (this.stage.lost) throw new Error('the WebGL context was lost')
    await this.load()
    const sky = this.sky as Sky
    const frame = clampFrame(frameIndex)
    const { stage, camera } = this
    const { renderer } = stage
    const count = samplesOf(tier)
    const alone = this.diag === 'plant' || this.diag === 'backlight'
    this.lastTier = tier
    setNow(frame)
    const seconds = now.t
    const tau = now.tau
    const tauClose = later.tau
    const def = lookAt(now, sky.light(now, this.skyLight), this.look)
    shared.uFrame.value = frame
    shared.uTime.value = tau
    shared.uReal.value = seconds
    shared.uWorldTime.value = now.world
    shared.uDiag.value = DIAG[this.diag]
    shared.uSkyHorizonSun.value.fromArray(this.skyLight.horizonSun)
    this.ground.setState(def.ground, smoothstep(0.25, 1.1, heightAt(tau)))
    this.ground.show(!alone && this.shows('ground'))
    stateUniforms.uPlantWet.value = def.ground.plantWet ?? def.ground.wet
    stateUniforms.uPlantFrost.value = def.ground.frost
    stateUniforms.uPlantDew.value = def.ground.dew
    const inputs = plantInputsOf(now)
    const inputsClose = plantInputsOf(later)
    const plantOn = this.shows('plant')
    this.plant.visible = plantOn
    if (plantOn) this.plant.prepare(tau, tauClose, inputs, inputsClose)
    const first = this.poseAt(seconds)
    const fixed = this.view.fixed
    const eye = this.rigOf(seconds)
    const distanceM = fixed ? fixed.distanceM : eye.distanceM
    const heightM = fixed ? fixed.heightM : eye.heightM
    const tanX = (0.5 * config.camera.gateWidthMm) / first.focalMm
    const tanY = (tanX * stage.height) / stage.width
    const near = this.nearAt(seconds)
    // The companion is drawn when the lens could see a part of it, and once the camera is far enough back to see the ground it stands on.
    const wide = alone ? 0 : smoothstep(1.0, 1.8, distanceM)
    const beside = !alone && this.shows('companion') && (wide > 0 || companionInView(tau, inputs, first, tanX, tanY, near))
    this.companion.visible = beside
    if (beside) this.companion.prepare(tau, tauClose, inputs, inputsClose)
    fieldUniforms.uPlantWind.value = Math.min(inputs.calm ?? inputs.wind, inputs.wind)
    fieldUniforms.uPlantHeight.value = heightAt(tau)
    const fieldOn = !alone && this.shows('field')
    if (fieldOn) {
      this.field.prepare(tau, tauClose, inputs, inputsClose, heightM)
      this.field.look(first, tanX, stage.width / stage.height)
    }
    this.field.show(fieldOn)
    const quality: Quality = this.quality ?? (count > 1 ? 'film' : 'high')
    const view: View = { pose: first, width: stage.width, height: stage.height, quality, samples: count, light: this.skyLight }
    for (const { name, part } of this.parts) {
      if (alone || !this.shows(name)) {
        for (const o of part.objects) o.visible = false
        continue
      }
      part.prepare(now, later, view)
    }
    const skyOn = !alone && this.shows('sky')
    if (skyOn) sky.prepare(renderer, now, later, view)
    const height = heightAt(tauClose)
    const reach = Math.max(0.012, 0.5 * height + plantReach(tauClose) + 0.004)
    // Once the camera is far enough back to see the ground round the plant, the shadow map takes in both plants whole.
    // In a close-up it takes in what the lens sees at the plant's depth and no more, so that the shadow of a bract or a petal is as fine as the frame.
    const place = companionPlace()
    const both = Math.hypot(place.x, place.z) + reach * config.field.companion.heightRatio
    const whole = lerp(reach, both, wide)
    const depthM = fixed ? Math.max(0.05, -first.position.dot(first.forward)) : this.tip.sub(first.position).dot(first.forward)
    const seen = 1.25 * depthM * tanX * Math.hypot(1, stage.height / stage.width) + 0.02
    const fit = Math.max(wide, smoothstep(0.75, 1, seen / whole))
    const radius = Math.max(lerp(seen, whole, fit), Math.min(seen, 0.5))
    const casters = beside ? this.bothCasters : this.casters
    this.middle.set(0, 0.5 * height, 0)
    this.center.copy(first.position).addScaledVector(first.forward, depthM).lerp(this.middle, fit)
    // The depth the map spans does not depend on whether the companion is drawn, so that switching it changes no shadow.
    const span = this.center.distanceTo(this.middle) + (alone ? reach : both)
    stage.accumulator.reset()
    const samples = frameSamples(frame, count)
    for (const s of samples) {
      const at = seconds + shutterSeconds * s.shutter
      const pose = this.poseAt(at)
      shared.uShutter.value = s.shutter
      const lit = this.light(def, pose, s.shutter)
      shared.uSunDir.value.copy(this.sun)
      applyLens(camera, pose, { gateMm: config.camera.gateWidthMm, width: stage.width, height: stage.height, near: this.nearAt(at), far: farPlane, pixelX: s.pixelX, pixelY: s.pixelY, lensX: s.lensX, lensY: s.lensY })
      shared.uCamPos.value.copy(camera.position)
      shared.uFocusM.value = pose.focusM
      shared.uCocScale.value = cocScalePx(pose, config.camera.gateWidthMm, stage.width)
      if (lit && plantOn) this.shadow.render(renderer, this.scene, casters, this.sun, alone ? 1 : def.sun.softnessDeg, s.lightX, s.lightY, this.center, radius, span, s.index)
      else this.shadow.off()
      renderer.setRenderTarget(stage.sample)
      renderer.setClearColor(alone ? GREY : BLACK, 0)
      renderer.clear(true, true, false)
      for (const { name, part } of this.parts) if (!alone && this.shows(name)) part.sample?.(camera, s.shutter)
      if (skyOn) sky.render(renderer, stage.sample, camera, s.pixelX, s.pixelY, stage.width, stage.height)
      renderer.render(this.scene, camera)
      stage.accumulator.add(renderer, stage.sample.texture, s.weight)
      if (pause) await breathe()
    }
    const sunSeen = !alone && now.lightKind === 'sun'
    const sunAt = sunSeen ? sunInFrame(this.poseAt(seconds + 0.5 * shutterSeconds), this.sun.copy(now.sun).lerp(later.sun, 0.5).normalize(), config.camera.gateWidthMm, stage.width, stage.height) : null
    this.post.render(renderer, stage.accumulator.texture, def, frame, count, this.diag, sunAt)
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
    return this.assets.megabytes() + (this.sky?.megabytes() ?? 0)
  }
}

// The frames drawn before the film starts: every look of the film and the turns between them.
export function warmFrames(): number[] {
  const fps = config.film.fps
  const frames = new Set<number>()
  for (const s of [0, 2, 7.2, 12, 28.5, 35.4, 49.5, 56.0, 57.5, 62.6, 63.2, 69.5, 70.2, 80, 97, 99, 104, 118, 126]) frames.add(clampFrame(Math.round(s * fps)))
  return [...frames].sort((a, b) => a - b)
}

export interface FilmView { azimuthDeg: number; elevationDeg: number; dolly: number; world: string | null; fixed: FixedView | null }

export interface TexelCheck { frame: number; pixels: number; textured: number; soft: number; texturedOutsideSharpZone: number; softShare: number }

export interface FrameCheck { frame: number; invalid: number; tip: { x: number; y: number; depthM: number; cocPx: number } }

export type { FrameState }
