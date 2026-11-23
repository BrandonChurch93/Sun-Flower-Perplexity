import * as THREE from 'three'
import { stream } from '../../core/random.ts'

export const STAR_CELLS = 512
export const STAR_MAP_WIDTH = STAR_CELLS * 3
export const STAR_MAP_HEIGHT = STAR_CELLS * 2

const CORE = [-0.5148, 0.1481, -0.8444]
const POLE = [0.7606, -0.3756, -0.5296]
const ACROSS = [
  POLE[1] * CORE[2] - POLE[2] * CORE[1],
  POLE[2] * CORE[0] - POLE[0] * CORE[2],
  POLE[0] * CORE[1] - POLE[1] * CORE[0],
]
const QUARTER = Math.PI / 4

function faceDirection(face: number, u: number, v: number): [number, number, number] {
  switch (face) {
    case 0: return [1, v, -u]
    case 1: return [-1, v, u]
    case 2: return [u, 1, -v]
    case 3: return [u, -1, v]
    case 4: return [u, v, 1]
    default: return [-u, v, -1]
  }
}

function byte(x: number): number {
  return Math.max(0, Math.min(255, Math.round(x * 255)))
}

export function starMap(): THREE.DataTexture {
  const n = STAR_CELLS
  const w = STAR_MAP_WIDTH
  const data = new Uint8Array(w * STAR_MAP_HEIGHT * 4)
  const random = stream('sky night star cells')
  for (let face = 0; face < 6; face++) {
    const ox = (face % 3) * n
    const oy = Math.floor(face / 3) * n
    for (let j = 0; j < n; j++) {
      const v = Math.tan(((j + 0.5) / n * 2 - 1) * QUARTER)
      for (let i = 0; i < n; i++) {
        const u = Math.tan(((i + 0.5) / n * 2 - 1) * QUARTER)
        const [x, y, z] = faceDirection(face, u, v)
        const r = Math.hypot(x, y, z)
        const lat = (x * POLE[0] + y * POLE[1] + z * POLE[2]) / r
        const lon = Math.atan2((x * ACROSS[0] + y * ACROSS[1] + z * ACROSS[2]) / r, (x * CORE[0] + y * CORE[1] + z * CORE[2]) / r)
        const area = (1 + u * u) * (1 + v * v) / r ** 3 / 1.2
        const band = Math.exp(-((lat / (0.13 + 0.09 * Math.exp(-lon * lon * 2))) ** 2))
        const chance = (0.45 + 0.55 * band * (0.45 + 0.55 * Math.exp(-lon * lon * 0.8))) * area
        const a = random.next()
        const s = random.next()
        const t = random.next()
        const pick = random.next()
        const tint = random.next()
        if (a > chance) continue
        const magnitude = Math.max(0, 7.4 + Math.log10(Math.max(1e-6, pick)) / 0.52)
        const k = (oy + j) * w + ox + i
        data[k * 4] = byte(0.2 + 0.6 * s)
        data[k * 4 + 1] = byte(0.2 + 0.6 * t)
        data[k * 4 + 2] = Math.max(1, byte(1 - magnitude / 7.4))
        const temperature = tint < 0.16 ? 0.05 + 0.3 * tint / 0.16 : tint < 0.86 ? 0.4 + 0.3 * (tint - 0.16) / 0.7 : 0.75 + 0.25 * (tint - 0.86) / 0.14
        data[k * 4 + 3] = byte(temperature)
      }
    }
  }
  const texture = new THREE.DataTexture(data, w, STAR_MAP_HEIGHT, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

const v3 = (a: number[]): string => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`

export const nightGlsl = /* glsl */ `
vec3 starsAt(vec3 d, vec3 air, float visible, float blur) {
  if (uNight <= 0.0001 || d.y < 0.0 || visible < 0.003) return vec3(0.0);
  const float N = ${STAR_CELLS}.0;
  const float Q = 0.7853981634;
  vec3 w = normalize(uStellar * d);
  vec3 a = abs(w);
  int face;
  vec2 st;
  if (a.x >= a.y && a.x >= a.z) {
    face = w.x > 0.0 ? 0 : 1;
    st = vec2(w.x > 0.0 ? -w.z : w.z, w.y) / a.x;
  } else if (a.y >= a.z) {
    face = w.y > 0.0 ? 2 : 3;
    st = vec2(w.x, w.y > 0.0 ? -w.z : w.z) / a.y;
  } else {
    face = w.z > 0.0 ? 4 : 5;
    st = vec2(w.z > 0.0 ? w.x : -w.x, w.y) / a.z;
  }
  vec2 cell = (atan(st) / Q * 0.5 + 0.5) * N;
  ivec2 c = clamp(ivec2(floor(cell)), ivec2(0), ivec2(int(N) - 1));
  ivec2 origin = ivec2(face - (face / 3) * 3, face / 3) * int(N);
  float px = uPixelAngle;
  float lens = min(blur, 2.2 * px);
  float base = 0.66 * px;
  vec3 stars = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      ivec2 k = c + ivec2(x, y);
      if (k.x < 0 || k.y < 0 || k.x >= int(N) || k.y >= int(N)) continue;
      vec4 s = texelFetch(tStars, origin + k, 0);
      if (s.b <= 0.0) continue;
      vec2 uv = tan(((vec2(k) + s.rg) / N * 2.0 - 1.0) * Q);
      vec3 p = face == 0 ? vec3(1.0, uv.y, -uv.x)
        : face == 1 ? vec3(-1.0, uv.y, uv.x)
        : face == 2 ? vec3(uv.x, 1.0, -uv.y)
        : face == 3 ? vec3(uv.x, -1.0, uv.y)
        : face == 4 ? vec3(uv.x, uv.y, 1.0)
        : vec3(-uv.x, uv.y, -1.0);
      vec3 e = w - normalize(p);
      float flux = exp2(-9.83 * (1.0 - s.b));
      float shown = pow(flux, 0.72);
      float size = base * (1.0 + 0.85 * sqrt(flux));
      float spread = size * size + px * px / 12.0 + 0.25 * lens * lens;
      float glow = exp(-0.5 * dot(e, e) / spread) * (base * base + px * px / 12.0) / spread;
      float t = s.a;
      vec3 tone = t < 0.5 ? mix(vec3(1.0, 0.66, 0.40), vec3(1.0, 0.97, 0.93), t * 2.0)
        : mix(vec3(1.0, 0.97, 0.93), vec3(0.70, 0.80, 1.0), t * 2.0 - 1.0);
      stars += tone * shown * glow;
    }
  }
  float lat = dot(w, ${v3(POLE)});
  float lon = atan(dot(w, ${v3(ACROSS)}), dot(w, ${v3(CORE)}));
  vec2 g = vec2(lon, lat);
  float core = exp(-lon * lon * 1.6);
  float spine = 0.018 * sin(2.3 * lon + 0.4) + 0.03 * (valueNoise(g * vec2(3.0, 1.0) + 7.1) - 0.5);
  float wide = 0.075 + 0.07 * core;
  float body = exp(-pow((lat - spine) / wide, 2.0));
  float bulge = exp(-(lon * lon * 9.0 + pow(lat - spine * 0.5, 2.0) * 140.0));
  float clouds = 0.42 * valueNoise(g * 9.0 + 1.3) + 0.26 * valueNoise(g * 23.0 + 4.7)
    + 0.18 * valueNoise(g * 61.0 + 2.9) + 0.14 * valueNoise(g * 157.0 + 8.3);
  float grain = valueNoise(g * 420.0 + 3.1);
  float laneAt = spine + 0.016 * sin(5.0 * lon) + 0.06 * (valueNoise(g * vec2(5.0, 1.5) + 12.4) - 0.5) + 0.03 * (valueNoise(g * vec2(17.0, 5.0) + 2.2) - 0.5);
  float laneWidth = (0.018 + 0.03 * valueNoise(g * 11.0 + 5.5)) * (0.5 + 0.8 * core);
  float lane = exp(-pow((lat - laneAt) / laneWidth, 2.0)) * smoothstep(0.15, 0.7, valueNoise(vec2(lon * 13.0, lat * 26.0) + 4.4));
  float knots = smoothstep(0.5, 0.85, valueNoise(g * vec2(9.0, 38.0) + 9.2)) * body;
  float dust = clamp(lane * (0.55 + 0.45 * valueNoise(g * 40.0 + 6.0)) + 0.5 * knots, 0.0, 1.0);
  float lumps = smoothstep(0.32, 0.86, clouds);
  float light = (body * (0.3 + 0.7 * core) * lumps * lumps * (0.6 + 0.8 * grain) + 1.4 * bulge * (0.5 + 0.8 * clouds))
    * (1.0 - 0.92 * dust) + 0.1 * exp(-lat * lat * 30.0) * (0.4 + 0.6 * core);
  vec3 milkyTone = mix(vec3(0.55, 0.68, 1.0), vec3(1.0, 0.80, 0.60), clamp(core * lumps * 0.7 + bulge, 0.0, 1.0));
  float faint = 0.55 + 0.45 * (1.0 - dust);
  float extinction = exp(-0.03 / max(0.016, d.y)) * smoothstep(0.0, 0.035, d.y);
  float wash = 1.0 - smoothstep(0.006, 0.05, dot(air, vec3(0.21, 0.72, 0.07)));
  return (stars * 0.75 * faint + 0.024 * light * milkyTone) * extinction * wash * visible * uNight;
}
`
