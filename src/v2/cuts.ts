import { config } from '../config.ts'
import { lerp } from '../core/curves.ts'
import { hitFrame } from './clock.ts'
import { eyeView, type FixedView } from './shots.ts'

type V3 = readonly [number, number, number]

// A close shot of the frost hold. It stands from the frame that holds the downbeat of one bar to the frame that holds the downbeat of another,
// and the lens drifts at one speed from its first place to its last: it is already moving when the picture cuts to it.
// `sharp` is how far before and how far behind the point the lens looks at everything is sharp, in metres: the whole leaf in frame, as in a macro picture put together from several focus distances.
// Behind that the blur grows with the stop: at f/11 and f/22 a glint on the frozen ground behind opens into a disc of 4 to 5 percent of the frame's width.
// `look` is the grade of this set up beside the wide shot's: factors on the sky's level, on the key and the fill, and on the grade. The picture cuts to a close shot, so its look may differ as it would between two set ups of one camera.
export interface ShotLook { level?: number; key?: number; fill?: number; contrast?: number; saturation?: number; bloom?: number; vignette?: number; gain?: V3 }
export interface CloseShot { id: string; fromBar: number; toBar: number; what: string; eye: readonly [V3, V3]; at: readonly [V3, V3]; focalMm: number; fNumber: number; sharp?: readonly [number, number]; look?: ShotLook }

export const closeShots: CloseShot[] = [
  { id: 'margin', fromBar: 19, toBar: 21, what: 'A leaf from above, its tip to the left, the frozen ground soft behind it: the ice on its face and the needles along its edge, still growing.', eye: [[-0.0887, 0.2018, 0.224], [-0.0577, 0.1822, 0.2142]], at: [[-0.0495, 0.1097, 0.0394], [-0.0458, 0.1099, 0.0443]], focalMm: 100, fNumber: 11, sharp: [0.026, 0.057], look: { key: 1.3, fill: 1.35, contrast: 1.06, bloom: 1.6, vignette: 1.2, gain: [0.97, 1, 1.05] } },
  { id: 'tip', fromBar: 21, toBar: 23, what: 'The growing tip and the furred stem as the sun comes through: glitter.', eye: [[-0.0239, 0.13, 0.2339], [-0.0142, 0.132, 0.2216]], at: [[-0.001, 0.134, 0.0], [-0.001, 0.135, 0.0]], focalMm: 100, fNumber: 22, sharp: [0.046, 0.04], look: { level: 0.8, key: 1.2, fill: 0.62, contrast: 1.08, saturation: 0.92, bloom: 1.5, vignette: 1.4, gain: [0.92, 1, 1.13] } },
  { id: 'thaw', fromBar: 23, toBar: 25, what: 'A leaf in profile as the ice goes to water: beads, and one drop at its tip that falls.', eye: [[-0.1085, 0.071, 0.2004], [-0.0932, 0.071, 0.1934]], at: [[0.0446, 0.065, 0.0626], [0.0446, 0.065, 0.0626]], focalMm: 85, fNumber: 22, sharp: [0.035, 0.04], look: { key: 1.1, fill: 0.75, contrast: 1.08, bloom: 1.3, vignette: 1.25, gain: [1.03, 1, 0.97] } },
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
    const sharp = s.shot.sharp
    if (!sharp) return eyeView(eye, at, s.shot.focalMm, s.shot.fNumber)
    const reach = Math.hypot(at[0] - eye[0], at[1] - eye[1], at[2] - eye[2])
    return eyeView(eye, at, s.shot.focalMm, s.shot.fNumber, reach + sharp[1], reach - sharp[0])
  }
  return null
}
