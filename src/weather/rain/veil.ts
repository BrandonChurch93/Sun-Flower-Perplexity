import * as THREE from 'three'
import { makeSurface } from '../../core/shading.ts'
import { LEAN_X, LEAN_Z, SLANT_CALM, SLANT_GUST } from './drops.ts'

// Past the reach of the streaks the rain is a grey veil: sheets that stand round the lens at set distances, each thicker than the one before, with shafts of heavier rain drifting across them.
const SHEETS_M = [900, 260, 70, 22, 9]
const THICK = [0.62, 0.5, 0.34, 0.2, 0.1]
const SHAFT_M = [140, 60, 22, 9, 4]
const SHAFTS = [0.9, 0.8, 0.6, 0.45, 0.35]
const DECK_M = 900

const list = (v: number[]): string => v.map((x) => x.toFixed(2)).join(', ')

const vertex = /* glsl */ `
in vec2 position;
out vec3 vWorld;
flat out int vSheet;
const float SHEETS[${SHEETS_M.length}] = float[](${list(SHEETS_M)});
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 ahead = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vec3 eye = (inverse(viewMatrix) * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec2 reach = 1.15 / vec2(projectionMatrix[0][0], projectionMatrix[1][1]);
  vec3 world = eye + (ahead + right * (position.x * reach.x) + up * (position.y * reach.y)) * SHEETS[gl_InstanceID];
  vWorld = world;
  vSheet = gl_InstanceID;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
flat in int vSheet;
uniform float uRain;
uniform float uWind;
uniform vec3 uFlash;
uniform vec3 uFlashAt;
uniform float uSpark;
const float SHEETS[${SHEETS_M.length}] = float[](${list(SHEETS_M)});
const float THICK[${SHEETS_M.length}] = float[](${list(THICK)});
const float SHAFT[${SHEETS_M.length}] = float[](${list(SHAFT_M)});
const float SHAFTS[${SHEETS_M.length}] = float[](${list(SHAFTS)});
void main() {
  if (uDiag > 1) discard;
  vec3 ray = normalize(vWorld - uCamPos);
  float level = max(length(ray.xz), 0.05);
  float away = SHEETS[vSheet];
  // The sheet is a wall standing round the lens: where the ray meets it, and how high.
  vec3 hit = uCamPos + ray * (away / level);
  float high = hit.y / ${DECK_M.toFixed(1)};
  if (high > 1.0) discard;
  float t = mix(uReal, uReal, uShutter);
  vec2 lean = vec2(${LEAN_X.toFixed(5)}, ${LEAN_Z.toFixed(5)});
  float slant = ${SLANT_CALM.toFixed(4)} + uWind * ${SLANT_GUST.toFixed(4)} * 0.6;
  vec2 side = vec2(lean.y, -lean.x);
  // A shaft hangs from the cloud and trails behind it as it falls.
  float across = (dot(hit.xz, side) + (dot(hit.xz, lean) - hit.y * slant) * 0.35) / SHAFT[vSheet];
  float drift = t * (0.05 + 0.5 / SHAFT[vSheet]);
  float wide = valueNoise(vec2(across * 0.37 + drift * 0.6 + float(vSheet) * 17.3, high * 0.8 + float(vSheet) * 3.1));
  float fine = valueNoise(vec2(across + drift + float(vSheet) * 41.7, high * 2.3 - drift * 0.4));
  float shaft = smoothstep(0.3, 0.8, 0.6 * wide + 0.4 * fine);
  float heavy = mix(1.0 - 0.6 * SHAFTS[vSheet], 1.0 + 0.9 * SHAFTS[vSheet], shaft);
  // Under the cloud the rain has only begun to fall together.
  float body = 1.0 - smoothstep(0.55, 1.0, high);
  float cover = (1.0 - exp(-THICK[vSheet] * heavy * 1.6)) * body * uRain;
  if (cover < 0.002) discard;
  vec3 light = 0.5 * uSkyHorizon + 0.28 * uSkyZenith + 0.12 * uSkyHorizonSun;
  // Heavy rain is darker than the air round it against a bright sky.
  light *= mix(1.08, 0.82, shaft);
  float toSun = saturate(dot(ray, uSunDir));
  float t2 = toSun * toSun;
  light += uSunColor * (0.02 + 0.1 * t2 + 0.5 * t2 * t2 * t2 * t2 * (0.5 + uSpark));
  light += uFlash * (0.08 + 0.5 * pow(saturate(dot(ray, uFlashAt)), 3.0));
  outColor = vec4(light, cover);
}
`

export class Veil {
  readonly mesh: THREE.Mesh
  private readonly geometry = new THREE.InstancedBufferGeometry()

  constructor(lit: Record<string, THREE.IUniform>) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 2))
    this.geometry.setIndex([0, 1, 2, 2, 1, 3])
    this.geometry.instanceCount = SHEETS_M.length
    const surface = makeSurface({ name: 'rain veil', vertex, fragment, uniforms: lit, side: THREE.DoubleSide, transparent: true, depthWrite: false, castShadow: false })
    this.mesh = new THREE.Mesh(this.geometry, surface.main)
    this.mesh.frustumCulled = false
    this.mesh.matrixAutoUpdate = false
    this.mesh.renderOrder = -20
    this.mesh.visible = false
  }

  // The weak card draws the three far sheets only.
  show(on: boolean, quality: number): void {
    this.mesh.visible = on
    this.geometry.instanceCount = quality === 2 ? 3 : SHEETS_M.length
  }
}
