import * as THREE from 'three'
import { makeSurface } from '../../core/shading.ts'
import type { RGB } from '../../core/world.ts'
import { ringStrip } from '../skyline.ts'

// Ground mist: a low layer of lit air, drawn as upright sheets round the plant. Each sheet stands for the slab of mist between it and the next, so the mist thickens with distance. It is lit by the world's sun and by the sky's fill, and it is a closed form of the time it is given.
export interface MistSettings {
  // Where the mist begins and where it ends, in meters from the plant, and the number of sheets between.
  fromM: number
  toM: number
  sheets: number
  // The height over the ground at which the mist has thinned to about a third.
  heightM: number
  // How much of the light behind it one meter of the mist takes away at the ground: 0.1 is a tenth.
  thickness: number
  // The mist's color in the sun's light and in the sky's shade. They multiply the world's sun and the world's sky.
  lit: RGB
  shade: RGB
  // How strongly the mist glows where one looks through it toward the sun: 0 not at all, 1 a strong glow.
  forward: number
  // The mist's drift over the ground in meters a second, along x and along z.
  drift: [number, number]
  // The width of one bank in meters, and how broken the mist is: 0 an even layer, 1 banks with clear air between.
  bankM: number
  broken: number
  // How much thinner the mist is at its near edge than at its far edge: 0 an even layer, 1 nothing at the near edge. Even when left out.
  rise?: number
  // The half width in radians of the wide glow round the sun. 0.24 when left out.
  lobeRad?: number
}

export interface Mist {
  meshes: THREE.Mesh[]
  triangles: number
  // Once a lens sample: the film time of that sample, in seconds.
  sample(time: number): void
  // The layer's height at a time of the film, in meters, where it settles: never above the height it was made with.
  settle(heightM: number): void
}

const vertex = /* glsl */ `
in vec3 position;
in vec3 aInfo;
out vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
uniform float uMistTime;
uniform float uSlabM;
uniform float uRadiusM;
uniform float uHeightM;
uniform float uThickness;
uniform vec3 uLit;
uniform vec3 uShade;
uniform float uForward;
uniform vec2 uDrift;
uniform float uBankM;
uniform float uBroken;
uniform float uSheet;
uniform float uShare;
uniform float uLobe;
void main() {
  if (uDiag > 1) discard;
  vec3 ray = vWorld - uCamPos;
  float d = length(ray);
  vec3 v = ray / d;
  vec2 at = (vWorld.xz - uDrift * uMistTime) / uBankM;
  float bank = valueNoise(at + uSheet * 0.37);
  float wisp = valueNoise(at * 3.1 + vec2(17.0, 5.0) + uSheet * 0.11);
  float height = uHeightM * (0.75 + 0.35 * bank + 0.15 * wisp);
  float amount = mix(1.0, smoothstep(0.25, 0.75, 0.7 * bank + 0.3 * wisp) * 1.8, uBroken);
  // The share of this sheet's slab that the ray crosses before it meets the ground, with the mist thinning upward along it.
  float across = max(length(v.xz), 0.05);
  float fall = -v.y / across;
  float reach = fall > 0.0 ? min(uSlabM, max(vWorld.y, 0.0) / fall) : uSlabM;
  float x = fall * reach / height;
  float lift = max(vWorld.y, 0.0) / height;
  float run = abs(x) > 1e-3 ? reach * (exp(x - lift) - exp(-lift)) / x : reach * exp(-lift);
  float depth = uThickness * uShare * amount * run / across;
  float alpha = (1.0 - exp(-depth)) * smoothstep(0.15, 0.6, length(ray.xz) / uRadiusM);
  float theta = acos(clamp(dot(v, uSunDir), -1.0, 1.0));
  float glow = 0.02 + uForward * (exp(-pow(theta / uLobe, 3.0)) + 2.0 * exp(-theta / 0.1));
  vec3 color = uLit * uSunColor * glow + uShade * skyAmbient(vec3(0.0, 1.0, 0.0));
  outColor = vec4(color, alpha);
}
`

const SIDES = 128

export function makeMist(name: string, settings: MistSettings, order = 60): Mist {
  const time = { value: 0 }
  const height = { value: settings.heightM }
  const meshes: THREE.Mesh[] = []
  let triangles = 0
  const count = Math.max(2, Math.round(settings.sheets))
  const step = Math.log(settings.toM / settings.fromM) / (count - 1)
  for (let i = 0; i < count; i++) {
    const radius = settings.fromM * Math.exp(step * i)
    const geometry = ringStrip(SIDES, () => ({ radius, top: settings.heightM * 9 }))
    const surface = makeSurface({
      name: `${name} mist ${i}`,
      vertex,
      fragment,
      uniforms: {
        uMistTime: time,
        uSlabM: { value: radius * step },
        uRadiusM: { value: radius },
        uHeightM: height,
        uThickness: { value: -Math.log(1 - Math.min(0.999, Math.max(0, settings.thickness))) },
        uLit: { value: new THREE.Vector3().fromArray(settings.lit) },
        uShade: { value: new THREE.Vector3().fromArray(settings.shade) },
        uForward: { value: settings.forward },
        uDrift: { value: new THREE.Vector2().fromArray(settings.drift) },
        uBankM: { value: settings.bankM },
        uBroken: { value: settings.broken },
        uSheet: { value: i + 1 },
        uShare: { value: 1 - (settings.rise ?? 0) * (1 - i / (count - 1)) },
        uLobe: { value: settings.lobeRad ?? 0.24 },
      },
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, surface.main)
    mesh.frustumCulled = false
    mesh.matrixAutoUpdate = false
    mesh.renderOrder = order + (count - i)
    meshes.push(mesh)
    triangles += (geometry.index as THREE.BufferAttribute).count / 3
  }
  return {
    meshes,
    triangles,
    sample(t: number): void {
      time.value = t
    },
    settle(heightM: number): void {
      height.value = Math.min(settings.heightM, Math.max(1e-4, heightM))
    },
  }
}
