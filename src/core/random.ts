import { config } from '../config.ts'

export function hash32(x: number): number {
  let h = x >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return h >>> 0
}

export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function combine(a: number, b: number): number {
  return hash32((a ^ (Math.imul(b, 0x9e3779b1) + 0x85ebca6b + (a << 6) + (a >>> 2))) >>> 0)
}

export class Random {
  private a: number
  private b: number
  private c: number
  private d: number

  constructor(seed: number) {
    this.a = hash32(seed)
    this.b = hash32(this.a ^ 0x9e3779b9)
    this.c = hash32(this.b ^ 0x243f6a88)
    this.d = hash32(this.c ^ 0xb7e15162)
    for (let i = 0; i < 12; i++) this.uint()
  }

  uint(): number {
    this.a >>>= 0
    this.b >>>= 0
    this.c >>>= 0
    this.d >>>= 0
    let t = (this.a + this.b) | 0
    this.a = this.b ^ (this.b >>> 9)
    this.b = (this.c + (this.c << 3)) | 0
    this.c = (this.c << 21) | (this.c >>> 11)
    this.d = (this.d + 1) | 0
    t = (t + this.d) | 0
    this.c = (this.c + t) | 0
    return t >>> 0
  }

  next(): number {
    return this.uint() / 4294967296
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next()
  }

  int(n: number): number {
    return Math.floor(this.next() * n)
  }

  gauss(): number {
    const u = Math.max(this.next(), 1e-12)
    const v = this.next()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  pick<T>(list: readonly T[]): T {
    return list[this.int(list.length)]
  }
}

export function streamSeed(name: string, seed: number = config.seed): number {
  return combine(hash32(seed), hashString(name))
}

export function stream(name: string, seed: number = config.seed): Random {
  return new Random(streamSeed(name, seed))
}

export function hash01(seed: number, i: number, j = 0): number {
  return combine(combine(seed, i), j) / 4294967296
}

export function hashRange(seed: number, i: number, j: number, lo: number, hi: number): number {
  return lo + (hi - lo) * hash01(seed, i, j)
}
