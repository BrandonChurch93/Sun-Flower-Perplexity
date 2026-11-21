// The one small shape every floret is an instance of. Each vertex says which piece it belongs to and where on it; the vertex shader poses it.
// aShape = piece, level, angle or side, flag.
export const PIECE = { corolla: 0, anther: 1, style: 2, chaff: 3 } as const

const SIDES = 5
const STYLE_STEPS = 3

export interface Shape { shape: Float32Array; index: Uint16Array; triangles: number }

export function floretShape(full: boolean): Shape {
  const v: number[] = []
  const index: number[] = []
  const add = (piece: number, level: number, around: number, flag: number): number => {
    v.push(piece, level, around, flag)
    return v.length / 4 - 1
  }
  const turn = (k: number, of: number) => (k / of) * Math.PI * 2

  // The corolla: a foot of five, rings of ten (a corner, then the middle of a side) and the five tips of its lobes.
  const foot: number[] = []
  for (let k = 0; k < SIDES; k++) foot.push(add(PIECE.corolla, 0, turn(k, SIDES), 1))
  const ring = (level: number): number[] => {
    const out: number[] = []
    for (let k = 0; k < SIDES * 2; k++) out.push(add(PIECE.corolla, level, turn(k, SIDES * 2), k % 2 === 0 ? 1 : 0))
    return out
  }
  const belly = full ? ring(1) : null
  const throat = ring(2)
  const tips: number[] = []
  for (let k = 0; k < SIDES; k++) tips.push(add(PIECE.corolla, 3, turn(k, SIDES), 1))
  const first = belly ?? throat
  for (let k = 0; k < SIDES; k++) {
    const a = foot[k]
    const b = foot[(k + 1) % SIDES]
    const c0 = first[k * 2]
    const c1 = first[k * 2 + 1]
    const c2 = first[(k * 2 + 2) % (SIDES * 2)]
    index.push(a, c1, c0, a, b, c1, b, c2, c1)
  }
  if (belly) {
    for (let k = 0; k < SIDES * 2; k++) {
      const n = (k + 1) % (SIDES * 2)
      index.push(belly[k], belly[n], throat[k], belly[n], throat[n], throat[k])
    }
  }
  for (let k = 0; k < SIDES; k++) {
    const left = throat[(k * 2 + SIDES * 2 - 1) % (SIDES * 2)]
    const right = throat[k * 2 + 1]
    index.push(left, throat[k * 2], tips[k], throat[k * 2], right, tips[k])
  }

  if (full) {
    // The anther tube: a column of five sides with a knob of pollen on it.
    const rings: number[][] = []
    for (let level = 0; level < 3; level++) {
      const row: number[] = []
      for (let k = 0; k < SIDES; k++) row.push(add(PIECE.anther, level, turn(k, SIDES), 0))
      rings.push(row)
    }
    const apex = add(PIECE.anther, 3, 0, 0)
    for (let k = 0; k < SIDES; k++) {
      const n = (k + 1) % SIDES
      for (let level = 0; level < 2; level++) index.push(rings[level][k], rings[level][n], rings[level + 1][k], rings[level][n], rings[level + 1][n], rings[level + 1][k])
      index.push(rings[2][k], rings[2][n], apex)
    }
    // The two arms of the style: a ribbon each.
    for (const side of [-1, 1]) {
      const rows: number[][] = []
      for (let s = 0; s <= STYLE_STEPS; s++) rows.push([add(PIECE.style, s / STYLE_STEPS, side, -1), add(PIECE.style, s / STYLE_STEPS, side, 1)])
      for (let s = 0; s < STYLE_STEPS; s++) index.push(rows[s][0], rows[s][1], rows[s + 1][0], rows[s][1], rows[s + 1][1], rows[s + 1][0])
    }
  }

  // The chaff scale on the outer side of the floret: folded along its keel, pointed.
  const bl = add(PIECE.chaff, 0, -1, 0)
  const br = add(PIECE.chaff, 0, 1, 0)
  const ml = add(PIECE.chaff, 1, -1, 0)
  const mk = add(PIECE.chaff, 1, 0, 1)
  const mr = add(PIECE.chaff, 1, 1, 0)
  const tip = add(PIECE.chaff, 2, 0, 1)
  index.push(bl, mk, ml, bl, br, mk, br, mr, mk, ml, mk, tip, mk, mr, tip)

  return { shape: new Float32Array(v), index: new Uint16Array(index), triangles: index.length / 3 }
}

// The disc of a neighbor: a low dome of rings. aDome = share of the radius, angle.
export function domeShape(rings: number, sides: number): { dome: Float32Array; index: Uint16Array; triangles: number } {
  const v: number[] = [0, 0]
  const index: number[] = []
  for (let r = 1; r <= rings; r++) for (let s = 0; s < sides; s++) v.push(r / rings, ((s + 0.5 * r) / sides) * Math.PI * 2)
  for (let s = 0; s < sides; s++) index.push(0, 1 + s, 1 + ((s + 1) % sides))
  for (let r = 1; r < rings; r++) {
    const a = 1 + (r - 1) * sides
    const b = a + sides
    for (let s = 0; s < sides; s++) {
      const n = (s + 1) % sides
      index.push(a + s, b + s, a + n, a + n, b + s, b + n)
    }
  }
  return { dome: new Float32Array(v), index: new Uint16Array(index), triangles: index.length / 3 }
}
