import * as THREE from 'three'
import { config } from '../../config.ts'
import { clamp, lerp, smoothstep } from '../../core/curves.ts'
import { makeSurface } from '../../core/shading.ts'
import type { Moment } from '../../v2/api.ts'
import { windWay } from '../../v2/wind.ts'
import { unitRing } from '../fog/ring.ts'

// The mist and the fog banks are one body of air: a layer that lies on the ground, thins upward, stands in banks and drifts. It is drawn as upright sheets, each standing for the slab of air between it and the next one out.
const DRIFT_M_PER_S = 0.07
const SHUTTER_SECONDS = config.film.shutterDegrees / 360 / config.film.fps
const SIDES = 96
// All the sheets of dawn mist together cover a quarter of what stands behind them at most.
export const DAWN_DEPTH = -Math.log(0.75)

export const DRIFT = { x: windWay.x * DRIFT_M_PER_S, z: windWay.z * DRIFT_M_PER_S }

const vertex = /* glsl */ `
in vec3 position;
uniform vec4 uPlace;
uniform vec2 uCenter;
out vec3 vWorld;
void main() {
  vec3 world = vec3(uCenter.x + position.x * uPlace.x, mix(uPlace.z, uPlace.y, position.y), uCenter.y + position.z * uPlace.x);
  vWorld = world;
  gl_Position = projectionMatrix * (viewMatrix * vec4(world, 1.0));
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
uniform vec4 uPlace;
// x: the depth of this sheet's slab in meters, y: the height at which the air has thinned to a third, z: how much light a meter of it takes at the ground, w: the width of a bank.
uniform vec4 uAir;
// x: how broken the layer is, y: how far the sun's side glows, z: the shafts, w: the tight glow round the light.
uniform vec4 uLook;
// x: how much thin fog stands above the layer, y: the sine of the height over the horizon at which it has thinned to a third.
uniform vec2 uHigh;
// x: how much of this air is the thin mist of a clear dawn and not fog, y: the most light one sheet of that mist may take.
uniform vec2 uDawn;
uniform vec3 uGlowDir;
const vec2 DRIFT = vec2(${DRIFT.x.toFixed(5)}, ${DRIFT.z.toFixed(5)});
const vec2 ALONG = vec2(${windWay.x.toFixed(5)}, ${windWay.z.toFixed(5)});
void main() {
  if (uDiag > 1) discard;
  vec3 ray = vWorld - uCamPos;
  float d = length(ray);
  vec3 v = ray / d;
  vec2 p = vWorld.xz - DRIFT * (uReal + uShutter * ${SHUTTER_SECONDS.toFixed(6)});
  // The banks lie in rolls across the drift.
  vec2 q = vec2(dot(p, ALONG), 0.55 * dot(p, vec2(-ALONG.y, ALONG.x))) / uAir.w;
  float broad = valueNoise(q * 0.31 + 7.3);
  float bank = valueNoise(q);
  float wisp = valueNoise(q * 3.1 + vec2(17.0, 5.0));
  // A slab deeper than its banks holds several of them: seen through, they even out.
  float told = saturate(1.6 * uAir.w / uAir.x);
  float shape = mix(0.5, 0.62 * bank + 0.38 * wisp, told);
  float height = uAir.y * (0.45 + 0.7 * broad + 0.5 * mix(0.5, bank, told));
  float amount = mix(1.0, 2.2 * smoothstep(0.24, 0.8, shape) * (0.35 + 1.3 * broad), uLook.x);
  float across = max(length(v.xz), 0.05);
  float fall = -v.y / across;
  float y = max(vWorld.y, 0.0);
  float reach = fall > 0.0 ? min(uAir.x, y / fall) : uAir.x;
  float x = fall * reach / height;
  float lift = y / height;
  float run = abs(x) > 1e-3 ? reach * (exp(min(x - lift, 0.0)) - exp(-lift)) / x : reach * exp(-lift);
  float depth = uAir.z * amount * run / across;
  // Above a few degrees the sky is the sky's own, a little paler for the thin air that stands over the banks.
  float high = uHigh.x * (exp(-max(v.y, 0.0) / uHigh.y) * (1.0 - smoothstep(0.06, 0.13, v.y)) + 0.5 * (1.0 - smoothstep(0.1, 0.45, v.y)));
  float alpha = (1.0 - exp(-depth) * (1.0 - high)) * (1.0 - smoothstep(0.7, 1.0, vWorld.y / uPlace.y));
  // Dawn mist is a breath over the soil: it never hides what stands on the horizon and ends a degree and a half above it.
  alpha = mix(alpha, (1.0 - exp(-uDawn.y * (1.0 - exp(-depth / uDawn.y)))) * (1.0 - smoothstep(0.7, 1.0, vWorld.y / uPlace.y)) * (1.0 - smoothstep(0.008, 0.026, v.y)), uDawn.x);
  if (alpha < 0.002) discard;
  float toSun = dot(v, uGlowDir);
  float wide = saturate(toSun);
  wide *= wide * wide;
  wide *= wide;
  float theta = acos(clamp(dot(v, uSunDir), -1.0, 1.0));
  // Shafts: the banks between the sun and the eye shade the air behind them, in a fan round the sun.
  vec3 e1 = normalize(cross(uGlowDir, vec3(0.0, 1.0, 0.0)));
  vec3 e2 = cross(uGlowDir, e1);
  float fan = atan(dot(v, e2), dot(v, e1));
  float beam = valueNoise(vec2(fan * 5.0, 0.05 * uReal)) * 0.6 + valueNoise(vec2(fan * 12.0 + 5.0, 0.08 * uReal)) * 0.4;
  // A shaft is soft at its sides, starts a little way off the sun and dies out away from it.
  float shafts = 1.0 + uLook.z * (smoothstep(0.1, 0.9, beam) * 1.3 - 0.5) * smoothstep(0.02, 0.12, theta) * exp(-theta / 0.4);
  // Mist is lit by the whole sky, so it is paler than the strip of sky behind it.
  float pale = dot(0.52 * uAirHorizon + 0.46 * uAirZenith, vec3(0.2126, 0.7152, 0.0722));
  vec3 air = 0.3 * uAirHorizon + 0.7 * uAirZenith;
  air = mix(air * (pale / max(dot(air, vec3(0.2126, 0.7152, 0.0722)), 1e-4)), vec3(pale), 0.6) * 1.3;
  // The sun's own light is many times the sky's. What the mist throws on is a share of the mist's own brightness, in the sun's color: it glows and never burns out.
  vec3 warm = min(max(uSkyHorizonSun - uAirHorizon, vec3(0.0)), air);
  vec3 sun = uAirSun / max(dot(uAirSun, vec3(0.2126, 0.7152, 0.0722)), 1.0) * dot(air, vec3(0.2126, 0.7152, 0.0722));
  // Mist between the eye and the sun throws the sun forward, and reddens it on the way: a warm bloom that lies in the low mist under the sun, widest along the horizon and falling off with the angle. The lens adds its own small glow tight round the disc, so there is none of that here.
  float paleness = dot(air, vec3(0.2126, 0.7152, 0.0722));
  vec3 peach = sun * vec3(1.3, 0.93, 0.6) + 0.5 * warm;
  peach *= paleness / max(dot(peach, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  float aside = acos(clamp(dot(normalize(v.xz + vec2(1e-6)), normalize(uGlowDir.xz + vec2(1e-6))), -1.0, 1.0));
  float lying = exp(-max(v.y, 0.0) / 0.07);
  float bloom = uLook.y * wide * (0.25 + 0.7 * lying) + uLook.w * (0.9 * exp(-theta / 0.16) + 1.3 * exp(-aside / 0.35) * lying);
  vec3 color = air + peach * (bloom * max(shafts, 0.0));
  // The top of a bank sees the whole sky and its foot only the bank above it.
  color *= 0.82 + 0.3 * saturate(lift);
  // So thin a mist takes the color of the sky that stands behind it.
  float sunward = pow(saturate(0.5 + 0.5 * dot(normalize(v.xz + vec2(1e-6)), normalize(uGlowDir.xz + vec2(1e-6)))), 6.0);
  color = mix(color, 0.6 * mix(uAirHorizon, uSkyHorizonSun, sunward), uDawn.x);
  outColor = vec4(color, alpha);
}
`

export interface Sheet {
  mesh: THREE.Mesh
  // x: radius, y: top, z: foot.
  place: THREE.Vector4
  center: THREE.Vector2
  air: THREE.Vector4
  look: THREE.Vector4
  high: THREE.Vector2
  dawn: THREE.Vector2
}

let ring: THREE.BufferGeometry | null = null

export function makeSheet(name: string, glowDir: THREE.Vector3): Sheet {
  ring ??= unitRing(SIDES)
  const place = new THREE.Vector4(1, 1, -0.5, 0)
  const center = new THREE.Vector2()
  const air = new THREE.Vector4(1, 0.1, 0, 1)
  const look = new THREE.Vector4(1, 1, 0, 0)
  const high = new THREE.Vector2(0, 0.1)
  const dawn = new THREE.Vector2(0, 1)
  const surface = makeSurface({
    name,
    vertex,
    fragment,
    uniforms: { uPlace: { value: place }, uCenter: { value: center }, uAir: { value: air }, uLook: { value: look }, uHigh: { value: high }, uDawn: { value: dawn }, uGlowDir: { value: glowDir } },
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(ring, surface.main)
  mesh.frustumCulled = false
  mesh.matrixAutoUpdate = false
  mesh.visible = false
  return { mesh, place, center, air, look, high, dawn }
}

export interface Air {
  // How much mist lies on the ground, 0 to 1.
  amount: number
  // How far it has lifted off the ground as the sun burns it off, 0 to 1.
  lifted: number
  // How strongly the sun's side of the air glows, 0 in the dark.
  glow: number
  shafts: number
  // How much of it is the thin mist of a clear dawn and not fog, 0 to 1.
  dawn: number
}

// The fog of one instant, from the fog dial alone: with the dial at 0 there is none.
export function fogAt(m: Moment, out: Air): Air {
  const d = m.dials
  out.amount = clamp(d.fog)
  out.lifted = smoothstep(0.25, 1, d.sunThrough)
  out.dawn = 0
  return lit(m, out)
}

// The air close to the soil. Fog is the frost morning's. The thin mist of a cool dawn comes with the dew and burns off as the sun climbs.
export function airAt(m: Moment, out: Air): Air {
  const d = m.dials
  const low = 1 - smoothstep(2, 11, m.sunElevationDeg)
  const dawn = 0.4 * d.dew * low * (1 - d.wet)
  out.amount = clamp(Math.max(d.fog, dawn))
  out.dawn = dawn > d.fog ? 1 - d.fog / dawn : 0
  out.lifted = lerp(smoothstep(0.25, 1, d.sunThrough), smoothstep(0, 9, m.sunElevationDeg), out.dawn)
  return lit(m, out)
}

function lit(m: Moment, out: Air): Air {
  const d = m.dials
  out.glow = smoothstep(-9, -1, m.sunElevationDeg)
  out.shafts = m.lightKind === 'sun' ? smoothstep(0.25, 0.5, d.sunThrough) * (1 - smoothstep(0.8, 1, d.sunThrough)) * clamp(d.fog * 2) : 0
  return out
}

export function blankAir(): Air {
  return { amount: 0, lifted: 0, glow: 0, shafts: 0, dawn: 0 }
}

// The sheets a quality level draws: the same span with fewer, deeper slabs.
export function sheetsFor(quality: 'film' | 'high' | 'low', most: number): number {
  return quality === 'film' ? most : quality === 'high' ? Math.round(most * 0.7) : Math.round(most * 0.45)
}
