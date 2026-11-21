import * as THREE from 'three'
import { declareStandIn } from '../core/standins.ts'
import { makeSurface, type Surface } from '../core/shading.ts'
import { headOpen, paleness, type PlantInputs } from './growth.ts'
import { buildStandIn, plantNumbers, standInTopology, standInVertexCount, tipAt } from './standin.ts'

const vertex = /* glsl */ `
in vec3 position;
in vec3 positionB;
in vec3 normal;
in vec2 uv;
in vec3 aInfo;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
out vec3 vInfo;
out float vDepth;
void main() {
  vec4 world = modelMatrix * vec4(mix(position, positionB, uShutter), 1.0);
  vec4 view = viewMatrix * world;
  vWorld = world.xyz;
  vNormal = normal;
  vUv = uv;
  vInfo = aInfo;
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
in vec3 vInfo;
in float vDepth;
uniform float uPale;
uniform float uBloom;
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(uCamPos - vWorld);
  float ndl = dot(n, uSunDir);
  vec3 toLight = ndl >= 0.0 ? n : -n;
  float lit = sunShadow(vWorld, toLight, uShadowTexelM * 2.5);
  vec3 albedo;
  vec3 through = vec3(0.0);
  int part = int(vInfo.x + 0.5);
  if (part == 0) {
    float streak = fbm(vec2(vUv.x * 9.0, vUv.y * 60.0));
    albedo = mix(vec3(0.2, 0.32, 0.08), vec3(0.42, 0.5, 0.2), streak);
    albedo = mix(albedo, vec3(0.78, 0.7, 0.5), uPale * 0.85);
  } else if (part == 1 || part == 2) {
    float across = abs(vUv.x - 0.5) * 2.0;
    float side = abs(fract(vUv.y * 7.0 + across * 1.6 + vInfo.z) - 0.5) * 2.0;
    float vein = max(smoothstep(0.1, 0.0, across), 0.6 * smoothstep(0.12, 0.0, side) * smoothstep(1.0, 0.2, across));
    if (part == 2) vein *= 0.25;
    float mottle = fbm(vUv * vec2(14.0, 30.0) + vInfo.z * 40.0);
    albedo = mix(vec3(0.1, 0.24, 0.04), vec3(0.24, 0.4, 0.09), mottle);
    if (part == 2) albedo = mix(albedo * 1.5, vec3(0.7, 0.72, 0.35), uPale * 0.7);
    albedo = mix(albedo, vec3(0.34, 0.46, 0.16), vein * (gl_FrontFacing ? 0.5 : 0.9));
    through = mix(vec3(0.5, 0.78, 0.08), vec3(0.16, 0.34, 0.02), vein) * (0.75 + 0.5 * mottle);
  } else if (part == 3) {
    float stripe = smoothstep(0.35, 0.65, abs(fract(vUv.x * 4.0) - 0.5) * 2.0);
    albedo = mix(vec3(0.03, 0.028, 0.025), vec3(0.5, 0.47, 0.4), stripe);
  } else if (part == 4) {
    float ring = vUv.y;
    vec3 bud = mix(vec3(0.14, 0.26, 0.07), vec3(0.3, 0.42, 0.14), fbm(vUv * vec2(18.0, 12.0)));
    vec3 face = mix(vec3(0.36, 0.3, 0.05), vec3(0.2, 0.1, 0.03), smoothstep(0.62, 0.98, ring));
    face = mix(face, vec3(0.5, 0.36, 0.05), smoothstep(0.75, 0.6, ring) * 0.6);
    face *= 0.75 + 0.5 * fbm(vUv * vec2(60.0, 40.0));
    albedo = mix(bud, face, uBloom * smoothstep(0.4, 0.56, ring));
  } else if (part == 5) {
    albedo = mix(vec3(0.12, 0.25, 0.06), vec3(0.26, 0.4, 0.12), fbm(vUv * vec2(6.0, 14.0) + vInfo.z * 30.0));
    through = vec3(0.3, 0.5, 0.06);
  } else {
    float line = abs(fract(vUv.x * 5.0 + vInfo.z) - 0.5) * 2.0;
    albedo = mix(vec3(0.95, 0.6, 0.03), vec3(1.0, 0.78, 0.08), smoothstep(0.0, 1.0, vUv.y)) * (0.86 + 0.14 * line);
    through = vec3(1.0, 0.62, 0.04);
  }
  vec3 color = albedo * (uSunColor * max(ndl, 0.0) * lit + skyAmbient(n));
  color += through * uSunColor * max(-ndl, 0.0) * lit * 0.55;
  color += through * skyAmbient(-n) * 0.25;
  float rim = pow(1.0 - saturate(dot(n, v)), 4.0);
  color += uSunColor * rim * 0.06 * lit * saturate(0.4 + dot(-v, uSunDir));
  outColor = finish(color, vWorld, vDepth, -1.0);
}
`

export class Plant {
  readonly surface: Surface
  readonly mesh: THREE.Mesh
  private readonly a: THREE.BufferAttribute
  private readonly b: THREE.BufferAttribute
  private readonly n: THREE.BufferAttribute

  constructor() {
    declareStandIn('plant')
    const topology = standInTopology()
    const geometry = new THREE.BufferGeometry()
    this.a = new THREE.BufferAttribute(new Float32Array(standInVertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.b = new THREE.BufferAttribute(new Float32Array(standInVertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.n = new THREE.BufferAttribute(new Float32Array(standInVertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', this.a)
    geometry.setAttribute('positionB', this.b)
    geometry.setAttribute('normal', this.n)
    geometry.setAttribute('uv', new THREE.BufferAttribute(topology.uv, 2))
    geometry.setAttribute('aInfo', new THREE.BufferAttribute(topology.info, 3))
    geometry.setIndex(new THREE.BufferAttribute(topology.index, 1))
    this.surface = makeSurface({ name: 'plant stand-in', vertex, fragment, side: THREE.DoubleSide, standIn: true, uniforms: { uPale: { value: 0 }, uBloom: { value: 0 } } })
    this.mesh = new THREE.Mesh(geometry, this.surface.main)
    this.mesh.frustumCulled = false
  }

  prepare(timeOpen: number, timeClose: number, open: PlantInputs, close: PlantInputs): void {
    buildStandIn(timeOpen, open, this.a.array as Float32Array, this.n.array as Float32Array)
    buildStandIn(timeClose, close, this.b.array as Float32Array, null)
    this.surface.main.uniforms.uPale.value = paleness(timeOpen)
    this.surface.main.uniforms.uBloom.value = headOpen(timeOpen)
    this.a.needsUpdate = true
    this.b.needsUpdate = true
    this.n.needsUpdate = true
  }

  tip(time: number, inputs: PlantInputs, out: THREE.Vector3): THREE.Vector3 {
    tipAt(time, inputs, out)
    return out
  }

  numbers(time: number, inputs: PlantInputs): number[] {
    return plantNumbers(time, inputs)
  }
}
