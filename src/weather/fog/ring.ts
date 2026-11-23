import * as THREE from 'three'

// An upright strip round a circle of radius 1: y is 0 at its foot and 1 at its top. A sheet of air places it by its own radius and height.
export function unitRing(sides: number): THREE.BufferGeometry {
  const position = new Float32Array((sides + 1) * 2 * 3)
  const index = new Uint16Array(sides * 6)
  for (let s = 0; s <= sides; s++) {
    const az = ((s % sides) / sides) * 2 * Math.PI
    for (let k = 0; k < 2; k++) {
      const v = (s * 2 + k) * 3
      position[v] = Math.sin(az)
      position[v + 1] = k
      position[v + 2] = Math.cos(az)
    }
    if (s < sides) {
      const a = s * 2
      index.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], s * 6)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  return geometry
}

// As above at a given radius and height, with aInfo: the run along it in meters, the height above the ground and the height of its top. For the sheets of the stage before this one.
export function roundStrip(sides: number, radius: number, top: number): THREE.BufferGeometry {
  const position = new Float32Array((sides + 1) * 2 * 3)
  const info = new Float32Array((sides + 1) * 2 * 3)
  const index = new Uint16Array(sides * 6)
  const step = 2 * radius * Math.sin(Math.PI / sides)
  for (let s = 0; s <= sides; s++) {
    const az = (s / sides) * 2 * Math.PI
    for (let k = 0; k < 2; k++) {
      const v = (s * 2 + k) * 3
      position[v] = Math.sin(az) * radius
      position[v + 1] = k ? top : -4
      position[v + 2] = Math.cos(az) * radius
      info[v] = s * step
      info[v + 1] = k ? top : -4
      info[v + 2] = top
    }
    if (s < sides) {
      const a = s * 2
      index.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], s * 6)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('aInfo', new THREE.BufferAttribute(info, 3))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  return geometry
}
