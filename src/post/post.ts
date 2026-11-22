import * as THREE from 'three'
import { config } from '../config.ts'
import { FullscreenPass } from '../core/fullscreen.ts'
import { shared, type DiagName } from '../core/shading.ts'
import type { WorldDef } from '../core/world.ts'
import { fillFragment, maxFillPx, nearFragment, reachFragment } from './fill.ts'
import { brightFragment, downFragment, flareFragment, levelGain, upFragment } from './glare.ts'
import { gradeFragment } from './grade.ts'
import { gradeOf, lensLook } from './looks.ts'
import { sunReadFragment, type SunInFrame } from './sun.ts'

type Mode = 0 | 1 | 2 | 3

const MODES: Record<DiagName, Mode> = { beauty: 0, ungraded: 1, plant: 1, backlight: 1, texels: 2, depth: 3, focus: 2, standins: 2 }

// How far past the spacing of the lens samples each copy is spread. At 1 the copies of an out of focus edge still show, at 8 samples and at 48.
const fillGain = 2.3
// With one sample the three rounds together draw the whole blur circle, and this keeps their sum at its size.
const soloGain = 0.9

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
  private flareTarget: THREE.WebGLRenderTarget | null = null
  private flareLevel = 0
  private nearTarget: THREE.WebGLRenderTarget | null = null
  private readonly sunTarget = halfTarget(2, 2)
  private readonly sunRead = new FullscreenPass(sunReadFragment, { tHot: { value: null }, uSunAt: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1 } })
  private readonly near = new FullscreenPass(nearFragment(), { ...shared, tFrame: { value: null }, uRadiusScale: { value: 0.5 }, uFar: { value: 0 }, uReach: { value: 0 } })
  private readonly reach = new FullscreenPass(reachFragment, { ...shared, tFrame: { value: null }, tNear: { value: null }, uRadiusScale: { value: 0.5 }, uFar: { value: 0 }, uSpecks: { value: 0 }, uSkyHold: { value: 0 }, uAirSoft: { value: 0 }, uAirFloor: { value: 0 } })
  private readonly fillWide = fillPass(3)
  private readonly fillTight = fillPass(2)
  private readonly bright = new FullscreenPass(brightFragment, { tFrame: { value: null }, uExposure: { value: 1 }, uKnee: { value: 1 } })
  private readonly downPass = new FullscreenPass(downFragment, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() } })
  private readonly upPass = new FullscreenPass(upFragment, { tSource: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uSourceGain: { value: new THREE.Vector3(1, 1, 1) }, uBaseGain: { value: new THREE.Vector3(1, 1, 1) } })
  private readonly flare = new FullscreenPass(flareFragment, { tNear: { value: null }, tFar: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1 }, uStreak: { value: 0 }, uGhost: { value: 0 } })
  private readonly grade = new FullscreenPass(gradeFragment, {
    ...shared,
    tFrame: { value: null },
    tRaw: { value: null },
    uFar: { value: 0 },
    tBloom: { value: null },
    tFlare: { value: null },
    uBloom: { value: 0 },
    uFlare: { value: 0 },
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
    uTop: { value: 0.12 },
    uWhiten: { value: 0 },
    uBlack: { value: new THREE.Vector3() },
    tHot: { value: null },
    uSunAt: { value: new THREE.Vector2(0.5, 0.5) },
    uStar: { value: 0 },
    uStarLen: { value: 1 },
    uGlow: { value: 0 },
    uShafts: { value: 0 },
    tSun: { value: null },
    uRays: { value: 0 },
    uSunClear: { value: 0 },
    uGlowNear: { value: new THREE.Vector3(1, 0.9, 0.76) },
    uGlowFar: { value: new THREE.Vector3(1, 0.5, 0.2) },
    uAirTint: { value: new THREE.Vector3(1, 0.4, 0.12) },
    uLowSun: { value: 0 },
    uBloomWide: { value: 0.1 },
    uLowFlare: { value: 1 },
    uKnee: { value: 0.88 },
    uDisc: { value: 0 },
    uFarFill: { value: 1 },
    uSaturation: { value: 1 },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uAirSoft: { value: 0 },
    uSpokes: { value: 0 },
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
    this.flareTarget?.dispose()
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
    this.flareLevel = Math.max(0, levels - 5)
    const at = this.down[this.flareLevel]
    this.flareTarget = halfTarget(at.width, at.height)
    this.nearTarget = halfTarget(Math.max(2, Math.ceil(width / 8)), Math.max(2, Math.ceil(height / 8)))
  }

  setSize(width: number, height: number): void {
    this.fillA.setSize(width, height)
    this.fillB.setSize(width, height)
    this.buildChain(width, height)
  }

  bytes(): number {
    let sum = (this.fillA.width * this.fillA.height * 16) * 2
    for (const t of [...this.down, ...this.up]) sum += t.width * t.height * 8
    if (this.flareTarget) sum += this.flareTarget.width * this.flareTarget.height * 8
    if (this.nearTarget) sum += this.nearTarget.width * this.nearTarget.height * 8
    return sum + this.sunTarget.width * this.sunTarget.height * 8
  }

  // Closes the gaps between the copies of an out of focus thing that the lens samples leave. Returns the filled frame.
  private fillGaps(renderer: THREE.WebGLRenderer, frame: THREE.Texture, frameIndex: number, scale: number, samples: number, farCircle: number, specks: number, skyHold: number, airSoft: number, airFloor: number): THREE.Texture {
    const near = this.nearTarget as THREE.WebGLRenderTarget
    if (farCircle > 0) {
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
    r.uSpecks.value = specks
    r.uSkyHold.value = skyHold
    r.uAirSoft.value = airSoft
    r.uAirFloor.value = airFloor
    this.reach.render(renderer, this.fillA)
    let from = this.fillA
    let to = this.fillB
    // One sample has no copies to join: the whole blur circle is drawn here, so its rim is weighted as the sampler weights the rim of the lens.
    const rounds: { pass: FullscreenPass; spread: number; edge: number }[] = [
      { pass: this.fillWide, spread: 1, edge: samples === 1 ? 0.35 : 0 },
      { pass: this.fillTight, spread: 0.45, edge: 0 },
      { pass: this.fillTight, spread: 0.18, edge: 0 },
    ]
    for (let i = 0; i < rounds.length; i++) {
      const u = rounds[i].pass.uniforms
      u.tFrame.value = from.texture
      u.uSpread.value = rounds[i].spread
      u.uEdge.value = rounds[i].edge
      u.uSeed.value = frameIndex + 0.25 * i
      rounds[i].pass.render(renderer, to)
      const swap = from
      from = to
      to = swap
    }
    return from.texture
  }

  // The light the glass scatters: a pyramid of ever wider blurs of what is bright, summed with a share for each width.
  private scatter(renderer: THREE.WebGLRenderer, source: THREE.Texture, grade: WorldDef['grade'], veil: number, halation: number, core: number, tint: readonly number[]): THREE.Texture {
    const b = this.bright.uniforms
    b.tFrame.value = source
    b.uExposure.value = grade.exposure
    b.uKnee.value = grade.bloomKnee
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
      if (i === this.up.length - 1) u.uSourceGain.value.fromArray(levelGain(levels - 1, levels, veil, halation, core, tint))
      else u.uSourceGain.value.set(1, 1, 1)
      u.uBaseGain.value.fromArray(levelGain(i, levels, veil, halation, core, tint))
      this.upPass.render(renderer, this.up[i])
      from = this.up[i]
    }
    return from.texture
  }

  // The frame before lens and grade stays in the accumulator. `sun` is where the main light sits in the picture and how wide infinity blurs; without it there is no flare and the sky is filled like everything else.
  render(renderer: THREE.WebGLRenderer, frame: THREE.Texture, def: WorldDef, frameIndex: number, samples: number, diag: DiagName, sun: SunInFrame | null = null): void {
    const mode = MODES[diag]
    const g = this.grade.uniforms
    g.uMode.value = mode
    g.uSeed.value = frameIndex
    let source = frame
    if (mode === 0) {
      const look = lensLook(def, frameIndex / config.film.fps)
      const grade = gradeOf(def, frameIndex / config.film.fps)
      const airSoft = sun ? (look.air * this.fillA.height) / 1080 : 0
      // With many samples the copies already stand close and the fill would leave the disc its hard edge. A floor under its reach keeps the edge soft and the middle bright, as an apodized lens draws it.
      const scale = samples === 1 ? 0.5 * soloGain : Math.max((0.5 * fillGain) / Math.sqrt(samples), look.soft)
      source = this.fillGaps(renderer, frame, frameIndex, scale, samples, sun ? sun.farCircle : 0, look.specks, look.skyHold, airSoft, sun ? sun.y - 0.25 : 2)
      const bloom = this.scatter(renderer, source, grade, look.veil, look.halation, look.core, look.veilTint)
      const flare = sun ? look.flare * sun.weight : 0
      const target = this.flareTarget as THREE.WebGLRenderTarget
      if (flare > 0 && sun) {
        const f = this.flare.uniforms
        f.tNear.value = this.down[this.flareLevel].texture
        f.tFar.value = this.down[Math.min(this.down.length - 1, this.flareLevel + 2)].texture
        f.uSun.value.set(sun.x, sun.y)
        f.uAspect.value = target.width / target.height
        f.uStreak.value = 0.3
        f.uGhost.value = 0.09
        this.flare.render(renderer, target)
      }
      const tone = toneConstants(grade.contrast, grade.white)
      g.tBloom.value = bloom
      g.tFlare.value = target.texture
      g.uBloom.value = grade.bloom
      g.uFlare.value = flare
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
      g.uTop.value = look.top
      g.uWhiten.value = look.whiten
      g.uBlack.value.fromArray(look.black)
      // The floors under the bloom and the shafts would pop as the sun crosses the frame edge, so they fade over its last few percent.
      const margin = sun ? Math.min(1, Math.max(0, Math.min(sun.x, 1 - sun.x, sun.y, 1 - sun.y) / 0.04)) : 0
      const seen = margin * margin * (3 - 2 * margin)
      const hot = this.down[Math.min(this.down.length - 1, 3)].texture
      if (sun) {
        const r = this.sunRead.uniforms
        r.tHot.value = hot
        r.uSunAt.value.set(sun.x, sun.y)
        r.uAspect.value = this.fillA.width / this.fillA.height
        this.sunRead.render(renderer, this.sunTarget)
      }
      g.tHot.value = hot
      g.tSun.value = this.sunTarget.texture
      g.uStar.value = sun ? look.star * sun.weight * seen : 0
      g.uGlow.value = sun ? look.glow * sun.weight * seen : 0
      g.uShafts.value = sun ? look.shafts * sun.weight * seen : 0
      g.uRays.value = look.rays
      g.uSunClear.value = look.sunClear
      g.uGlowNear.value.fromArray(look.glowNear)
      g.uGlowFar.value.fromArray(look.glowFar)
      g.uAirTint.value.fromArray(look.airTint)
      g.uLowSun.value = look.lowSun
      g.uBloomWide.value = look.bloomWide
      g.uLowFlare.value = look.lowFlare
      g.uKnee.value = look.knee
      g.uDisc.value = look.disc
      g.tRaw.value = frame
      g.uFar.value = sun ? sun.farCircle : 0
      g.uFarFill.value = sun ? Math.min(sun.farCircle * scale, maxFillPx) : 1
      if (sun) g.uSunAt.value.set(sun.x, sun.y)
      g.uStarLen.value = 0.2 * this.fillA.width
      g.uSaturation.value = grade.saturation
      g.uVignette.value = grade.vignette
      g.uGrain.value = grade.grain * look.grain
      g.uAirSoft.value = airSoft
      g.uSpokes.value = look.spokes
    }
    g.tFrame.value = source
    this.grade.render(renderer, null)
  }
}


