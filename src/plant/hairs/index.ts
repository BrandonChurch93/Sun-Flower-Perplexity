import * as THREE from 'three'
import { makePartSurface, partMesh, stateUniforms, type PartOptions } from '../part.ts'
import { shared, type Surface } from '../../core/shading.ts'

// `real` turns true once this folder holds the plant's hairs at their real quality.
export const real = true

// See-through things are drawn in the order of these numbers: the hairs of the plant after the far things of a world (under 20) and before its air (40 and over).
export const HAIR_ORDER = 20

// A hair wider than this many pixels is drawn as a ribbon turned to the camera. Thinner, it is a one pixel line that carries its true share of light.
const RIBBON_FROM_PX = 0.45
const ROW = 512
// A hair whose blur circle is wider than this many pixels shares its place: fewer are drawn and each stands for several.
const THIN_FROM_PX = 10
const THIN_LEAST = 0.12
const THIN_EASE = 0.15
const REGATHER_M = 0.03
// Hairs hide one another: where they would cover more than this share of a pixel, only that many of them show.
const CROWD_COVER = 0.35
// A hair far thinner than a pixel cannot be told from its neighbors, and a coat of them is a haze. Where hairs are thinner than this on the screen, one strand of this width stands for those around it, with their light.
const STRAND_PX = 0.06
const STRAND_FROM_PX = 2
const CROWD_CELL_PX = 8

// A hair is a clear fiber. Sunlight goes through it and leaves in a cone about the fiber, strongest straight on (the lobe called TT), with a weak mirror of the sun on its near side (R) and next to nothing scattered evenly.
const strand = /* glsl */ `
uniform sampler2D uHairs;
uniform float uPlantWet;
uniform float uPlantFrost;
uniform float uPlantDew;
out vec3 vWorld;
out vec3 vLitAt;
out float vDepth;
out vec3 vSun;
out vec3 vSky;
out float vSkyY;
out vec3 vBead;
uniform vec3 uHairColor;
uniform float uHairWidth;

// How bright a hair is at its brightest, seen straight against the sun, in white cards that face the sun. Set by eye against the approved bloom pictures, for a hair in focus: more than this and a fringe burns into a wire.
const float SUN_THROUGH = 1.8;
// A lit hair is paler than the sun, for it also sends on the sky round the sun. Only with the sun right behind it does it take a color deeper than the sun's.
const float SUN_PALE = 0.2;
// What comes through a hair is warm white going to pink, as the approved pictures have it, where the low sun alone would make it yellow.
const vec3 THROUGH_TINT = vec3(1.0, 0.8, 0.72);
const float SUN_DEEPEN = 0.6;
// A hair that stands toward the eye with the sun behind it is on the dark face of its body.
const float FACE_SHADE = 1.2;
const float SHADE_OUT_M = 0.005;
const float TT_SPREAD = 0.7;
const float TT_TURN = 2.0;
const float R_SPREAD = 0.16;
const float EVEN = 0.035;
const float SKY_BACK = 0.12;
const float SKY_THROUGH = 0.5;
const float STRAND_GAIN = SUN_THROUGH * 2.5066 * TT_SPREAD / 0.714;
const vec3 RIME = vec3(0.92, 0.96, 1.0);
const float RIME_SUN = 0.4;
const float RIME_SKY = 0.85;
// Rime on a hair that stands toward the eye is seen end on, against the body: a point, not a needle.
const float RIME_FACE = 0.2;

struct Strand {
  vec3 world;
  vec3 along;
  vec3 toEye;
  float depth;
  float width;
  float pixel;
  float share;
};

vec4 hairRoot;
vec3 hairDir;
vec3 hairStand;
vec4 hairFoot;
vec4 hairTip;
float hairLong;
vec3 hairBend;
float hairOwn;
float hairShare;
float hairWide;
float hairBead;
float hairSlim;

vec3 hairPoint(float t) {
  return hairRoot.xyz + (hairDir * t + hairBend * (t * t)) * hairRoot.w;
}

// Four texels a hair: its root and length, its root at the close of the shutter and its own number, its direction and how many hairs it stands for, its direction at the close.
void readHair(int k) {
  ivec2 at = ivec2((k & 511) * 4, k >> 9);
  vec4 a = texelFetch(uHairs, at, 0);
  vec4 b = texelFetch(uHairs, at + ivec2(1, 0), 0);
  vec4 c = texelFetch(uHairs, at + ivec2(2, 0), 0);
  vec4 d = texelFetch(uHairs, at + ivec2(3, 0), 0);
  hairRoot = vec4(mix(a.xyz, b.xyz, uShutter), a.w);
  hairDir = normalize(mix(c.xyz, d.xyz, uShutter));
  hairStand = hairDir;
  hairOwn = b.w;
  hairShare = c.w;
  float h1 = fract(hairOwn * 13.37 + 0.21);
  float h2 = fract(hairOwn * 47.13 + 0.67);
  float h4 = fract(hairOwn * 233.31 + 0.09);
  float h5 = fract(hairOwn * 71.93 + 0.5);
  float h6 = fract(hairOwn * 317.77 + 0.21);
  float h7 = fract(hairOwn * 173.19 + 0.83);
  vec3 ref = abs(hairDir.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 e1 = normalize(cross(hairDir, ref));
  vec3 e2 = cross(hairDir, e1);
  float turn = h1 * 6.2832;
  vec3 aside = e1 * cos(turn) + e2 * sin(turn);
  // No two hairs stand alike: each leans its own way off the line it was given, has its own length and its own slight curve. A long hair wanders and curves more than short down, which stands straight.
  float reach = smoothstep(0.001, 0.005, hairRoot.w);
  hairDir = normalize(hairDir + aside * ((0.35 + 0.5 * reach) * sqrt(h7)) + vec3(0.0, 0.2 * h6, 0.0));
  hairBend = (e1 * cos(turn + 2.1) + e2 * sin(turn + 2.1)) * ((0.08 + 0.3 * h2 * h2) * (0.4 + 1.2 * reach)) + vec3(0.0, -0.05, 0.0);
  hairWide = 1.0;
  // Most hairs are short and a few are long, and they do not stand evenly: there are stretches with few, and those few are short. Down is even.
  float coat = smoothstep(0.0008, 0.002, hairRoot.w);
  vec3 q = hairRoot.xyz * 260.0;
  float stand = 0.5 + 0.25 * (sin(q.x + 2.3 * q.y + 1.7 * sin(1.3 * q.z)) + sin(3.1 * q.y - 1.7 * q.z + 1.3 * sin(2.1 * q.x)));
  float few = mix(1.0, smoothstep(0.15, 0.6, stand), coat);
  hairRoot.w *= mix(0.5 + h6, 0.35 + 1.75 * h6 * h6, coat) * (0.35 + 0.65 * few);
  hairShare *= 0.3 + 0.7 * few;
  // A drop is the size a hair can hold, whatever the strand stands for, and down holds none.
  float one = min(uHairWidth, 0.00006) * smoothstep(0.001, 0.002, hairRoot.w);
  // A strand given a width past an eighth of its length stands for the down round it. It is drawn that slim and carries the rest as light, so close up it is still a hair and not a grain.
  hairSlim = min(1.0, hairRoot.w / (8.0 * uHairWidth * (0.5 + fract(hairOwn * 91.71 + 0.43))));
  hairBead = 0.0;
  // Rime grows on every hair: a thick white needle, a little longer than the hair.
  if (uPlantFrost > 0.0) {
    hairRoot.w *= 1.0 + uPlantFrost * (0.15 + 0.2 * h2);
    hairWide *= 1.0 + uPlantFrost * (3.5 + 3.5 * h4) * hairSlim;
    // Rime grows on a hair, not on the felt a strand of down stands for.
    hairShare *= mix(1.0, hairSlim * hairSlim, uPlantFrost);
  }
  // Wet hairs stick together in points. One hair in three stands for a point, thick at its foot, and the others fade into it. All of them lie flatter, and a few carry a drop.
  if (uPlantWet > 0.0) {
    float point = step(h4, 0.34);
    hairShare *= mix(1.0 - uPlantWet, 1.0, point);
    hairWide *= 1.0 + 2.0 * uPlantWet * point;
    hairDir = normalize(hairDir + (aside * 0.35 + vec3(0.0, -0.6, 0.0)) * uPlantWet);
    hairRoot.w *= 1.0 - 0.2 * uPlantWet;
    hairBead = one * 3.0 * uPlantWet * step(h5, 0.06);
  }
  // Dew sits as a bead near the tip of one hair in three.
  if (uPlantDew > 0.0) hairBead += one * (1.5 + 2.0 * h2) * uPlantDew * (1.0 - uPlantWet) * step(0.85, h5);
  mat4 toClip = projectionMatrix * viewMatrix;
  hairFoot = toClip * vec4(plantWorld(hairPoint(0.0)), 1.0);
  hairTip = toClip * vec4(plantWorld(hairPoint(1.0)), 1.0);
  vec2 run = (hairTip.xy / max(hairTip.w, 1e-5) - hairFoot.xy / max(hairFoot.w, 1e-5)) * 0.5 * uSize;
  hairLong = max(abs(run.x), abs(run.y));
  // A strand stands for its neighbors only where it shows as a strand. Seen end on it is a point, and a point that carries the light of ten is a speck.
  hairShare = min(hairShare, 1.0 + (hairShare - 1.0) * smoothstep(1.5, 4.0, hairLong));
}


float lobe(float s, float spread) {
  return exp(-0.5 * s * s / (spread * spread)) / (2.5066 * spread);
}

vec3 scatter(vec3 along, vec3 toEye, vec3 toSun) {
  float sinI = dot(toSun, along);
  float sinO = dot(toEye, along);
  float cosI = sqrt(max(1.0 - sinI * sinI, 0.0));
  float cosO = sqrt(max(1.0 - sinO * sinO, 0.0));
  float round = clamp(dot(toSun - sinI * along, toEye - sinO * along) / max(cosI * cosO, 1e-4), -1.0, 1.0);
  // Seen or lit end on, a fiber has no round: the turn about it is taken as the mean of all turns, so a hair that points at the lens does not flash.
  round = mix(-0.57, round, smoothstep(0.05, 0.4, min(cosI, cosO)));
  float between = 0.5 * (1.0 + cosI * cosO + sinI * sinO);
  float glance = sqrt(saturate(0.5 + 0.5 * dot(toSun, toEye)));
  float mirror = 0.04 + 0.96 * pow(1.0 - glance, 5.0);
  float through = lobe(sinI + sinO, TT_SPREAD) * 0.714 * exp(-TT_TURN * (1.0 + round)) * (1.0 - mirror) * (1.0 - mirror);
  float back = lobe(sinI + sinO, R_SPREAD) * 0.25 * sqrt(saturate(0.5 + 0.5 * round)) * mirror;
  vec3 clear = vec3((through + back) * cosI / max(between, 0.2)) + uHairColor * (EVEN * cosI);
  // Rime is matt: it sends the sun on evenly, a little more against the light, where the ice lets it through.
  if (uPlantFrost > 0.0) clear = mix(clear, RIME * (RIME_SUN * cosI * (0.7 - 0.3 * round) / STRAND_GAIN), uPlantFrost);
  return clear;
}

Strand strandAt(float t) {
  float h1 = fract(hairOwn * 13.37 + 0.21);
  float h3 = fract(hairOwn * 91.71 + 0.43);
  Strand s;
  s.world = plantWorld(hairPoint(t));
  s.along = plantDirection(normalize(hairDir + hairBend * (2.0 * t)));
  s.toEye = normalize(uCamPos - s.world);
  vec4 view = viewMatrix * vec4(s.world, 1.0);
  s.depth = -view.z;
  s.pixel = s.depth * 2.0 / (projectionMatrix[1][1] * uSize.y);
  s.width = uHairWidth * plantSize() * (0.5 + h3) * hairSlim * hairWide * mix(1.0, mix(0.6, 0.1 + 0.3 * uPlantFrost, hairSlim), pow(t, 0.8 + h1));
  s.share = hairShare / hairSlim;
  float reach = length(s.world - uCamPos);
  float fog = exp(-uFogDensity * exp(-uFogFalloff * max(uCamPos.y, 0.0)) * reach) * (1.0 - 0.5 * uPlantWet);
  vWorld = s.world;
  // The shadow map cannot tell a hair from the body it grows on, a millimeter away, and would darken the foot of every hair on an outline. It is asked farther out, where it can tell what else is in the way; the body's own shade is the term below.
  vLitAt = s.world + plantDirection(hairStand) * (SHADE_OUT_M * plantSize());
  vDepth = s.depth;
  // A hair grows out of a body. One that points away from the sun stands in that body's shade, closer than the shadow map can tell, and one that points away from the eye is behind it.
  vec3 out3 = plantDirection(hairStand);
  // How far round the dark side a hair still reaches the sun goes with its length: down is in the body's shade sooner than a long hair, and on the face toward the eye it is dark right up to the outline.
  float clear = min(0.95, sqrt(hairRoot.w * plantSize() / 0.0015));
  float shade = smoothstep(-clear, -0.63 * clear, dot(out3, uSunDir) - FACE_SHADE * (0.9 / (clear * clear)) * max(dot(out3, s.toEye), 0.0));
  float behind = smoothstep(-0.85, -0.6, dot(out3, s.toEye));
  float against = smoothstep(0.93, 0.995, -dot(s.toEye, uSunDir));
  vec3 lit = uSunColor * pow(uSunColor / max(uSunColor.r, max(uSunColor.g, uSunColor.b)), vec3(mix(-SUN_PALE, SUN_DEEPEN, against) * (1.0 - uPlantFrost)));
  vSun = lit * mix(THROUGH_TINT, vec3(1.0), uPlantFrost) * scatter(s.along, s.toEye, uSunDir) * (STRAND_GAIN * fog * shade * behind);
  // Sky light comes through a fiber as sunlight does, from behind it, where the body it grows on is not in the way. The little it sends back is all a hair on the near face has. Rime takes the sky from all round, as a white card does.
  float open = 1.0 - smoothstep(-0.1, 0.6, dot(out3, s.toEye));
  vSky = mix(uHairColor * (SKY_BACK + SKY_THROUGH * open), RIME * (RIME_SKY * mix(RIME_FACE, 1.0, open)), uPlantFrost) * (fog * behind);
  vSkyY = normalize(vec3(0.0, 0.5, 0.0) - s.toEye * open + s.toEye * (1.0 - open)).y;
  vBead = vec3(t, hairBead * plantSize() / s.pixel, 1.0);
  return s;
}
`

const lineVertex = /* glsl */ `
out float vCover;
${strand}
void main() {
  readHair(gl_VertexID / 3);
  int j = gl_VertexID % 3;
  Strand s = strandAt(0.5 * float(j));
  vec4 here = projectionMatrix * viewMatrix * vec4(s.world, 1.0);
  vec4 foot = hairFoot;
  vec4 tip = hairTip;
  vec2 a = foot.xy / max(foot.w, 1e-5);
  vec2 b = tip.xy / max(tip.w, 1e-5);
  vec2 run = (b - a) * 0.5 * uSize;
  float major = max(abs(run.x), abs(run.y));
  // A hair shorter than two pixels would light one whole pixel in some samples and none in others. It is drawn two pixels long and that much fainter, level in depth, so it does not sparkle. Shorter than a pixel it has no direction to show and is laid across its own, which on an outline is along it: down adds up to a line there, not to a row of beads.
  float stretch = max(1.0, min(2.0 / sqrt(hairSlim), 4.0) / max(major, 1e-3));
  float across = 1.5708 * (1.0 - smoothstep(0.75, 1.5, major));
  mat2 lay = mat2(cos(across), sin(across), -sin(across), cos(across));
  vec2 mid = 0.5 * (a + b);
  vec2 at = mid + lay * ((here.xy / max(here.w, 1e-5) - mid) * uSize) * stretch / uSize;
  vec2 laid = lay * run * stretch;
  float level = 0.5 * (foot.z / max(foot.w, 1e-5) + tip.z / max(tip.w, 1e-5));
  vCover = s.width / s.pixel * s.share * length(run) / max(max(abs(laid.x), abs(laid.y)), 1e-3);
  vBead.y *= sqrt(s.share);
  vBead.z = max(major, 2.0);
  gl_Position = stretch > 1.0 ? vec4(at * here.w, level * here.w, here.w) : here;
}
`

const ribbonVertex = /* glsl */ `
out float vAcross;
out float vHalf;
out float vShare;
${strand}
void main() {
  readHair(gl_VertexID / 10);
  int j = gl_VertexID % 10;
  Strand s = strandAt(0.25 * float(j >> 1));
  vec3 side = normalize(cross(s.along, s.toEye));
  float halfPx = 0.5 * s.width / s.pixel;
  // The ribbon opens at its tip to hold the bead.
  vAcross = (float(j & 1) * 2.0 - 1.0) * ((j >= 8 ? max(halfPx, vBead.y) : halfPx) + 0.75);
  vHalf = halfPx;
  vShare = s.share;
  vBead.z = hairRoot.w * plantSize() / s.pixel;
  vec3 world = s.world + side * (vAcross * s.pixel);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vLitAt;
in float vDepth;
in vec3 vSun;
in vec3 vSky;
in float vSkyY;
in vec3 vBead;
#ifdef RIBBON
in float vAcross;
in float vHalf;
in float vShare;
#else
in float vCover;
#endif
const float BEAD_THROUGH = 3.0;
const float BEAD_SKY = 2.0;
void main() {
#ifdef RIBBON
  float x = abs(vAcross);
  float cover = max(0.0, min(vHalf, x + 0.5) - max(-vHalf, x - 0.5)) * vShare;
#else
  float cover = vCover;
#endif
  float sun = plantSun(vLitAt, uSunDir);
  vec3 color = (vSun * sun + vSky * skyAmbient(vec3(0.0, vSkyY, 0.0)) * plantSky(vWorld)) * cover;
  // A bead of water is a lens: it throws the sun on toward an eye that looks against it, and shows the bright low sky from anywhere.
  if (vBead.y > 0.0) {
    float against = exp(-4.0 * (1.0 + dot(normalize(uCamPos - vWorld), uSunDir)));
    vec3 bead = uSunColor * ((BEAD_THROUGH * against + 0.05) * sun) + skyAmbient(vec3(0.0, 0.35, 0.0)) * (BEAD_SKY * plantSky(vWorld));
    float r = vBead.y;
#ifdef RIBBON
    float q = length(vec2(vAcross, (1.0 - vBead.x) * vBead.z - r));
    float small = 3.0 * r * r / ((r + 0.5) * (r + 0.5) * (r + 0.5));
    color += bead * (saturate(r - q + 0.5) * mix(small, 1.0, smoothstep(0.75, 1.5, r)) * vShare);
#else
    float t3 = vBead.x * vBead.x * vBead.x;
    color += bead * (21.99 * r * r * t3 * t3 / vBead.z);
#endif
  }
  // Light is added to what is behind, as a clear fiber does. The blur circle is the smaller of the hair's own and the one behind it, and only where the hair shows, so the lens does not smear a sharp bright hair into a soft background.
  float shows = dot(color, vec3(0.3, 0.6, 0.1));
  outColor = vec4(color, shows > 0.002 ? cocOf(vDepth) : 4096.0);
}
`

// Fine hairs. Far from the lens each is a line a pixel wide that adds its true share of light; close to it each is a thin ribbon turned to the camera. The part that wears them gives each hair its root and its direction at both ends of the shutter.
export class HairSet {
  readonly surface: Surface
  // The two forms of the hairs. One of them is drawn in any sample. A part that wears hairs adds all of them to its own meshes.
  readonly meshes: THREE.Mesh[]
  private readonly roots: [Float32Array, Float32Array]
  private readonly leans: [Float32Array, Float32Array]
  private readonly lines = new THREE.BufferGeometry()
  private readonly ribbons = new THREE.BufferGeometry()
  private readonly data: Float32Array
  private readonly texture: THREE.DataTexture
  private shown: number
  private stale = true
  private kept = 0
  private nearest = 1
  private longest = 0
  private readonly eye = new THREE.Vector3()
  private readonly seen = new THREE.Vector3()
  private readonly clip = new THREE.Matrix4()
  private readonly at: Float32Array
  private crowd = new Float32Array(0)

  constructor(options: PartOptions, readonly count: number, name: string, color: [number, number, number] = [0.9, 0.95, 0.8], private readonly widthM = 0.00004) {
    if (options.places) throw new Error('hairs are worn by the plant and the companion only')
    this.shown = count
    this.roots = [new Float32Array(count * 4), new Float32Array(count * 4)]
    this.leans = [new Float32Array(count * 4), new Float32Array(count * 4)]
    this.at = new Float32Array(count * 2)
    const rows = Math.max(1, Math.ceil(count / ROW))
    this.data = new Float32Array(ROW * 4 * rows * 4)
    this.texture = new THREE.DataTexture(this.data, ROW * 4, rows, THREE.RGBAFormat, THREE.FloatType)
    this.texture.colorSpace = THREE.NoColorSpace
    this.texture.minFilter = THREE.NearestFilter
    this.texture.magFilter = THREE.NearestFilter
    this.texture.generateMipmaps = false
    this.texture.needsUpdate = true
    // The vertices carry nothing: a vertex knows its hair and its place on it from its number.
    const lineIndex = new Uint32Array(count * 6)
    const ribbonIndex = new Uint32Array(count * 36)
    for (let k = 0; k < count; k++) {
      const v = k * 3
      lineIndex.set([v, v + 2], k * 2)
      lineIndex.set([v, v + 1, v + 1, v + 2], count * 2 + k * 4)
      const w = k * 10
      const band = (a: number, b: number) => [w + a * 2, w + a * 2 + 1, w + b * 2, w + a * 2 + 1, w + b * 2 + 1, w + b * 2]
      ribbonIndex.set([...band(0, 2), ...band(2, 4)], k * 12)
      ribbonIndex.set([...band(0, 1), ...band(1, 2), ...band(2, 3), ...band(3, 4)], count * 12 + k * 24)
    }
    this.lines.setIndex(new THREE.BufferAttribute(lineIndex, 1))
    this.ribbons.setIndex(new THREE.BufferAttribute(ribbonIndex, 1))
    const own = { uHairColor: { value: new THREE.Vector3(...color) }, uHairWidth: { value: widthM }, uHairs: { value: this.texture } }
    const make = (label: string, vertex: string, define: string): Surface => {
      const surface = makePartSurface(options, { name: label, vertex, fragment: `${define}${fragment}`, side: THREE.DoubleSide, transparent: true, additive: true, castShadow: false, uniforms: own })
      surface.main.blendEquationAlpha = THREE.MinEquation
      surface.main.blendSrcAlpha = THREE.OneFactor
      surface.main.blendDstAlpha = THREE.OneFactor
      return surface
    }
    this.surface = make(name, lineVertex, '')
    const close = make(`${name} close`, ribbonVertex, '#define RIBBON 1\n')
    const far = new THREE.LineSegments(this.lines, this.surface.main)
    far.frustumCulled = false
    far.matrixAutoUpdate = false
    const near = partMesh(this.ribbons, close)
    far.renderOrder = HAIR_ORDER
    near.renderOrder = HAIR_ORDER + 1
    far.onBeforeRender = (_renderer, _scene, camera) => this.choose(camera, far, false)
    near.onBeforeRender = (_renderer, _scene, camera) => this.choose(camera, near, true)
    this.meshes = [far as unknown as THREE.Mesh, near]
  }

  // A hair outside the picture is left out, and of the hairs far out of focus a share is left out and the rest stand for them.
  private gather(camera: THREE.Camera, object: THREE.Object3D): void {
    const e = this.clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(object.matrixWorld).elements
    const m = object.matrixWorld.elements
    const size = Math.hypot(m[0], m[1], m[2])
    const [ra, rb] = this.roots
    const [la, lb] = this.leans
    const out = this.data
    const cocScale = shared.uCocScale.value
    const focus = shared.uFocusM.value
    const height = shared.uSize.value.y
    const cols = Math.ceil(shared.uSize.value.x / CROWD_CELL_PX) + 1
    const rows = Math.ceil(height / CROWD_CELL_PX) + 1
    if (this.crowd.length !== cols * rows) this.crowd = new Float32Array(cols * rows)
    const crowd = this.crowd
    crowd.fill(0)
    const at = this.at
    const perM = (camera.projectionMatrix.elements[5] * height) / 2
    const thick = (1 + 5 * stateUniforms.uPlantFrost.value) * (1 + 2 * stateUniforms.uPlantWet.value)
    let n = 0
    let nearest = Infinity
    let longest = 0
    for (let i = 0; i < this.shown; i++) {
      const o = i * 4
      const length = ra[o + 3]
      if (!(length > 0)) continue
      const x = ra[o]
      const y = ra[o + 1]
      const z = ra[o + 2]
      const w = e[3] * x + e[7] * y + e[11] * z + e[15]
      const long = length * size
      if (w < long) continue
      const coc = cocScale * Math.abs(1 / w - 1 / focus)
      const reach = w * (1.04 + (2 * coc) / height) + long * 4
      if (Math.abs(e[0] * x + e[4] * y + e[8] * z + e[12]) > reach || Math.abs(e[1] * x + e[5] * y + e[9] * z + e[13]) > reach) continue
      const own = la[o + 3]
      let share = 1
      const scale = (size * perM) / w
      // A hair too short on the screen to show as a strand stands for itself, so a part with short hairs loses none of their light.
      const brief = Math.min(1, Math.max(0, (length * scale - STRAND_FROM_PX) / STRAND_FROM_PX))
      const fine = Math.min(1, (this.widthM * thick * scale) / STRAND_PX)
      const part = (1 - brief * (1 - fine)) * (coc > THIN_FROM_PX ? Math.max(THIN_FROM_PX / coc, THIN_LEAST) : 1)
      if (part < 1) {
        const keep = part * (1 + THIN_EASE)
        const h = (own * 151.37 + 0.11) % 1
        const s = Math.min(1, (keep - h) / (THIN_EASE * keep))
        if (s <= 0) continue
        const whole = keep * (1 - THIN_EASE)
        share = s / (keep <= 1 ? keep * (1 - 0.5 * THIN_EASE) : whole + 0.5 * (1 - whole) * (1 + (keep - 1) / (THIN_EASE * keep)))
      }
      const la2 = Math.hypot(la[o], la[o + 1], la[o + 2]) || 1
      const lb2 = Math.hypot(lb[o], lb[o + 1], lb[o + 2]) || 1
      const q = n * 16
      const px = Math.min(cols - 1.001, Math.max(0, (((e[0] * x + e[4] * y + e[8] * z + e[12]) / w) * 0.5 + 0.5) * (shared.uSize.value.x / CROWD_CELL_PX)))
      const py = Math.min(rows - 1.001, Math.max(0, (((e[1] * x + e[5] * y + e[9] * z + e[13]) / w) * 0.5 + 0.5) * (height / CROWD_CELL_PX)))
      at[n * 2] = px
      at[n * 2 + 1] = py
      crowd[Math.round(py) * cols + Math.round(px)] += (share * this.widthM * scale * Math.min(length * scale, CROWD_CELL_PX)) / (CROWD_CELL_PX * CROWD_CELL_PX)
      out[q] = x
      out[q + 1] = y
      out[q + 2] = z
      out[q + 3] = length
      out[q + 4] = rb[o]
      out[q + 5] = rb[o + 1]
      out[q + 6] = rb[o + 2]
      out[q + 7] = own
      out[q + 8] = la[o] / la2
      out[q + 9] = la[o + 1] / la2
      out[q + 10] = la[o + 2] / la2
      out[q + 11] = share
      out[q + 12] = lb[o] / lb2
      out[q + 13] = lb[o + 1] / lb2
      out[q + 14] = lb[o + 2] / lb2
      out[q + 15] = 0
      n++
      if (w < nearest) nearest = w
      if (long > longest) longest = long
    }
    // Rime is matt and does not burn: a crust of it may stand as close as it grows.
    const limit = CROWD_COVER * (1 + 15 * stateUniforms.uPlantFrost.value)
    for (let k = 0; k < n; k++) {
      const px = at[k * 2]
      const py = at[k * 2 + 1]
      const cx = Math.floor(px)
      const cy = Math.floor(py)
      const fx = px - cx
      const fy = py - cy
      const c = cy * cols + cx
      const cover = (crowd[c] * (1 - fx) + crowd[c + 1] * fx) * (1 - fy) + (crowd[c + cols] * (1 - fx) + crowd[c + cols + 1] * fx) * fy
      if (cover <= limit) continue
      const keep = limit / cover
      const h = (out[k * 16 + 7] * 97.13 + 0.37) % 1
      out[k * 16 + 11] *= Math.min(1, Math.max(0, (keep - h) / (0.3 * keep)))
    }
    this.kept = n
    this.nearest = nearest
    this.longest = longest
    this.texture.needsUpdate = true
    this.stale = false
    this.eye.setFromMatrixPosition(camera.matrixWorld)
  }

  private choose(camera: THREE.Camera, object: THREE.Object3D, ribbon: boolean): void {
    // The samples of one frame differ by the width of the lens. A camera farther than that from where the hairs were gathered is another view.
    if (this.stale || this.seen.setFromMatrixPosition(camera.matrixWorld).distanceTo(this.eye) > REGATHER_M) this.gather(camera, object)
    const geometry = ribbon ? this.ribbons : this.lines
    const m = object.matrixWorld.elements
    const size = Math.hypot(m[0], m[1], m[2])
    const pixel = (this.nearest * 2) / (camera.projectionMatrix.elements[5] * shared.uSize.value.y)
    const thick = (1 + 5 * stateUniforms.uPlantFrost.value) * (1 + 2 * stateUniforms.uPlantWet.value)
    // Down that is wider than it is long on the screen stays a line: a ribbon has nothing to show of it.
    const close = (Math.min(this.widthM * size, this.longest / 5) * thick * 1.5) / pixel > RIBBON_FROM_PX
    if (this.kept === 0 || close !== ribbon || shared.uDiag.value >= 4) {
      geometry.setDrawRange(0, 0)
      return
    }
    const lengthPx = this.longest / pixel
    if (ribbon) {
      if (lengthPx < 12) geometry.setDrawRange(0, this.kept * 12)
      else geometry.setDrawRange(this.count * 12, this.kept * 24)
    } else if (lengthPx < 5) geometry.setDrawRange(0, this.kept * 2)
    else geometry.setDrawRange(this.count * 2, this.kept * 4)
  }

  // Four numbers a hair: where it is rooted (x, y, z in the plant's own space, meters) and how long it is.
  root(slot: 0 | 1): Float32Array {
    return this.roots[slot]
  }

  // Four numbers a hair: the direction it grows in, and a number from 0 to 1 that is its own.
  lean(slot: 0 | 1): Float32Array {
    return this.leans[slot]
  }

  // How many of the hairs are drawn. They are packed for the shader when the first sample of the frame is drawn, once the camera is known.
  finish(shown = this.count): void {
    this.shown = Math.max(0, Math.min(shown, this.count))
    this.stale = true
  }
}

export function createHairs(options: PartOptions, count: number, name: string, color?: [number, number, number], widthM?: number): HairSet | null {
  return options.places ? null : new HairSet(options, count, name, color, widthM)
}
