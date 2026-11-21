import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { config, frameCount, timeOf } from '../src/config.ts'
import { rigAt } from '../src/director/camera.ts'
import { companionInView, companionMatrix } from '../src/director/companion.ts'
import { plantInputsAt } from '../src/director/inputs.ts'
import { nearPlane, poseOf, project } from '../src/director/pose.ts'
import { companionPlace, companionVariant } from '../src/field/layout.ts'
import { heightAt, usePlant } from '../src/plant/growth.ts'
import { create as createBud } from '../src/plant/head/bud/index.ts'
import { create as createPetals } from '../src/plant/head/petals/index.ts'
import { create as createLeaves } from '../src/plant/leaves/index.ts'
import type { PlantPart } from '../src/plant/part.ts'
import { poseAt } from '../src/plant/skeleton.ts'
import { buildStandIn, standInVertexCount } from '../src/plant/standin.ts'
import { create as createStem } from '../src/plant/stem/index.ts'

const aspect = config.formats.master.width / config.formats.master.height
const pos = new Float32Array(standInVertexCount * 3)
const p = new THREE.Vector3()
const matrix = companionMatrix()

// How many vertices of the companion's stand-in land inside the frame.
function inFrame(frame: number): number {
  const time = timeOf(frame)
  const rig = rigAt(time)
  const pose = poseOf(rig, new THREE.Vector3())
  usePlant(companionVariant, companionPlace())
  buildStandIn(time, plantInputsAt(time), pos, null)
  usePlant(0)
  let count = 0
  for (let i = 0; i < standInVertexCount; i++) {
    const seen = project(pose, p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(matrix), aspect)
    if (seen.depthM > nearPlane(rig) && seen.x >= 0 && seen.x <= 1 && seen.y >= 0 && seen.y <= 1) count++
  }
  return count
}

// The companion's real stem, leaves, bud and rays, as the film builds them.
const options = { detail: 'hero' as const, variant: companionVariant, places: null }
const parts = [createStem(options), createLeaves(options), createBud(options), createPetals(options)].filter((part): part is PlantPart => !!part)

// How many points of the companion's real parts land inside the frame, and how far right the farthest one lands within the frame's height.
function realInFrame(frame: number): { count: number; maxX: number } {
  const time = timeOf(frame)
  const rig = rigAt(time)
  const pose = poseOf(rig, new THREE.Vector3())
  const near = nearPlane(rig)
  usePlant(companionVariant, companionPlace())
  const posed = poseAt(time, plantInputsAt(time))
  for (const part of parts) part.fill(0, posed)
  usePlant(0)
  let count = 0
  let maxX = -Infinity
  for (const part of parts) {
    for (const mesh of part.meshes) {
      const at = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
      if (!at || at.itemSize !== 3) continue
      const a = at.array as Float32Array
      for (let i = 0; i < a.length; i += 3) {
        const seen = project(pose, p.set(a[i], a[i + 1], a[i + 2]).applyMatrix4(matrix), aspect)
        if (seen.depthM <= near || seen.y < 0 || seen.y > 1) continue
        if (seen.x > maxX) maxX = seen.x
        if (seen.x >= 0 && seen.x <= 1) count++
      }
    }
  }
  return { count, maxX }
}

function couldBeSeen(frame: number): boolean {
  const time = timeOf(frame)
  const rig = rigAt(time)
  const pose = poseOf(rig, new THREE.Vector3())
  const tanX = (0.5 * config.camera.gateWidthMm) / rig.focalMm
  return companionInView(time, plantInputsAt(time), pose, tanX, tanX / aspect, nearPlane(rig))
}

describe('the companion', () => {
  it('stands as tall as the config says, however it leans', () => {
    const top = new THREE.Vector3(0, 1, 0).applyMatrix4(matrix)
    expect(top.y).toBeCloseTo(config.field.companion.heightRatio, 9)
    const foot = new THREE.Vector3(0, 0, 0).applyMatrix4(matrix)
    const place = companionPlace()
    expect(foot.x).toBeCloseTo(place.x, 9)
    expect(foot.y).toBe(0)
    expect(foot.z).toBeCloseTo(place.z, 9)
  })

  it('is never left out of a frame that shows any part of it', () => {
    let hidden = 0
    for (let f = 0; f < frameCount; f += 3) {
      const could = couldBeSeen(f)
      if (!could) hidden++
      if (inFrame(f) > 0) expect(could, `frame ${f}`).toBe(true)
    }
    // It is out of sight for a good part of the film, which is time the render does not spend on it.
    expect(hidden).toBeGreaterThan(100)
    console.log(`the companion is left out of ${hidden} of ${Math.ceil(frameCount / 3)} frames tried`)
  })

  it('is in both bloom key frames', () => {
    for (const id of ['bloom-opening', 'bloom-hero']) {
      const frame = Math.round(config.keys.find((k) => k.id === id)!.time * config.film.fps)
      expect(couldBeSeen(frame)).toBe(true)
      expect(inFrame(frame)).toBeGreaterThan(0)
    }
    expect(heightAt(45)).toBeGreaterThan(1)
  })

  it('keeps every real part out of the frame through dawn, rain and night and at the frost key', () => {
    const fps = config.film.fps
    const night = config.segments.find((s) => s.id === 'night')!
    const frames: number[] = []
    for (let f = 0; f < night.end * fps; f += 5) frames.push(f)
    frames.push(night.end * fps - 1, Math.round(config.keys.find((k) => k.id === 'frost')!.time * fps))
    let worst = -Infinity
    let at = 0
    for (const f of frames) {
      const seen = realInFrame(f)
      expect(seen.count, `frame ${f}`).toBe(0)
      if (seen.maxX > worst) {
        worst = seen.maxX
        at = f
      }
    }
    // Hairs are a few millimeters long and are not counted: the nearest point stays a clear step outside the edge.
    expect(worst).toBeLessThan(-0.02)
    console.log(`the real companion comes nearest the frame at frame ${at}: ${(-worst * 100).toFixed(1)}% of the frame's width outside the left edge`)
  }, 60_000)

  it('is drawn in every frame that shows a real part of it, and shows its leaves in both bloom key frames', () => {
    for (let f = 0; f < frameCount; f += 6) if (realInFrame(f).count > 0) expect(couldBeSeen(f), `frame ${f}`).toBe(true)
    for (const id of ['bloom-opening', 'bloom-hero']) {
      const frame = Math.round(config.keys.find((k) => k.id === id)!.time * config.film.fps)
      expect(realInFrame(frame).count).toBeGreaterThan(500)
    }
  }, 120_000)
})
