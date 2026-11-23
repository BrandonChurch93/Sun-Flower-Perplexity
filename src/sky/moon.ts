// A centered shutter for the foreground crossing the lunar disc, not for
// the moon's own rise in twilight nor for the rest of the cloud picture.
export const MOON_SHUTTER = 7

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

export function lunarShutter(samples: Float32Array, out: Float32Array, start: number, end: number): void {
  for (let frame = start; frame <= end; frame++) {
    let sum = 0
    let mass = 0
    for (let k = -MOON_SHUTTER; k <= MOON_SHUTTER; k++) {
      const w = 0.5 + 0.5 * Math.cos(Math.PI * k / (MOON_SHUTTER + 1))
      sum += samples[Math.max(0, Math.min(samples.length - 1, frame + k))] * w
      mass += w
    }
    out[frame] = sum / mass
  }
}
