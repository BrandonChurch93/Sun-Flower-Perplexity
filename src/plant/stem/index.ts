// A worked example of a part: a plain tube with hairs on it. The real stem takes its place.
import * as THREE from 'three'
import { combine, hash01, streamSeed } from '../../core/random.ts'
import { heightAt, stemRadius } from '../growth.ts'
import { createHairs, type HairSet } from '../hairs/index.ts'
import { makePartSurface, partGeometry, partMesh, type PartDetail, type PartOptions, type PlantPart } from '../part.ts'
import { NECK_FLARE, stemAt, type Pose } from '../skeleton.ts'
import { tissueGlsl } from '../surface/index.ts'

const vertex = /* glsl */ `
in vec3 position;
#ifndef PLANT_FIELD
in vec3 positionB;
#endif
in vec3 normal;
in vec2 uv;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out float vDepth;
void main() {
#ifdef PLANT_FIELD
  vec3 local = position;
#else
  vec3 local = mix(position, positionB, uShutter);
#endif
  vec4 world = vec4(plantWorld(local), 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vNormal = plantDirection(normal);
  vUv = uv;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in float vDepth;
${tissueGlsl}
void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  if (dot(face, view) < 0.0) face = -face;
  float ribs = 0.5 + 0.5 * sin(vUv.x * 6.2832 * 14.0);
  float streak = valueNoise(vec2(vUv.x * 40.0, vUv.y * 90.0));
  Tissue t;
  t.albedo = mix(vec3(0.16, 0.27, 0.07), vec3(0.34, 0.44, 0.16), 0.6 * ribs + 0.4 * streak);
  t.through = vec3(0.0);
  t.face = face;
  t.normal = reliefNormal(face, vWorld, 0.0004 * ribs, 1.0);
  t.rough = 0.75;
  t.wax = 0.25;
  t.sheen = 0.7;
  t.occlusion = 1.0;
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, vDepth, -1.0);
}
`

const SHAPE: Record<PartDetail, { rings: number; sides: number; hairs: number }> = {
  hero: { rings: 96, sides: 16, hairs: 6000 },
  near: { rings: 10, sides: 5, hairs: 0 },
  far: { rings: 3, sides: 3, hairs: 0 },
}

const HAIR_LENGTH_M = 0.0035

export function create(options: PartOptions): PlantPart {
  const { rings, sides } = SHAPE[options.detail]
  const seed = combine(streamSeed('stem'), options.variant)
  const count = rings * (sides + 1)
  const geometry = partGeometry(options)
  const slots = [new Float32Array(count * 3), new Float32Array(count * 3)]
  const normals = new Float32Array(count * 3)
  const uv = new Float32Array(count * 2)
  const index: number[] = []
  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < sides; s++) {
      const a = r * (sides + 1) + s
      const b = a + sides + 1
      index.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const dynamic = (array: Float32Array, size: number) => new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage)
  const position = dynamic(slots[0], 3)
  const positionB = options.places ? null : dynamic(slots[1], 3)
  const normal = dynamic(normals, 3)
  const uvs = dynamic(uv, 2)
  geometry.setAttribute('position', position)
  if (positionB) geometry.setAttribute('positionB', positionB)
  geometry.setAttribute('normal', normal)
  geometry.setAttribute('uv', uvs)
  geometry.setIndex(index)
  const surface = makePartSurface(options, { name: 'stem', vertex, fragment })
  const mesh = partMesh(geometry, surface)

  const hairs: HairSet | null = createHairs(options, SHAPE[options.detail].hairs, 'stem hairs')
  // Each hair keeps its own place on the stem for the whole film: a share of its length and an angle round it.
  const where = hairs ? Float32Array.from({ length: hairs.count * 4 }, (_, i) => hash01(seed, 1 + (i % 4), i >> 2)) : null

  const radiusAt = (pose: Pose, u: number): number => {
    const grown = Math.min(1, heightAt(pose.time) / 0.006)
    const flare = NECK_FLARE * pose.head.radius * Math.max(0, (u - 0.97) / 0.03)
    return Math.max(stemRadius(pose.time, u) * grown, flare)
  }

  return {
    name: 'stem',
    meshes: hairs ? [mesh, ...hairs.meshes] : [mesh],
    casters: [{ mesh, surface }],
    fill(slot, pose) {
      if (slot === 1 && !positionB) return
      const out = slots[slot]
      for (let r = 0; r < rings; r++) {
        const u = r / (rings - 1)
        const n = stemAt(pose, u)
        const radius = radiusAt(pose, u)
        for (let s = 0; s <= sides; s++) {
          const a = (s / sides) * Math.PI * 2
          const c = Math.cos(a)
          const e = Math.sin(a)
          const nx = n.rx * c + n.bx * e
          const ny = n.ry * c + n.by * e
          const nz = n.rz * c + n.bz * e
          const v = (r * (sides + 1) + s) * 3
          out[v] = n.x + nx * radius
          out[v + 1] = n.y + ny * radius
          out[v + 2] = n.z + nz * radius
          if (slot === 0) {
            normals[v] = nx
            normals[v + 1] = ny
            normals[v + 2] = nz
            const t = (r * (sides + 1) + s) * 2
            uv[t] = s / sides
            uv[t + 1] = u * pose.length
          }
        }
      }
      if (hairs && where) {
        const root = hairs.root(slot)
        const lean = hairs.lean(slot)
        for (let i = 0; i < hairs.count; i++) {
          const u = where[i * 4]
          const a = where[i * 4 + 1] * Math.PI * 2
          const n = stemAt(pose, u)
          const radius = radiusAt(pose, u)
          const c = Math.cos(a)
          const e = Math.sin(a)
          const nx = n.rx * c + n.bx * e
          const ny = n.ry * c + n.by * e
          const nz = n.rz * c + n.bz * e
          root[i * 4] = n.x + nx * radius
          root[i * 4 + 1] = n.y + ny * radius
          root[i * 4 + 2] = n.z + nz * radius
          root[i * 4 + 3] = HAIR_LENGTH_M * (0.5 + where[i * 4 + 2]) * Math.min(1, radius / 0.004)
          lean[i * 4] = nx + n.tx * 0.3
          lean[i * 4 + 1] = ny + n.ty * 0.3
          lean[i * 4 + 2] = nz + n.tz * 0.3
          lean[i * 4 + 3] = where[i * 4 + 3]
        }
      }
    },
    finish() {
      position.needsUpdate = true
      if (positionB) positionB.needsUpdate = true
      normal.needsUpdate = true
      uvs.needsUpdate = true
      hairs?.finish()
    },
  }
}
