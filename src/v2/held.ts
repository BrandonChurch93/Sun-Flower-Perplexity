import * as THREE from 'three'
import { config } from '../config.ts'
import { closeShotAt } from './cuts.ts'
import { HOLD_FRAMES } from './inputs.ts'

const FPS = config.film.fps

// While the plant's clock stands, each shot has one lens the plant is thinned for: the nearest look that shot takes at it. It is the same on every frame of the shot, so nothing has to be chosen again while the shot lasts.
// The film's own camera stands on both sides of the close shots of a hold: those frames share one lens.
export const heldFrames: number[][] = []
const lensOf = new Map<number, number>()
for (const [from, to] of HOLD_FRAMES) {
  const own = new Map<string, number>()
  for (let f = from; f <= to; f++) {
    const id = closeShotAt(f / FPS)?.id ?? 'film'
    let i = own.get(id)
    if (i === undefined) {
      i = heldFrames.length
      heldFrames.push([])
      own.set(id, i)
    }
    heldFrames[i].push(f)
    lensOf.set(f, i)
  }
}

// Which held lens a frame is drawn under, or -1 where the plant grows.
export function heldLensAt(frame: number): number {
  return lensOf.get(frame) ?? -1
}

// The held lens of the frame being drawn, set by the film before anything is drawn. `lens` is -1 where there is none.
// `perTan` is pixels for a tangent of one, `cocScale` the blur circle in pixels for a difference of one in 1 / depth, both at the size of the frame being drawn.
// Everything from `focusNearM` to `focusM` is sharp; the two are equal for a lens focused at one distance. `blurPx` in `core/lens.ts` gives the blur circle.
export const held = { lens: -1, eye: new THREE.Vector3(), forward: new THREE.Vector3(), perTan: 0, focusM: 1, focusNearM: 1, cocScale: 0 }
