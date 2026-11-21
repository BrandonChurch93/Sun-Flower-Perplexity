// Stand-ins until the soil's own furrow lands: a bank that leaves one long hollow along the furrow's course, and the level the water stands at in it.
export const standInLevelM = 0.014

export const standInBank = /* glsl */ `
float furrowBank(vec2 p, float cut) {
  vec2 f = furrowPlace(p);
  float wide = furrowHalf(f.y) * (0.8 + 0.2 * cut) + 0.014 * (valueNoise(p * 17.0) - 0.5);
  float side = abs(f.x) - wide + 0.014;
  float end = f.y - mix(-0.15, 0.27, cut);
  float off = max(side, end * 0.5);
  return 0.06 * smoothstep(-0.01, 0.05, off) - 0.006 * (1.0 - smoothstep(-0.05, 0.0, off));
}
`
