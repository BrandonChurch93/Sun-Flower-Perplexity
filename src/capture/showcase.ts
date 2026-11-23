import { REVISION } from 'three'
import { config, frameCount, type TierId } from '../config.ts'
import { isDiag } from '../core/shading.ts'
import { REQUIRED_EXTENSIONS } from '../core/stage.ts'
import { standIns, type StandIn } from '../core/standins.ts'
import { formatById, isAssetSet, isTier } from '../core/tiers.ts'
import type { Film, FrameCheck, FrameState, TexelCheck } from '../director/film.ts'
import { madeSoFar, type Made } from '../v2/counter.ts'
import { views, type ViewName } from '../v2/shots.ts'

declare const __ENGINE_HASH__: string
declare const __UNIT_HASHES__: Record<string, string>
declare const __VERSIONS__: Record<string, string>

export interface ShowcaseInfo {
  frameCount: number
  fps: number
  format: string
  tier: string
  assets: string
  engineHash: string
  unitHashes: Record<string, string>
  standIns: StandIn[]
  textureMb: number
  versions: Record<string, string>
}

export interface Showcase {
  ready: Promise<void>
  info(): ShowcaseInfo
  state(frameIndex: number): FrameState
  setFormat(id: string): Promise<void>
  setAssets(id: string): Promise<void>
  setDiagnostic(view: string): void
  renderFrame(frameIndex: number, tier: string): Promise<void>
  requirements(): { extensions: string[]; limits: Record<string, number> }
  check(frameIndex: number): FrameCheck
  texels(frameIndex: number): TexelCheck
  // Draws the film's own moments once so that nothing is left to make while it plays.
  warm(tier: string): Promise<void>
  // What the graphics card has been asked to make since the page opened.
  made(): Made
  setView(name: string): void
  // The world at rest: no weather, no wind, one fixed sun. For the checks that look for growth.
  setStill(on: boolean): void
  sky(): string
}

declare global {
  interface Window { showcase: Showcase }
}

export function installShowcase(film: Film, ready: Promise<void>): Showcase {
  const showcase: Showcase = {
    ready,
    info: () => ({
      frameCount,
      fps: config.film.fps,
      format: film.format.id,
      tier: film.lastTier,
      assets: film.assets.set,
      engineHash: __ENGINE_HASH__,
      unitHashes: __UNIT_HASHES__,
      standIns: standIns(),
      textureMb: film.textureMb(),
      versions: { ...__VERSIONS__, three: REVISION },
    }),
    state: (frameIndex) => film.state(frameIndex),
    setFormat: (id) => film.setFormat(formatById(id)),
    setAssets: (id) => {
      if (!isAssetSet(id)) throw new Error(`unknown asset set "${id}"`)
      return film.setAssets(id)
    },
    setDiagnostic: (view) => {
      if (!isDiag(view)) throw new Error(`unknown diagnostic view "${view}"`)
      film.diag = view
    },
    renderFrame: (frameIndex, tier) => {
      if (!isTier(tier)) throw new Error(`unknown tier "${tier}"`)
      return film.renderFrame(frameIndex, tier as TierId)
    },
    check: (frameIndex) => film.check(frameIndex),
    texels: (frameIndex) => film.texels(frameIndex),
    warm: (tier) => {
      if (!isTier(tier)) throw new Error(`unknown tier "${tier}"`)
      return film.warm(tier as TierId)
    },
    made: () => madeSoFar(),
    setView: (name) => {
      if (name !== 'film' && !(name in views)) throw new Error(`unknown view "${name}"`)
      film.view.fixed = name === 'film' ? null : views[name as Exclude<ViewName, 'film'>]
    },
    setStill: (on) => film.setStill(on),
    sky: () => film.skyName,
    requirements: () => ({
      extensions: REQUIRED_EXTENSIONS.slice(),
      limits: {
        MAX_TEXTURE_SIZE: Math.max(film.format.width, film.format.height, 2048, film.assets.largestSide()),
        MAX_RENDERBUFFER_SIZE: Math.max(film.format.width, film.format.height, 2048),
        MAX_VERTEX_ATTRIBS: 8,
        MAX_DRAW_BUFFERS: 1,
      },
    }),
  }
  window.showcase = showcase
  return showcase
}
