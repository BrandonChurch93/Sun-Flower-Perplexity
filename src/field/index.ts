import * as THREE from 'three'
import { declareStandIn } from '../core/standins.ts'
import { makeSurface, type Surface } from '../core/shading.ts'
import { headOpen, heightAt, paleness, type PlantInputs } from '../plant/growth.ts'
import { plantColorGlsl } from '../plant/index.ts'
import { buildStandIn, standInTopology, vertexCountOf, type Detail } from '../plant/standin.ts'
import { PLACE, fieldFarM, fieldHalfWidth, fieldPlaces, right, toward } from './layout.ts'

const NEAR: Detail = { stemRings: 6, stemSides: 4, seedU: 3, seedV: 2, huskRings: 0, huskSides: 0, leafStep: 2, leafU: 4, leafV: 3, bodyRings: 4, bodySides: 7, bractStep: 3, bractU: 3, bractV: 2, rayStep: 2, rayU: 3, rayV: 2 }
const FAR: Detail = { stemRings: 2, stemSides: 4, seedU: 0, seedV: 0, huskRings: 0, huskSides: 0, leafStep: 5, leafU: 3, leafV: 2, bodyRings: 3, bodySides: 6, bractStep: 0, bractU: 0, bractV: 0, rayStep: 5, rayU: 3, rayV: 2 }

const vertex = /* glsl */ `
in vec3 position;
in vec3 normal;
in vec2 uv;
in vec3 aInfo;
in vec4 aPlace;
in vec4 aVary;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out vec3 vInfo;
out float vDepth;
out float vTone;
void main() {
  float c = cos(aPlace.z);
  float s = sin(aPlace.z);
  vec3 p = position * aPlace.w;
  p.xz += aVary.xy * p.y;
  vec4 world = vec4(c * p.x + s * p.z + aPlace.x, p.y, c * p.z - s * p.x + aPlace.y, 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vNormal = vec3(c * normal.x + s * normal.z, normal.y, c * normal.z - s * normal.x);
  vUv = uv;
  vInfo = aInfo;
  vTone = aVary.z;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in vec3 vInfo;
in float vDepth;
in float vTone;
uniform float uCanopy;
${plantColorGlsl}
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uCamPos - vWorld);
  if (dot(n, v) < 0.0) n = -n;
  float ndl = dot(n, uSunDir);
  vec3 albedo;
  vec3 through;
  plantColor(int(vInfo.x + 0.5), vUv, vInfo.z, true, albedo, through);
  albedo *= 0.78 + 0.44 * vTone;
  float high = saturate(vWorld.y / max(uCanopy, 0.001));
  float open = mix(0.22, 1.0, smoothstep(0.25, 0.95, high));
  float reach = mix(smoothstep(0.5, 0.95, high), 1.0, saturate(uSunDir.y * 1.5));
  vec3 color = albedo * (uSunColor * max(ndl, 0.0) * reach + skyAmbient(n) * open);
  color += through * uSunColor * max(-ndl, 0.0) * reach * 0.25;
  color += through * skyAmbient(-n) * 0.25 * open;
  outColor = finish(color, vWorld, vDepth, -1.0);
}
`

const carpetVertex = /* glsl */ `
in vec3 position;
out vec3 vWorld;
out float vDepth;
uniform float uCanopy;
void main() {
  vec4 world = vec4(position.x, uCanopy * 0.9, position.z, 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

const carpetFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
uniform float uBloom;
void main() {
  float heads = smoothstep(0.52, 0.7, valueNoise(vWorld.xz * 2.4));
  float patchy = fbm(vWorld.xz * 0.11);
  vec3 leaves = mix(vec3(0.07, 0.15, 0.03), vec3(0.16, 0.27, 0.07), patchy);
  vec3 albedo = mix(leaves, vec3(0.85, 0.58, 0.05), heads * uBloom * 0.8);
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 color = albedo * (uSunColor * max(uSunDir.y, 0.0) * 1.6 + skyAmbient(n) * 0.8);
  outColor = finish(color, vWorld, vDepth, -1.0);
}
`

interface Tier { detail: Detail; mesh: THREE.Mesh; position: THREE.BufferAttribute; normal: THREE.BufferAttribute; count: number }

function tier(detail: Detail, places: Float32Array, material: THREE.Material): Tier {
  const count = vertexCountOf(detail)
  const topology = standInTopology(detail)
  const geometry = new THREE.InstancedBufferGeometry()
  const position = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage)
  const normal = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', position)
  geometry.setAttribute('normal', normal)
  geometry.setAttribute('uv', new THREE.BufferAttribute(topology.uv, 2))
  geometry.setAttribute('aInfo', new THREE.BufferAttribute(topology.info, 3))
  const each = new THREE.InstancedInterleavedBuffer(places, PLACE)
  geometry.setAttribute('aPlace', new THREE.InterleavedBufferAttribute(each, 4, 0))
  geometry.setAttribute('aVary', new THREE.InterleavedBufferAttribute(each, 4, 4))
  geometry.setIndex(new THREE.BufferAttribute(topology.index, 1))
  geometry.instanceCount = places.length / PLACE
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  return { detail, mesh, position, normal, count: places.length / PLACE }
}

function carpetGeometry(): THREE.BufferGeometry {
  const depths = [fieldFarM - 6, 200, 1200, 6000]
  const position: number[] = []
  const index: number[] = []
  depths.forEach((d, i) => {
    const half = fieldHalfWidth(d)
    for (const side of [-1, 1]) position.push(-toward.x * d + right.x * half * side, 0, -toward.z * d + right.z * half * side)
    if (i > 0) {
      const a = (i - 1) * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(position), 3))
  geometry.setIndex(index)
  return geometry
}

// The neighbors: the same kind of plant at the same age, in rows behind the plant, and one sheet of canopy past them.
export class Field {
  readonly surface: Surface
  readonly carpetSurface: Surface
  readonly near: Tier
  readonly far: Tier
  readonly carpet: THREE.Mesh
  readonly meshes: THREE.Mesh[]

  constructor() {
    declareStandIn('field')
    const uniforms = { uPale: { value: 0 }, uBloom: { value: 0 }, uCanopy: { value: 0 } }
    this.surface = makeSurface({ name: 'field stand-in', vertex, fragment, side: THREE.DoubleSide, standIn: true, castShadow: false, uniforms })
    this.carpetSurface = makeSurface({ name: 'far field stand-in', vertex: carpetVertex, fragment: carpetFragment, side: THREE.DoubleSide, standIn: true, castShadow: false, uniforms })
    const places = fieldPlaces()
    this.near = tier(NEAR, places.near, this.surface.main)
    this.far = tier(FAR, places.far, this.surface.main)
    this.carpet = new THREE.Mesh(carpetGeometry(), this.carpetSurface.main)
    this.carpet.frustumCulled = false
    this.meshes = [this.near.mesh, this.far.mesh, this.carpet]
  }

  get plants(): number {
    return this.near.count + this.far.count
  }

  prepare(time: number, inputs: PlantInputs, eyeHeightM: number): void {
    for (const t of [this.near, this.far]) {
      buildStandIn(time, inputs, t.position.array as Float32Array, t.normal.array as Float32Array, t.detail)
      t.position.needsUpdate = true
      t.normal.needsUpdate = true
    }
    const canopy = heightAt(time) * 0.95
    const u = this.surface.main.uniforms
    u.uPale.value = paleness(time)
    u.uBloom.value = headOpen(time)
    u.uCanopy.value = canopy
    this.carpet.visible = eyeHeightM > canopy * 0.9
  }
}
