import * as THREE from 'three'
import { makePartSurface, partMesh, type PartOptions } from '../part.ts'
import type { Surface } from '../../core/shading.ts'

// `real` turns true once this folder holds the plant's hairs at their real quality.
export const real = false

const STEPS = 3

const vertex = /* glsl */ `
in vec2 position;
in vec4 aRootA;
in vec4 aRootB;
in vec4 aLeanA;
in vec4 aLeanB;
out vec3 vWorld;
out float vDepth;
out float vAlong;
out float vCover;
out float vSeed;
uniform float uHairWidth;
void main() {
  vec4 root = mix(aRootA, aRootB, uShutter);
  vec4 lean = mix(aLeanA, aLeanB, uShutter);
  float t = position.y;
  vec3 dir = normalize(lean.xyz);
  vec3 sag = vec3(0.0, -1.0, 0.0) * 0.35 * t * t;
  vec3 local = root.xyz + (dir * t + sag) * root.w;
  vec3 world = plantWorld(local);
  vec3 along = plantDirection(normalize(dir + 2.0 * sag));
  vec3 toEye = normalize(uCamPos - world);
  vec3 side = normalize(cross(along, toEye));
  vec4 view = viewMatrix * vec4(world, 1.0);
  float pixel = (-view.z) * 2.0 / (projectionMatrix[1][1] * uSize.y);
  float want = uHairWidth * plantSize() * (1.0 - 0.8 * t);
  float wide = max(want, pixel);
  world += side * position.x * 0.5 * wide;
  view = viewMatrix * vec4(world, 1.0);
  vWorld = world;
  vDepth = -view.z;
  vAlong = t;
  vCover = want / wide;
  vSeed = lean.w;
  gl_Position = projectionMatrix * view;
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
in float vAlong;
in float vCover;
in float vSeed;
uniform vec3 uHairColor;
void main() {
  vec3 v = normalize(uCamPos - vWorld);
  float sun = plantSun(vWorld, uSunDir);
  float against = pow(saturate(dot(-v, uSunDir) * 0.5 + 0.5), 3.0);
  vec3 color = uHairColor * (uSunColor * (0.08 + 0.9 * against) * sun + skyAmbient(vec3(0.0, 1.0, 0.0)) * 0.5 * plantSky(vWorld));
  float cover = saturate(vCover) * (1.0 - 0.6 * vAlong);
  if (uDiag >= 4) cover = 0.0;
  outColor = vec4(applyFog(color, vWorld), cover);
}
`

// Fine hairs, one thin ribbon each, turned to the camera. The part that wears them gives each hair its root and its direction at both ends of the shutter.
export class HairSet {
  readonly surface: Surface
  readonly mesh: THREE.Mesh
  private readonly roots: [THREE.InstancedBufferAttribute, THREE.InstancedBufferAttribute]
  private readonly leans: [THREE.InstancedBufferAttribute, THREE.InstancedBufferAttribute]
  private readonly geometry: THREE.InstancedBufferGeometry

  constructor(options: PartOptions, readonly count: number, name: string, color: [number, number, number] = [0.9, 0.95, 0.8], widthM = 0.00004) {
    if (options.places) throw new Error('hairs are worn by the plant and the companion only')
    const strip = new Float32Array((STEPS + 1) * 4)
    const index: number[] = []
    for (let i = 0; i <= STEPS; i++) {
      strip.set([-1, i / STEPS, 1, i / STEPS], i * 4)
      if (i < STEPS) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    }
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(strip, 2))
    geometry.setIndex(index)
    const each = () => new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.roots = [each(), each()]
    this.leans = [each(), each()]
    geometry.setAttribute('aRootA', this.roots[0])
    geometry.setAttribute('aRootB', this.roots[1])
    geometry.setAttribute('aLeanA', this.leans[0])
    geometry.setAttribute('aLeanB', this.leans[1])
    geometry.instanceCount = count
    this.geometry = geometry
    this.surface = makePartSurface(options, {
      name,
      vertex,
      fragment,
      side: THREE.DoubleSide,
      transparent: true,
      castShadow: false,
      uniforms: { uHairColor: { value: new THREE.Vector3(...color) }, uHairWidth: { value: widthM } },
    })
    this.mesh = partMesh(geometry, this.surface)
  }

  // Four numbers a hair: where it is rooted (x, y, z in the plant's own space, meters) and how long it is.
  root(slot: 0 | 1): Float32Array {
    return this.roots[slot].array as Float32Array
  }

  // Four numbers a hair: the direction it grows in, and a number from 0 to 1 that is its own.
  lean(slot: 0 | 1): Float32Array {
    return this.leans[slot].array as Float32Array
  }

  // How many of the hairs are drawn, and the buffers sent again.
  finish(shown = this.count): void {
    this.geometry.instanceCount = Math.min(shown, this.count)
    for (const a of [...this.roots, ...this.leans]) a.needsUpdate = true
  }
}

export function createHairs(options: PartOptions, count: number, name: string, color?: [number, number, number], widthM?: number): HairSet | null {
  return options.places ? null : new HairSet(options, count, name, color, widthM)
}
