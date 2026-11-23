import * as THREE from 'three'
import { config } from '../../config.ts'
import type { Moment, Part, Quality, View } from '../../v2/api.ts'
import { AirLayer, HeavyLayer, type LayerSpec } from './air.ts'
import { rainOnBeads } from '../../plant/surface/wet/index.ts'
import { Veil } from './veil.ts'

const QUALITY: Record<Quality, number> = { film: 0, high: 1, low: 2 }
const MASTER_WIDTH = config.formats.master.width

// The rain in three depths: a few heavy drops just off the lens, far out of focus; the body of the rain round the plant, sharp where the lens is; and the fine rain beyond, which thins into the veil.
const LAYERS: LayerSpec[] = [
  { name: 'near', seed: 1, box: [2.4, 2.2, 2.4], ahead: 0.9, onGround: false, range: [0.3, 0.45, 1.3, 1.7], radii: [0.0018, 0.0036], gain: 170, count: [1500, 1000, 400] },
  { name: 'plant', seed: 2, box: [7, 3.8, 7], ahead: 2.9, onGround: true, range: [0.8, 1.1, 4.6, 5.6], radii: [0.00035, 0.0022], gain: 14, count: [36000, 24000, 10000] },
  { name: 'far', seed: 3, box: [18, 6.5, 18], ahead: 8.5, onGround: true, range: [4.6, 5.6, 13, 17], radii: [0.0005, 0.0022], gain: 26, count: [70000, 40000, 14000] },
]

// The drops that land where the lens can see them land: the square round the plant they are drawn in, as half its side at each quality.
const HEAVY_HALF_M = [2.1, 2.1, 1.4]
const HEAVY_TOWARD = 0.3
const HEAVY_GAIN = 16

const FLASH_TINT = [1.0, 1.15, 1.45]
const lum = (c: readonly number[]): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

class Rain implements Part {
  readonly objects: THREE.Object3D[]
  private readonly lit: Record<string, THREE.IUniform> = {
    uSpan: { value: new THREE.Vector2() },
    uRain: { value: 0 },
    uWind: { value: 0 },
    uPixelAngle: { value: 0.001 },
    uSamples: { value: 1 },
    uLeast: { value: 1 },
    uFlash: { value: new THREE.Vector3() },
    uFlashAt: { value: new THREE.Vector3(0, 1, 0) },
    uStrike: { value: 0 },
    uSpark: { value: 0 },
  }
  private readonly layers: AirLayer[]
  private readonly veil: Veil
  private readonly heavy: HeavyLayer

  constructor() {
    this.layers = LAYERS.map((spec) => new AirLayer(spec, this.lit))
    this.veil = new Veil(this.lit)
    this.heavy = new HeavyLayer(this.lit, HEAVY_GAIN)
    this.objects = [this.veil.mesh, ...this.layers.flatMap((l) => l.meshes), ...this.heavy.meshes]
  }

  prepare(now: Moment, later: Moment, view: View): void {
    const rain = now.dials.rain
    const on = rain > 0
    rainOnBeads(rain)
    const quality = QUALITY[view.quality]
    this.veil.show(on, quality)
    for (const layer of this.layers) layer.place(view.pose.position, view.pose.forward, quality, view.samples, on)
    this.heavy.place(view.pose.position.x * HEAVY_TOWARD, view.pose.position.z * HEAVY_TOWARD, HEAVY_HALF_M[quality], now.t, view.samples, on)
    if (!on) return
    const u = this.lit
    const tanX = config.camera.gateWidthMm / (2 * view.pose.focalMm)
    u.uSpan.value.set(now.t, later.t)
    u.uRain.value = rain
    u.uWind.value = now.dials.wind
    u.uPixelAngle.value = (2 * tanX) / view.width
    u.uSamples.value = view.samples
    u.uLeast.value = Math.max(0.75, (1.1 * view.width) / MASTER_WIDTH)
    const flash = 0.5 * (now.dials.flash + later.dials.flash)
    const sky = Math.max(lum(view.light.horizon), lum(view.light.zenith), 1e-4)
    u.uFlash.value.fromArray(FLASH_TINT).multiplyScalar(flash * sky * 5)
    u.uFlashAt.value.copy(now.flashAt)
    u.uStrike.value = Math.min(1, flash)
    u.uSpark.value = now.dials.burst
  }
}

export function make(): Part[] {
  return [new Rain()]
}
