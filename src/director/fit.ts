// One entry per key of the unit, in the order of the config, with optional values at the first and last frame of its segment.
export interface UnitFit {
  fNumber: { start?: number; keys: number[]; end?: number }
}
