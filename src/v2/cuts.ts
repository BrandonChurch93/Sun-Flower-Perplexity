import { config } from '../config.ts'
import { lerp } from '../core/curves.ts'
import { hitFrame } from './clock.ts'
import { eyeView, type FixedView } from './shots.ts'

type V3 = readonly [number, number, number]

// A close shot of the frost hold. It stands from the frame that holds the downbeat of one bar to the frame that holds the downbeat of another,
// and the lens drifts at one speed from its first place to its last: it is already moving when the picture cuts to it.
export interface CloseShot { id: string; fromBar: number; toBar: number; what: string; eye: readonly [V3, V3]; at: readonly [V3, V3]; focalMm: number; fNumber: number }

export const closeShots: CloseShot[] = [
  { id: 'margin', fromBar: 19, toBar: 21, what: 'The edge of a leaf against the dim sun in the mist: the needles of ice still growing.', eye: [[0.046, 0.107, 0.168], [0.034, 0.109, 0.162]], at: [[0.039, 0.113, -0.023], [0.035, 0.112, -0.023]], focalMm: 100, fNumber: 8 },
  { id: 'tip', fromBar: 21, toBar: 23, what: 'The growing tip and the furred stem as the sun comes through: glitter.', eye: [[-0.046, 0.124, 0.204], [-0.03, 0.127, 0.196]], at: [[0.003, 0.137, 0], [0.003, 0.139, 0]], focalMm: 100, fNumber: 8 },
  { id: 'thaw', fromBar: 23, toBar: 25, what: 'A leaf as the ice goes to water: beads, and one drop that falls.', eye: [[-0.03, 0.098, 0.224], [-0.022, 0.096, 0.218]], at: [[0.044, 0.084, 0.068], [0.046, 0.082, 0.068]], focalMm: 100, fNumber: 8 },
]

const FPS = config.film.fps
const spans = closeShots.map((shot) => ({ shot, from: hitFrame(shot.fromBar), to: hitFrame(shot.toBar) }))

// The frames on which the picture cuts.
export const cutFrames: number[] = [...new Set(spans.flatMap((s) => [s.from, s.to]))].sort((a, b) => a - b)

// One frame from the middle of each close shot, for the warming before the film.
export const closeFrames: number[] = spans.map((s) => Math.round(0.5 * (s.from + s.to)))

const eye = [0, 0, 0]
const at = [0, 0, 0]

export function closeShotAt(seconds: number): CloseShot | null {
  const f = seconds * FPS + 1e-6
  for (const s of spans) if (f >= s.from && f < s.to) return s.shot
  return null
}

// The lens of the close shot that stands at this film second, or null where the film's own camera stands.
export function closeAt(seconds: number): FixedView | null {
  const f = seconds * FPS + 1e-6
  for (const s of spans) {
    if (f < s.from || f >= s.to) continue
    const u = (seconds * FPS - s.from) / (s.to - s.from)
    for (let i = 0; i < 3; i++) {
      eye[i] = lerp(s.shot.eye[0][i], s.shot.eye[1][i], u)
      at[i] = lerp(s.shot.at[0][i], s.shot.at[1][i], u)
    }
    return eyeView(eye, at, s.shot.focalMm, s.shot.fNumber)
  }
  return null
}
