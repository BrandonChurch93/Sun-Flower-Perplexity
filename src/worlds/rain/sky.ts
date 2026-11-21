import * as THREE from 'three'
import type { Assets } from '../../core/assets.ts'
import { FullscreenPass } from '../../core/fullscreen.ts'
import { glslCommon, shared } from '../../core/shading.ts'

const RAD = Math.PI / 180
// The bearing the lens looks along at the key: the middle of the painted sky sits there.
const CENTER_DEG = -170.5
// Where the band is brightest: the sun stands there, behind the cloud.
const SUN_BEHIND_CLOUD_DEG = -173.5
const FLASH_BEARING_DEG = -160
const FLASH_ELEVATION_DEG = 9
const FAR_RAIN: [number, number, number] = [0.3, 0.36, 0.4]
const DRIFT_TURNS_PER_SECOND = 0.0002
export const SKY_FILE = 'sky.jpg'

const direction = (bearingDeg: number, elevationDeg: number): THREE.Vector3 =>
  new THREE.Vector3(Math.sin(bearingDeg * RAD) * Math.cos(elevationDeg * RAD), Math.sin(elevationDeg * RAD), Math.cos(bearingDeg * RAD) * Math.cos(elevationDeg * RAD))

// Everything `rainSkyGlsl` reads. Whatever mirrors the sky spreads these same objects into its own material; they are right once the stage has loaded and prepared the frame.
export const rainSkyUniforms: Record<string, THREE.IUniform> = {
  tRainSky: { value: null },
  uRainSkyTexel: { value: 0.001 },
  uRainSkyCenter: { value: CENTER_DEG * RAD },
  uRainSkySunTurn: { value: (SUN_BEHIND_CLOUD_DEG - CENTER_DEG) * RAD },
  uRainSkyGain: { value: 1 },
  uRainSkyDrift: { value: 0 },
  uRainSkyTone: { value: new THREE.Vector3().fromArray(FAR_RAIN) },
  uRainFlash: { value: 0 },
  uRainFlashAt: { value: direction(FLASH_BEARING_DEG, FLASH_ELEVATION_DEG) },
}

// The light of the sky in a world direction, for this world's own sky pass and for whatever mirrors it. It needs glslCommon.
// The picture holds one sixth of the horizon twice, the second time turned over, so it closes round the dome. Its lower part is the pale band under the cloud, laid steeply; the cloud above is laid flatter, as cloud near the horizon lies.
// No fog is laid over it: the rain between the lens and the cloud is in the grey added here and in the veils drawn in front.
export const rainSkyGlsl = /* glsl */ `
uniform sampler2D tRainSky;
uniform float uRainSkyTexel;
uniform float uRainSkyCenter;
uniform float uRainSkySunTurn;
uniform float uRainSkyGain;
uniform float uRainSkyDrift;
uniform vec3 uRainSkyTone;
uniform float uRainFlash;
uniform vec3 uRainFlashAt;

const float RAIN_SKY_SPAN = 2.0943951;
const float RAIN_SKY_BAND_ROWS = 0.235;
const float RAIN_SKY_BAND_TOP = 0.078;
const float RAIN_SKY_CLOUD_TALL = 0.32;

vec3 rainSky(vec3 d, float lod) {
  float up = max(asin(clamp(d.y, -1.0, 1.0)), 0.0);
  float turn = mod(uRainSkyCenter - atan(d.x, d.z) + 3.14159265, 6.2831853) - 3.14159265;
  float row = up < RAIN_SKY_BAND_TOP ? RAIN_SKY_BAND_ROWS * up / RAIN_SKY_BAND_TOP : RAIN_SKY_BAND_ROWS + (1.0 - RAIN_SKY_BAND_ROWS) * (up - RAIN_SKY_BAND_TOP) / RAIN_SKY_CLOUD_TALL;
  vec2 at = vec2(fract(0.25 + turn / RAIN_SKY_SPAN + uRainSkyDrift), clamp(row, 0.004, 0.996));
  vec3 sky = textureLod(tRainSky, at, lod).rgb;
  float lum = dot(sky, vec3(0.3, 0.6, 0.1));
  float cloud = 1.0 - smoothstep(0.12, 0.35, lum);
  // Seen through kilometres of rain the cloud keeps its great masses and loses its wisps.
  vec3 mass = textureLod(tRainSky, at, max(lod, 6.0)).rgb;
  sky = mix(sky, mass, 0.85 * cloud);
  vec3 color = sky * mix(vec3(1.0), vec3(1.0, 1.08, 1.0), cloud) * uRainSkyGain;
  // The paint holds the lit bellies of those masses back: they stand pale and greyer than the depths, which go darker. Next to the band the mass already holds the band's light and is left as it is, or the cloud's foot would wear a pale rim.
  float body = dot(mass, vec3(0.3, 0.6, 0.1));
  color *= mix(1.0, mix(0.8, 1.0, smoothstep(0.015, 0.04, body)), cloud) * (1.0 + vec3(0.55, 0.38, 0.25) * (cloud * smoothstep(0.03, 0.06, body) * (1.0 - smoothstep(0.09, 0.18, body))));
  // The deck is thinnest a little off the sun's bearing and lets more light through there; away from it the cloud goes to its darkest.
  float thin = (turn - 0.11) / 0.21;
  color *= mix(1.0, mix(0.85, 2.0, exp(-thin * thin)), cloud);
  // The band is where the sun stands behind thin cloud: the paint holds it back, the film lets it burn, most a little above the land and toward the sun.
  float toSun = (turn + uRainSkySunTurn) / 0.34;
  float sunward = exp(-toSun * toSun);
  float open = (1.0 - cloud) * smoothstep(0.0, 0.012, up) * exp(-up / 0.045) * (0.15 + 0.85 * sunward);
  color *= mix(vec3(1.0), vec3(5.6, 4.4, 3.0), open);
  // The cloud's foot hangs into the band in rags, lower the farther from the sun, so the band opens wide only where the sun stands.
  float rags = 0.6 * valueNoise(vec2(turn * 14.0 + 3.0, up * 40.0)) + 0.4 * valueNoise(vec2(turn * 43.0 + 1.0, up * 90.0 + 5.0));
  float foot = smoothstep(0.25, 0.95, up / RAIN_SKY_BAND_TOP + 0.9 * (rags - 0.5) + 0.55 - 0.78 * sunward);
  color = mix(color, uRainSkyTone * 0.9, (1.0 - smoothstep(0.6, 1.0, cloud)) * 0.9 * foot);
  // Far rain hangs between the lens and the sky, lit grey by the band: an even haze that thickens toward the land, and leaning curtains under the cloud that drift.
  float lean = turn - 0.21 * up;
  float curtain = valueNoise(vec2(lean * 7.0 + uTime * 0.012, 2.0)) * 0.6 + valueNoise(vec2(lean * 31.0 + uTime * 0.03, up * 5.0 + 9.0)) * 0.4;
  color = mix(color, uRainSkyTone, 0.3 * smoothstep(0.3, 0.8, curtain) * cloud * exp(-up / 0.22));
  color = mix(color, uRainSkyTone, 0.55 * exp(-up / 0.06) * (1.0 - 0.85 * sunward));
  // The rain falls heaviest away to the left of the sun: the low sky there stands darker and bluer behind it.
  float heavy = (turn + 0.45) / 0.25;
  color *= 1.0 - vec3(0.9, 0.6, 0.52) * (exp(-heavy * heavy) * exp(-up / 0.16));
  // The rain between the lens and the cloud lays its own grey green over it: the depths lift and the lit bellies stay.
  color = mix(color, vec3(0.11, 0.17, 0.18), vec3(0.2, 0.35, 0.38) * cloud);
  // Lightning deep in the cloud: its body lights up from inside round one place, brightest where it is thin.
  float near = exp(-(1.0 - dot(d, uRainFlashAt)) / 0.012);
  color += uRainFlash * vec3(0.55, 0.68, 1.0) * (0.05 + 0.8 * near) * cloud * (0.35 + 2.2 * lum) * smoothstep(0.03, 0.09, up);
  return color;
}
`

const fragment = /* glsl */ `${glslCommon}
${rainSkyGlsl}
uniform mat4 uCamWorld;
uniform vec4 uProj;
uniform float uPixelAngle;
uniform float uSamples;
in vec2 vUv;
layout(location = 0) out vec4 outColor;

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dv = normalize(vec3((ndc.x + uProj.z) * uProj.x, (ndc.y + uProj.w) * uProj.y, -1.0));
  vec3 d = normalize(mat3(uCamWorld) * dv);
  float coc = min(uCocScale / uFocusM, 2048.0);
  // One lens sample carries its share of the blur circle, so the samples close into it.
  float wide = max(1.0, 1.4 * coc / sqrt(uSamples));
  vec3 color = rainSky(d, max(0.0, log2(wide * uPixelAngle / uRainSkyTexel)));
  float grey = dot(color, vec3(0.3, 0.6, 0.1));
  if (uDiag == 7) color = vec3(grey);
  if (uDiag == 4) { outColor = vec4(vec3(0.03), -1.0); return; }
  if (uDiag == 5) color = vec3(1.0e4);
  if (uDiag == 6) color = vec3(grey) * 0.5;
  outColor = vec4(color, coc);
}
`

export class RainSky {
  private readonly pass = new FullscreenPass(fragment, {
    ...shared,
    ...rainSkyUniforms,
    uCamWorld: { value: new THREE.Matrix4() },
    uProj: { value: new THREE.Vector4() },
    uPixelAngle: { value: 0.001 },
    uSamples: { value: 1 },
  })

  async load(assets: Assets): Promise<void> {
    const map = await assets.texture('worlds/rain', SKY_FILE, { repeat: true })
    rainSkyUniforms.tRainSky.value = map
    rainSkyUniforms.uRainSkyTexel.value = ((2 * Math.PI) / 3) / (map.userData.size as { width: number }).width
  }

  prepare(time: number, gain: number, flash: number, samples: number): void {
    this.pass.uniforms.uSamples.value = Math.max(1, samples)
    rainSkyUniforms.uRainSkyDrift.value = time * DRIFT_TURNS_PER_SECOND
    rainSkyUniforms.uRainSkyGain.value = gain
    rainSkyUniforms.uRainFlash.value = flash
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, camera: THREE.PerspectiveCamera, width: number): void {
    const u = this.pass.uniforms
    const e = camera.projectionMatrix.elements
    u.uCamWorld.value.copy(camera.matrixWorld)
    u.uProj.value.set(1 / e[0], 1 / e[5], e[8], e[9])
    u.uPixelAngle.value = 2 / (e[0] * width)
    this.pass.render(renderer, target)
  }
}
