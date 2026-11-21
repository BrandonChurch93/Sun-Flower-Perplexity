import { hash32, streamSeed } from '../core/random.ts'

export const vertex = /* glsl */ `
in vec3 position;
out vec3 vWorld;
out float vDepth;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

export const standInFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
uniform sampler2D tSoil;
uniform vec2 uSoilSize;
uniform float uWet;
uniform float uFrost;
uniform float uCover;
uniform vec2 uToward;
void main() {
  vec2 uv = vWorld.xz * 2.2;
  vec2 wide = vWorld.xz * 0.31 + vec2(0.37, 0.11);
  vec4 near = texture(tSoil, uv);
  vec4 far = texture(tSoil, wide);
  vec3 albedo = near.rgb * (0.6 + 0.8 * far.rgb);
  vec2 e = vec2(1.0 / uSoilSize.x, 0.0);
  float hx = texture(tSoil, uv + e.xy).a - texture(tSoil, uv - e.xy).a;
  float hz = texture(tSoil, uv + e.yx).a - texture(tSoil, uv - e.yx).a;
  float fade = 1.0 / (1.0 + vDepth * 0.4);
  vec3 n = normalize(vec3(-hx * 9.0 * fade, 1.0, -hz * 9.0 * fade));
  albedo = mix(albedo, albedo * 0.45, uWet);
  float under = uCover * smoothstep(0.9, 1.7, -dot(vWorld.xz, uToward));
  albedo = mix(albedo, vec3(0.75, 0.8, 0.85), uFrost * smoothstep(0.35, 0.8, near.a) * (1.0 - 0.7 * under));
  float ndl = max(dot(n, uSunDir), 0.0);
  float lit = sunShadow(vWorld, vec3(0.0, 1.0, 0.0), uShadowTexelM * 1.5);
  vec3 color = albedo * (uSunColor * ndl * lit * (1.0 - 0.85 * under) + skyAmbient(n) * (0.55 + 0.45 * near.a) * (1.0 - 0.8 * under));
  vec3 v = normalize(uCamPos - vWorld);
  vec3 h = normalize(v + uSunDir);
  color += uSunColor * pow(max(dot(n, h), 0.0), 40.0) * uWet * 0.25 * lit;
  outColor = finish(color, vWorld, vDepth, texelDensity(uv, uSoilSize));
}
`

const SEED = streamSeed('ground')

export function standInPixels(size: number): Uint8Array {
  const cell = 64
  const grid = (n: number, layer: number) => {
    const g = new Float32Array(n * n)
    for (let i = 0; i < g.length; i++) g[i] = hash32(SEED + layer * 7919 + i) / 4294967296
    return g
  }
  const layers = [4, 8, 16, 32, 64, 128].map((n, k) => ({ n, g: grid(n, k), gain: Math.pow(0.6, k) }))
  const total = layers.reduce((s, l) => s + l.gain, 0)
  const out = new Uint8Array(size * size * 4)
  void cell
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let h = 0
      for (const l of layers) {
        const fx = (x / size) * l.n
        const fy = (y / size) * l.n
        const x0 = Math.floor(fx)
        const y0 = Math.floor(fy)
        const tx = fx - x0
        const ty = fy - y0
        const sx = tx * tx * (3 - 2 * tx)
        const sy = ty * ty * (3 - 2 * ty)
        const x1 = (x0 + 1) % l.n
        const y1 = (y0 + 1) % l.n
        const a = l.g[y0 * l.n + x0]
        const b = l.g[y0 * l.n + x1]
        const c = l.g[y1 * l.n + x0]
        const d = l.g[y1 * l.n + x1]
        h += l.gain * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy)
      }
      h /= total
      const crumb = Math.min(1, Math.max(0, (h - 0.3) * 2.6))
      const speck = hash32(SEED ^ (y * size + x)) / 4294967296
      const tone = 0.55 + 0.75 * crumb + (speck - 0.5) * 0.18
      const i = (y * size + x) * 4
      out[i] = Math.min(255, Math.round(255 * Math.pow(0.105 * tone, 1 / 2.2)))
      out[i + 1] = Math.min(255, Math.round(255 * Math.pow(0.068 * tone, 1 / 2.2)))
      out[i + 2] = Math.min(255, Math.round(255 * Math.pow(0.042 * tone, 1 / 2.2)))
      out[i + 3] = Math.round(255 * crumb)
    }
  }
  return out
}
