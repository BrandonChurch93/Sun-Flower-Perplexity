import * as THREE from 'three'

const known = new Set<THREE.Material>()
const shape = new THREE.BufferGeometry()
shape.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3))
const lens = new THREE.Camera()

export interface Built {
  programs: number
  beside: boolean
}

// A material that is drawn outside the film's scene (a pass over the whole picture, a shadow pass) is named here, so its program is built with the others at loading.
export function remember<T extends THREE.Material>(material: T): T {
  known.add(material)
  return material
}

// Asks the graphics card for every program at once and waits for them.
// Where the browser builds programs beside the page (KHR_parallel_shader_compile), the page never stands still for one, however long the card takes over it. Elsewhere each is built at its first draw, as before.
export async function buildPrograms(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget): Promise<Built> {
  const beside = renderer.extensions.get('KHR_parallel_shader_compile') !== null
  const others = new THREE.Scene()
  for (const material of known) others.add(new THREE.Mesh(shape, material))
  renderer.setRenderTarget(target)
  const waiting = new Set<THREE.Material>([...renderer.compile(scene, camera), ...renderer.compile(others, lens)])
  renderer.setRenderTarget(null)
  others.clear()
  const programs = waiting.size
  const gl = renderer.getContext()
  while (waiting.size > 0 && !gl.isContextLost()) {
    for (const material of waiting) {
      const program = (renderer.properties.get(material) as { currentProgram?: { isReady(): boolean } }).currentProgram
      if (!program || program.isReady()) waiting.delete(material)
    }
    if (waiting.size > 0) await new Promise<void>((resolve) => setTimeout(resolve, 16))
  }
  return { programs, beside }
}
