import * as THREE from 'three'
import { config, segmentStart } from '../config.ts'
import type { Assets } from '../core/assets.ts'
import type { CameraPose } from '../core/lens.ts'
import { makeSurface, shared, type Surface } from '../core/shading.ts'
import { bodyRadius, headOpen, heightAt, leafCount, leafLength, rayLength, type PlantInputs } from '../plant/growth.ts'
import { Plant } from '../plant/index.ts'
import { fieldUniforms } from '../plant/part.ts'
import { STEM_LEAN, STEM_SWING, swayGlsl, windToward } from '../plant/wind.ts'
import { leavesApart, placeTurned } from './turn.ts'
import { PLACE, beyondAt, beyondPlaces, budTurn, fieldBeyondM, carpetBandM, farVariants, fieldFarM, fieldHalfWidth, fieldPicturesM, kindTime, lagAt, nightAt, NIGHT_LOW, pictureCount, pictureTurn, pictureTurns, plantAhead, right, sizeGlsl, toward } from './layout.ts'

const TILE_W = 64
const PICTURE_SIZE = 0.72
const TILE_H = 128
const SHUTTER_SECONDS = config.film.shutterDegrees / 360 / config.film.fps
// Where the dark layer under the far plants begins, and over how many meters it comes in.
const UNDER_FROM_M = 3
const UNDER_BAND_M = 6
// The dark layers, as shares of the height of the tops.
const UNDER_LEVELS = [0.5, 0.68, 0.84]
// From where the pictures differ in size and tilt, where the head sits in a picture, and how much green and blue a far ray keeps.
const HEADS_FROM_M = 16
const HEAD_AT = 0.9
const RAY_DEEP = [0.82, 0.25]
const LEAF_SKY = 1.2
const HEAD_GROWS = 0.35

const pictureVertex = /* glsl */ `
in vec2 aCorner;
in vec4 aPlace;
in vec4 aVary;
out vec2 vUv;
out vec3 vWorld;
out float vDepth;
out float vTone;
uniform vec3 uRight;
uniform vec2 uTile;
uniform vec2 uCrop;
uniform float uOpen;
uniform float uCount;
uniform float uPlantWind;
uniform float uPlantHeight;
uniform float uAhead;
uniform float uLow;
uniform float uSquat;
${swayGlsl}
${sizeGlsl}
void main() {
  float across = aCorner.x;
  float size = sizeAt(aPlace.w, aVary.z, uAhead);
  if (uLow > 0.0) size *= 1.0 - uLow;
  // Far off, over a grown field, only the head and the leaves beside it clear the rows in front.
  float v = mix(1.0 - mix(uCrop.x, uCrop.y, smoothstep(35.0, 66.0, length(aPlace.xy - uCamPos.xz))), 1.0, aCorner.y);
  // Far off no two heads are the same: each picture is drawn larger or smaller about its head, tipped to one side, and half of them the other way round.
  float away = smoothstep(${HEADS_FROM_M.toFixed(1)}, ${(HEADS_FROM_M + 30).toFixed(1)}, length(aPlace.xy - uCamPos.xz));
  float draw = fract(aVary.w * 0.6180339);
  // An open head is nearly as large as the plant's own: the picture of a short neighbor is drawn larger about its head.
  float scale = mix(1.0, 0.55 + 0.7 * fract(aPlace.z), away) * (1.0 + ${HEAD_GROWS.toFixed(2)} * uOpen);
  float tip = (fract(draw * 7.0) - 0.5) * 0.9 * away;
  float flip = fract(draw * 13.0) < 0.5 ? -1.0 : 1.0;
  float top = ${HEAD_AT.toFixed(2)} * uTile.y * size * (1.0 - uSquat);
  vec2 off = vec2(across * uTile.x * size, v * uTile.y * size * (1.0 - uSquat) - top) * scale;
  off = vec2(cos(tip) * off.x - sin(tip) * off.y, sin(tip) * off.x + cos(tip) * off.y);
  float h = top + off.y;
  vec3 world = vec3(aPlace.x, h, aPlace.y) + uRight * off.x;
  world.xz += aVary.xy * h;
  // The bend plantWorld gives a real neighbor, so the wave crosses the pictures as it crosses the rows.
  float tall = max(uPlantHeight * size * (1.0 - uSquat), 0.001);
  float k = clamp((h / tall - 0.3) / 0.7, 0.0, 1.0);
  float blow = uPlantWind * (${STEM_LEAN.toFixed(4)} + ${STEM_SWING.toFixed(4)} * plantSway(uTime + uShutter * ${SHUTTER_SECONDS.toFixed(6)}, aPlace.xy));
  world.xz += vec2(${windToward.x.toFixed(4)}, ${windToward.z.toFixed(4)}) * (blow * tall * 0.7 * (k * k * k - 0.5 * k * k * k * k));
  vec4 view = viewMatrix * vec4(world, 1.0);
  float inset = 0.5 / ${TILE_W.toFixed(1)};
  vUv = vec2((floor(aPlace.z) + clamp(across * flip + 0.5, inset, 1.0 - inset)) / uCount, v);
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
  // At this distance a head is the color of light through its rays: deeper than the lemon of a ray seen near.
  float ray = smoothstep(1.0, 1.25, color.r / max(color.g, 1e-4));
  color.gb *= mix(vec2(1.0), vec2(${RAY_DEEP[0].toFixed(2)}, ${RAY_DEEP[1].toFixed(2)}), ray);
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

const sheetFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
in vec3 vTop;
in vec3 vMid;
uniform vec2 uToward;
uniform vec2 uStart;
uniform float uCover;
uniform float uAbove;
uniform float uLevel;
uniform float uThrough;
uniform float uHeight;
uniform float uPlantWind;
uniform float uPlantHeight;
${swayGlsl}
void main() {
  float reach = smoothstep(uStart.x, uStart.x + uStart.y, length(vWorld.xz));
  // The wind carries a sheet as far as it carries a neighbor at the sheet's height, so the wave that crosses the rows crosses the sheets too.
  float tall = max(uPlantHeight * ${PICTURE_SIZE.toFixed(3)}, 0.001);
  float k = clamp((uHeight / tall - 0.3) / 0.7, 0.0, 1.0);
  float blow = uPlantWind * (${STEM_LEAN.toFixed(4)} + ${STEM_SWING.toFixed(4)} * plantSway(uTime + uShutter * ${SHUTTER_SECONDS.toFixed(6)}, vWorld.xz));
  vec2 at = vWorld.xz - vec2(${windToward.x.toFixed(4)}, ${windToward.z.toFixed(4)}) * (blow * tall * 0.7 * (k * k * k - 0.5 * k * k * k * k));
  vec3 color;
  if (uLevel > 0.0) {
    // A layer of leaves under the tops: clumps with holes between them, fewer toward the front of the field, darker toward the edge of a clump.
    vec2 p = at + uLevel * 37.0;
    float clump = 0.25 * valueNoise(p * 3.1) + 0.35 * valueNoise(p * 7.7) + 0.4 * valueNoise(p * 17.0);
    float share = uCover * (0.95 - 0.22 * uLevel) * (0.25 + 0.75 * reach) * (1.0 - smoothstep(0.5, 1.0, uAbove));
    if (clump > share) discard;
    float inside = (share - clump) / max(share, 0.01);
    float lift = inside * uLevel / ${UNDER_LEVELS[UNDER_LEVELS.length - 1].toFixed(2)};
    // From high over the tops the layers are the dark between the plants and nothing else, and then they are gone under the real leaves.
    float low = 1.0 - smoothstep(0.0, 0.5, uAbove);
    color = vMid * mix(0.3, mix(0.45, 0.95, low), lift);
    // Seen from over the tops the upper leaves show the faces they turn to the sky.
    color += vec3(0.045, 0.09, 0.022) * skyAmbient(vec3(0.0, 1.0, 0.0)) * (${LEAF_SKY.toFixed(2)} * lift * lift * low);
    // The low sun comes through the upper leaves of a clump, green, and here and there a leaf catches it whole. Looking into the sun the eye meets the shaded side of every clump.
    float lit = smoothstep(0.6, 0.78, valueNoise(p * 9.0 + 5.0));
    float lee = mix(0.35, 1.0, smoothstep(1.0, 0.6, dot(normalize(vWorld.xz - uCamPos.xz), normalize(uSunDir.xz))));
    color += vec3(0.3, 0.5, 0.04) * uSunColor * ((0.02 + 0.88 * lit) * lee * inside * uLevel * low * uThrough * smoothstep(0.0, 0.1, uSunDir.y));
  } else {
    // The carpet: a share of the plants, each one whole, so it comes in plant by plant.
    float along = -dot(at, uToward);
    float across = at.x * uToward.y - at.y * uToward.x;
    vec2 cell = floor(vec2(across / ${config.field.plantSpacingM.toFixed(3)}, along / ${config.field.rowSpacingM.toFixed(3)}));
    if (uCover * reach < hash21(cell)) discard;
    float grain = valueNoise(vec2(across, along) * 1.7);
    float patchy = valueNoise(at * 0.028);
    color = mix(vMid * 0.7, vTop, 0.3 + 0.55 * grain) * (0.78 + 0.44 * patchy);
  }
  if (uDiag == 7) {
    outColor = vec4(color, cocOf(vDepth));
    return;
  }
  outColor = finish(color, vWorld, vDepth, -1.0);
}
`

// The ground past the last rows rises to the foot of the tree row, and the tops on it come up over the rows in front as the lens does.
const BEYOND_LIFT_M = 1.8
const BEYOND_BUMPS_M = 0.3
const BEYOND_HEADS_M = 0.4
const BEYOND_SHADE = 0.5
const beyondLift = (at: string, liftM = BEYOND_LIFT_M): string => `smoothstep(${fieldBeyondM[0].toFixed(1)}, ${(fieldBeyondM[0] + 6).toFixed(1)}, length(${at})) * (${liftM.toFixed(2)} + ${BEYOND_BUMPS_M.toFixed(2)} * (0.5 + 0.3 * sin(atan(${at}.x, ${at}.y) * 23.0 + 1.3) + 0.2 * sin(atan(${at}.x, ${at}.y) * 57.0 + 4.1)))`

function ringGeometry(): THREE.BufferGeometry {
  const position: number[] = []
  const index: number[] = []
  const sides = 160
  const rings = 10
  for (let r = 0; r < rings; r++) {
    const reach = fieldBeyondM[0] + ((fieldBeyondM[1] + 0.4 - fieldBeyondM[0]) * r) / (rings - 1)
    for (let a = 0; a <= sides; a++) {
      const turn = (a / sides - 0.5) * 2.4
      const along = Math.cos(turn) * reach
      const across = Math.sin(turn) * reach
      position.push(-toward.x * along + right.x * across, 0, -toward.z * along + right.z * across)
      if (r > 0 && a > 0) {
        const q = r * (sides + 1) + a
        const p = q - (sides + 1)
        index.push(p - 1, p, q - 1, p, q, q - 1)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(position), 3))
  geometry.setIndex(index)
  return geometry
}

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

// Every picture is in one piece of geometry: a software rasterizer pays for each copy of a drawn shape, not for each triangle.
function quads(places: Float32Array): THREE.BufferGeometry {
  const count = places.length / PLACE
  const CORNER = 10
  const data = new Float32Array(count * 4 * CORNER)
  const index = new Uint32Array(count * 6)
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 4; c++) {
      const at = (i * 4 + c) * CORNER
      data.set(places.subarray(i * PLACE, i * PLACE + PLACE), at)
      data[at + 8] = (c % 2) - 0.5
      data[at + 9] = c >> 1
    }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6)
  }
  const corners = new THREE.InterleavedBuffer(data, CORNER)
  const quad = new THREE.BufferGeometry()
  quad.setAttribute('aPlace', new THREE.InterleavedBufferAttribute(corners, 4, 0))
  quad.setAttribute('aVary', new THREE.InterleavedBufferAttribute(corners, 4, 4))
  quad.setAttribute('aCorner', new THREE.InterleavedBufferAttribute(corners, 2, 8))
  quad.setIndex(new THREE.BufferAttribute(index, 1))
  return quad
}

// The far field. Pictures of the simpler plants, drawn once a frame from the plants themselves as the camera sees them, stand in rows
// past the last real plant. Past the pictures one carpet carries their color on. Under both lies the dark of the leaves.
export class FarField {
  readonly count: number
  readonly pictures: THREE.Mesh
  readonly beyond: THREE.Mesh
  readonly carpet: THREE.Mesh
  readonly end: THREE.Mesh
  readonly under: THREE.Mesh[]
  readonly meshes: THREE.Mesh[]
  private readonly plants: Plant[] = []
  private readonly spots: THREE.InstancedInterleavedBuffer[] = []
  private readonly stills: THREE.InstancedInterleavedBuffer[] = []
  private readonly atlas: THREE.WebGLRenderTarget
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, 0, 0.1, 200)
  private readonly uniforms = {
    uAtlas: { value: null as THREE.Texture | null },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uTile: { value: new THREE.Vector2(1, 1) },
    uCrop: { value: new THREE.Vector2(1, 1) },
    uCount: { value: pictureCount },
    uPlantWind: fieldUniforms.uPlantWind,
    uPlantHeight: fieldUniforms.uPlantHeight,
    uToward: { value: new THREE.Vector2(toward.x, toward.z) },
    uCover: { value: 0 },
    uOpen: { value: 0 },
    uAbove: { value: 0 },
    uAhead: { value: 1 },
    uLag: { value: 0 },
    uLow: { value: 0 },
    uThrough: { value: 1 },
    uSquat: fieldUniforms.uSquat,
  }
  private readonly carpetHeight = { value: 0 }
  private readonly underHeights = UNDER_LEVELS.map(() => ({ value: 0 }))
  private readonly eye = new THREE.Vector3()
  private readonly clear = new THREE.Color()
  private stale = false
  private time = 0
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
      this.stills.push(leavesApart(plant, pictureTurns))
      this.plants.push(plant)
      this.scene.add(...plant.meshes)
    })
    this.scene.matrixWorldAutoUpdate = false
    this.camera.matrixAutoUpdate = false

    const quad = quads(places)
    this.count = places.length / PLACE
    const picture = makeSurface({ name: 'field pictures', vertex: pictureVertex, fragment: pictureFragment, side: THREE.DoubleSide, castShadow: false, uniforms: this.uniforms })
    this.pictures = plain(quad, picture)
    const late = pictureVertex.replace('  vec4 view = viewMatrix * vec4(world, 1.0);', `  world.y += ${beyondLift('aPlace.xy', BEYOND_LIFT_M + BEYOND_HEADS_M)};\n  vec4 view = viewMatrix * vec4(world, 1.0);`)
    this.beyond = plain(quads(beyondPlaces()), makeSurface({ name: 'field pictures beyond', vertex: late, fragment: pictureFragment, side: THREE.DoubleSide, castShadow: false, uniforms: this.uniforms }))
    this.beyond.renderOrder = 10.5

    const sheet = (level: number, height: { value: number }, startM: number, bandM: number, depths: number[]): THREE.Mesh => {
      const uniforms = { ...this.uniforms, uHeight: height, uLevel: { value: level }, uStart: { value: new THREE.Vector2(startM, bandM) } }
      return plain(sheetGeometry(depths), makeSurface({ name: level > 0 ? 'field leaf layer' : 'field carpet', vertex: sheetVertex, fragment: sheetFragment, side: THREE.DoubleSide, castShadow: false, uniforms }))
    }
    this.carpet = sheet(0, this.carpetHeight, fieldPicturesM - carpetBandM, carpetBandM, [fieldPicturesM - carpetBandM - 2, fieldPicturesM])
    this.under = UNDER_LEVELS.map((level, i) => sheet(level, this.underHeights[i], UNDER_FROM_M, UNDER_BAND_M, [UNDER_FROM_M - 2.5, fieldFarM, fieldPicturesM]))

    const riseVertex = sheetVertex.replace('uHeight, position.z', `uHeight + ${beyondLift('position.xz')}, position.z`)
    const riseFragment = sheetFragment.replace('float reach = smoothstep(', 'float reach = 1.0 - smoothstep(').replace('  if (uDiag == 7) {', `  color *= mix(1.0, ${BEYOND_SHADE.toFixed(2)}, smoothstep(0.5, ${BEYOND_LIFT_M.toFixed(2)}, vWorld.y - uHeight));\n  if (uDiag == 7) {`)
    this.end = plain(ringGeometry(), makeSurface({ name: 'field carpet rise', vertex: riseVertex, fragment: riseFragment, side: THREE.DoubleSide, castShadow: false, uniforms: { ...this.uniforms, uCover: { value: 1 }, uHeight: this.carpetHeight, uLevel: { value: 0 }, uStart: { value: new THREE.Vector2(fieldBeyondM[1] + 2, 1) } } }))
    this.end.renderOrder = 14
    // The pictures are made just before the first surface that reads them is drawn.
    this.pictures.onBeforeRender = (renderer) => this.draw(renderer as THREE.WebGLRenderer)
    // Solid surfaces all: the order only lets the nearer ones hide the sheets before the sheets are shaded.
    this.pictures.renderOrder = 10
    this.under.forEach((m, i) => (m.renderOrder = 12 - i))
    this.carpet.renderOrder = 13
    this.meshes = [this.pictures, this.beyond, ...this.under, this.carpet, this.end]
  }

  async load(assets: Assets): Promise<void> {
    for (const plant of this.plants) await plant.load(assets)
  }

  prepare(timeOpen: number, timeClose: number, open: PlantInputs, close: PlantInputs, eyeHeightM: number, canopy: number): void {
    this.time = timeOpen
    this.plants.forEach((plant, i) => {
      plant.prepare(kindTime(timeOpen, i, 'pictures'), kindTime(timeClose, i, 'pictures'), open, close)
    })
    this.uniforms.uAhead.value = plantAhead(timeOpen)
    this.uniforms.uLag.value = lagAt(timeOpen)
    this.uniforms.uLow.value = nightAt(timeOpen) * NIGHT_LOW
    // Moonlight and the white sun of the frost do not glow green through a leaf; the low sun of the bloom does.
    this.uniforms.uThrough.value = THREE.MathUtils.smoothstep(timeOpen, segmentStart('frost'), segmentStart('bloom'))
    this.uniforms.uOpen.value = headOpen(kindTime(timeOpen, 1, 'pictures'))
    const head = bodyRadius(timeOpen) + rayLength(0, timeOpen) + 0.14
    this.uniforms.uTile.value.set(2 * (0.03 + Math.max(maxLeaf(timeOpen) * 1.3, head)), Math.max(0.01, heightAt(timeOpen) * 1.04 + 0.005))
    // How far the eye stands over the tops, in heights of the tops. As it rises the leaf layers and the carpet come in and
    // the pictures are cut to the part that clears the rows in front, all by degrees, so no frame differs from the one before by a jump.
    const over = canopy > 0.06 ? (eyeHeightM - canopy) / canopy : 0
    const rise = THREE.MathUtils.smoothstep(over, 0.02, 0.27)
    this.uniforms.uCover.value = THREE.MathUtils.smoothstep(canopy, 0.06, 0.55) * rise
    this.uniforms.uAbove.value = THREE.MathUtils.smoothstep(over, 0.4, 1.0)
    this.carpetHeight.value = canopy * 0.97
    UNDER_LEVELS.forEach((level, i) => (this.underHeights[i].value = canopy * level))
    const grown = THREE.MathUtils.smoothstep(canopy, 0.3, 0.9)
    this.uniforms.uCrop.value.set(THREE.MathUtils.lerp(1, 0.46, THREE.MathUtils.smoothstep(over, 0.02, 0.5)), THREE.MathUtils.lerp(1, 0.3, grown * THREE.MathUtils.smoothstep(over, 0.02, 0.15)))
    this.above = rise > 0
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
      const still = this.stills[i]
      for (let j = 0; j < pictureTurns; j++) {
        const across = (i * pictureTurns + j - (pictureCount - 1) / 2) * tile.x
        const id = 1 + i * pictureTurns + j
        placeTurned([rx * across, rz * across, pictureTurn(i, j), 1, 0, 0, 0.5, id], 0, a, still.array as Float32Array, j * PLACE, budTurn(kindTime(this.time, i, 'pictures'), id))
      }
      spot.needsUpdate = true
      still.needsUpdate = true
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
    this.pictures.visible = on
    this.carpet.visible = on && this.above
    this.end.visible = on && beyondAt(this.time)
    this.beyond.visible = this.end.visible
    for (const m of this.under) m.visible = on && this.above
  }

  // The pictures: each simpler kind as the frame's camera sees it, under the frame's sun and sky, without the air between.
  private draw(renderer: THREE.WebGLRenderer): void {
    if (!this.stale) return
    this.stale = false
    const target = renderer.getRenderTarget()
    const alpha = renderer.getClearAlpha()
    renderer.getClearColor(this.clear)
    const keep = { x: shared.uCamPos.value.x, y: shared.uCamPos.value.y, z: shared.uCamPos.value.z, fog: shared.uFogDensity.value, coc: shared.uCocScale.value, shadow: shared.uShadowOn.value, wind: fieldUniforms.uPlantWind.value, canopy: fieldUniforms.uCanopy.value, edge: fieldUniforms.uEdge.value.z }
    shared.uCamPos.value.copy(this.eye)
    shared.uFogDensity.value = 0
    shared.uCocScale.value = 0
    shared.uShadowOn.value = 0
    fieldUniforms.uPlantWind.value = 0
    // The pictures are drawn of plants at full size and stand at a neighbor's: they are lit as a neighbor of middle height is.
    fieldUniforms.uCanopy.value = keep.canopy / PICTURE_SIZE
    fieldUniforms.uEdge.value.z = -1000
    renderer.setRenderTarget(this.atlas)
    renderer.setClearColor(0x000000, 1)
    renderer.clear(true, true, false)
    renderer.render(this.scene, this.camera)
    shared.uCamPos.value.set(keep.x, keep.y, keep.z)
    shared.uFogDensity.value = keep.fog
    shared.uCocScale.value = keep.coc
    shared.uShadowOn.value = keep.shadow
    fieldUniforms.uPlantWind.value = keep.wind
    fieldUniforms.uCanopy.value = keep.canopy
    fieldUniforms.uEdge.value.z = keep.edge
    renderer.setRenderTarget(target)
    renderer.setClearColor(this.clear, alpha)
  }
}
