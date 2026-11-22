import { config, frameCount, timeOf } from '../../src/config.ts'
import { heightAt, rayCount, rayOpen, usePlant } from '../../src/plant/growth.ts'

export interface GrowthRun { first: number; measure: 'height' | 'opening'; change: number }

const share = (frame: number): number => {
  const now = heightAt(timeOf(frame))
  return now > 0 ? (now - heightAt(timeOf(frame - 1))) / now : 0
}
const opening = (frame: number): number => {
  let sum = 0
  for (let k = 0; k < rayCount; k++) sum += rayOpen(k, timeOf(frame)) - rayOpen(k, timeOf(frame - 1))
  return Math.abs(sum) / rayCount
}

export function peakRuns(steps: number[], count: number): { first: number; change: number }[] {
  const sums: number[] = []
  for (let first = 0; first + count <= steps.length; first++) {
    let sum = 0
    for (let i = 1; i < count; i++) sum += steps[first + i]
    sums.push(sum)
  }
  const out: { first: number; change: number }[] = []
  for (let first = 0; first < sums.length; first++) {
    if (!(sums[first] > 0)) continue
    let top = true
    for (let other = Math.max(0, first - count); other <= Math.min(sums.length - 1, first + count) && top; other++) {
      if (sums[other] > sums[first] || (sums[other] === sums[first] && other < first)) top = false
    }
    if (top) out.push({ first, change: sums[first] })
  }
  return out
}

export function growthRuns(count: number = config.critics.contactSheetFrames): GrowthRun[] {
  usePlant(0)
  const measures: { measure: GrowthRun['measure']; step: (frame: number) => number }[] = [
    { measure: 'height', step: share },
    { measure: 'opening', step: opening },
  ]
  const out: GrowthRun[] = []
  for (const { measure, step } of measures) {
    const steps = Array.from({ length: frameCount }, (_, frame) => (frame === 0 ? 0 : step(frame)))
    for (const run of peakRuns(steps, count)) out.push({ ...run, measure })
  }
  const kept: GrowthRun[] = []
  for (const run of out.sort((a, b) => a.first - b.first)) {
    const last = kept[kept.length - 1]
    if (last && run.first < last.first + count) continue
    kept.push(run)
  }
  return kept
}
