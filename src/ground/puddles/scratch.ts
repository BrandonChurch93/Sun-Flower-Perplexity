// Stand-ins until the soil's own furrow lands: a bank that leaves one long hollow from the lower left of the rain key to the foot of the plant, and the level the water stands at in it.
export const standInLevelM = 0.014
export const standInRiseM = 0.005

export const standInBank = /* glsl */ `
float furrowBank(vec2 p, float spread) {
  float a = dot(p, uRight);
  float d = -dot(p, uToward);
  float k = saturate((d + 0.75) / 0.8);
  float mid = mix(-0.2, -0.045, k * k) + 0.022 * sin(d * 13.0 + 1.0);
  float wide = mix(0.1, 0.028, k) * (0.8 + 0.2 * spread) + 0.02 * (valueNoise(p * 17.0) - 0.5);
  float side = abs(a - mid) - wide;
  float end = d - mix(-0.12, 0.035, spread);
  float out2 = max(side, end * 0.6);
  return 0.06 * smoothstep(-0.01, 0.05, out2) - 0.006 * (1.0 - smoothstep(-0.05, 0.0, out2));
}
`
