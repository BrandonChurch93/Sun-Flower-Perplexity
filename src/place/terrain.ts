import * as THREE from 'three'
import { makeSurface } from '../core/shading.ts'
import { airGlsl, airUniforms, farDepth } from './air.ts'
import { FIELDS, HOME, LAND_FROM_M, LAND_TO_M, fieldAxes, landAt, landHill, woodAt } from './land.ts'

const RAD = Math.PI / 180
const RING_GROWTH = 1.022
// The bearings the lens can see are cut fine, the land behind the camera coarse.
const FINE = { fromDeg: 136, toDeg: 274, stepDeg: 0.125 }
const COARSE_STEP_DEG = 1.2

function bearings(): number[] {
  const list: number[] = []
  const fine = Math.round((FINE.toDeg - FINE.fromDeg) / FINE.stepDeg)
  for (let i = 0; i < fine; i++) list.push(FINE.fromDeg + i * FINE.stepDeg)
  const rest = 360 - (FINE.toDeg - FINE.fromDeg)
  const coarse = Math.round(rest / COARSE_STEP_DEG)
  for (let i = 0; i < coarse; i++) list.push(FINE.toDeg + (i * rest) / coarse)
  return list
}

export function terrainGeometry(): THREE.BufferGeometry {
  const az = bearings()
  const cols = az.length
  const rings: number[] = []
  for (let r = LAND_FROM_M; r < LAND_TO_M; r *= RING_GROWTH) rings.push(r)
  rings.push(LAND_TO_M)
  const count = rings.length * cols
  const position = new Float32Array(count * 3)
  const normal = new Float32Array(count * 3)
  const land = new Float32Array(count * 2)
  const at = { height: 0, wood: 0, hill: 0 }
  for (let k = 0; k < rings.length; k++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.sin(az[c] * RAD) * rings[k]
      const z = Math.cos(az[c] * RAD) * rings[k]
      landAt(x, z, at)
      const v = k * cols + c
      position[v * 3] = x
      position[v * 3 + 1] = at.height
      position[v * 3 + 2] = z
      land[v * 2] = at.wood
      land[v * 2 + 1] = at.hill
    }
  }
  const index = new Uint32Array((rings.length - 1) * cols * 6)
  let n = 0
  for (let k = 0; k < rings.length - 1; k++) {
    for (let c = 0; c < cols; c++) {
      const c1 = (c + 1) % cols
      const a = k * cols + c
      const b = k * cols + c1
      const d = (k + 1) * cols + c
      const e = (k + 1) * cols + c1
      index[n++] = a
      index[n++] = e
      index[n++] = b
      index[n++] = a
      index[n++] = d
      index[n++] = e
    }
  }
  for (let k = 0; k < rings.length; k++) {
    const k0 = Math.max(0, k - 1)
    const k1 = Math.min(rings.length - 1, k + 1)
    for (let c = 0; c < cols; c++) {
      const l = (k * cols + ((c + cols - 1) % cols)) * 3
      const r = (k * cols + ((c + 1) % cols)) * 3
      const i = (k0 * cols + c) * 3
      const o = (k1 * cols + c) * 3
      const ax = position[r] - position[l]
      const ay = position[r + 1] - position[l + 1]
      const azz = position[r + 2] - position[l + 2]
      const bx = position[o] - position[i]
      const by = position[o + 1] - position[i + 1]
      const bz = position[o + 2] - position[i + 2]
      let nx = ay * bz - azz * by
      let ny = azz * bx - ax * bz
      let nz = ax * by - ay * bx
      if (ny < 0) {
        nx = -nx
        ny = -ny
        nz = -nz
      }
      const len = Math.hypot(nx, ny, nz) || 1
      const v = (k * cols + c) * 3
      normal[v] = nx / len
      normal[v + 1] = ny / len
      normal[v + 2] = nz / len
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  geometry.setAttribute('aLand', new THREE.BufferAttribute(land, 2))
  geometry.setIndex(new THREE.BufferAttribute(index, 1))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), LAND_TO_M + 400)
  return geometry
}

// Where the woods are, as a picture of the whole land seen from above, so that their edge is as smooth in the shading as it is on the land.
const MAP = 768
const MAP_HALF_M = LAND_TO_M + 50

export function woodMap(): THREE.DataTexture {
  const data = new Uint8Array(MAP * MAP)
  for (let j = 0; j < MAP; j++) {
    for (let i = 0; i < MAP; i++) {
      const x = ((i + 0.5) / MAP - 0.5) * 2 * MAP_HALF_M
      const z = ((j + 0.5) / MAP - 0.5) * 2 * MAP_HALF_M
      const r = Math.hypot(x, z)
      if (r < 400 || r > LAND_TO_M) continue
      data[j * MAP + i] = Math.round(255 * woodAt(x, z, landHill(x, z)))
    }
  }
  const texture = new THREE.DataTexture(data, MAP, MAP, THREE.RedFormat, THREE.UnsignedByteType)
  texture.colorSpace = THREE.NoColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.unpackAlignment = 1
  texture.needsUpdate = true
  return texture
}

export const woodMapMegabytes = (MAP * MAP) / 1048576

const vertex = /* glsl */ `
in vec3 position;
in vec3 normal;
in vec2 aLand;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vLand;
out float vDepth;
${farDepth}
void main() {
  vec4 view = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  vWorld = position;
  vNormal = normal;
  vLand = aLand;
  vDepth = -view.z;
  farDepth(vDepth, 0.0);
}
`

// What grows in a field, as the light it gives back: pasture, a green crop, ripe grain, stubble, tilled earth, a dark standing crop, a hay meadow.
const CROPS = [
  [0.06, 0.095, 0.03],
  [0.036, 0.078, 0.022],
  [0.3, 0.24, 0.11],
  [0.21, 0.185, 0.1],
  [0.115, 0.085, 0.058],
  [0.045, 0.07, 0.022],
  [0.1, 0.14, 0.045],
]

export const fieldsGlsl = /* glsl */ `
float fieldHash(int i, int j, int salt) {
  return float(hashU(uint(i + 32768) ^ hashU(uint(j + 32768) ^ (uint(salt) << 20)))) * (1.0 / 4294967296.0);
}
float stripEdge(int i) { return float(i) + 0.5 * (fieldHash(i, 0, 1) - 0.5); }
float fieldEdge(int i, int j) { return float(j) + fieldHash(i, 0, 2) + 0.6 * (fieldHash(i, j, 3) - 0.5); }

struct Field { int strip; int field; float edgeM; vec2 q; };

Field fieldAt(vec2 p) {
  vec2 o = vec2(dot(p, vec2(${fieldAxes.ux.toFixed(6)}, ${fieldAxes.uz.toFixed(6)})), dot(p, vec2(${fieldAxes.vx.toFixed(6)}, ${fieldAxes.vz.toFixed(6)})));
  vec2 q = vec2(o.x + ${FIELDS.bendM[0].toFixed(1)} * sin(o.y / ${FIELDS.waveM[0].toFixed(1)} + 0.7), o.y + ${FIELDS.bendM[1].toFixed(1)} * sin(o.x / ${FIELDS.waveM[1].toFixed(1)} + 2.1));
  float su = q.x / ${FIELDS.stripM.toFixed(1)};
  int i = int(floor(su));
  float e0 = stripEdge(i);
  float e1 = stripEdge(i + 1);
  if (su < e0) { i -= 1; e1 = e0; e0 = stripEdge(i); }
  else if (su > e1) { i += 1; e0 = e1; e1 = stripEdge(i + 1); }
  float sv = q.y / ${FIELDS.lengthM.toFixed(1)};
  int j = int(floor(sv - fieldHash(i, 0, 2)));
  float f0 = fieldEdge(i, j);
  float f1 = fieldEdge(i, j + 1);
  if (sv < f0) { j -= 1; f1 = f0; f0 = fieldEdge(i, j); }
  else if (sv > f1) { j += 1; f0 = f1; f1 = fieldEdge(i, j + 1); }
  Field f;
  f.strip = i;
  f.field = j;
  f.edgeM = min(min(su - e0, e1 - su) * ${FIELDS.stripM.toFixed(1)}, min(sv - f0, f1 - sv) * ${FIELDS.lengthM.toFixed(1)});
  f.q = q;
  return f;
}
`

const fragment = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec2 vLand;
in float vDepth;
uniform sampler2D tWoods;
${airGlsl}
${fieldsGlsl}

const vec3 CROPS[${CROPS.length}] = vec3[${CROPS.length}](${CROPS.map((c) => `vec3(${c.join(', ')})`).join(', ')});

float crowns(vec2 p) {
  return 0.62 * valueNoise(p / 7.5) + 0.38 * valueNoise(p / 2.9 + 11.0);
}

void main() {
  vec2 p = vWorld.xz;
  vec3 n = normalize(vNormal);
  vec3 toCam = uCamPos - vWorld;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  float r = length(p);
  vec2 foot = fwidth(p);
  float px = max(foot.x, foot.y);

  Field f = fieldAt(p);
  float pick = fieldHash(f.strip, f.field, 4);
  int kind = int(pick * ${CROPS.length}.0);
  float tone = fieldHash(f.strip, f.field, 7);
  vec3 albedo = CROPS[kind] * (0.8 + 0.4 * tone);
  // Round the planted field lies a headland of grass, and ahead of the lens the sunflowers go on to the first hedge.
  bool home = f.strip >= ${HOME.strips[0]} && f.strip <= ${HOME.strips[1]} && f.field >= ${HOME.fields[0]} && f.field <= ${HOME.fields[1]};
  float headland = home ? 0.0 : 1.0 - smoothstep(86.0, 104.0, r);
  albedo = mix(albedo, vec3(0.05, 0.066, 0.03), headland);
  if (home) albedo = vec3(0.03, 0.052, 0.018) * (0.85 + 0.3 * tone);
  float tilled = kind == 4 && !home ? 1.0 - headland : 0.0;
  float standing = (home || kind == 1 || kind == 2 || kind == 5) ? 1.0 - headland : 0.0;
  float mottle = 0.55 * valueNoise(p / 37.0 + 3.0) + 0.3 * valueNoise(p / 9.0 + 7.0) + 0.15 * valueNoise(p / 2.3);
  albedo *= 0.72 + 0.56 * mottle;
  float rowFade = 1.0 - smoothstep(0.12, 0.45, px / 3.0);
  float tramFade = 1.0 - smoothstep(0.12, 0.45, px / 24.0);
  float rows = 0.5 + 0.5 * cos(6.2832 * f.q.y / 3.0);
  float tram = smoothstep(0.82, 0.95, cos(6.2832 * f.q.y / 24.0)) ;
  albedo *= 1.0 - 0.16 * (rows - 0.5) * rowFade * (1.0 - headland);
  albedo *= 1.0 - 0.3 * tram * tramFade * standing;
  // The baulk between two fields: rough grass, darker than either.
  float baulk = 1.0 - smoothstep(1.2, 3.4 + 0.5 * px, f.edgeM + 1.5 * (valueNoise(p / 5.0) - 0.5));
  albedo = mix(albedo, vec3(0.04, 0.058, 0.024) * (0.7 + 0.6 * mottle), home ? 0.0 : baulk * (1.0 - headland));

  // Woods.
  float wood = smoothstep(0.42, 0.58, texture(tWoods, p / ${(2 * MAP_HALF_M).toFixed(1)} + 0.5).r + 0.1 * (valueNoise(p / 19.0) - 0.5));
  float bump = 1.0 - smoothstep(2.5, 12.0, px);
  float c0 = crowns(p);
  vec2 grad = vec2(crowns(p + vec2(0.9, 0.0)) - c0, crowns(p + vec2(0.0, 0.9)) - c0) / 0.9;
  vec3 leaf = vec3(0.026, 0.047, 0.016) * (0.7 + 0.6 * valueNoise(p / 23.0 + 5.0)) * mix(vec3(1.0), vec3(1.25, 1.1, 0.75), smoothstep(0.55, 0.9, valueNoise(p / 61.0 + 9.0)));
  albedo = mix(albedo, leaf, wood);
  n = normalize(n - vec3(grad.x, 0.0, grad.y) * (4.0 * wood * bump));
  float low = 1.0 - smoothstep(0.03, 0.4, uSunDir.y);
  float nook = mix(1.0, mix(1.0, 0.55 + 0.45 * smoothstep(0.25, 0.75, c0), bump), wood);

  // Weather on the land.
  float nearLand = 1.0 - smoothstep(500.0, 1800.0, r);
  albedo *= 1.0 - uLandWet * mix(0.2, 0.45, tilled) * (1.0 - 0.5 * wood);
  float rime = uLandFrost * (0.25 + 0.75 * nearLand) * mix(0.75, 0.3, wood) * smoothstep(0.2, 0.7, mottle + 0.35 * (1.0 - wood));
  albedo = mix(albedo, vec3(0.72, 0.78, 0.84), rime);

  float ndl = max(dot(n, uSunDir), 0.0);
  float shade = mix(1.0, smoothstep(0.3, 0.8, c0), low * wood * bump);
  // A standing crop and a wood let the low sun through toward the lens.
  float through = uThrough * pow(saturate(dot(-v, uSunDir)), 3.0) * (0.1 * (1.0 - tilled) + 0.2 * standing + 0.3 * wood * (1.0 - bump * c0)) * (1.0 - smoothstep(0.25, 0.6, uSunDir.y));
  vec3 color = albedo * (uSunColor * (ndl * shade + through) + skyAmbient(n) * nook);
  outColor = landFinish(color, vWorld, vDepth);
}
`

export interface Terrain { mesh: THREE.Mesh; woods: THREE.DataTexture }

export function makeTerrain(): Terrain {
  const woods = woodMap()
  const surface = makeSurface({ name: 'place land', vertex, fragment, uniforms: { ...airUniforms, tWoods: { value: woods } }, castShadow: false })
  const mesh = new THREE.Mesh(terrainGeometry(), surface.main)
  mesh.frustumCulled = false
  mesh.matrixAutoUpdate = false
  mesh.name = 'place land'
  return { mesh, woods }
}
