// A centered shutter for the foreground crossing the lunar disc, not for
// the moon's own rise in twilight nor for the rest of the cloud picture.
export const MOON_SHUTTER = 7
const NOTCH_MARGIN = 4
const NOTCH_DROP = 0.04

export function quickMoonFrames(elevation: Float32Array, fps: number): [number, number][] {
  const windows: [number, number][] = []
  for (let a = 0; a < elevation.length; a++) {
    if (elevation[a] >= -3.3) continue
    let b = a + 1
    while (b < elevation.length && elevation[b] < -3.3) b++
    if (a > 0 && b < elevation.length && b - a <= Math.round(1.2 * fps)) windows.push([a, b - 1])
    a = b - 1
  }
  return windows
}

function exposure(samples: Float32Array, frame: number, radius: number): number {
  let sum = 0
  let mass = 0
  for (let k = -radius; k <= radius; k++) {
    const w = 0.5 + 0.5 * Math.cos(Math.PI * k / (radius + 1))
    sum += samples[Math.max(0, Math.min(samples.length - 1, frame + k))] * w
    mass += w
  }
  return sum / mass
}

export function lunarShutter(samples: Float32Array, out: Float32Array, start: number, end: number): void {
  for (let f = start; f <= end; f++) out[f] = exposure(samples, f, MOON_SHUTTER)

  // A short, opaque crossing can survive the normal shutter as a deep
  // notch. Use the longer exposure only to fill such a notch, never to
  // lower either shoulder or rewrite the entrance/exit of a quick night.
  // The margin lets the wider kernel use the same already sampled range.
  const notches: number[] = []
  for (let f = start + NOTCH_MARGIN; f <= end - NOTCH_MARGIN; f++) {
    let drop = 0
    for (let a = f - 3; a < f; a++) {
      for (let b = f + 1; b <= a + 4; b++) drop = Math.max(drop, Math.min(out[a], out[b]) - out[f])
    }
    if (drop > NOTCH_DROP) notches.push(f)
  }
  for (const at of notches) {
    for (let f = Math.max(start + NOTCH_MARGIN, at - NOTCH_MARGIN); f <= Math.min(end - NOTCH_MARGIN, at + NOTCH_MARGIN); f++) {
      out[f] = Math.max(out[f], exposure(samples, f, MOON_SHUTTER + NOTCH_MARGIN))
    }
  }
}
