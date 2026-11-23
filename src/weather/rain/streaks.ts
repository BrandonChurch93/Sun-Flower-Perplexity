import * as THREE from 'three'
import type { CameraPose } from '../../core/lens.ts'
import { makeSurface } from '../../core/shading.ts'
import { RAIN_CELL_M, RAIN_FINE_SERIES, RAIN_SERIES, dropOf, fallDir, firstIndexFrom, seriesPeriod } from './drops.ts'

// A drop crosses many times its own width while the shutter is open, so it is drawn as the whole path it sweeps: a strip from where it is at the open shutter
// to where it is at the close, as wide as the drop, holding the share of the exposure the drop spends over each point of it.
const PLANT_REACH_M = 0.3

const vertex = /* glsl */ `
const float PLANT_REACH_M = ${PLANT_REACH_M.toFixed(2)};
in vec2 position;
in vec4 aOpen;
in vec4 aClose;
uniform float uPixelAngle;
uniform float uSamples;
uniform float uGain;
uniform float uKeep;
uniform vec4 uBand;
uniform float uLeast;
out vec2 vEnds;
out float vAcross;
out float vAlong;
out float vShare;
out float vSeed;
out float vSeen;
out float vRun;
out vec3 vWorld;
void main() {
  vec3 a = (viewMatrix * vec4(aOpen.xyz, 1.0)).xyz;
  vec3 b = (viewMatrix * vec4(aClose.xyz, 1.0)).xyz;
  float r = aOpen.w;
  vec3 mid = mix(a, b, position.y);
  float depth = max(-mid.z, 1e-3);
  vec2 run = b.xy / max(-b.z, 1e-3) - a.xy / max(-a.z, 1e-3);
  float runLength = length(run);
  vec2 along = runLength > 1e-7 ? run / runLength : vec2(0.0, -1.0);
  vec2 across = vec2(-along.y, along.x);
  float pixelM = depth * uPixelAngle;
  float coc = cocOf(depth);
  // Out of focus, one lens sample carries its share of the blur circle: the strip is drawn that wide so the samples close into it.
  float halfPx = max(max(r / pixelM, uLeast), 1.2 * coc / sqrt(uSamples));
  float halfM = halfPx * pixelM;
  float lengthM = distance(aOpen.xyz, aClose.xyz);
  mid.xy += across * (position.x * halfM) + along * ((2.0 * position.y - 1.0) * halfM);
  vAcross = position.x;
  vRun = position.y;
  float whole = (lengthM + 2.0 * halfM) / halfM;
  vEnds = vec2(position.y, 1.0 - position.y) * whole;
  vAlong = position.y * (lengthM + 2.0 * halfM) / max(r, 1e-5);
  // A fine drop is a clean ball and gathers the band into one hard line; a heavy one is flattened by the air and wobbles, and spreads the same light over its width.
  // No two drops catch the band alike: most are dim and a few of the fine ones flare. Off the focus one fine drop in a few is drawn, the brighter for the rest.
  float catchLight = mix(0.2, mix(2.6, 1.0, smoothstep(0.0003, 0.0007, r)), pow(fract(aClose.w * 13.7 + 0.31), 3.0));
  float nearFocus = smoothstep(uBand.x, uBand.y, depth / uFocusM) * (1.0 - smoothstep(uBand.z, uBand.w, depth / uFocusM));
  // A heavy drop off the focus is a soft bar wider than 5 px under this lens, and one near the lens is in the frame for a single exposure: both dim to nearly nothing and go into the haze.
  float crowd = r < 0.0004 ? pow(mix(uKeep, 1.0, nearFocus), -0.6) : (1.0 - 0.93 * smoothstep(1.1, 1.5, depth / uFocusM)) * (0.07 + 0.93 * smoothstep(0.5, 0.8, depth / uFocusM));
  vShare = min(1.0, uGain * catchLight * crowd * mix(1.0, 0.05, smoothstep(0.0003, 0.0007, r)) * 3.14159 * r * r / (2.0 * halfM * (lengthM + 2.0 * halfM)));
  vSeed = aClose.w;
  float least = max(uLeast, 1.2 * coc / sqrt(uSamples)) / halfPx;
  vSeen = min(1.0, max(0.09, least * least));
  vWorld = (inverse(viewMatrix) * vec4(mid, 1.0)).xyz;
  gl_Position = projectionMatrix * vec4(mid, 1.0);
  // Seen past the plant, a drop nearer than it reads as falling through the leaves. Within the plant's reach every drop is tested against the picture's depth as if it fell just behind the plant, so a leaf hides it and the streak ends on the leaf's edge.
  vec3 ray = normalize(vWorld - uCamPos);
  float axisAt = -dot(uCamPos.xz, ray.xz) / max(dot(ray.xz, ray.xz), 1e-6);
  if (axisAt > 0.0 && length(uCamPos.xz + ray.xz * axisAt) < PLANT_REACH_M && length(vWorld - uCamPos) < axisAt + PLANT_REACH_M) {
    vec4 behind = projectionMatrix * viewMatrix * vec4(uCamPos + ray * (axisAt + PLANT_REACH_M), 1.0);
    gl_Position.z = behind.z * gl_Position.w / behind.w;
  }
  if (-a.z < 0.02 || -b.z < 0.02) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`

const fragment = /* glsl */ `
in float vAcross;
in vec2 vEnds;
in float vAlong;
in float vShare;
in float vSeed;
in float vSeen;
in float vRun;
in vec3 vWorld;
uniform vec3 uLight;
uniform vec3 uShade;
uniform vec3 uRainUp;
float litFromSun(vec3 q) {
  vec4 sc = uShadowMatrix * vec4(q, 1.0);
  vec3 p = sc.xyz / sc.w;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  return texture(uShadowMap, vec3(p.xy, p.z - uShadowBias));
}
// A drop that met a leaf or the stem on its way down has landed and is not in the air under it: the path it came by is walked back up, and a point of it that lies in shade with the light two centimetres above it is a point just under a surface.
bool landedAbove(vec3 world) {
  if (uShadowOn < 0.5) return false;
  float start = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  for (int i = 0; i < 22; i++) {
    vec3 q = world + uRainUp * ((float(i) + start) * 0.016);
    if (litFromSun(q) < 0.5 && litFromSun(q + uSunDir * 0.02) > 0.5) return true;
  }
  return false;
}
void main() {
  if (uDiag > 1) discard;
  float cap = max(0.0, 1.0 - min(vEnds.x, vEnds.y));
  float u = min(1.0, vAcross * vAcross + cap * cap);
  // A drop is a small lens: it gathers the bright horizon into a line down its middle and shows the dark land and cloud toward its edges. It also swings as it falls, so the line swells and thins.
  float swing = 0.75 + 0.25 * sin(vAlong * (0.22 + 0.2 * vSeed) + 40.0 * vSeed);
  float core = exp(-u / vSeen) * swing;
  float seen = 1.0 - vSeen;
  // Where the drop is wider than a pixel and the blur, only that line and a faint body show, the line never finer than the blur so the lens samples close; where it is not, the strip is the blur itself and holds the line's light evenly.
  vec3 color = mix(uShade, uLight, mix(0.85, 0.3 + 0.7 * core, seen));
  // The edge of a strip falls off twice as gently as its middle, so a line one or two pixels wide has no step for the encoder to ring on; the factor keeps its light.
  float body = 1.25 * (1.0 - u) * (1.0 - u) * mix(1.5, 0.12, seen);
  // Seen from above, a drop shows the dark land behind it and little of the band.
  float rise = normalize(vWorld - uCamPos).y;
  float level = smoothstep(-0.12, 0.0, rise);
  // The line a drop gathers swells in and out of sight as the drop swings, so a streak has no hard end.
  float ends = smoothstep(0.0, 0.3, min(vRun, 1.0 - vRun));
  float cover = saturate(vShare * 1.25 * ends * mix(body, body + 1.5 * core, seen)) * mix(0.3, 1.0, level);
  if (cover > 0.004 && landedAbove(vWorld)) discard;
  outColor = vec4(applyFog(color, vWorld), cover);
}
`

const MAX_STREAKS = 60000
const HEAVY_REACH_M = 6
// The fine rain is drawn where the lens holds it as lines, from this share of the focus distance to that one. Nearer and farther a drizzle drop is spread over a blur many times its width and adds only a grey haze of wide soft strips, which the approved image does not have.
const FINE_NEAR = 0.92
const FINE_REACH = 1.1
// A little way off the focus the same drops are soft and a few pixels thick, and a share of them is drawn there.
const SOFT_NEAR = 0.85
const SOFT_REACH = 1.21
const SOFT_KEEP = 0.6
// The air holds more of the finest rain than marks the puddles.
const FINE_IN_AIR = 2
const SLOWEST_M_PER_S = 0.5
// The wind carries a light drop farther than a heavy one, and gusts carry each a little differently, so no two fall at one angle. Every path still ends at its own landing.
const CARRY_SPREAD = 0.32
const CARRY_BY_WEIGHT = 0.22
const CROSS_SPREAD = 0.09
// A gust leans the drops that land near each other at about the same time the same way, so the rain falls in loose sheets and not at one angle.
const GUST_LEAN = 0.2
// No strip is drawn finer than this half width in pixels: a finer line is a stair of single pixels.
const LEAST_HALF_PX = 1

function smooth(from: number, to: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

export interface Streaks {
  mesh: THREE.Mesh
  count(): number
  // Lays out every drop in the air over the part of the ground the lens looks across, between the open shutter and its close.
  prepare(open: number, close: number, pose: CameraPose, tanX: number, tanY: number, samples: number, width: number, flash: number): void
}

export function makeStreaks(light: [number, number, number], shade: [number, number, number]): Streaks {
  const opens = new Float32Array(MAX_STREAKS * 4)
  const closes = new Float32Array(MAX_STREAKS * 4)
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), 2))
  geometry.setIndex([0, 1, 2, 2, 1, 3])
  // The renderer asks every mesh for a sphere to sort it by and cannot make one from a position of two numbers.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1)
  const openAttr = new THREE.InstancedBufferAttribute(opens, 4)
  const closeAttr = new THREE.InstancedBufferAttribute(closes, 4)
  openAttr.setUsage(THREE.DynamicDrawUsage)
  closeAttr.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('aOpen', openAttr)
  geometry.setAttribute('aClose', closeAttr)
  geometry.instanceCount = 0
  const uniforms = {
    uPixelAngle: { value: 0.001 },
    uSamples: { value: 1 },
    uGain: { value: 17 },
    uLeast: { value: LEAST_HALF_PX },
    uKeep: { value: SOFT_KEEP },
    uBand: { value: new THREE.Vector4(SOFT_NEAR, FINE_NEAR, FINE_REACH, SOFT_REACH) },
    uLight: { value: new THREE.Vector3().fromArray(light) },
    uShade: { value: new THREE.Vector3().fromArray(shade) },
    uRainUp: { value: new THREE.Vector3(-fallDir[0], -fallDir[1], -fallDir[2]) },
  }
  const surface = makeSurface({ name: 'rain streaks', vertex, fragment, uniforms, side: THREE.DoubleSide, transparent: true, depthWrite: false })
  const mesh = new THREE.Mesh(geometry, surface.main)
  mesh.frustumCulled = false
  mesh.matrixAutoUpdate = false
  mesh.renderOrder = 44
  let made = 0
  const flat = new THREE.Vector3()
  const side = new THREE.Vector3()

  return {
    mesh,
    count: () => made,
    prepare(open, close, pose, tanX, tanY, samples, width, flash) {
      flat.set(pose.forward.x, 0, pose.forward.z).normalize()
      side.set(pose.right.x, 0, pose.right.z).normalize()
      const rise = pose.forward.y / Math.hypot(pose.forward.x, pose.forward.z)
      const eye = pose.position
      const reach = HEAVY_REACH_M
      const fineFrom = SOFT_NEAR * pose.focusM
      const fineTo = SOFT_REACH * pose.focusM
      const i0 = Math.floor((eye.x - reach) / RAIN_CELL_M)
      const i1 = Math.floor((eye.x + reach) / RAIN_CELL_M)
      const j0 = Math.floor((eye.z - reach) / RAIN_CELL_M)
      const j1 = Math.floor((eye.z + reach) / RAIN_CELL_M)
      const down = -fallDir[1]
      const level = Math.hypot(fallDir[0], fallDir[2])
      const crossX = -fallDir[2] / level
      const crossZ = fallDir[0] / level
      let n = 0
      for (let j = j0; j <= j1 && n < MAX_STREAKS; j++) {
        for (let i = i0; i <= i1 && n < MAX_STREAKS; i++) {
          const cx = (i + 0.5) * RAIN_CELL_M - eye.x
          const cz = (j + 0.5) * RAIN_CELL_M - eye.z
          const depth = cx * flat.x + cz * flat.z
          if (depth < -0.3 || depth > reach) continue
          const off = Math.abs(cx * side.x + cz * side.z)
          const room = Math.max(depth, 0) + 0.4
          if (off > room * tanX * 1.2 + 0.3) continue
          // The highest a drop over this cell can be and still show in the frame.
          const top = Math.max(0.3, eye.y + room * (rise + tanY * 1.2) + 0.2)
          const series = depth > fineFrom - RAIN_CELL_M && depth < fineTo + RAIN_CELL_M ? RAIN_SERIES + Math.round(RAIN_FINE_SERIES * FINE_IN_AIR) : RAIN_SERIES
          for (let s = 0; s < series && n < MAX_STREAKS; s++) {
            const period = seriesPeriod(i, j, s)
            const last = close + top / (SLOWEST_M_PER_S * down)
            for (let k = firstIndexFrom(i, j, s, open); (k - 1) * period < last && n < MAX_STREAKS; k++) {
              const drop = dropOf(i, j, s, k)
              if (!drop) continue
              if (drop.time > last) break
              if (s >= RAIN_SERIES) {
                const away = (drop.x - eye.x) * flat.x + (drop.z - eye.z) * flat.z
                if (away < fineFrom || away > fineTo) continue
                const at = away / pose.focusM
                const inFocus = smooth(SOFT_NEAR, FINE_NEAR, at) * (1 - smooth(FINE_REACH, SOFT_REACH, at))
                if (((drop.id >>> 3) & 127) / 127 > SOFT_KEEP + (1 - SOFT_KEEP) * inFocus) continue
              }
              const fromOpen = drop.speed * (drop.time - open)
              const fromClose = Math.max(0, drop.speed * (drop.time - close))
              if (fromClose * down > top) continue
              const gust = ((drop.id >>> 10) & 1023) / 511.5 - 1
              const cross = (((drop.id >>> 20) & 1023) / 511.5 - 1) * CROSS_SPREAD * down
              const weight = Math.min(1, Math.max(0, (drop.speed - 4) / 4.9))
              const sheet = Math.sin(drop.x * 2.3 + drop.z * 1.7 + drop.time * 1.9)
              const carry = 1 + CARRY_SPREAD * gust + GUST_LEAN * sheet + (s < RAIN_SERIES ? CARRY_BY_WEIGHT * (1 - 2 * weight) : 0)
              const dx = fallDir[0] * carry + crossX * cross
              const dz = fallDir[2] * carry + crossZ * cross
              const o = n * 4
              opens[o] = drop.x - dx * fromOpen
              opens[o + 1] = down * fromOpen
              opens[o + 2] = drop.z - dz * fromOpen
              opens[o + 3] = drop.radius
              closes[o] = drop.x - dx * fromClose
              closes[o + 1] = down * fromClose
              closes[o + 2] = drop.z - dz * fromClose
              closes[o + 3] = (drop.id & 1023) / 1023
              n++
            }
          }
        }
      }
      made = n
      geometry.instanceCount = n
      openAttr.needsUpdate = true
      closeAttr.needsUpdate = true
      uniforms.uSamples.value = Math.max(1, samples)
      uniforms.uPixelAngle.value = (2 * tanX) / width
      uniforms.uLight.value.fromArray(light).multiplyScalar(1 + flash)
    },
  }
}
