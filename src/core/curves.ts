export function clamp(x: number, lo = 0, hi = 1): number {
  return x < lo ? lo : x > hi ? hi : x
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export function smootherstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

export function remap(x: number, a: number, b: number, c: number, d: number): number {
  return c + (d - c) * clamp((x - a) / (b - a))
}

export class Monotone {
  private readonly xs: number[]
  private readonly ys: number[]
  private readonly ms: number[]

  constructor(points: readonly (readonly [number, number])[], held: readonly (readonly [number, number])[] = []) {
    const n = points.length
    if (n < 2) throw new Error('a monotone curve needs two points')
    this.xs = points.map((p) => p[0])
    this.ys = points.map((p) => p[1])
    const d: number[] = []
    const h: number[] = []
    for (let i = 0; i < n - 1; i++) {
      h.push(this.xs[i + 1] - this.xs[i])
      d.push((this.ys[i + 1] - this.ys[i]) / h[i])
    }
    const m = new Array<number>(n).fill(0)
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) m[i] = 0
      else {
        const w1 = 2 * h[i] + h[i - 1]
        const w2 = h[i] + 2 * h[i - 1]
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
      }
    }
    m[0] = Monotone.end(h[0], h[1] ?? h[0], d[0], d[1] ?? d[0])
    m[n - 1] = Monotone.end(h[n - 2], h[n - 3] ?? h[n - 2], d[n - 2], d[n - 3] ?? d[n - 2])
    for (const [x, slope] of held) {
      const i = this.xs.indexOf(x)
      if (i < 0) throw new Error(`no point at ${x} to hold a slope at`)
      m[i] = slope
    }
    this.ms = m
  }

  slopeAt(x: number): number {
    const i = this.xs.indexOf(x)
    if (i < 0) throw new Error(`no point at ${x}`)
    return this.ms[i]
  }

  private static end(h0: number, h1: number, d0: number, d1: number): number {
    let m = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
    if (Math.sign(m) !== Math.sign(d0)) m = 0
    else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(m) > 3 * Math.abs(d0)) m = 3 * d0
    return m
  }

  private span(x: number): number {
    const xs = this.xs
    let lo = 0
    let hi = xs.length - 2
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (xs[mid] <= x) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  at(x: number): number {
    const xs = this.xs
    const n = xs.length
    if (x <= xs[0]) return this.ys[0]
    if (x >= xs[n - 1]) return this.ys[n - 1]
    const i = this.span(x)
    const h = xs[i + 1] - xs[i]
    const t = (x - xs[i]) / h
    const t2 = t * t
    const t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * this.ys[i] + (t3 - 2 * t2 + t) * h * this.ms[i] + (-2 * t3 + 3 * t2) * this.ys[i + 1] + (t3 - t2) * h * this.ms[i + 1]
  }

  slope(x: number): number {
    const xs = this.xs
    const n = xs.length
    if (x <= xs[0]) return this.ms[0]
    if (x >= xs[n - 1]) return this.ms[n - 1]
    const i = this.span(x)
    const h = xs[i + 1] - xs[i]
    const t = (x - xs[i]) / h
    const t2 = t * t
    return ((6 * t2 - 6 * t) * this.ys[i]) / h + (3 * t2 - 4 * t + 1) * this.ms[i] + ((-6 * t2 + 6 * t) * this.ys[i + 1]) / h + (3 * t2 - 2 * t) * this.ms[i + 1]
  }
}
