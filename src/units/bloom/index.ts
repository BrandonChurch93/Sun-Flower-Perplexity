import type { UnitFit } from '../../director/fit.ts'

export const fit: UnitFit = {
  fNumber: { keys: [4, 4] },
  // While the head opens, the folded rays stand up to 4 cm in front of the point the lens holds and hide it, so the focus comes forward to them and goes back to the shared place once they have spread.
  heldShare: [[40, 0.55], [42, 0.3], [43.5, 0.1], [44.5, -0.12], [44.75, -0.12], [45, 0.4], [46.5, 0.4], [48, 0.55]],
}
