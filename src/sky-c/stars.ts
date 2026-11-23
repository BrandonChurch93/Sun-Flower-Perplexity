import * as THREE from 'three'
import { clamp, smoothstep } from '../core/curves.ts'
import { stream } from '../core/random.ts'

export const MW_W = 512
export const MW_H = 256
export const BRIGHT_STAR_COUNT = 148

const RAD = Math.PI / 180

// Real J2000 bright stars: [RA_hours, Dec_deg, Vmag, BV_color]
const REAL_STARS: readonly [number, number, number, number][] = [
  [6.752, -16.72, -1.46, 0.0],
  [6.399, -52.7, -0.74, 0.15],
  [14.261, 19.18, -0.05, 1.23],
  [18.616, 38.78, 0.03, 0.0],
  [5.278, 46.0, 0.08, 0.8],
  [5.242, -8.2, 0.13, -0.03],
  [7.655, 5.22, 0.34, 0.42],
  [5.919, 7.41, 0.42, 1.85],
  [19.846, 8.87, 0.76, 0.22],
  [4.599, 16.51, 0.86, 1.54],
  [13.42, -11.16, 0.97, -0.23],
  [16.49, -26.43, 1.06, 1.83],
  [7.755, 28.03, 1.14, 1.0],
  [22.961, -29.62, 1.16, 0.09],
  [20.69, 45.28, 1.25, 0.09],
  [10.14, 11.97, 1.36, -0.11],
  [6.977, -28.97, 1.5, -0.21],
  [7.577, 31.89, 1.58, 0.03],
  [17.56, -37.1, 1.62, -0.22],
  [5.419, 6.35, 1.64, -0.22],
  [5.603, 28.61, 1.65, -0.13],
  [5.603, -1.2, 1.69, -0.19],
  [22.137, -46.96, 1.74, -0.14],
  [12.901, 55.96, 1.77, -0.02],
  [3.405, 49.86, 1.79, 0.48],
  [11.062, 61.75, 1.79, 1.07],
  [18.403, -34.38, 1.8, -0.03],
  [7.14, -26.39, 1.83, 0.67],
  [17.622, -43.0, 1.86, 0.4],
  [13.792, 49.31, 1.86, -0.19],
  [5.992, 44.95, 1.9, 0.03],
  [6.629, 16.4, 1.93, 0.0],
  [2.53, 89.26, 1.98, 0.6],
  [2.12, 23.46, 2.0, 1.15],
  [9.46, -8.66, 1.98, 1.44],
  [18.921, -26.3, 2.05, -0.21],
  [5.796, -9.67, 2.06, -0.17],
  [0.14, 29.09, 2.06, -0.11],
  [1.162, 35.62, 2.07, 1.58],
  [17.582, 12.56, 2.08, 0.15],
  [14.845, 74.16, 2.08, 1.47],
  [16.005, -22.62, 2.29, -0.12],
  [16.836, -34.29, 2.29, 1.15],
  [20.37, 40.26, 2.23, 0.67],
  [0.675, 56.54, 2.24, 1.17],
  [17.943, 51.49, 2.24, 1.52],
  [15.578, 26.71, 2.23, -0.02],
  [5.533, -0.3, 2.23, -0.18],
  [13.399, 54.93, 2.27, 0.05],
  [0.946, 60.72, 2.27, 0.34],
  [8.159, -40.0, 2.21, -0.27],
  [9.133, -43.43, 2.21, 1.65],
  [21.736, 9.88, 2.39, 1.52],
  [0.438, -42.31, 2.39, 1.09],
  [16.619, -10.57, 2.56, 0.02],
  [23.079, 15.21, 2.49, -0.04],
  [23.063, 28.08, 2.42, 1.67],
  [11.897, 53.69, 2.44, 0.0],
  [17.173, -15.72, 2.43, 0.06],
  [7.402, -29.3, 2.45, -0.08],
  [20.77, 33.97, 2.48, 1.02],
  [12.263, -17.54, 2.59, -0.11],
  [18.1, -30.42, 2.65, 1.0],
  [19.043, -29.88, 2.6, 0.08],
  // Scorpius, Sagittarius, Scutum, Ophiuchus, Capricornus southern Milky Way stars
  [18.35, -29.83, 2.7, 1.38],
  [18.466, -25.42, 2.82, 1.04],
  [18.962, -21.11, 2.89, 1.02],
  [19.162, -27.67, 2.89, 0.22],
  [17.793, -40.13, 2.99, 0.24],
  [17.708, -39.03, 2.39, -0.22],
  [16.864, -38.05, 3.04, -0.22],
  [16.599, -28.22, 2.82, -0.25],
  [16.091, -19.81, 2.62, -0.07],
  [15.981, -26.11, 2.89, -0.2],
  [17.367, -24.99, 3.25, -0.15],
  [18.097, -24.28, 3.12, 0.05],
  [18.65, -8.24, 3.1, 1.15],
  [19.09, -4.88, 3.38, -0.05],
  [19.771, 10.61, 2.72, 1.52],
  [19.09, 13.86, 2.99, 0.01],
  [20.294, -12.51, 3.08, 0.92],
  [20.482, -14.78, 3.05, 0.8],
  [17.626, -15.4, 3.15, 0.38],
  [16.24, -3.69, 2.73, 1.58],
]

function bvToRgb(bv: number): [number, number, number] {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))
  let r: number
  let g: number
  let b: number
  const tk = t / 100
  if (tk <= 66) {
    r = 1
    g = clamp((99.4708 * Math.log(Math.max(1, tk)) - 161.1196) / 255, 0, 1)
    b = tk <= 19 ? 0 : clamp((138.5177 * Math.log(tk - 10) - 305.0448) / 255, 0, 1)
  } else {
    r = clamp((329.6987 * Math.pow(tk - 60, -0.1332)) / 255, 0, 1)
    g = clamp((288.1222 * Math.pow(tk - 60, -0.0755)) / 255, 0, 1)
    b = 1
  }
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const s = 1 / Math.max(0.1, lum)
  return [r * s, g * s, b * s]
}

// Equatorial J2000 vector to local celestial frame at lat 45N where pole is (0, sin45, cos45)
function eqToCelestial(raRad: number, decRad: number): [number, number, number] {
  const cd = Math.cos(decRad)
  const sd = Math.sin(decRad)
  // Places Scorpius-Sagittarius Milky Way arch across the south sky during the night scenes
  const ha = raRad - 294 * RAD
  const xEq = -cd * Math.sin(ha)
  const yEq = cd * Math.cos(ha)
  const zEq = sd

  const s45 = Math.SQRT1_2
  const wx = xEq
  const wy = yEq * s45 + zEq * s45
  const wz = -yEq * s45 + zEq * s45
  return [wx, wy, wz]
}

export interface StarAssets {
  milkyWayTexture: THREE.DataTexture
  starDirsAndFlux: Float32Array
  starColors: Float32Array
  byteCount: number
}

export function buildStarAssets(renderer: THREE.WebGLRenderer): StarAssets {
  const rng = stream('sky-c-stars')
  const rand = (): number => rng.next()

  const starDirsAndFlux = new Float32Array(BRIGHT_STAR_COUNT * 4)
  const starColors = new Float32Array(BRIGHT_STAR_COUNT * 3)

  for (let i = 0; i < BRIGHT_STAR_COUNT; i++) {
    let raH: number
    let decD: number
    let vmag: number
    let bv: number
    if (i < REAL_STARS.length) {
      ;[raH, decD, vmag, bv] = REAL_STARS[i]
    } else if (i < REAL_STARS.length + 38) {
      raH = 15.2 + rand() * 6.2
      decD = -42.0 + rand() * 44.0
      vmag = 2.15 + Math.pow(rand(), 1.35) * 1.25
      bv = -0.18 + Math.pow(rand(), 1.45) * 1.65
    } else {
      raH = rand() * 24.0
      decD = -38.0 + rand() * 118.0
      vmag = 2.35 + Math.pow(rand(), 1.35) * 1.25
      bv = -0.15 + Math.pow(rand(), 1.5) * 1.6
    }
    const [wx, wy, wz] = eqToCelestial(raH * 15 * RAD, decD * RAD)
    const flux = 1.35 * Math.pow(10, -0.25 * vmag)
    const [cr, cg, cb] = bvToRgb(bv)
    starDirsAndFlux[i * 4] = wx
    starDirsAndFlux[i * 4 + 1] = wy
    starDirsAndFlux[i * 4 + 2] = wz
    starDirsAndFlux[i * 4 + 3] = flux
    starColors[i * 3] = cr
    starColors[i * 3 + 1] = cg
    starColors[i * 3 + 2] = cb
  }

  const GN = 32
  const gTab = new Float32Array(GN * GN)
  for (let i = 0; i < gTab.length; i++) gTab[i] = rand()
  const noise2 = (u: number, v: number, freqU: number, freqV: number): number => {
    const x = ((u * freqU) % GN + GN) % GN
    const y = ((v * freqV) % GN + GN) % GN
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const x1 = (x0 + 1) % GN
    const y1 = (y0 + 1) % GN
    const a = gTab[y0 * GN + x0] + (gTab[y0 * GN + x1] - gTab[y0 * GN + x0]) * sx
    const b = gTab[y1 * GN + x0] + (gTab[y1 * GN + x1] - gTab[y1 * GN + x0]) * sx
    return a + (b - a) * sy
  }
  const fbm = (u: number, v: number): number =>
    0.5 * noise2(u, v, 4, 4) +
    0.25 * noise2(u + 0.17, v + 0.31, 8, 8) +
    0.15 * noise2(u + 0.43, v + 0.11, 16, 16) +
    0.1 * noise2(u + 0.71, v + 0.59, 32, 32)

  const [gpx, gpy, gpz] = eqToCelestial(192.86 * RAD, 27.13 * RAD)
  const [gcx, gcy, gcz] = eqToCelestial(266.4 * RAD, -29.01 * RAD)
  const gex = gpy * gcz - gpz * gcy
  const gey = gpz * gcx - gpx * gcz
  const gez = gpx * gcy - gpy * gcx

  const mwBytes = new Uint8Array(MW_W * MW_H * 4)
  let ptr = 0
  for (let y = 0; y < MW_H; y++) {
    const v = (y + 0.5) / MW_H
    const theta = (v - 0.5) * Math.PI
    const ct = Math.cos(theta)
    const st = Math.sin(theta)
    for (let x = 0; x < MW_W; x++) {
      const u = (x + 0.5) / MW_W
      const phi = (u * 2 - 1) * Math.PI
      const dx = ct * Math.sin(phi)
      const dy = st
      const dz = ct * Math.cos(phi)

      const sinB = clamp(dx * gpx + dy * gpy + dz * gpz, -1, 1)
      const galB = Math.asin(sinB)
      const galL = Math.atan2(dx * gex + dy * gey + dz * gez, dx * gcx + dy * gcy + dz * gcz)
      const lu = galL / (2 * Math.PI) + 0.5
      const bv = galB / Math.PI + 0.5

      const nCloud = fbm(lu, bv * 3.0)
      const nRift = fbm(lu + 0.37, bv * 5.0 + 0.21)
      const coreBulge = Math.exp(-Math.pow(galL / 0.65, 2) - Math.pow(galB / 0.24, 2))
      const diskBand = Math.exp(-Math.pow(galB / (0.17 + 0.09 * nCloud), 2)) * (0.4 + 0.6 * smoothstep(Math.PI, 0.2, Math.abs(galL)))

      const riftBand = Math.exp(-Math.pow((galB - 0.015 * (nRift - 0.5)) / 0.055, 2)) * smoothstep(0.4, 0.72, nRift)
      const starCloud = clamp((0.58 * diskBand + 0.88 * coreBulge) * (0.52 + 0.92 * nCloud) * (1 - 0.76 * riftBand), 0, 1)
      const warmCore = clamp(coreBulge * (1 - 0.55 * riftBand), 0, 1)
      const dustMask = clamp(riftBand, 0, 1)

      mwBytes[ptr++] = Math.round(starCloud * 255)
      mwBytes[ptr++] = Math.round(warmCore * 255)
      mwBytes[ptr++] = Math.round(dustMask * 255)
      mwBytes[ptr++] = 255
    }
  }

  const milkyWayTexture = new THREE.DataTexture(mwBytes, MW_W, MW_H, THREE.RGBAFormat, THREE.UnsignedByteType)
  milkyWayTexture.minFilter = THREE.LinearFilter
  milkyWayTexture.magFilter = THREE.LinearFilter
  milkyWayTexture.wrapS = THREE.RepeatWrapping
  milkyWayTexture.wrapT = THREE.ClampToEdgeWrapping
  milkyWayTexture.generateMipmaps = false
  milkyWayTexture.colorSpace = THREE.NoColorSpace
  milkyWayTexture.needsUpdate = true
  renderer.initTexture(milkyWayTexture)

  return { milkyWayTexture, starDirsAndFlux, starColors, byteCount: mwBytes.byteLength }
}
