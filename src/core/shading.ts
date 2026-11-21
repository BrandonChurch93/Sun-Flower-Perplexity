import * as THREE from 'three'

export const DIAG = { beauty: 0, ungraded: 1, plant: 2, backlight: 3, texels: 4, depth: 5, focus: 6, standins: 7 } as const
export type DiagName = keyof typeof DIAG
export const diagNames = Object.keys(DIAG) as DiagName[]

export function isDiag(name: string): name is DiagName {
  return name in DIAG
}

export const shared = {
  uShutter: { value: 0 },
  uTime: { value: 0 },
  uWorldTime: { value: 0 },
  uFrame: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Vector3(1, 1, 1) },
  uSkyZenith: { value: new THREE.Vector3(0.2, 0.3, 0.5) },
  uSkyHorizon: { value: new THREE.Vector3(0.6, 0.6, 0.6) },
  uGroundBounce: { value: new THREE.Vector3(0.05, 0.04, 0.03) },
  uFogColor: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
  uFogSunTint: { value: new THREE.Vector3(0, 0, 0) },
  uFogDensity: { value: 0 },
  uFogFalloff: { value: 0.5 },
  uCamPos: { value: new THREE.Vector3() },
  uCamRot: { value: new THREE.Matrix3() },
  uSkyInvProj: { value: new THREE.Matrix4() },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowMap: { value: null as THREE.Texture | null },
  uShadowOn: { value: 0 },
  uShadowBias: { value: 0.0008 },
  uShadowNormalBias: { value: 0.002 },
  uFocusM: { value: 1 },
  uCocScale: { value: 0 },
  uSkyBlur: { value: 0 },
  uDiag: { value: 0 },
  uSize: { value: new THREE.Vector2(1, 1) },
}

export type SharedUniforms = typeof shared

export const glslCommon = /* glsl */ `
uniform float uShutter;
uniform float uTime;
uniform float uWorldTime;
uniform int uFrame;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uGroundBounce;
uniform vec3 uFogColor;
uniform vec3 uFogSunTint;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform vec3 uCamPos;
uniform float uFocusM;
uniform float uCocScale;
uniform int uDiag;

float saturate(float x) { return clamp(x, 0.0, 1.0); }

uint hashU(uint x) {
  x ^= x >> 16; x *= 0x7feb352dU; x ^= x >> 15; x *= 0x846ca68bU; x ^= x >> 16;
  return x;
}
float hash11(float p) { return float(hashU(floatBitsToUint(p))) * (1.0 / 4294967296.0); }
float hash21(vec2 p) { return float(hashU(floatBitsToUint(p.x) ^ hashU(floatBitsToUint(p.y)))) * (1.0 / 4294967296.0); }
float hash31(vec3 p) { return float(hashU(floatBitsToUint(p.x) ^ hashU(floatBitsToUint(p.y) ^ hashU(floatBitsToUint(p.z))))) * (1.0 / 4294967296.0); }

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * valueNoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}
`

export const glslLight = /* glsl */ `
uniform mat4 uShadowMatrix;
uniform highp sampler2DShadow uShadowMap;
uniform float uShadowOn;
uniform float uShadowBias;
uniform float uShadowNormalBias;

float sunShadow(vec3 worldPos, vec3 towardLightNormal) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 sc = uShadowMatrix * vec4(worldPos + towardLightNormal * uShadowNormalBias, 1.0);
  vec3 p = sc.xyz / sc.w;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  return texture(uShadowMap, vec3(p.xy, p.z - uShadowBias));
}

vec3 skyAmbient(vec3 n) {
  float t = n.y * 0.5 + 0.5;
  vec3 upper = mix(uSkyHorizon, uSkyZenith, smoothstep(0.55, 1.0, t));
  return mix(uGroundBounce, upper, smoothstep(0.1, 0.6, t));
}

vec3 applyFog(vec3 color, vec3 worldPos) {
  vec3 v = worldPos - uCamPos;
  float d = length(v);
  float a = uFogDensity * exp(-uFogFalloff * max(uCamPos.y, 0.0));
  float k = uFogFalloff * v.y;
  float depth = abs(k) > 1e-4 ? a * d * (1.0 - exp(-k)) / k : a * d;
  float f = 1.0 - exp(-depth);
  float toSun = pow(saturate(dot(v / max(d, 1e-5), uSunDir)), 6.0);
  return mix(color, uFogColor + uFogSunTint * toSun, f);
}

float cocOf(float viewDepth) {
  return min(uCocScale * abs(1.0 / max(viewDepth, 1e-4) - 1.0 / uFocusM), 4096.0);
}

vec4 finish(vec3 color, vec3 worldPos, float viewDepth) {
  return vec4(applyFog(color, worldPos), cocOf(viewDepth));
}
`

export interface SurfaceOptions {
  vertex: string
  fragment: string
  uniforms?: Record<string, THREE.IUniform>
  side?: THREE.Side
  transparent?: boolean
  depthWrite?: boolean
  blending?: THREE.Blending
  defines?: Record<string, string | number | boolean>
  standIn?: boolean
}

export interface Surface { main: THREE.ShaderMaterial; depth: THREE.ShaderMaterial | null }

const depthFragment = /* glsl */ `
void main() {
  gl_FragColor = vec4(1.0);
}
`

export function makeSurface(o: SurfaceOptions): Surface {
  const uniforms = { ...shared, uStandIn: { value: o.standIn ? 1 : 0 }, ...(o.uniforms ?? {}) }
  const main = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: `${glslCommon}\n${o.vertex}`,
    fragmentShader: `${glslCommon}\n${glslLight}\nuniform float uStandIn;\n${o.fragment}`,
    uniforms,
    side: o.side ?? THREE.FrontSide,
    transparent: o.transparent ?? false,
    depthWrite: o.depthWrite ?? true,
    blending: o.blending ?? THREE.NoBlending,
    defines: o.defines ?? {},
  })
  if (o.transparent) {
    main.blending = o.blending ?? THREE.CustomBlending
    if (main.blending === THREE.CustomBlending) {
      main.blendSrc = THREE.SrcAlphaFactor
      main.blendDst = THREE.OneMinusSrcAlphaFactor
      main.blendSrcAlpha = THREE.ZeroFactor
      main.blendDstAlpha = THREE.OneFactor
    }
  }
  const depth = o.transparent
    ? null
    : new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: `#define DEPTH_PASS 1\n${glslCommon}\n${o.vertex}`,
        fragmentShader: depthFragment,
        uniforms,
        side: THREE.DoubleSide,
        defines: o.defines ?? {},
        colorWrite: false,
      })
  return { main, depth }
}
