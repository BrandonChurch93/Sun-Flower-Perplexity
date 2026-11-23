import * as THREE from 'three'

export const DIAG = { beauty: 0, ungraded: 1, plant: 2, backlight: 3, texels: 4, depth: 5, focus: 6, standins: 7 } as const
export type DiagName = keyof typeof DIAG
export const diagNames = Object.keys(DIAG) as DiagName[]

export function isDiag(name: string): name is DiagName {
  return name in DIAG
}

export const shared = {
  uShutter: { value: 0 },
  // uTime is the plant's clock: it stands still in a hold. uReal is the film second: everything that moves by itself runs on it. uWorldTime is the day count.
  uTime: { value: 0 },
  uReal: { value: 0 },
  uWorldTime: { value: 0 },
  uFrame: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Vector3(1, 1, 1) },
  uSkyZenith: { value: new THREE.Vector3(0.2, 0.3, 0.5) },
  uSkyHorizon: { value: new THREE.Vector3(0.6, 0.6, 0.6) },
  // The sky low toward the sun, as the sky itself says: the far land and the air take their warm side from it.
  uSkyHorizonSun: { value: new THREE.Vector3(0.6, 0.6, 0.6) },
  uGroundBounce: { value: new THREE.Vector3(0.05, 0.04, 0.03) },
  // The sky's own light as it draws itself, for what floats in the air and for mirror images of the sky: the sun where cloud and land let it through, the sky overhead and the sky at the horizon.
  uAirSun: { value: new THREE.Vector3(1, 1, 1) },
  uAirZenith: { value: new THREE.Vector3(0.2, 0.3, 0.5) },
  uAirHorizon: { value: new THREE.Vector3(0.6, 0.6, 0.6) },
  uFogColor: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
  uFogSunTint: { value: new THREE.Vector3(0, 0, 0) },
  uFogDensity: { value: 0 },
  uFogFalloff: { value: 0.5 },
  uSkyEven: { value: 0 },
  uKeyClear: { value: -1 },
  uCamPos: { value: new THREE.Vector3() },
  uShadowMatrix: { value: new THREE.Matrix4() },
  uShadowMap: { value: null as THREE.Texture | null },
  uShadowOn: { value: 0 },
  uShadowBias: { value: 0.0006 },
  uShadowTexel: { value: 1 / 2048 },
  uShadowTexelM: { value: 0.001 },
  uFocusM: { value: 1 },
  uFocusNear: { value: 1 },
  uCocScale: { value: 0 },
  uFocusCoc: { value: 1.5 },
  uWorldExposure: { value: 1 },
  uDiag: { value: 0 },
  uSize: { value: new THREE.Vector2(1, 1) },
}

export const glslHead = /* glsl */ `precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DShadow;
`

export const glslCommon = /* glsl */ `
uniform float uShutter;
uniform float uTime;
uniform float uReal;
uniform float uWorldTime;
uniform int uFrame;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyHorizonSun;
uniform vec3 uGroundBounce;
uniform vec3 uAirSun;
uniform vec3 uAirZenith;
uniform vec3 uAirHorizon;
uniform vec3 uFogColor;
uniform vec3 uFogSunTint;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform float uSkyEven;
uniform float uKeyClear;
uniform vec3 uCamPos;
uniform float uFocusM;
uniform float uFocusNear;
uniform float uCocScale;
uniform float uFocusCoc;
uniform float uWorldExposure;
uniform int uDiag;
uniform vec2 uSize;

float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec3 saturate(vec3 x) { return clamp(x, 0.0, 1.0); }

// The blur circle, in pixels across, of a thing at this depth along the lens axis. Everything from uFocusNear to uFocusM is sharp and the blur grows from those two ends.
// For a lens focused at one distance the two are equal.
float cocOf(float viewDepth) {
  float inv = 1.0 / max(viewDepth, 1e-4);
  return min(uCocScale * max(max(1.0 / uFocusM - inv, inv - 1.0 / uFocusNear), 0.0), 2048.0);
}

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

export const glslVertex = /* glsl */ `
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
`

export const glslLight = /* glsl */ `
uniform mat4 uShadowMatrix;
uniform sampler2DShadow uShadowMap;
uniform float uShadowOn;
uniform float uShadowBias;
uniform float uShadowTexel;
uniform float uShadowTexelM;
uniform float uStandIn;
layout(location = 0) out vec4 outColor;

float sunShadow(vec3 worldPos, vec3 offsetDir, float offsetM) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 sc = uShadowMatrix * vec4(worldPos + offsetDir * offsetM, 1.0);
  vec3 p = sc.xyz / sc.w;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float z = p.z - uShadowBias;
  float t = uShadowTexel;
  float s = texture(uShadowMap, vec3(p.xy + vec2(-0.5, -0.5) * t, z));
  s += texture(uShadowMap, vec3(p.xy + vec2(0.5, -0.5) * t, z));
  s += texture(uShadowMap, vec3(p.xy + vec2(-0.5, 0.5) * t, z));
  s += texture(uShadowMap, vec3(p.xy + vec2(0.5, 0.5) * t, z));
  return s * 0.25;
}

vec3 skyAmbient(vec3 n) {
  float t = n.y * 0.5 + 0.5;
  vec3 upper = mix(uSkyHorizon, uSkyZenith, smoothstep(0.55, 1.0, t));
  return mix(uGroundBounce, upper, smoothstep(0.15, 0.6, t));
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

vec3 heat(float t) {
  t = saturate(t);
  return saturate(vec3(1.5 - abs(4.0 * t - 3.0), 1.5 - abs(4.0 * t - 2.0), 1.5 - abs(4.0 * t - 1.0)));
}

// texelsPerPixel below zero means the surface has no texture behind it
vec4 finish(vec3 color, vec3 worldPos, float viewDepth, float texelsPerPixel) {
  float coc = cocOf(viewDepth);
  if (uDiag == 7) return vec4(uStandIn > 0.5 ? vec3(1.0, 0.0, 0.6) : vec3(dot(color, vec3(0.3, 0.6, 0.1))), coc);
  if (uDiag == 4) return vec4(texelsPerPixel < 0.0 ? vec3(0.03) : heat(texelsPerPixel * 0.5), texelsPerPixel < 0.0 ? -1.0 : (coc < uFocusCoc ? texelsPerPixel : -2.0));
  if (uDiag == 5) return vec4(vec3(viewDepth), coc);
  if (uDiag == 6) return vec4(coc < uFocusCoc ? vec3(0.1, 1.0, 0.3) : vec3(dot(color, vec3(0.3, 0.6, 0.1))) * 0.5, coc);
  return vec4(applyFog(color, worldPos), coc);
}

float texelDensity(vec2 uv, vec2 textureSize) {
  vec2 dx = dFdx(uv) * textureSize;
  vec2 dy = dFdy(uv) * textureSize;
  return sqrt(max(dot(dx, dx), dot(dy, dy)));
}
`

export interface SurfaceOptions {
  name: string
  vertex: string
  fragment: string
  uniforms?: Record<string, THREE.IUniform>
  side?: THREE.Side
  transparent?: boolean
  depthWrite?: boolean
  additive?: boolean
  // Writes nothing but the blur circle, and only where it is smaller than the one already there. For a thin thing drawn see-through that must stay as sharp as it is.
  cocOnly?: boolean
  standIn?: boolean
  castShadow?: boolean
  // The body of the shadow pass, for a surface with holes cut in it: it may only discard. It gets the same varyings as the fragment shader.
  depthFragment?: string
}

export interface Surface { main: THREE.RawShaderMaterial; depth: THREE.RawShaderMaterial | null }

const depthFragment = /* glsl */ `${glslHead}
layout(location = 0) out vec4 outColor;
void main() {
  outColor = vec4(1.0);
}
`

export function makeSurface(o: SurfaceOptions): Surface {
  const uniforms = { ...shared, uStandIn: { value: o.standIn ? 1 : 0 }, ...(o.uniforms ?? {}) }
  const main = new THREE.RawShaderMaterial({
    name: o.name,
    glslVersion: THREE.GLSL3,
    vertexShader: `${glslHead}${glslVertex}${glslCommon}\n${o.vertex}`,
    fragmentShader: `${glslHead}${glslCommon}${glslLight}\n${o.fragment}`,
    uniforms,
    side: o.side ?? THREE.FrontSide,
    transparent: o.transparent ?? false,
    depthWrite: o.depthWrite ?? !(o.transparent ?? false),
    blending: THREE.NoBlending,
  })
  if (o.transparent) {
    main.blending = THREE.CustomBlending
    main.blendSrc = o.additive ? THREE.OneFactor : THREE.SrcAlphaFactor
    main.blendDst = o.additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor
    main.blendSrcAlpha = THREE.ZeroFactor
    main.blendDstAlpha = THREE.OneFactor
  }
  if (o.cocOnly) {
    main.blendSrc = THREE.ZeroFactor
    main.blendDst = THREE.OneFactor
    main.blendEquationAlpha = THREE.MinEquation
    main.blendSrcAlpha = THREE.OneFactor
    main.blendDstAlpha = THREE.OneFactor
  }
  const cast = o.castShadow ?? !(o.transparent ?? false)
  const depth = cast
    ? new THREE.RawShaderMaterial({
        name: `${o.name} depth`,
        glslVersion: THREE.GLSL3,
        vertexShader: `${glslHead}#define DEPTH_PASS 1\n${glslVertex}${glslCommon}\n${o.vertex}`,
        fragmentShader: o.depthFragment ? `${glslHead}${glslCommon}\nlayout(location = 0) out vec4 outColor;\n${o.depthFragment}` : depthFragment,
        uniforms,
        side: THREE.DoubleSide,
        colorWrite: false,
      })
    : null
  return { main, depth }
}
