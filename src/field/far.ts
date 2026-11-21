import * as THREE from 'three'
import { config } from '../config.ts'
import type { Assets } from '../core/assets.ts'
import type { CameraPose } from '../core/lens.ts'
import { makeSurface, shared, type Surface } from '../core/shading.ts'
import { bodyRadius, heightAt, leafCount, leafLength, rayLength, type PlantInputs } from '../plant/growth.ts'
import { Plant } from '../plant/index.ts'
import { makePartSurface } from '../plant/part.ts'
import { tissueGlsl } from '../plant/surface/index.ts'
import { windToward } from '../plant/wind.ts'
import { PLACE, carpetBandM, farVariants, fieldEndM, fieldFarM, fieldHalfWidth, fieldPicturesM, lagOf, pictureCount, pictureTurn, pictureTurns, right, toward } from './layout.ts'

const TILE_W = 64
const TILE_H = 128
// The lean a full gust gives a neighbor, per meter of its height. The same wave bends the pictures.
const SWAY = 0.035
// Where the dark layer under the far plants begins, and over how many meters it comes in.
const UNDER_FROM_M = 11
const UNDER_BAND_M = 16
// The dark layers, as shares of the height of the tops.
const UNDER_LEVELS = [0.5, 0.76]

const pictureVertex = /* glsl */ `
in vec3 position;
in vec4 aPlace;
in vec4 aVary;
out vec2 vUv;
out vec3 vWorld;
out float vDepth;
out float vTone;
uniform vec3 uRight;
uniform vec2 uTile;
uniform float uCrop;
uniform float uCount;
uniform float uWind;
// The wave of src/plant/wind.ts.
float gust(float time, vec2 p) {
  vec2 dir = vec2(${windToward.x.toFixed(4)}, ${windToward.z.toFixed(4)});
  float along = dot(p, dir) - time * 1.6;
  float across = p.y * dir.x - p.x * dir.y;
  return 0.55 * sin(along * 0.9 + 0.6 * sin(across * 0.31 + time * 0.13)) + 0.3 * sin(along * 2.3 + 1.7 + across * 0.9) + 0.15 * sin(along * 5.1 + 4.2 - across * 1.7);
}
void main() {
  float v = mix(1.0 - uCrop, 1.0, position.y);
  float h = v * uTile.y * aPlace.w;
  vec3 world = vec3(aPlace.x, h, aPlace.y) + uRight * (position.x * uTile.x * aPlace.w);
  vec2 lean = aVary.xy + vec2(${windToward.x.toFixed(4)}, ${windToward.z.toFixed(4)}) * (gust(uTime, aPlace.xy) * uWind * ${SWAY.toFixed(4)});
  world.xz += lean * h;
  vec4 view = viewMatrix * vec4(world, 1.0);
  float inset = 0.5 / ${TILE_W.toFixed(1)};
  vUv = vec2((aPlace.z + mix(inset, 1.0 - inset, position.x + 0.5)) / uCount, v);
  vWorld = world;
  vDepth = -view.z;
  vTone = 0.78 + 0.44 * aVary.z;
  gl_Position = projectionMatrix * view;
}
`

const pictureFragment = /* glsl */ `
in vec2 vUv;
in vec3 vWorld;
in float vDepth;
in float vTone;
uniform sampler2D uAtlas;
void main() {
  vec4 t = texture(uAtlas, vUv);
  float cover = 1.0 - t.a;
  if (cover < 0.42) discard;
  vec3 color = t.rgb / cover;
  if (uDiag == 7) {
    outColor = vec4(color, cocOf(vDepth));
    return;
  }
  outColor = finish(color * vTone, vWorld, vDepth, -1.0);
}
`

const sheetVertex = /* glsl */ `
in vec3 position;
out vec3 vWorld;
out float vDepth;
out vec3 vTop;
out vec3 vMid;
uniform sampler2D uAtlas;
uniform float uHeight;
vec3 band(float v) {
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 4; i++) sum += textureLod(uAtlas, vec2((float(i) + 0.5) * 0.25, v), 5.0);
  return sum.rgb / max(4.0 - sum.a, 0.02);
}
void main() {
  vec4 world = vec4(position.x, uHeight, position.z, 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  vTop = band(0.875);
  vMid = band(0.625);
  gl_Position = projectionMatrix * view;
}
`

const sheetCommon = /* glsl */ `
in vec3 vWorld;
in float vDepth;
in vec3 vTop;
in vec3 vMid;
uniform vec2 uToward;
uniform vec2 uStart;
uniform float uCover;
// A share of the plants, each one whole: the sheet comes in plant by plant.
float present(out float along, out float across) {
  along = -dot(vWorld.xz, uToward);
  across = vWorld.x * uToward.y - vWorld.z * uToward.x;
  vec2 cell = floor(vec2(across / ${config.field.plantSpacingM.toFixed(3)}, along / ${config.field.rowSpacingM.toFixed(3)}));
  float share = uCover * smoothstep(uStart.x, uStart.x + uStart.y, length(vWorld.xz));
  return share - hash21(cell);
}
`

const carpetFragment = /* glsl */ `
${sheetCommon}
void main() {
  float along;
  float across;
  if (present(along, across) < 0.0) discard;
  float grain = valueNoise(vec2(across * 2.2, along * 0.045));
  float patchy = valueNoise(vWorld.xz * 0.028);
  vec3 color = mix(vMid * 0.7, vTop, 0.3 + 0.55 * grain) * (0.78 + 0.44 * patchy);
  if (uDiag == 7) {
    outColor = vec4(color, cocOf(vDepth));
    return;
  }
  outColor = finish(color, vWorld, vDepth, -1.0);
}
`

const underVertex = /* glsl */ `
in vec3 position;
out vec3 vWorld;
out float vDepth;
uniform float uHeight;
void main() {
  vec4 world = vec4(position.x, uHeight, position.z, 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vDepth = -view.z;
  vPlantTone = 0.5;
  gl_Position = projectionMatrix * view;
}
`

const underFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
uniform vec2 uStart;
uniform float uCover;
uniform float uLevel;
${tissueGlsl}
// Clumps of leaves with holes between them, fewer toward the front of the field, lit as leaves deep under the tops.
void main() {
  vec2 p = vWorld.xz + uLevel * 37.0;
  float clump = 0.6 * valueNoise(p * 3.1) + 0.4 * valueNoise(p * 7.7);
  float share = uCover * (0.72 - 0.25 * uLevel) * smoothstep(uStart.x, uStart.x + uStart.y, length(vWorld.xz));
  if (clump > share) discard;
  float inside = (share - clump) / max(share, 0.01);
  Tissue t;
  t.albedo = mix(vec3(0.06, 0.13, 0.03), vec3(0.13, 0.25, 0.07), inside);
  t.through = vec3(0.3, 0.5, 0.06);
  // A leaf in the mass tips toward the viewer, so the light behind it comes through.
  t.normal = normalize(vec3(-uSunDir.x, 0.9, -uSunDir.z));
  t.face = t.normal;
  t.rough = 0.8;
  t.wax = 0.1;
  t.sheen = 0.0;
  t.occlusion = 0.45 + 0.55 * inside;
  outColor = finish(shadeTissue(t, vWorld, normalize(uCamPos - vWorld)), vWorld, vDepth, -1.0);
}
`

const hookVertex = /* glsl */ `
in vec3 position;
void main() {
  gl_Position = vec4(position, 1.0);
}
`

const hookFragment = /* glsl */ `
void main() {
  outColor = vec4(0.0);
}
`

function sheetGeometry(depths: number[]): THREE.BufferGeometry {
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

function plain(geometry: THREE.BufferGeometry, surface: Surface): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, surface.main)
  mesh.frustumCulled = false
  mesh.matrixAutoUpdate = false
  return mesh
}

const maxLeaf = (time: number): number => {
  let reach = 0
  for (let i = 0; i < leafCount; i++) reach = Math.max(reach, leafLength(i, time))
  return reach
}

// The far field. Pictures of the simpler plants, drawn once a frame from the plants themselves as the camera sees them, stand in rows
// past the last real plant. Past the pictures one carpet carries their color on. Under both lies the dark of the leaves.
export class FarField {
  readonly places: THREE.InstancedInterleavedBuffer
  readonly pictures: THREE.Mesh
  readonly carpet: THREE.Mesh
  readonly under: THREE.Mesh[]
  readonly meshes: THREE.Mesh[]
  private readonly plants: Plant[] = []
  private readonly spots: THREE.InstancedInterleavedBuffer[] = []
  private readonly atlas: THREE.WebGLRenderTarget
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, 0, 0.1, 200)
  private readonly uniforms = {
    uAtlas: { value: null as THREE.Texture | null },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uTile: { value: new THREE.Vector2(1, 1) },
    uCrop: { value: 1 },
    uCount: { value: pictureCount },
    uWind: { value: 0 },
    uToward: { value: new THREE.Vector2(toward.x, toward.z) },
    uCover: { value: 0 },
  }
  private readonly carpetHeight = { value: 0 }
  private readonly underHeights = UNDER_LEVELS.map(() => ({ value: 0 }))
  private readonly eye = new THREE.Vector3()
  private readonly clear = new THREE.Color()
  private readonly hook: THREE.Mesh
  private stale = false
  private above = false

  constructor(places: Float32Array) {
    this.atlas = new THREE.WebGLRenderTarget(TILE_W * pictureCount, TILE_H, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: true,
    })
    this.atlas.texture.colorSpace = THREE.NoColorSpace
    this.uniforms.uAtlas.value = this.atlas.texture
    farVariants.forEach((variant) => {
      const spot = new THREE.InstancedInterleavedBuffer(new Float32Array(pictureTurns * PLACE), PLACE)
      spot.setUsage(THREE.DynamicDrawUsage)
      const plant = new Plant({ detail: 'far', variant, places: spot })
      plant.show(pictureTurns)
      this.spots.push(spot)
      this.plants.push(plant)
      this.scene.add(...plant.meshes)
    })
    this.scene.matrixWorldAutoUpdate = false
    this.camera.matrixAutoUpdate = false

    this.places = new THREE.InstancedInterleavedBuffer(new Float32Array(places), PLACE)
    this.places.setUsage(THREE.DynamicDrawUsage)
    const quad = new THREE.InstancedBufferGeometry()
    quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0]), 3))
    quad.setIndex([0, 1, 2, 1, 3, 2])
    quad.setAttribute('aPlace', new THREE.InterleavedBufferAttribute(this.places, 4, 0))
    quad.setAttribute('aVary', new THREE.InterleavedBufferAttribute(this.places, 4, 4))
    quad.instanceCount = this.places.count
    const picture = makeSurface({ name: 'field pictures', vertex: pictureVertex, fragment: pictureFragment, side: THREE.DoubleSide, castShadow: false, uniforms: this.uniforms })
    this.pictures = plain(quad, picture)

    const carpet = makeSurface({ name: 'field carpet', vertex: sheetVertex, fragment: carpetFragment, side: THREE.DoubleSide, castShadow: false, uniforms: { ...this.uniforms, uHeight: this.carpetHeight, uStart: { value: new THREE.Vector2(fieldPicturesM - carpetBandM, carpetBandM) } } })
    this.carpet = plain(sheetGeometry([fieldPicturesM - carpetBandM - 2, 220, 360, fieldEndM]), carpet)
    const depths = [UNDER_FROM_M - 2.5, fieldFarM, 100, fieldPicturesM + 12]
    this.under = UNDER_LEVELS.map((level, i) => {
      const surface = makePartSurface({ detail: 'far', variant: 0, places: this.places }, { name: `field under layer ${i}`, vertex: underVertex, fragment: underFragment, side: THREE.DoubleSide, castShadow: false, uniforms: { uCover: this.uniforms.uCover, uHeight: this.underHeights[i], uLevel: { value: level }, uStart: { value: new THREE.Vector2(UNDER_FROM_M, UNDER_BAND_M) } } })
      return plain(sheetGeometry(depths), surface)
    })

    // Drawn before everything else in the frame, and it draws nothing: its place in the order is where the pictures are made.
    const nothing = new THREE.BufferGeometry()
    nothing.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3))
    this.hook = plain(nothing, makeSurface({ name: 'field pictures hook', vertex: hookVertex, fragment: hookFragment, castShadow: false }))
    this.hook.renderOrder = -1000
    this.hook.onBeforeRender = (renderer) => this.draw(renderer as THREE.WebGLRenderer)
    this.meshes = [this.hook, this.pictures, ...this.under, this.carpet]
  }

  get count(): number {
    return this.places.count
  }

  async load(assets: Assets): Promise<void> {
    for (const plant of this.plants) await plant.load(assets)
  }

  prepare(timeOpen: number, timeClose: number, open: PlantInputs, close: PlantInputs, eyeHeightM: number, canopy: number): void {
    this.plants.forEach((plant, i) => {
      const lag = lagOf(i, this.plants.length)
      plant.prepare(Math.max(0, timeOpen + lag), Math.max(0, timeClose + lag), open, close)
    })
    const head = bodyRadius(timeOpen) + rayLength(0, timeOpen) + 0.14
    this.uniforms.uTile.value.set(2 * (0.03 + Math.max(maxLeaf(timeOpen) * 1.3, head)), Math.max(0.01, heightAt(timeOpen) * 1.04 + 0.005))
    this.uniforms.uWind.value = open.wind
    this.uniforms.uCover.value = THREE.MathUtils.smoothstep(canopy, 0.06, 0.55)
    this.carpetHeight.value = canopy * 0.97
    UNDER_LEVELS.forEach((level, i) => (this.underHeights[i].value = canopy * level))
    const above = eyeHeightM > canopy + 0.03 && canopy > 0.06
    // From above only the tops of the far plants show, over the dark layer.
    this.uniforms.uCrop.value = above ? 0.52 : 1
    this.above = above
    this.stale = true
  }

  // Lays the simpler plants side by side before a camera that looks the way the film's does.
  look(pose: CameraPose): void {
    const flat = Math.hypot(pose.forward.x, pose.forward.z) || 1
    const fx = pose.forward.x / flat
    const fz = pose.forward.z / flat
    const rx = -fz
    const rz = fx
    this.uniforms.uRight.value.set(rx, 0, rz)
    const tile = this.uniforms.uTile.value
    this.spots.forEach((spot, i) => {
      const a = spot.array as Float32Array
      for (let j = 0; j < pictureTurns; j++) {
        const across = (i * pictureTurns + j - (pictureCount - 1) / 2) * tile.x
        a.set([rx * across, rz * across, pictureTurn(j), 1, 0, 0, 0.5, 1 + i * pictureTurns + j], j * PLACE)
      }
      spot.needsUpdate = true
    })
    const cam = this.camera
    const half = (pictureCount * tile.x) / 2
    cam.left = -half
    cam.right = half
    cam.bottom = 0
    cam.top = tile.y
    cam.updateProjectionMatrix()
    const back = 80
    cam.matrix.makeBasis(new THREE.Vector3(rx, 0, rz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-fx, 0, -fz)).setPosition(-fx * back, 0, -fz * back)
    cam.matrixWorld.copy(cam.matrix)
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert()
    this.eye.set(-fx * back, pose.position.y, -fz * back)
  }

  show(on: boolean): void {
    this.hook.visible = on
    this.pictures.visible = on
    this.carpet.visible = on && this.above
    for (const m of this.under) m.visible = on && this.above
  }

  // The pictures: each simpler kind as the frame's camera sees it, under the frame's sun and sky, without the air between.
  private draw(renderer: THREE.WebGLRenderer): void {
    if (!this.stale) return
    this.stale = false
    const target = renderer.getRenderTarget()
    const alpha = renderer.getClearAlpha()
    renderer.getClearColor(this.clear)
    const keep = { x: shared.uCamPos.value.x, y: shared.uCamPos.value.y, z: shared.uCamPos.value.z, fog: shared.uFogDensity.value, coc: shared.uCocScale.value, shadow: shared.uShadowOn.value }
    shared.uCamPos.value.copy(this.eye)
    shared.uFogDensity.value = 0
    shared.uCocScale.value = 0
    shared.uShadowOn.value = 0
    renderer.setRenderTarget(this.atlas)
    renderer.setClearColor(0x000000, 1)
    renderer.clear(true, true, false)
    renderer.render(this.scene, this.camera)
    shared.uCamPos.value.set(keep.x, keep.y, keep.z)
    shared.uFogDensity.value = keep.fog
    shared.uCocScale.value = keep.coc
    shared.uShadowOn.value = keep.shadow
    renderer.setRenderTarget(target)
    renderer.setClearColor(this.clear, alpha)
  }
}
