// The wind of the film, one for everything that bends: the plant, its companion, the field, the grass, the rain.
// A gust crosses the land as a wave: a front that strikes, holds and lets go, one every few seconds, travelling toward azimuth 42, the way the clouds go.
// It runs on the film second, so it keeps moving in a hold. How hard it blows is `dials.wind`.
const RAD = Math.PI / 180
export const WIND_TOWARD_DEG = 42
export const windWay = { x: Math.sin(WIND_TOWARD_DEG * RAD), z: Math.cos(WIND_TOWARD_DEG * RAD) }
const WAVE_M = 27
const WAVE_SPEED = 7.5
const RIPPLE_M = 8.5
const RIPPLE_SPEED = 5

const pulse = (f: number): number => {
  const x = f - Math.floor(f)
  const rise = Math.min(1, x / 0.12)
  const out = Math.min(1, Math.max(0, (1 - x) / 0.25))
  return rise * rise * (3 - 2 * rise) * Math.exp(-3.2 * Math.max(x - 0.12, 0)) * out * out * (3 - 2 * out)
}

// How hard the air pushes at a place in meters and a film second, 0 to about 1.
export function gustAt(x: number, z: number, seconds: number): number {
  const along = x * windWay.x + z * windWay.z
  const across = z * windWay.x - x * windWay.z
  const front = (along - WAVE_SPEED * seconds) / WAVE_M + 0.22 * Math.sin(across * 0.045 + 1.3) + 0.1 * Math.sin(across * 0.13 - seconds * 0.21)
  return 0.85 * pulse(-front) + 0.15 * (0.5 + 0.5 * Math.sin((2 * Math.PI * (along - RIPPLE_SPEED * seconds)) / RIPPLE_M + across * 0.4))
}

// The same for a shader, as `gustAt(place, seconds)`.
export const gustGlsl = /* glsl */ `
float gustPulse(float f) {
  float x = fract(f);
  return smoothstep(0.0, 0.12, x) * exp(-3.2 * max(x - 0.12, 0.0)) * smoothstep(0.0, 0.25, 1.0 - x);
}
float gustAt(vec2 at, float seconds) {
  float along = at.x * ${windWay.x.toFixed(4)} + at.y * ${windWay.z.toFixed(4)};
  float across = at.y * ${windWay.x.toFixed(4)} - at.x * ${windWay.z.toFixed(4)};
  float front = (along - ${WAVE_SPEED.toFixed(2)} * seconds) / ${WAVE_M.toFixed(2)} + 0.22 * sin(across * 0.045 + 1.3) + 0.1 * sin(across * 0.13 - seconds * 0.21);
  return 0.85 * gustPulse(-front) + 0.15 * (0.5 + 0.5 * sin(6.2831853 * (along - ${RIPPLE_SPEED.toFixed(2)} * seconds) / ${RIPPLE_M.toFixed(2)} + across * 0.4));
}
`
