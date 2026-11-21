import * as THREE from 'three'
import { config } from '../config.ts'
import type { Assets } from '../core/assets.ts'
import { allUnits, declareStandIn } from '../core/standins.ts'
import type { Surface } from '../core/shading.ts'
import type { Caster } from '../core/shadow.ts'
import { bodyRadius, headOpen, leafCount, leafLength, paleness, rayCount, rayLength, usePlant, type PlantInputs } from './growth.ts'
import { real as hairsReal } from './hairs/index.ts'
import { create as createBud } from './head/bud/index.ts'
import { create as createDisc } from './head/disc/index.ts'
import { create as createPetals } from './head/petals/index.ts'
import { create as createLeaves } from './leaves/index.ts'
import { makePartSurface, partGeometry, partMesh, type PartDetail, type PartMaker, type PartOptions, type PlantPart } from './part.ts'
import { create as createSeedling } from './seedling/index.ts'
import { poseAt } from './skeleton.ts'
import { HERO, PART, buildStandIn, plantNumbers, standInTopology, tipAt, vertexCountOf, type Detail } from './standin.ts'
import { create as createStem } from './stem/index.ts'
import { real as surfaceReal } from './surface/index.ts'

const vertex = /* glsl */ `
in vec3 position;
#ifndef PLANT_FIELD
in vec3 positionB;
#endif
in vec3 normal;
in vec2 uv;
in vec3 aInfo;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out vec3 vInfo;
out float vDepth;
void main() {
#ifdef PLANT_FIELD
  vec4 world = vec4(plantWorld(position), 1.0);
  vNormal = plantDirection(normal);
#else
  vec4 world = vec4(plantWorld(mix(position, positionB, uShutter)), 1.0);
  vNormal = normal;
#endif
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vUv = uv;
  vInfo = aInfo;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

// The stand-in colors of each part of a sunflower, shared with the neighbors in the field.
export const plantColorGlsl = /* glsl */ `
uniform float uPale;
uniform float uBloom;
void plantColor(int part, vec2 uv, float seed, bool front, out vec3 albedo, out vec3 through) {
  through = vec3(0.0);
  if (part == 0) {
    float streak = fbm(vec2(uv.x * 9.0, uv.y * 60.0));
    albedo = mix(vec3(0.2, 0.32, 0.08), vec3(0.42, 0.5, 0.2), streak);
    albedo = mix(albedo, vec3(0.78, 0.7, 0.5), uPale * 0.85);
  } else if (part == 1 || part == 2) {
    float across = abs(uv.x - 0.5) * 2.0;
    float side = abs(fract(uv.y * 7.0 + across * 1.6 + seed) - 0.5) * 2.0;
    float vein = max(smoothstep(0.1, 0.0, across), 0.6 * smoothstep(0.12, 0.0, side) * smoothstep(1.0, 0.2, across));
    if (part == 2) vein *= 0.25;
    float mottle = fbm(uv * vec2(14.0, 30.0) + seed * 40.0);
    albedo = mix(vec3(0.1, 0.24, 0.04), vec3(0.24, 0.4, 0.09), mottle);
    if (part == 2) albedo = mix(albedo * 1.5, vec3(0.7, 0.72, 0.35), uPale * 0.7);
    albedo = mix(albedo, vec3(0.34, 0.46, 0.16), vein * (front ? 0.5 : 0.9));
    through = mix(vec3(0.5, 0.78, 0.08), vec3(0.16, 0.34, 0.02), vein) * (0.75 + 0.5 * mottle);
  } else if (part == 3) {
    float stripe = smoothstep(0.35, 0.65, abs(fract(uv.x * 4.0) - 0.5) * 2.0);
    albedo = mix(vec3(0.03, 0.028, 0.025), vec3(0.5, 0.47, 0.4), stripe);
  } else if (part == 4) {
    float ring = uv.y;
    vec3 bud = mix(vec3(0.14, 0.26, 0.07), vec3(0.3, 0.42, 0.14), fbm(uv * vec2(18.0, 12.0)));
    vec3 face = mix(vec3(0.36, 0.3, 0.05), vec3(0.2, 0.1, 0.03), smoothstep(0.62, 0.98, ring));
    face = mix(face, vec3(0.5, 0.36, 0.05), smoothstep(0.75, 0.6, ring) * 0.6);
    face *= 0.75 + 0.5 * fbm(uv * vec2(60.0, 40.0));
    albedo = mix(bud, face, uBloom * smoothstep(0.4, 0.56, ring));
  } else if (part == 5) {
    albedo = mix(vec3(0.12, 0.25, 0.06), vec3(0.26, 0.4, 0.12), fbm(uv * vec2(6.0, 14.0) + seed * 30.0));
    through = vec3(0.3, 0.5, 0.06);
  } else {
    float line = abs(fract(uv.x * 5.0 + seed) - 0.5) * 2.0;
    albedo = mix(vec3(0.95, 0.6, 0.03), vec3(1.0, 0.78, 0.08), smoothstep(0.0, 1.0, uv.y)) * (0.86 + 0.14 * line);
    through = vec3(1.0, 0.62, 0.04);
  }
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in vec3 vInfo;
in float vDepth;
${plantColorGlsl}
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uCamPos - vWorld);
#ifdef PLANT_FIELD
  if (dot(n, v) < 0.0) n = -n;
  float ndl = dot(n, uSunDir);
  vec3 albedo;
  vec3 through;
  plantColor(int(vInfo.x + 0.5), vUv, vInfo.z, true, albedo, through);
  albedo *= 0.78 + 0.44 * vPlantTone;
  float high = saturate(vWorld.y / max(uCanopy, 0.001));
  float open = mix(0.22, 1.0, smoothstep(0.25, 0.95, high));
  float reach = mix(smoothstep(0.5, 0.95, high), 1.0, saturate(uSunDir.y * 1.5));
  vec3 color = albedo * (uSunColor * max(ndl, 0.0) * reach + skyAmbient(n) * open);
  color += through * uSunColor * max(-ndl, 0.0) * reach * 0.25;
  color += through * skyAmbient(-n) * 0.25 * open;
#else
  if (!gl_FrontFacing) n = -n;
  float ndl = dot(n, uSunDir);
  vec3 toLight = ndl >= 0.0 ? n : -n;
  float lit = sunShadow(vWorld, toLight, uShadowTexelM * 2.5);
  vec3 albedo;
  vec3 through;
  plantColor(int(vInfo.x + 0.5), vUv, vInfo.z, gl_FrontFacing, albedo, through);
  vec3 color = albedo * (uSunColor * max(ndl, 0.0) * lit + skyAmbient(n));
  color += through * uSunColor * max(-ndl, 0.0) * lit * 0.25;
  color += through * skyAmbient(-n) * 0.25;
  float rim = pow(1.0 - saturate(dot(n, v)), 4.0);
  color += uSunColor * rim * 0.06 * lit * saturate(0.4 + dot(-v, uSunDir));
#endif
  outColor = finish(color, vWorld, vDepth, -1.0);
}
`

// How finely the neighbors are built.
const NEAR: Detail = { stemRings: 6, stemSides: 4, seedU: 3, seedV: 2, huskRings: 0, huskSides: 0, leafStep: 2, leafU: 4, leafV: 3, bodyRings: 4, bodySides: 7, bractStep: 3, bractU: 3, bractV: 2, rayStep: 2, rayU: 3, rayV: 2 }
const FAR: Detail = { stemRings: 2, stemSides: 4, seedU: 0, seedV: 0, huskRings: 0, huskSides: 0, leafStep: 5, leafU: 3, leafV: 2, bodyRings: 3, bodySides: 6, bractStep: 0, bractU: 0, bractV: 0, rayStep: 5, rayU: 3, rayV: 2 }
const DETAIL: Record<PartDetail, Detail> = { hero: HERO, near: NEAR, far: FAR }

const bit = (part: number) => 1 << part
const ALL = bit(PART.stem) | bit(PART.leaf) | bit(PART.seedLeaf) | bit(PART.husk) | bit(PART.body) | bit(PART.bract) | bit(PART.ray)

// Which units a piece of the plant is in: every unit with a moment at which the piece has a size.
function unitsWith(size: (time: number) => number): string[] {
  return config.segments
    .filter((s) => {
      for (let t = s.start; t <= s.end; t += 0.25) if (size(Math.min(t, s.end - 1e-6)) > 0) return true
      return false
    })
    .map((s) => s.id)
}

const anyLeaf = (time: number) => {
  for (let i = 0; i < leafCount; i++) if (leafLength(i, time) > 0) return 1
  return 0
}
const anyRay = (time: number) => {
  for (let k = 0; k < rayCount; k++) if (rayLength(k, time) > 0) return 1
  return 0
}

// The real parts, in the order they are drawn, with the stand-in pieces each one draws instead of and the units it is in.
const SLOTS: { name: string; make: PartMaker; pieces: number; units: () => string[] }[] = [
  { name: 'stem', make: createStem, pieces: bit(PART.stem), units: allUnits },
  { name: 'leaves', make: createLeaves, pieces: bit(PART.leaf), units: () => unitsWith(anyLeaf) },
  { name: 'seedling', make: createSeedling, pieces: bit(PART.seedLeaf) | bit(PART.husk), units: allUnits },
  { name: 'bud', make: createBud, pieces: bit(PART.body) | bit(PART.bract), units: () => unitsWith(bodyRadius) },
  { name: 'disc', make: createDisc, pieces: 0, units: () => unitsWith(headOpen) },
  { name: 'petals', make: createPetals, pieces: bit(PART.ray), units: () => unitsWith(anyRay) },
]

export interface PlantOptions {
  // 0 is the plant. Any other number builds a neighbor with its own small differences.
  variant?: number
  detail?: PartDetail
  // The places of the neighbors, when one shape is drawn once per neighbor.
  places?: THREE.InstancedInterleavedBuffer | null
}

export class Plant {
  readonly variant: number
  readonly detail: PartDetail
  // The stand-in: every piece no real part has taken over yet.
  readonly surface: Surface
  readonly mesh: THREE.Mesh
  readonly parts: PlantPart[] = []
  readonly meshes: THREE.Mesh[]
  readonly casters: Caster[]
  private readonly shape: Detail
  private readonly a: THREE.BufferAttribute
  private readonly b: THREE.BufferAttribute | null
  private readonly n: THREE.BufferAttribute
  private readonly hide: number

  constructor(o: PlantOptions = {}) {
    this.variant = o.variant ?? 0
    this.detail = o.detail ?? 'hero'
    const places = o.places ?? null
    const options: PartOptions = { detail: this.detail, variant: this.variant, places }
    const who = places ? 'neighbors' : 'plant'
    let hide = 0
    for (const slot of SLOTS) {
      const part = slot.make(options)
      if (part) {
        this.parts.push(part)
        hide |= slot.pieces
      } else declareStandIn(`${who} ${slot.name}`, slot.units())
    }
    if (!hairsReal) declareStandIn('plant hairs')
    if (!surfaceReal) declareStandIn('plant surface')
    this.hide = hide
    this.shape = DETAIL[this.detail]
    const count = vertexCountOf(this.shape)
    const topology = standInTopology(this.shape)
    const geometry = partGeometry(options)
    const dynamic = () => new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.a = dynamic()
    this.b = places ? null : dynamic()
    this.n = dynamic()
    geometry.setAttribute('position', this.a)
    if (this.b) geometry.setAttribute('positionB', this.b)
    geometry.setAttribute('normal', this.n)
    geometry.setAttribute('uv', new THREE.BufferAttribute(topology.uv, 2))
    geometry.setAttribute('aInfo', new THREE.BufferAttribute(topology.info, 3))
    geometry.setIndex(new THREE.BufferAttribute(topology.index, 1))
    const name = places ? 'field stand-in' : this.variant === 0 ? 'plant stand-in' : 'companion stand-in'
    this.surface = makePartSurface(options, { name, vertex, fragment, side: THREE.DoubleSide, standIn: true, uniforms: { uPale: { value: 0 }, uBloom: { value: 0 } } })
    this.mesh = partMesh(geometry, this.surface)
    this.mesh.visible = hide !== ALL
    this.meshes = [this.mesh, ...this.parts.flatMap((p) => p.meshes)]
    this.casters = places ? [] : [{ mesh: this.mesh, surface: this.surface }, ...this.parts.flatMap((p) => p.casters)]
  }

  async load(assets: Assets): Promise<void> {
    for (const part of this.parts) await part.load?.(assets)
  }

  // Where the whole plant stands: every mesh of it takes the same matrix.
  place(matrix: THREE.Matrix4): void {
    for (const m of this.meshes) {
      m.matrixAutoUpdate = false
      m.matrix.copy(matrix)
      m.matrixWorld.copy(matrix)
    }
  }

  // How many neighbors are drawn, when the plant is drawn once per neighbor.
  show(count: number): void {
    for (const m of this.meshes) if (m.geometry instanceof THREE.InstancedBufferGeometry && m.geometry.getAttribute('aPlace')) m.geometry.instanceCount = count
  }

  set visible(on: boolean) {
    for (const m of this.meshes) m.visible = on && (m !== this.mesh || this.hide !== ALL)
  }

  prepare(timeOpen: number, timeClose: number, open: PlantInputs, close: PlantInputs): void {
    usePlant(this.variant)
    if (this.hide !== ALL) {
      buildStandIn(timeOpen, open, this.a.array as Float32Array, this.n.array as Float32Array, this.shape, this.hide)
      if (this.b) buildStandIn(timeClose, close, this.b.array as Float32Array, null, this.shape, this.hide)
      this.a.needsUpdate = true
      if (this.b) this.b.needsUpdate = true
      this.n.needsUpdate = true
    }
    if (this.parts.length) {
      const first = poseAt(timeOpen, open)
      for (const part of this.parts) part.fill(0, first)
      const second = poseAt(timeClose, close)
      for (const part of this.parts) part.fill(1, second)
      for (const part of this.parts) part.finish(timeOpen, open)
    }
    usePlant(0)
    this.surface.main.uniforms.uPale.value = paleness(timeOpen)
    this.surface.main.uniforms.uBloom.value = headOpen(timeOpen)
  }

  tip(time: number, inputs: PlantInputs, out: THREE.Vector3): THREE.Vector3 {
    tipAt(time, inputs, out)
    return out
  }

  numbers(time: number, inputs: PlantInputs): number[] {
    return plantNumbers(time, inputs)
  }
}
