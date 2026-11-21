import * as THREE from 'three'
import type { Assets } from '../../core/assets.ts'
import { FullscreenPass } from '../../core/fullscreen.ts'
import { stream } from '../../core/random.ts'
import { glslCommon, shared } from '../../core/shading.ts'
import { DENSITY, DENSITY_SIZE, GLOW_COVER } from './density.ts'

const RAD = Math.PI / 180

// The painted glow is laid where the camera of the night key saw it and is fixed to the stars from there on.
const MAP_AZ_DEG = -166.8002
const MAP_EL_DEG = 7.3127
const MAP_SCALE_X = 1.1388889
const MAP_SCALE_Y = MAP_SCALE_X * (16 / 9)
const KEY_TIME_S = 26

const POLE_AZ_DEG = 180
const POLE_EL_DEG = 42
const TURN_DEG_PER_SECOND = 0.6

// One faint meteor, once, well before the key: where it enters and where it burns out, by bearing and height in degrees.
const METEOR_AT_S = 22.3
const METEOR_SECONDS = 0.5
const METEOR_TRAIL = 0.3
const METEOR_FROM_DEG: [number, number] = [-187.7, 16.7]
const METEOR_TO_DEG: [number, number] = [-181.7, 11.4]
const METEOR_LIGHT = 0.5

const STARS = 150000
const FAINTEST = 0.0147
const BRIGHTEST = 12
const SLOPE = 1.3
const IN_RIVER = 6

const glowFragment = /* glsl */ `${glslCommon}
uniform mat4 uCamWorld;
uniform vec4 uProj;
uniform sampler2D tGlow;
uniform mat3 uToMap;
uniform vec2 uMapScale;
uniform float uPixelAngle;
uniform float uGain;
uniform vec3 uMeteorHead;
uniform vec3 uMeteorTail;
uniform float uMeteor;
uniform vec3 uGlow;
uniform float uGlowPower;
uniform vec3 uZenith;
uniform vec3 uHorizon;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dv = normalize(vec3((ndc.x + uProj.z) * uProj.x, (ndc.y + uProj.w) * uProj.y, -1.0));
  vec3 d = normalize(mat3(uCamWorld) * dv);
  float coc = min(uCocScale / uFocusM, 2048.0);
  float el = asin(clamp(d.y, -1.0, 1.0));
  vec3 m = uToMap * d;
  vec2 uv = 0.5 + m.xy / max(m.z, 0.2) * uMapScale;
  vec3 paint = texture(tGlow, clamp(uv, 0.002, 0.998)).rgb * uGain;
  vec3 plain = mix(uHorizon, uZenith, smoothstep(0.0, 0.6, el));
  vec2 off = abs(uv - 0.5);
  float inside = (1.0 - smoothstep(0.44, 0.5, max(off.x, off.y))) * smoothstep(0.2, 0.5, m.z);
  vec3 color = mix(plain, paint, inside);
  float toMoon = saturate(dot(normalize(d.xz), normalize(uSunDir.xz)));
  color += uGlow * pow(toMoon, uGlowPower) * exp(-max(el, 0.0) / 0.12);
  if (uMeteor > 0.0) {
    vec3 trail = uMeteorHead - uMeteorTail;
    float along = clamp(dot(d - uMeteorTail, trail) / dot(trail, trail), 0.0, 1.0);
    float off = length(d - (uMeteorTail + trail * along)) / uPixelAngle;
    color += vec3(0.75, 0.9, 1.0) * (uMeteor * along * along * exp(-off * off));
  }
  float a = uFogDensity * exp(-uFogFalloff * max(uCamPos.y, 0.0));
  float depth = a / (uFogFalloff * max(d.y, 1e-4));
  color = mix(color, uFogColor + uFogSunTint * pow(saturate(dot(d, uSunDir)), 6.0), 1.0 - exp(-depth));
  float grey = dot(color, vec3(0.3, 0.6, 0.1));
  if (uDiag == 7) color = vec3(grey);
  if (uDiag == 4) { outColor = vec4(vec3(0.03), -1.0); return; }
  if (uDiag == 5) color = vec3(1.0e4);
  if (uDiag == 6) color = vec3(grey) * 0.5;
  outColor = vec4(color, coc);
}
`

// The whole night sky is seen through the middle of the lens in every sample, so the lens never spreads it. A star is a point whose width is set in pixels.
const starVertex = /* glsl */ `precision highp float;
in vec3 position;
in vec4 aLight;
uniform mat3 uTurn;
uniform mat3 uView;
uniform vec4 uProj;
uniform float uWidth;
uniform float uGain;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform vec3 uCamPos;
uniform int uDiag;
out vec3 vLight;
out float vSigma;
void main() {
  vec3 w = uTurn * position;
  vec3 v = uView * w;
  float sigma = aLight.a * uWidth / 1920.0;
  float size = ceil(6.0 * sigma) + 2.0;
  float air = uFogDensity * exp(-uFogFalloff * max(uCamPos.y, 0.0)) / (uFogFalloff * max(w.y, 1e-4));
  float dim = exp(-air) * exp(-0.035 / max(w.y, 0.01)) * smoothstep(0.0, 0.02, w.y);
  vLight = aLight.rgb * (uGain * dim / (6.2832 * sigma * sigma));
  vSigma = sigma;
  bool hidden = v.z > -0.05 || uDiag > 1;
  gl_Position = hidden ? vec4(2.0, 2.0, 2.0, 1.0) : vec4(uProj.x * v.x / -v.z - uProj.z, uProj.y * v.y / -v.z - uProj.w, 0.0, 1.0);
  gl_PointSize = size;
  vSigma = sigma / size;
}
`

const starFragment = /* glsl */ `precision highp float;
in vec3 vLight;
in float vSigma;
layout(location = 0) out vec4 outColor;
void main() {
  vec2 r = (gl_PointCoord - 0.5) / vSigma;
  outColor = vec4(vLight * exp(-0.5 * dot(r, r)), 0.0);
}
`

function direction(azDeg: number, elDeg: number): THREE.Vector3 {
  const az = azDeg * RAD
  const el = elDeg * RAD
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
}

const TINTS: [number, number, number][] = [
  [0.3, 0.55, 1.0],
  [0.5, 0.75, 1.0],
  [0.85, 0.92, 1.0],
  [1.0, 0.82, 0.55],
  [1.0, 0.6, 0.3],
  [1.0, 0.45, 0.25],
]
const TINT_SHARE = [0.3, 0.32, 0.16, 0.1, 0.09, 0.03]

function catalogue(forward: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): THREE.BufferGeometry {
  const random = stream('night stars')
  const [cols, rows] = DENSITY_SIZE
  const glowAt = (u: number, v: number): number => {
    const x = Math.min(cols - 1, Math.floor(u * cols))
    const y = Math.min(rows - 1, Math.floor(v * rows))
    const g = parseInt(DENSITY.slice((y * cols + x) * 2, (y * cols + x) * 2 + 2), 16) / 255
    return g * g
  }
  const position = new Float32Array(STARS * 3)
  const light = new Float32Array(STARS * 4)
  const d = new THREE.Vector3()
  let n = 0
  while (n < STARS) {
    const u = random.next()
    const v = random.next()
    const keep = random.next()
    const drawn = Math.min(BRIGHTEST, FAINTEST * Math.pow(Math.max(random.next(), 1e-6), -1 / SLOPE))
    const pick = random.next()
    const width = random.next()
    const glow = glowAt(u, v)
    if (keep > 0.07 + 6 * glow) continue
    // In the river only the stars that outshine it are seen.
    const flux = drawn * (1 + IN_RIVER * glow)
    d.copy(forward).addScaledVector(right, ((u - 0.5) * GLOW_COVER) / MAP_SCALE_X).addScaledVector(up, ((0.5 - v) * GLOW_COVER) / MAP_SCALE_Y).normalize()
    position[n * 3] = d.x
    position[n * 3 + 1] = d.y
    position[n * 3 + 2] = d.z
    let k = 0
    let acc = TINT_SHARE[0]
    while (pick > acc && k < TINTS.length - 1) acc += TINT_SHARE[++k]
    const tint = TINTS[k]
    light[n * 4] = flux * tint[0]
    light[n * 4 + 1] = flux * tint[1]
    light[n * 4 + 2] = flux * tint[2]
    light[n * 4 + 3] = 0.5 + 0.12 * width + 0.8 * Math.min(1, Math.sqrt(drawn / BRIGHTEST))
    n++
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('aLight', new THREE.BufferAttribute(light, 4))
  return geometry
}

export const GLOW_FILE = 'glow.jpg'

export interface NightSkyLook { gain: number; stars: number; glow: [number, number, number]; glowPower: number; zenith: [number, number, number]; horizon: [number, number, number] }

export class NightSky {
  private readonly pass: FullscreenPass
  private readonly stars: THREE.Points
  private readonly starMaterial: THREE.RawShaderMaterial
  private readonly pole = direction(POLE_AZ_DEG, POLE_EL_DEG)
  private readonly meteorFrom = direction(METEOR_FROM_DEG[0], METEOR_FROM_DEG[1])
  private readonly meteorTo = direction(METEOR_TO_DEG[0], METEOR_TO_DEG[1])
  private readonly meteorHead = new THREE.Vector3(0, 1, 0)
  private readonly meteorTail = new THREE.Vector3(0, 1, 0)
  private readonly mapBasis = new THREE.Matrix3()
  private readonly turn = new THREE.Matrix4()
  private readonly turn3 = new THREE.Matrix3()
  private readonly back3 = new THREE.Matrix3()
  private readonly view3 = new THREE.Matrix3()
  private readonly flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  constructor(look: NightSkyLook) {
    const forward = direction(MAP_AZ_DEG, MAP_EL_DEG)
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward).normalize()
    this.mapBasis.set(right.x, right.y, right.z, up.x, up.y, up.z, forward.x, forward.y, forward.z)
    this.pass = new FullscreenPass(glowFragment, {
      ...shared,
      uCamWorld: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Vector4() },
      tGlow: { value: null },
      uToMap: { value: new THREE.Matrix3() },
      uMapScale: { value: new THREE.Vector2(MAP_SCALE_X / GLOW_COVER, MAP_SCALE_Y / GLOW_COVER) },
      uPixelAngle: { value: 0.001 },
      uMeteorHead: { value: this.meteorHead },
      uMeteorTail: { value: this.meteorTail },
      uMeteor: { value: 0 },
      uGain: { value: look.gain },
      uGlow: { value: new THREE.Vector3().fromArray(look.glow) },
      uGlowPower: { value: look.glowPower },
      uZenith: { value: new THREE.Vector3().fromArray(look.zenith) },
      uHorizon: { value: new THREE.Vector3().fromArray(look.horizon) },
    })
    this.starMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: starVertex,
      fragmentShader: starFragment,
      uniforms: {
        uTurn: { value: this.turn3 },
        uView: { value: this.view3 },
        uProj: { value: new THREE.Vector4() },
        uWidth: { value: 1920 },
        uGain: { value: look.stars },
        uFogDensity: shared.uFogDensity,
        uFogFalloff: shared.uFogFalloff,
        uCamPos: shared.uCamPos,
        uDiag: shared.uDiag,
      },
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    })
    this.stars = new THREE.Points(catalogue(forward, right, up), this.starMaterial)
    this.stars.frustumCulled = false
  }

  async load(assets: Assets): Promise<void> {
    const map = await assets.texture('worlds/night', GLOW_FILE)
    this.pass.uniforms.tGlow.value = map
  }

  // The sky turns about the pole. The time is that of this sample, so the shutter's open and close each have their own sky.
  sample(time: number): void {
    this.turn.makeRotationAxis(this.pole, -(time - KEY_TIME_S) * TURN_DEG_PER_SECOND * RAD)
    this.turn3.setFromMatrix4(this.turn)
    this.back3.copy(this.turn3).transpose()
    const toMap = this.pass.uniforms.uToMap.value as THREE.Matrix3
    toMap.copy(this.mapBasis).multiply(this.back3)
    const u = this.pass.uniforms
    const s = (time - METEOR_AT_S) / METEOR_SECONDS
    u.uMeteor.value = s > 0 && s < 1 ? METEOR_LIGHT * Math.sin(Math.PI * s) : 0
    this.meteorHead.copy(this.meteorFrom).lerp(this.meteorTo, Math.min(1, Math.max(0, s))).normalize()
    this.meteorTail.copy(this.meteorFrom).lerp(this.meteorTo, Math.min(1, Math.max(0, s - METEOR_TRAIL))).normalize()
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, camera: THREE.PerspectiveCamera, pixelX: number, pixelY: number, width: number, height: number): void {
    const u = this.pass.uniforms
    const e = camera.projectionMatrix.elements
    u.uCamWorld.value.copy(camera.matrixWorld)
    u.uProj.value.set(1 / e[0], 1 / e[5], (2 * pixelX) / width, (2 * pixelY) / height)
    u.uPixelAngle.value = 2 / (e[0] * width)
    this.pass.render(renderer, target)
    const s = this.starMaterial.uniforms
    this.view3.setFromMatrix4(camera.matrixWorldInverse)
    s.uProj.value.set(e[0], e[5], (2 * pixelX) / width, (2 * pixelY) / height)
    s.uWidth.value = width
    renderer.render(this.stars, this.flat)
  }
}
