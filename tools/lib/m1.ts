import { config, frameOf } from '../../src/config.ts'
import type { FrameCheck } from '../../src/director/film.ts'

export interface M1Result { frame: number; pass: boolean; reasons: string[]; invalid: number; tip: FrameCheck['tip'] }

export function m1Of(check: FrameCheck): M1Result {
  const reasons: string[] = []
  if (check.invalid > 0) reasons.push(`${check.invalid} pixels hold an invalid value`)
  if (check.frame >= frameOf(config.film.hookSeconds)) {
    const m = config.detail.tipMarginFraction
    const { x, y, cocPx } = check.tip
    if (!(x >= m && x <= 1 - m && y >= m && y <= 1 - m)) reasons.push(`the tip is at ${x.toFixed(3)}, ${y.toFixed(3)}, closer than ${m} to an edge or outside the frame`)
    if (!(cocPx >= 0 && cocPx < config.detail.focusCocPx)) reasons.push(cocPx < 0 ? 'no blur circle was found at the tip' : `the blur circle at the tip is ${cocPx.toFixed(2)} px, not under ${config.detail.focusCocPx}`)
  }
  return { frame: check.frame, pass: reasons.length === 0, reasons, invalid: check.invalid, tip: check.tip }
}
