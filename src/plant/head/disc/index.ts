import * as THREE from 'three'
import { config } from '../../../config.ts'
import { combine, hash01, streamSeed } from '../../../core/random.ts'
import { makePartSurface, partGeometry, partMesh, type PartOptions, type PlantPart } from '../../part.ts'
import { FLOOR_DOME, FLOOR_RIM, type Pose } from '../../skeleton.ts'
import { tissueGlsl } from '../../surface/index.ts'
import { FIRST_OPEN, FIRST_SIDE, RIM_SHARE, SHOWN_FROM, cover, fronts, schedule, youth } from './opening.ts'
import { fieldFragment, fieldVertex, floretFragment, floretVertex } from './shaders.ts'
import { domeShape, floretShape } from './shape.ts'

const COUNT = config.plant.discFlorets
const GOLDEN = (config.plant.goldenAngleDeg * Math.PI) / 180
// The width of one floret's share of the floor, as a share of the head's radius.
const CELL = RIM_SHARE * Math.sqrt(Math.PI / COUNT)

interface HeadUniforms {
  uHC: { value: THREE.Vector3[] }
  uHA: { value: THREE.Vector3[] }
  uHP: { value: THREE.Vector3[] }
  uHQ: { value: THREE.Vector3[] }
  uHS: { value: THREE.Vector3[] }
  [name: string]: THREE.IUniform
}

function headUniforms(): HeadUniforms {
  const pair = () => ({ value: [new THREE.Vector3(), new THREE.Vector3()] })
  return {
    uHC: pair(),
    uHA: pair(),
    uHP: pair(),
    uHQ: pair(),
    uHS: pair(),
    uFloor: { value: new THREE.Vector2(FLOOR_RIM, FLOOR_DOME) },
    uCell: { value: CELL },
    uYoung: { value: 0 },
    uCover: { value: 0 },
    uFront: { value: new THREE.Vector2(1, 1) },
  }
}

function setHead(u: HeadUniforms, slot: 0 | 1, pose: Pose): void {
  const h = pose.head
  const shown = pose.time >= SHOWN_FROM ? h.radius : 0
  u.uHC.value[slot].set(h.cx, h.cy, h.cz)
  u.uHA.value[slot].set(h.ax, h.ay, h.az)
  u.uHP.value[slot].set(h.px, h.py, h.pz)
  u.uHQ.value[slot].set(h.qx, h.qy, h.qz)
  u.uHS.value[slot].set(shown, h.depth, pose.time)
}

function field(options: PartOptions): PlantPart {
  const shape = domeShape(options.detail === 'near' ? 4 : 1, 12)
  const geometry = partGeometry(options)
  geometry.setAttribute('aDome', new THREE.BufferAttribute(shape.dome, 2))
  geometry.setIndex(new THREE.BufferAttribute(shape.index, 1))
  const uniforms = headUniforms()
  const surface = makePartSurface(options, { name: `disc ${options.detail}`, vertex: fieldVertex, fragment: `${tissueGlsl}\n${fieldFragment}`, uniforms, castShadow: false })
  const mesh = partMesh(geometry, surface)
  return {
    name: 'disc',
    meshes: [mesh],
    casters: [],
    fill(slot, pose) {
      if (slot === 1) return
      setHead(uniforms, 0, pose)
      setHead(uniforms, 1, pose)
      // Each kind of neighbor runs on its own time, which its pose carries.
      const f = fronts(pose.time)
      uniforms.uFront.value.set(f.start, f.open)
      uniforms.uYoung.value = youth(pose.time)
      uniforms.uCover.value = cover(pose.time)
    },
    finish() {},
  }
}

export function create(options: PartOptions): PlantPart | null {
  if (options.places) return field(options)
  const seed = combine(streamSeed('disc'), options.variant)
  const uniforms = headUniforms()
  const surface = makePartSurface(options, {
    name: options.variant === 0 ? 'disc florets' : 'companion disc florets',
    vertex: floretVertex,
    fragment: `${tissueGlsl}\n${floretFragment}`,
    uniforms,
    side: THREE.DoubleSide,
    castShadow: false,
  })

  // Two sets: the florets that open during the film carry the whole flower, the ones that never do are pegs only.
  const sets: { full: boolean; florets: number[] }[] = [
    { full: true, florets: [] },
    { full: false, florets: [] },
  ]
  const each = new Float32Array(COUNT * 8)
  const wave = hash01(seed, 9) * Math.PI * 2
  for (let n = 0; n < COUNT; n++) {
    const rho = RIM_SHARE * Math.sqrt((n + 0.5) / COUNT)
    const theta = n * GOLDEN
    const ragged = (hash01(seed, 1, n) - 0.5) * 0.085 + 0.022 * Math.sin(3 * theta + wave) + 0.014 * Math.sin(7 * theta + wave * 2.3) + 0.06 * Math.cos(theta - FIRST_SIDE)
    const when = schedule(rho + ragged)
    when.start = Math.max(FIRST_OPEN, when.start + (hash01(seed, 6, n) - 0.5) * 1.4)
    when.length *= 0.75 + 0.6 * hash01(seed, 7, n)
    each.set([rho, theta, when.start, when.length, hash01(seed, 2, n), hash01(seed, 3, n) * Math.PI * 2, 0.9 + 0.2 * hash01(seed, 4, n), hash01(seed, 5, n)], n * 8)
    sets[when.start > config.film.durationSeconds + 0.25 ? 1 : 0].florets.push(n)
  }

  const meshes: THREE.Mesh[] = []
  const geometries: { geometry: THREE.InstancedBufferGeometry; count: number }[] = []
  for (const set of sets) {
    if (!set.florets.length) continue
    const shape = floretShape(set.full)
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.setAttribute('aShape', new THREE.BufferAttribute(shape.shape, 4))
    geometry.setIndex(new THREE.BufferAttribute(shape.index, 1))
    const data = new Float32Array(set.florets.length * 8)
    set.florets.forEach((n, i) => data.set(each.subarray(n * 8, n * 8 + 8), i * 8))
    const buffer = new THREE.InstancedInterleavedBuffer(data, 8)
    geometry.setAttribute('aFloret', new THREE.InterleavedBufferAttribute(buffer, 4, 0))
    geometry.setAttribute('aSeed', new THREE.InterleavedBufferAttribute(buffer, 4, 4))
    geometry.instanceCount = set.florets.length
    geometries.push({ geometry, count: set.florets.length })
    meshes.push(partMesh(geometry, surface))
  }

  return {
    name: 'disc',
    meshes,
    casters: [],
    fill(slot, pose) {
      setHead(uniforms, slot, pose)
      if (slot === 1) return
      const shown = pose.time >= SHOWN_FROM && uniforms.uHS.value[0].x > 0
      for (const g of geometries) g.geometry.instanceCount = shown ? g.count : 0
      uniforms.uYoung.value = youth(pose.time)
      uniforms.uCover.value = cover(pose.time)
    },
    finish() {},
  }
}
