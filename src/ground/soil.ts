// The soil's tile is the scan's own size on the ground, and its mean brightness comes from the recipe.
export const soilTileM = 1.3
export const soilMeanLuma = 0.1413
export const litterTileM = 2.9
export const ridgeHeightM = 0.07

export const soilFragment = /* glsl */ `
in vec3 vWorld;
in float vDepth;
uniform sampler2D tColor;
uniform sampler2D tData;
uniform sampler2D tLitter;
uniform vec2 uColorSize;
uniform float uWet;
uniform float uFrost;
uniform float uCover;
uniform vec2 uToward;
uniform vec2 uRight;
uniform vec3 uRows;
uniform vec3 uTiles;
uniform float uLitter;

const mat2 TURN_B = mat2(0.788, 0.616, -0.616, 0.788);
const mat2 TURN_W = mat2(0.454, -0.891, 0.891, 0.454);

void main() {
  vec2 p = vWorld.xz;
  float d = -dot(p, uToward);
  float along = dot(p, uRight);
  vec2 uvA = p * uTiles.x;
  vec2 uvB = TURN_B * p * (uTiles.x * 0.73) + vec2(0.37, 0.61);
  vec4 cA = texture(tColor, uvA);
  vec4 dA = texture(tData, uvA);
  vec4 cB = texture(tColor, uvB);
  vec4 dB = texture(tData, uvB);
  float blend = valueNoise(p * 1.9 + 31.0);
  float w = saturate((blend - 0.5) * 3.5 + 0.5 + (dB.a - dA.a) * 1.2);
  vec3 albedo = mix(cA.rgb, cB.rgb, w);
  float h = mix(dA.a, dB.a, w);
  float rough = mix(dA.b, dB.b, w);
  vec2 g = mix(dA.rg * 2.0 - 1.0, (dB.rg * 2.0 - 1.0) * TURN_B, w);

  vec3 wide = texture(tColor, TURN_W * p * uTiles.y + vec2(0.13, 0.77)).rgb;
  float tone = dot(wide, vec3(0.3, 0.6, 0.1)) * uTiles.z;
  float big = 0.6 * valueNoise(p * 0.13 + 7.0) + 0.4 * valueNoise(p * 0.037 + 3.0);
  albedo *= mix(0.7, 1.25, saturate(tone * 0.5)) * mix(0.82, 1.16, big);

  float rowAmt = smoothstep(0.6, 1.3, d);
  float phase = 6.2832 * ((d - uRows.y) / uRows.x + (valueNoise(vec2(along * 0.7, d * 0.4)) - 0.5) * 0.14);
  float ridge = 0.5 + 0.5 * cos(phase);
  float slope = uRows.z * 3.1416 / uRows.x * sin(phase) * rowAmt;
  float clod = mix(1.0, mix(0.45, 1.15, ridge), rowAmt);
  albedo *= mix(1.0, mix(0.74, 1.07, ridge), rowAmt);
  vec2 tilt = g * 1.6 * clod - uToward * slope;
  vec3 n = normalize(vec3(tilt.x, 1.0, tilt.y));

  float under = uCover * smoothstep(0.9, 1.7, d);
  vec4 litter = texture(tLitter, TURN_W * p * uLitter + vec2(0.21, 0.43));
  albedo = mix(albedo, litter.rgb, litter.a * smoothstep(0.7, 1.6, d) * mix(0.45, 1.0, uCover) * mix(1.0, 0.7, ridge));

  albedo = mix(albedo, albedo * 0.45, uWet);
  albedo = mix(albedo, vec3(0.75, 0.8, 0.85), uFrost * smoothstep(0.45, 0.8, h) * (1.0 - 0.7 * under));
  float ndl = max(dot(n, uSunDir), 0.0);
  float lit = sunShadow(vWorld, vec3(0.0, 1.0, 0.0), uShadowTexelM * 1.5);
  float open = (0.5 + 0.5 * h) * mix(1.0, 0.72 + 0.28 * ridge, rowAmt);
  vec3 shade = mix(vec3(1.0), vec3(0.2, 0.235, 0.14), under);
  vec3 color = albedo * (uSunColor * ndl * lit * (1.0 - 0.85 * under) + skyAmbient(n) * open * shade);
  vec3 v = normalize(uCamPos - vWorld);
  vec3 hv = normalize(v + uSunDir);
  color += uSunColor * pow(max(dot(n, hv), 0.0), 40.0) * uWet * 0.25 * lit * (1.3 - rough);
  outColor = finish(color, vWorld, vDepth, texelDensity(uvA, uColorSize));
}
`
