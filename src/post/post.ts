import * as THREE from 'three'
import { FullscreenPass } from '../core/fullscreen.ts'
import { shared, type DiagName } from '../core/shading.ts'
import type { WorldDef } from '../core/world.ts'
import type { Quality } from '../v2/api.ts'
import { now } from '../v2/now.ts'
import { fillFragment, nearFragment, reachFragment } from './fill.ts'
import { brightFragment, downFragment, levelGain, SHAFT_TAPS, shaftFragment, upFragment } from './glare.ts'
import { gradeFragment } from './grade.ts'
import { blankLens, lensAt, lum, type LensLook } from './looks.ts'
import { sunReadFragment, type SunInFrame } from './sun.ts'

type Mode = 0 | 1 | 2 | 3

const MODES: Record<DiagName, Mode> = { beauty: 0, ungraded: 1, plant: 1, backlight: 1, texels: 2, depth: 3, focus: 2, standins: 2 }

// How far past the spacing of the lens samples each copy is spread. At 1 the copies of an out of focus edge still show, at the review tier's sample count and at the final tier's.
const fillGain = 2.3
// With one sample the three rounds together draw the whole blur circle, and this keeps their sum at its size.
const soloGain = 0.9
// The pyramid level the shafts are cast through.
const OPEN_LEVEL = 1
// The level the tear in the deck is looked for in.
const HOLE_LEVEL = 3

function halfTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const t = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  })
  t.texture.colorSpace = THREE.NoColorSpace
  return t
}

function fullTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const t = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  })
  t.texture.colorSpace = THREE.NoColorSpace
  return t
}

export function toneConstants(contrast: number, white: number): { m: number; norm: number } {
  const a = Math.pow(0.18, contrast)
  const w = Math.pow(white, contrast)
  const m = (0.82 * a * w) / (0.18 * w - a)
  return { m, norm: (w + m) / w }
}

function fillPass(rings: number): FullscreenPass {
  return new FullscreenPass(fillFragment(rings), { ...shared, tFrame: { value: null }, uSpread: { value: 1 }, uEdge: { value: 0 }, uSeed: { value: 0 } })
}

export class Post {
  private fillA: THREE.WebGLRenderTarget
  private fillB: THREE.WebGLRenderTarget
  private down: THREE.WebGLRenderTarget[] = []
  private up: THREE.WebGLRenderTarget[] = []
  private shaftA: THREE.WebGLRenderTarget | null = null
  private shaftB: THREE.WebGLRenderTarget | null = null
  private nearTarget: THREE.WebGLRenderTarget | null = null
  private quality: Quality | null = null
  private held = false
  private warmed = false
  private readonly look: LensLook = blankLens()
  private readonly sunTarget = halfTarget(2, 2)
  private readonly sunRead = new FullscreenPass(sunReadFragment, { tRaw: { value: null }, tBright: { value: null }, uSunAt: { value: new THREE.Vector2(0.5, 0.5) }, uTrack: { value: new THREE.Vector2(0, 0) }, uAspect: { value: 1 }, uPatch: { value: 0.02 }, uFar: { value: 0 } })
  private readonly near = new FullscreenPass(nearFragment(), { ...shared, tFrame: { value: null }, uRadiusScale: { value: 0.5 }, uFar: { value: 0 }, uReach: { value: 0 } })
  private readonly reach = new FullscreenPass(reachFragment, { ...shared, tFrame: { value: null }, tNear: { value: null }, uRadiusScale: { value: 0.5 }, uFar: { value: 0 }, uSpecks: { value: 0 }, uSkyHold: { value: 0 } })
  private readonly fillWide = fillPass(3)
  private readonly fillTight = fillPass(2)
  private readonly bright = new FullscreenPass(brightFragment, { tFrame: { value: null }, uExposure: { value: 1 }, uKnee: { value: 1 }, uSkyLevel: { value: 1 } })
  private readonly downPass = new FullscreenPass(downFragment, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() } })
  private readonly upPass = new FullscreenPass(upFragment, { tSource: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uSourceGain: { value: new THREE.Vector3(1, 1, 1) }, uBaseGain: { value: new THREE.Vector3(1, 1, 1) } })
  private readonly shaft = new FullscreenPass(shaftFragment, { tSource: { value: null }, tSun: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uRatio: { value: 1 }, uAspect: { value: 1 }, uFan: { value: 0 }, uAlpha: { value: 0 } })
  private readonly grade = new FullscreenPass(gradeFragment, {
    ...shared,
    tFrame: { value: null },
    tBloom: { value: null },
    tShafts: { value: null },
    tOpen: { value: null },
    tSun: { value: null },
    uBloom: { value: 0 },
    uExposure: { value: 1 },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uLift: { value: new THREE.Vector3() },
    uContrast: { value: 1 },
    uToneM: { value: 1 },
    uToneNorm: { value: 1 },
    uKeep: { value: 0 },
    uPunch: { value: 0 },
    uPale: { value: 0 },
    uGreens: { value: 1 },
    uKnee: { value: 0.88 },
    uTop: { value: 0.12 },
    uWhiten: { value: 0 },
    uBlack: { value: new THREE.Vector3() },
    uSunAt: { value: new THREE.Vector2(0.5, 0.5) },
    uSunLight: { value: new THREE.Vector3() },
    uSunAir: { value: new THREE.Vector3(1, 1, 1) },
    uSunCore: { value: 0.01 },
    uSunHot: { value: 0 },
    uFan: { value: 0 },
    uShaftLevel: { value: 0 },
    uBloomCap: { value: 0 },
    uHaze: { value: 0 },
    uVeilSun: { value: 0 },
    uMist: { value: 0 },
    uWarm: { value: 0 },
    tRaw: { value: null },
    uFar: { value: 0 },
    uShafts: { value: 0 },
    uSaturation: { value: 1 },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uSeed: { value: 0 },
    uMode: { value: 0 },
  })

  constructor(width: number, height: number) {
    this.fillA = fullTarget(width, height)
    this.fillB = fullTarget(width, height)
    this.buildChain(width, height)
  }

  private buildChain(width: number, height: number): void {
    for (const t of [...this.down, ...this.up]) t.dispose()
    this.shaftA?.dispose()
    this.shaftB?.dispose()
    this.nearTarget?.dispose()
    this.down = []
    this.up = []
    // The widest level is about eight texels tall: one texel of it is an eighth of the frame, which is what carries the veil.
    const levels = Math.min(8, Math.max(3, Math.floor(Math.log2(height / 8))))
    let w = width
    let h = height
    for (let i = 0; i < levels; i++) {
      w = Math.max(2, Math.ceil(w / 2))
      h = Math.max(2, Math.ceil(h / 2))
      this.down.push(halfTarget(w, h))
      if (i < levels - 1) this.up.push(halfTarget(w, h))
    }
    const at = this.down[OPEN_LEVEL]
    this.shaftA = halfTarget(at.width, at.height)
    this.shaftB = halfTarget(at.width, at.height)
    this.nearTarget = halfTarget(Math.max(2, Math.ceil(width / 8)), Math.max(2, Math.ceil(height / 8)))
    this.warmed = false
  }

  setSize(width: number, height: number): void {
    this.fillA.setSize(width, height)
    this.fillB.setSize(width, height)
    this.buildChain(width, height)
  }

  // `film` and `high` draw everything. `low` is for a weak graphics card: the out of focus fill takes two rounds in place of three and the shafts two in place of three.
  setQuality(quality: Quality | null): void {
    this.quality = quality
  }

  // For the proofs of a world at rest: the grain stops following the frame, so nothing of the lens changes from frame to frame.
  setStill(on: boolean): void {
    this.held = on
  }

  bytes(): number {
    let sum = (this.fillA.width * this.fillA.height * 16) * 2
    for (const t of [...this.down, ...this.up, this.shaftA, this.shaftB, this.nearTarget]) if (t) sum += t.width * t.height * 8
    return sum + this.sunTarget.width * this.sunTarget.height * 8
  }

  // Closes the gaps between the copies of an out of focus thing that the lens samples leave. Returns the filled frame.
  private fillGaps(renderer: THREE.WebGLRenderer, frame: THREE.Texture, scale: number, samples: number, farCircle: number, low: boolean): THREE.Texture {
    const near = this.nearTarget as THREE.WebGLRenderTarget
    if (farCircle > 0 || !this.warmed) {
      const n = this.near.uniforms
      n.tFrame.value = frame
      n.uRadiusScale.value = scale
      n.uFar.value = farCircle
      n.uReach.value = Math.min(128, 2 * farCircle + 8)
      this.near.render(renderer, near)
    }
    const r = this.reach.uniforms
    r.tFrame.value = frame
    r.tNear.value = near.texture
    r.uRadiusScale.value = scale
    r.uFar.value = farCircle
    r.uSpecks.value = this.look.specks
    r.uSkyHold.value = 1
    this.reach.render(renderer, this.fillA)
    let from = this.fillA
    let to = this.fillB
    // One sample has no copies to join: the whole blur circle is drawn here, so its rim is weighted as the sampler weights the rim of the lens.
    const rounds: { pass: FullscreenPass; spread: number; edge: number }[] = low
      ? [
          { pass: this.fillWide, spread: 1, edge: samples === 1 ? 0.35 : 0 },
          { pass: this.fillTight, spread: 0.3, edge: 0 },
        ]
      : [
          { pass: this.fillWide, spread: 1, edge: samples === 1 ? 0.35 : 0 },
          { pass: this.fillTight, spread: 0.45, edge: 0 },
          { pass: this.fillTight, spread: 0.18, edge: 0 },
        ]
    for (let i = 0; i < rounds.length; i++) {
      const u = rounds[i].pass.uniforms
      u.tFrame.value = from.texture
      u.uSpread.value = rounds[i].spread
      u.uEdge.value = rounds[i].edge
      // The stipple of the fill is a fixed pattern: one that followed the frame made far things a little sharper in some frames than in others.
      u.uSeed.value = 0.25 * i
      rounds[i].pass.render(renderer, to)
      const swap = from
      from = to
      to = swap
    }
    return from.texture
  }

  // The light the glass scatters: a pyramid of ever wider blurs of what is bright, summed with a share for each width.
  private scatter(renderer: THREE.WebGLRenderer, source: THREE.Texture, grade: WorldDef['grade'], skyLevel: number): THREE.Texture {
    const look = this.look
    const b = this.bright.uniforms
    b.tFrame.value = source
    b.uExposure.value = grade.exposure
    b.uKnee.value = grade.bloomKnee
    b.uSkyLevel.value = skyLevel
    this.bright.render(renderer, this.down[0])
    const levels = this.down.length
    for (let i = 1; i < levels; i++) {
      const d = this.downPass.uniforms
      d.tSource.value = this.down[i - 1].texture
      d.uTexel.value.set(0.5 / this.down[i].width, 0.5 / this.down[i].height)
      this.downPass.render(renderer, this.down[i])
    }
    let from = this.down[levels - 1]
    const u = this.upPass.uniforms
    for (let i = this.up.length - 1; i >= 0; i--) {
      u.tSource.value = from.texture
      u.tBase.value = this.down[i].texture
      u.uTexel.value.set(1 / from.width, 1 / from.height)
      if (i === this.up.length - 1) u.uSourceGain.value.fromArray(levelGain(levels - 1, levels, look.veil, look.halation, look.core))
      else u.uSourceGain.value.set(1, 1, 1)
      u.uBaseGain.value.fromArray(levelGain(i, levels, look.veil, look.halation, look.core))
      this.upPass.render(renderer, this.up[i])
      from = this.up[i]
    }
    return from.texture
  }

  // How open the way to the sun is from every place in the frame, at a quarter of its size.
  private castShafts(renderer: THREE.WebGLRenderer, sun: SunInFrame, rounds: number, aspect: number, fan: number): THREE.Texture {
    const a = this.shaftA as THREE.WebGLRenderTarget
    const b = this.shaftB as THREE.WebGLRenderTarget
    const u = this.shaft.uniforms
    u.uSun.value.set(sun.x, sun.y)
    u.tSun.value = this.sunTarget.texture
    u.uAspect.value = aspect
    u.uFan.value = fan
    // The last reading stands at a twelfth of the way from the sun, whatever the count.
    const total = Math.pow(SHAFT_TAPS, rounds) - 1
    let ratio = Math.exp(Math.log(1 / 12) / total)
    let source: THREE.Texture = this.down[OPEN_LEVEL].texture
    let to = a
    for (let i = 0; i < rounds; i++) {
      u.tSource.value = source
      u.uRatio.value = ratio
      u.uAlpha.value = i === 0 ? 1 : 0
      this.shaft.render(renderer, to)
      source = to.texture
      to = to === a ? b : a
      ratio = Math.pow(ratio, SHAFT_TAPS)
    }
    return source
  }

  // The frame before lens and grade stays in the accumulator. `sun` is where the sun sits in the picture and how wide infinity blurs; without it the glass sees no sun and the sky is filled like everything else.
  render(renderer: THREE.WebGLRenderer, frame: THREE.Texture, def: WorldDef, frameIndex: number, samples: number, diag: DiagName, sun: SunInFrame | null = null): void {
    const mode = MODES[diag]
    const seed = this.held ? 0 : frameIndex
    const g = this.grade.uniforms
    g.uMode.value = mode
    g.uSeed.value = seed
    let source = frame
    if (mode === 0) {
      const width = this.fillA.width
      const height = this.fillA.height
      const aspect = width / height
      const low = (this.quality ?? (samples > 1 ? 'film' : 'high')) === 'low'
      const look = lensAt(now, def, sun, aspect, this.look)
      const grade = def.grade
      const farCircle = sun ? sun.farCircle : 0
      const scale = samples === 1 ? 0.5 * soloGain : (0.5 * fillGain) / Math.sqrt(samples)
      source = this.fillGaps(renderer, frame, scale, samples, farCircle, low)
      const toSun = shared.uSkyHorizonSun.value
      const skyLevel = Math.max(lum([toSun.x, toSun.y, toSun.z]) * grade.exposure, 1e-4)
      const bloom = this.scatter(renderer, source, grade, skyLevel)
      const light = lum(look.sun)
      const at = sun ?? { x: 0.5, y: 0.5, weight: 0, farCircle: 0 }
      const disc = at.disc ?? 0.005
      const blurred = Math.hypot(disc, (0.5 * farCircle) / width)
      if (light > 0 || !this.warmed) {
        const r = this.sunRead.uniforms
        r.tRaw.value = frame
        r.tBright.value = this.down[Math.min(HOLE_LEVEL, this.down.length - 1)].texture
        r.uSunAt.value.set(at.x, at.y)
        r.uTrack.value.set(at.dx ?? 0, at.dy ?? 0)
        r.uAspect.value = aspect
        r.uPatch.value = Math.max(blurred, 1 / width)
        r.uFar.value = farCircle
        this.sunRead.render(renderer, this.sunTarget)
      }
      const cast = light * look.shafts > 0 || !this.warmed
      const shafts = cast ? this.castShafts(renderer, at, low ? 2 : 3, aspect, look.fan) : (this.shaftA as THREE.WebGLRenderTarget).texture
      const tone = toneConstants(grade.contrast, grade.white)
      g.tBloom.value = bloom
      g.tShafts.value = shafts
      g.tOpen.value = this.down[OPEN_LEVEL].texture
      g.tSun.value = this.sunTarget.texture
      g.uBloom.value = grade.bloom * look.bloom
      g.uExposure.value = grade.exposure
      g.uGain.value.fromArray(grade.gain)
      g.uLift.value.fromArray(grade.lift)
      g.uContrast.value = grade.contrast
      g.uToneM.value = tone.m
      g.uToneNorm.value = tone.norm
      g.uKeep.value = look.keep
      g.uPunch.value = look.punch
      g.uPale.value = look.pale
      g.uGreens.value = look.greens
      g.uKnee.value = look.knee
      g.uTop.value = look.top
      g.uWhiten.value = look.whiten
      g.uBlack.value.fromArray(look.black)
      g.uSunAt.value.set(at.x, at.y)
      g.uSunLight.value.fromArray(look.sun).multiplyScalar(look.glare)
      g.uSunAir.value.fromArray(look.air)
      g.uSunCore.value = 1.2 * blurred * (1 + 0.8 * look.warm)
      g.uSunHot.value = (8 * disc * disc) / (blurred * blurred)
      g.uHaze.value = look.haze
      g.uFan.value = look.fan
      // Under a deck that has just torn the sun itself is still thin, and the beams carry the light of the gap: the level between the two.
      g.uShaftLevel.value = Math.sqrt(Math.max(look.sun[0], look.sun[1], look.sun[2]) * look.glare * skyLevel)
      g.uBloomCap.value = look.cap
      g.uVeilSun.value = look.veilSun
      g.uMist.value = look.mist
      g.uWarm.value = look.warm
      g.tRaw.value = frame
      g.uFar.value = farCircle
      g.uShafts.value = cast ? look.shafts : 0
      g.uSaturation.value = grade.saturation
      g.uVignette.value = grade.vignette
      g.uGrain.value = grade.grain * look.grain
      this.warmed = true
    }
    g.tFrame.value = source
    this.grade.render(renderer, null)
  }
}
