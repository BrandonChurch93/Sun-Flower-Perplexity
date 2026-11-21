export type Range = [number, number]

export function tileRanges(ranges: Range[], whole: Range): number[] | null {
  const picked: number[] = []
  let at = whole[0]
  while (at <= whole[1]) {
    let best = -1
    for (let i = 0; i < ranges.length; i++) {
      const [a, b] = ranges[i]
      if (a !== at || b < a || b > whole[1]) continue
      if (best < 0 || b > ranges[best][1]) best = i
    }
    if (best < 0) return null
    picked.push(best)
    at = ranges[best][1] + 1
  }
  return picked
}

export function missingRanges(ranges: Range[], whole: Range): Range[] {
  const sorted = ranges.filter(([a, b]) => a <= b && b >= whole[0] && a <= whole[1]).sort((x, y) => x[0] - y[0])
  const gaps: Range[] = []
  let at = whole[0]
  for (const [a, b] of sorted) {
    if (a > at) gaps.push([at, a - 1])
    at = Math.max(at, b + 1)
  }
  if (at <= whole[1]) gaps.push([at, whole[1]])
  return gaps
}
