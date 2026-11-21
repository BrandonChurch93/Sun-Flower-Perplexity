import * as THREE from 'three'
import type { CameraPose } from '../../core/lens.ts'
import { makeSurface } from '../../core/shading.ts'
import { RAIN_CELL_M, RAIN_FINE_SERIES, RAIN_SERIES, dropOf, fallDir, firstIndexFrom, seriesPeriod } from './drops.ts'

// A drop crosses many times its own width while the shutter is open, so it is drawn as the whole path it sweeps: a strip from where it is at the open shutter
// to where it is at the close, as wide as the drop, holding the share of the exposure the drop spends over each point of it.
const vertex = /* glsl */ `
in vec2 position;
in vec4 aOpen;
in vec4 aClose;
uniform float uPixelAngle;
uniform float uSamples;
uniform float uGain;
out float vAcross;
out float vAlong;
out float vShare;
out float vSeed;
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
  float coc = min(uCocScale * abs(1.0 / depth - 1.0 / uFocusM), 2048.0);
  // Out of focus, one lens sample carries its share of the blur circle: the strip is drawn that wide so the samples close into it.
  float halfPx = max(max(r / pixelM, 0.6), 1.2 * coc / sqrt(uSamples));
  float halfM = halfPx * pixelM;
  float lengthM = distance(aOpen.xyz, aClose.xyz);
  mid.xy += across * (position.x * halfM) + along * ((2.0 * position.y - 1.0) * halfM);
  vAcross = position.x;
  vAlong = position.y * (lengthM + 2.0 * halfM) / max(r, 1e-5);
  vShare = min(1.0, uGain * 3.14159 * r * r / (2.0 * halfM * (lengthM + 2.0 * halfM)));
  vSeed = aClose.w;
  vWorld = (inverse(viewMatrix) * vec4(mid, 1.0)).xyz;
  gl_Position = projectionMatrix * vec4(mid, 1.0);
  if (-a.z < 0.02 || -b.z < 0.02) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`

const fragment = /* glsl */ `
in float vAcross;
in float vAlong;
in float vShare;
in float vSeed;
in vec3 vWorld;
uniform vec3 uLight;
uniform vec3 uShade;
void main() {
  if (uDiag > 1) discard;
  float u = vAcross * vAcross;
  // A drop is a small lens: it gathers the bright horizon into a line down its middle and shows the dark land and cloud toward its edges. It also swings as it falls, so the line swells and thins.
  float swing = 0.75 + 0.25 * sin(vAlong * (0.22 + 0.2 * vSeed) + 40.0 * vSeed);
  float core = exp(-u / 0.09) * swing;
  vec3 color = mix(uShade, uLight, 0.3 + 0.7 * core);
  float body = 1.5 * (1.0 - u);
  outColor = vec4(applyFog(color, vWorld), saturate(vShare * body * (0.6 + 0.9 * core)));
}
`

const MAX_STREAKS = 60000
const HEAVY_REACH_M = 12
const FINE_REACH_M = 2.6
const SLOWEST_M_PER_S = 1

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
    uGain: { value: 6 },
    uLight: { value: new THREE.Vector3().fromArray(light) },
    uShade: { value: new THREE.Vector3().fromArray(shade) },
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
      const i0 = Math.floor((eye.x - reach) / RAIN_CELL_M)
      const i1 = Math.floor((eye.x + reach) / RAIN_CELL_M)
      const j0 = Math.floor((eye.z - reach) / RAIN_CELL_M)
      const j1 = Math.floor((eye.z + reach) / RAIN_CELL_M)
      const down = -fallDir[1]
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
          const series = depth < FINE_REACH_M ? RAIN_SERIES + RAIN_FINE_SERIES : RAIN_SERIES
          for (let s = 0; s < series && n < MAX_STREAKS; s++) {
            const period = seriesPeriod(i, j, s)
            const last = close + top / (SLOWEST_M_PER_S * down)
            for (let k = firstIndexFrom(i, j, s, open); (k - 1) * period < last && n < MAX_STREAKS; k++) {
              const drop = dropOf(i, j, s, k)
              if (!drop) continue
              if (drop.time > last) break
              const fromOpen = drop.speed * (drop.time - open)
              const fromClose = Math.max(0, drop.speed * (drop.time - close))
              if (fromClose * down > top) continue
              const o = n * 4
              opens[o] = drop.x - fallDir[0] * fromOpen
              opens[o + 1] = down * fromOpen
              opens[o + 2] = drop.z - fallDir[2] * fromOpen
              opens[o + 3] = drop.radius
              closes[o] = drop.x - fallDir[0] * fromClose
              closes[o + 1] = down * fromClose
              closes[o + 2] = drop.z - fallDir[2] * fromClose
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
