import type { FrameState } from './state.ts'

export interface Step { name: string; across: number; ordinary: number; ratio: number }
export interface Continuity { frame: number; steps: Step[]; worst: Step }

const CAMERA = ['camera x', 'camera y', 'camera z', 'aim x', 'aim y', 'aim z', 'focal length', 'focus distance', 'f-number']
const PLANT = ['height', 'tip x', 'tip y', 'tip z', 'stem radius', 'leaf length', 'lean x', 'lean z', 'lift']
const TINY = 1e-9

// The change over the cut, measured against the larger of the changes over the frame before it and the frame after it.
export function continuityFrom(stateOf: (frame: number) => FrameState, cutFrame: number): Continuity {
  const read = (f: number) => {
    const s = stateOf(f)
    return [...s.camera, ...s.plant]
  }
  const names = [...CAMERA, ...PLANT]
  const a = read(cutFrame - 2)
  const b = read(cutFrame - 1)
  const c = read(cutFrame)
  const d = read(cutFrame + 1)
  const steps: Step[] = c.map((_, i) => {
    const across = Math.abs(c[i] - b[i])
    const ordinary = Math.max(Math.abs(b[i] - a[i]), Math.abs(d[i] - c[i]))
    const ratio = across <= TINY ? 0 : ordinary <= TINY ? Infinity : across / ordinary
    return { name: names[i] ?? `number ${i}`, across, ordinary, ratio }
  })
  const worst = steps.reduce((w, s) => (s.ratio > w.ratio ? s : w), steps[0])
  return { frame: cutFrame, steps, worst }
}
