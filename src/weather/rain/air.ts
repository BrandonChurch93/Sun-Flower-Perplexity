import * as THREE from 'three'
import { makeSurface } from '../../core/shading.ts'
import { gustGlsl } from '../../v2/wind.ts'
import { LEAN_X, LEAN_Z, SLANT_CALM, SLANT_GUST, SLANT_WIND, fallDir, landingsNear, type Drop } from './drops.ts'

// The rain in the air. Every drop is worked out on the graphics card from its own number and the film second: where it is at the open shutter and at the close,
// and the strip between the two is the streak the exposure leaves. A layer is a box of drops that wraps round the lens, fixed to the world.

export const airGlsl = /* glsl */ `
uniform vec2 uSpan;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec4 uRange;
uniform vec2 uRadii;
uniform float uRain;
uniform float uWind;
uniform float uSeed;
uniform float uPixelAngle;
uniform float uSamples;
uniform float uGain;
uniform float uLeast;

float rnd(uint a, uint b) {
  return float(hashU(a * 0x9E3779B9U + b * 0x85EBCA6BU + 0x27D4EB2FU)) * (1.0 / 4294967296.0);
}

${gustGlsl}
// How far the wind leans the rain, as the tangent of its slant: the gust that bends the field leans the rain as it passes.
float slantAt(vec2 p, float t) {
  return ${SLANT_CALM.toFixed(4)} + min(1.0, 1.8 * uWind) * (${SLANT_WIND.toFixed(4)} + ${SLANT_GUST.toFixed(4)} * gustAt(p, t));
}

struct Drop {
  vec3 open;
  vec3 close;
  float radius;
  float seed;
  float size;
  float there;
};

Drop dropOf(int index) {
  Drop d;
  uint id = uint(index) + uint(uSeed) * 7919U;
  d.size = rnd(id, 1U);
  d.radius = mix(uRadii.x, uRadii.y, d.size * d.size * d.size);
  d.seed = rnd(id, 2U);
  float speed = 9.65 - 10.3 * exp(-1200.0 * d.radius);
  vec3 b = vec3(rnd(id, 3U), rnd(id, 4U), rnd(id, 5U)) * uBox;
  float lattice = b.y - speed * uSpan.x;
  float turn = floor(lattice / uBox.y);
  float y = lattice - turn * uBox.y;
  uint fall = uint(int(turn) + 8388608);
  float started = (b.y - (turn + 1.0) * uBox.y) / speed;
  vec2 top = vec2(rnd(id, fall * 2U + 11U), rnd(id, fall * 2U + 12U)) * uBox.xz;
  // The first drops of a shower and the last are the heavy ones, far apart.
  float rank = mix(rnd(id, fall * 2U + 13U), 1.0 - d.size, 0.55);
  // The front of a gust carries a sheet of thicker rain with it.
  float sheet = mix(1.0, 0.55 + 0.9 * gustAt(top, started), min(1.0, 1.8 * uWind) * smoothstep(0.5, 1.0, uRain));
  d.there = smoothstep(0.0, 0.04, uRain * sqrt(uRain) * 1.04 * sheet - rank);
  float carry = mix(1.1, 0.95, d.size) * (1.0 + 0.12 * (rnd(id, 6U) - 0.5));
  float slant = slantAt(top, started) * carry;
  vec2 lean = vec2(${LEAN_X.toFixed(5)}, ${LEAN_Z.toFixed(5)});
  vec2 side = vec2(-lean.y, lean.x) * (0.07 * (rnd(id, 7U) - 0.5));
  vec2 level = (lean * slant + side) * speed;
  float since = (uBox.y - y) / speed;
  vec3 at = vec3(top.x + level.x * since, uCenter.y - 0.5 * uBox.y + y, top.y + level.y * since);
  at.xz += uBox.xz * floor((uCenter.xz - at.xz) / uBox.xz + 0.5);
  vec3 step = vec3(level.x, -speed, level.y) * (uSpan.y - uSpan.x);
  d.open = at;
  d.close = at + step;
  return d;
}
`

// The heavy drops are the ones that land: each is read from the list of landings near the plant, so the streak ends where its splash stands up.
export const heavyGlsl = /* glsl */ `
in vec4 drop;
uniform vec2 uSpan;
uniform vec4 uRange;
uniform float uSamples;
uniform float uPixelAngle;
uniform float uGain;
uniform float uLeast;

struct Drop {
  vec3 open;
  vec3 close;
  float radius;
  float seed;
  float size;
  float there;
};

Drop dropOf(int index) {
  Drop d;
  d.radius = drop.w;
  d.size = saturate((drop.w - 0.0005) / 0.0017);
  d.seed = hash21(drop.xy * 53.3 + 0.37);
  float speed = 9.65 - 10.3 * exp(-1200.0 * d.radius);
  vec3 way = vec3(${fallDir[0].toFixed(6)}, ${fallDir[1].toFixed(6)}, ${fallDir[2].toFixed(6)}) * speed;
  vec3 land = vec3(drop.x, 0.0, drop.y);
  d.open = land + way * min(uSpan.x - drop.z, 0.0);
  d.close = land + way * min(uSpan.y - drop.z, 0.0);
  d.there = uSpan.x < drop.z ? 1.0 : 0.0;
  return d;
}
`

const vertexOf = (drops: string): string => /* glsl */ `
in vec2 position;
${drops}
out vec2 vEnds;
out float vAcross;
out float vWhen;
out float vCover;
out float vSeed;
out float vSeen;
out vec3 vWorld;
out float vDepth;
void main() {
  Drop drop = dropOf(gl_InstanceID);
  vec3 a = (viewMatrix * vec4(drop.open, 1.0)).xyz;
  vec3 b = (viewMatrix * vec4(drop.close, 1.0)).xyz;
  float r = drop.radius;
  float depth = max(-0.5 * (a.z + b.z), 1e-3);
  float pixelM = depth * uPixelAngle;
  float coc = min(uCocScale * abs(1.0 / depth - 1.0 / uFocusM), 2048.0);
  // Out of focus, one lens sample carries its share of the blur circle: the strip is drawn that wide so the samples close into it.
  float halfPx = max(max(r / pixelM, uLeast), 0.6 * coc / sqrt(uSamples));
  float halfM = halfPx * pixelM;
  float lengthM = distance(drop.open, drop.close);
  // No two drops catch the sky alike: most are dim and a few flare.
  float catchLight = mix(0.14, 2.6, pow(fract(drop.seed * 13.7 + 0.31), 4.0));
  float range = smoothstep(uRange.x, uRange.y, depth) * (1.0 - smoothstep(uRange.z, uRange.w, depth));
  float cover = min(mix(0.6, 0.32, smoothstep(3.0, 8.0, depth)), uGain * catchLight * 3.14159 * r * r / (2.0 * halfM * (lengthM + 2.0 * halfM))) * range * drop.there * mix(0.6, 1.0, smoothstep(0.8, 2.0, depth));
  // With several samples each draws the drop where it is at its own instant, over as much of the path as keeps the frame's sum equal to the one streak: twice its own share, so neighbours overlap and the line does not break into dashes.
  float share = uSamples > 1.5 ? clamp(max(2.0 / uSamples, cover), 0.0, 1.0) : 1.0;
  float middle = uSamples > 1.5 ? uShutter : 0.5;
  float from = middle - 0.5 * share;
  vec3 a2 = mix(a, b, from);
  vec3 b2 = mix(a, b, from + share);
  vec2 run = b2.xy / max(-b2.z, 1e-3) - a2.xy / max(-a2.z, 1e-3);
  float runLength = length(run);
  vec2 along = runLength > 1e-7 ? run / runLength : vec2(0.0, -1.0);
  vec2 across = vec2(-along.y, along.x);
  vec3 mid = mix(a2, b2, position.y);
  mid.xy += across * (position.x * halfM) + along * ((2.0 * position.y - 1.0) * halfM);
  float segM = lengthM * share;
  vAcross = position.x;
  vEnds = vec2(position.y, 1.0 - position.y) * ((segM + 2.0 * halfM) / halfM);
  vWhen = from + share * position.y;
  vCover = cover / share;
  vSeed = drop.seed;
  float least = max(uLeast, 0.6 * coc / sqrt(uSamples)) / halfPx;
  vSeen = min(1.0, least * least);
  vWorld = (inverse(viewMatrix) * vec4(mid, 1.0)).xyz;
  vDepth = depth;
  gl_Position = projectionMatrix * vec4(mid, 1.0);
  if (cover < 0.002 || -a.z < 0.03 || -b.z < 0.03) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`

const vertex = vertexOf(airGlsl)
const heavyVertex = vertexOf(heavyGlsl)

const shape = /* glsl */ `
in vec2 vEnds;
in float vAcross;
in float vWhen;
in float vCover;
in float vSeed;
in float vSeen;
in vec3 vWorld;
in float vDepth;
// The drop swings as it falls, so the line it leaves swells and thins along its length.
float streak(float low) {
  float cap = max(0.0, 1.0 - min(vEnds.x, vEnds.y));
  float u = min(1.0, vAcross * vAcross + cap * cap);
  float swing = 0.72 + 0.28 * sin(vWhen * (9.0 + 22.0 * vSeed) + 40.0 * vSeed);
  float core = exp(-3.0 * u / max(vSeen, 0.08));
  float body = (1.0 - u) * (1.0 - u);
  // A falling drop shows the sky only while it is flat to the lens: the middle of its path is lit and both ends fade, each drop over its own share. A low sun behind it lights far more of the path.
  float lit = exp(-pow((vWhen - 0.5) / ((0.16 + 0.2 * fract(vSeed * 3.7)) * (1.0 + 2.5 * low)), 2.0));
  return saturate(vCover * lit * mix(1.6 * core * swing + 0.25 * body, 1.5 * body * body, vSeen));
}
`

const fragment = /* glsl */ `
${shape}
uniform vec3 uFlash;
uniform vec3 uFlashAt;
uniform float uStrike;
uniform float uSpark;
void main() {
  if (uDiag > 1) discard;
  float cover = streak(uSpark);
  if (cover < 0.003) discard;
  vec3 ray = normalize(vWorld - uCamPos);
  // A drop is a lens: it shows the brightest of the sky all round it, so it glints against the dark deck and is lost against the bright gap.
  vec3 light = (1.25 * uSkyHorizonSun + 0.6 * uAirHorizon + 0.15 * uAirZenith) * (1.0 - 0.6 * uSpark);
  float toSun = saturate(dot(ray, uSunDir));
  float t2 = toSun * toSun;
  float t8 = t2 * t2 * t2 * t2;
  float t32 = t8 * t8 * t8 * t8;
  float glint = pow(fract(vSeed * 71.3 + 0.17), 3.0);
  // Backlit, a drop throws the sun forward through itself: the low sun's colour, deepened by the water's own path.
  float sunPeak = max(max(uAirSun.r, uAirSun.g), max(uAirSun.b, 1e-4));
  vec3 gold = uAirSun * uAirSun / sunPeak;
  // The drop throws the sun at the lens over the middle of its path, brightest where it swings square to it: a lit line, not a spark.
  float flare = exp(-pow((vWhen - 0.25 - 0.5 * fract(vSeed * 9.1)) / 0.45, 2.0));
  light += uAirSun * (0.03 + (0.9 * t8 + 5.0 * t32) * (1.0 - 0.75 * uSpark)) + gold * uSpark * flare * (0.25 + 1.6 * glint) * (1.0 + 4.0 * t8);
  // A strike is several strokes over a few hundredths of a second: it catches each drop as a brighter dash inside its streak, most toward the strike, and never more than two and a half times the storm's own light.
  float toFlash = 0.3 + 0.7 * saturate(dot(ray, uFlashAt));
  float dash = exp(-pow((vWhen - 0.42 - 0.16 * fract(vSeed * 5.3)) / 0.14, 2.0));
  vec3 struck = uFlash / max(max(uFlash.r, uFlash.g), max(uFlash.b, 1e-5));
  light *= mix(vec3(1.0), struck * (1.0 + 1.5 * toFlash * (0.35 + 0.65 * dash)), uStrike);
  // Close to the lens a drop is a blur that holds back part of the bright sky behind it.
  light *= mix(0.5, 1.0, smoothstep(0.8, 2.0, vDepth));
  outColor = vec4(applyFog(light, vWorld), cover);
}
`

const sharp = /* glsl */ `
${shape}
void main() {
  if (uDiag > 1) discard;
  if (streak(0.0) < 0.05) discard;
  outColor = vec4(0.0, 0.0, 0.0, cocOf(vDepth));
}
`

export interface LayerSpec {
  name: string
  seed: number
  // The box of drops, in metres, and how far ahead of the lens its middle lies.
  box: [number, number, number]
  ahead: number
  // Where the box stands: on the ground, or round the lens.
  onGround: boolean
  // View depths between which its drops are drawn, fading in over the first pair and out over the second.
  range: [number, number, number, number]
  radii: [number, number]
  gain: number
  // Drops at each quality: film, high, low.
  count: [number, number, number]
}

export class AirLayer {
  readonly meshes: THREE.Mesh[]
  readonly uniforms: Record<string, THREE.IUniform>
  private readonly geometry = new THREE.InstancedBufferGeometry()

  constructor(readonly spec: LayerSpec, lit: Record<string, THREE.IUniform>) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), 2))
    this.geometry.setIndex([0, 1, 2, 2, 1, 3])
    // The renderer asks every mesh for a sphere to sort it by and cannot make one from a position of two numbers.
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1)
    this.geometry.instanceCount = spec.count[0]
    this.uniforms = {
      ...lit,
      uCenter: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(...spec.box) },
      uRange: { value: new THREE.Vector4(...spec.range) },
      uRadii: { value: new THREE.Vector2(...spec.radii) },
      uSeed: { value: spec.seed },
      uGain: { value: spec.gain },
    }
    const main = makeSurface({ name: `rain ${spec.name}`, vertex, fragment, uniforms: this.uniforms, side: THREE.DoubleSide, transparent: true, depthWrite: false, castShadow: false })
    const keep = makeSurface({ name: `rain ${spec.name} sharp`, vertex, fragment: sharp, uniforms: this.uniforms, side: THREE.DoubleSide, transparent: true, depthWrite: false, cocOnly: true, castShadow: false })
    const streaks = new THREE.Mesh(this.geometry, main.main)
    const focus = new THREE.Mesh(this.geometry, keep.main)
    streaks.renderOrder = 44
    focus.renderOrder = 45
    this.meshes = [streaks, focus]
    for (const m of this.meshes) {
      m.frustumCulled = false
      m.matrixAutoUpdate = false
      m.visible = false
    }
  }

  place(eye: THREE.Vector3, forward: THREE.Vector3, quality: number, samples: number, on: boolean): void {
    const s = this.spec
    const flat = Math.hypot(forward.x, forward.z) || 1
    this.uniforms.uCenter.value.set(eye.x + (forward.x / flat) * s.ahead, s.onGround ? 0.5 * s.box[1] - 0.05 : eye.y, eye.z + (forward.z / flat) * s.ahead)
    this.geometry.instanceCount = s.count[quality]
    this.meshes[0].visible = on
    this.meshes[1].visible = on && samples === 1
  }
}

const HEAVY_MAX = 4096
// How long before its landing a heavy drop is drawn: the time it takes to fall through the frame.
const HEAVY_AHEAD_S = 0.55

// The heavy drops near the plant, each on its way to the place and the instant it lands.
export class HeavyLayer {
  readonly meshes: THREE.Mesh[]
  private readonly geometry = new THREE.InstancedBufferGeometry()
  private readonly data = new Float32Array(HEAVY_MAX * 4)
  private readonly drop: THREE.InstancedBufferAttribute
  private readonly found: Drop[] = []

  constructor(lit: Record<string, THREE.IUniform>, gain: number) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), 2))
    this.geometry.setIndex([0, 1, 2, 2, 1, 3])
    // The renderer asks every mesh for a sphere to sort it by and cannot make one from a position of two numbers.
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1)
    this.drop = new THREE.InstancedBufferAttribute(this.data, 4)
    this.drop.setUsage(THREE.DynamicDrawUsage)
    this.geometry.setAttribute('drop', this.drop)
    this.geometry.instanceCount = 0
    const uniforms = { ...lit, uRange: { value: new THREE.Vector4(0.25, 0.45, 7, 8) }, uGain: { value: gain } }
    const main = makeSurface({ name: 'rain heavy', vertex: heavyVertex, fragment, uniforms, side: THREE.DoubleSide, transparent: true, depthWrite: false, castShadow: false })
    const keep = makeSurface({ name: 'rain heavy sharp', vertex: heavyVertex, fragment: sharp, uniforms, side: THREE.DoubleSide, transparent: true, depthWrite: false, cocOnly: true, castShadow: false })
    const streaks = new THREE.Mesh(this.geometry, main.main)
    const focus = new THREE.Mesh(this.geometry, keep.main)
    streaks.renderOrder = 44
    focus.renderOrder = 45
    this.meshes = [streaks, focus]
    for (const m of this.meshes) {
      m.frustumCulled = false
      m.matrixAutoUpdate = false
      m.visible = false
    }
  }

  // The drops that land within `half` metres of (x, z) from the open shutter on.
  place(x: number, z: number, half: number, open: number, samples: number, on: boolean): void {
    this.meshes[0].visible = on
    this.meshes[1].visible = on && samples === 1
    if (!on) return
    this.found.length = 0
    landingsNear(x, z, half, open, open + HEAVY_AHEAD_S, this.found)
    const n = Math.min(this.found.length, HEAVY_MAX)
    for (let i = 0; i < n; i++) {
      const d = this.found[i]
      this.data[i * 4] = d.x
      this.data[i * 4 + 1] = d.z
      this.data[i * 4 + 2] = d.time
      this.data[i * 4 + 3] = d.radius
    }
    this.geometry.instanceCount = n
    if (n === 0) return
    this.drop.clearUpdateRanges()
    this.drop.addUpdateRange(0, n * 4)
    this.drop.needsUpdate = true
  }
}
