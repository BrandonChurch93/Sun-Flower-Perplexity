import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { config, frameCount, timeOf } from '../src/config.ts'
import { rigAt } from '../src/director/camera.ts'
import { companionInView, companionMatrix } from '../src/director/companion.ts'
import { plantInputsAt } from '../src/director/inputs.ts'
import { nearPlane, poseOf, project } from '../src/director/pose.ts'
import { companionPlace, companionVariant } from '../src/field/layout.ts'
import { heightAt, usePlant } from '../src/plant/growth.ts'
import { buildStandIn, standInVertexCount } from '../src/plant/standin.ts'

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
})
