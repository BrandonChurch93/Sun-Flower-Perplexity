// One entry per key of the unit, in the order of the config, with optional values at the first and last frame of its segment.
export interface UnitFit {
  fNumber: { start?: number; keys: number[]; end?: number }
  // The share of the sharp zone's blur limit the held point takes when the focus is shared with the stem, as points of film seconds and share. Outside the points the first and the last hold.
  heldShare?: [number, number][]
}
