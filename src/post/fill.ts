import { glslCommon } from '../core/shading.ts'

export const maxFillPx = 96

// A channel of the frame that is not a number or is infinite is taken as nothing. Said in two ways, because a driver may drop either.
export const sound = /* glsl */ `
vec3 sound(vec3 c) {
  bvec3 lost = bvec3(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b));
  return min(max(mix(c, vec3(0.0), lost), 0.0), 65504.0);
}
// A circle that is not a number or is infinite is taken as sharp. Said in two ways as well.
float circleOf(float a) {
  if (isnan(a) || isinf(a)) return 0.0;
  return a >= 0.0 && a < 65504.0 ? a : 0.0;
}
`

export const skyness = /* glsl */ `
uniform float uFar;
// The sky arrives already blurred, with exactly the circle of infinity in alpha: it has no copies to join. The frame holds that circle in sixteen bits, which is good to one part in two thousand, so land is told from sky up to about a thousand times the focus distance and no further.
float sky(float a) {
  return uFar > 0.0 ? 1.0 - smoothstep(0.0006, 0.0012, abs(a / uFar - 1.0)) : 0.0;
}
`

// The radius over which each pixel is spread. Where the frame is the sum of several places on the lens the sharp zone is grown by one pixel, so the soft edge pixels of a sharp thing keep their own color; a frame drawn through one place has no such pixels, and there the growth would leave a ring of unblurred ground round every hair.
export const reachFragment = /* glsl */ `${glslCommon}
uniform sampler2D tFrame;
uniform sampler2D tNear;
uniform float uRadiusScale;
uniform float uSpecks;
uniform float uSkyHold;
uniform float uExposure;
uniform float uDiscScale;
uniform float uGrow;
uniform float uMixed;
uniform sampler2D tPure;
uniform float uPure;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
${skyness}${sound}
float circle(ivec2 q, float near) {
  float a = circleOf(texelFetch(tFrame, q, 0).a);
  return a * max(1.0 - sky(a), near);
}
#define RING(o) { ivec2 q = p + o; if (q == clamp(q, ivec2(0), top)) { vec3 n = sound(texelFetch(tFrame, q, 0).rgb); ring = max(ring, max(n.r, max(n.g, n.b))); } }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 top = ivec2(uSize) - 1;
  vec4 c = texelFetch(tFrame, p, 0);
  c.a = circleOf(c.a);
  float near = uFar > 0.0 ? texture(tNear, vUv).r : 1.0;
  float a = circle(p, near);
  if (uMixed > 0.5) {
    // The frame is the sum of several pictures drawn through one place on the lens: a pixel on the edge of a thing holds a share of the thing and a share of what lies behind, and the mean of their two circles. Spread by that mean, a hair in front of blurred ground would dissolve. So the pixel is taken for the thing: it keeps the thing's own circle, and the ground's share of it is put right after the fill.
    float most = c.a;
    ivec2 way = ivec2(0);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      float n = circleOf(texelFetch(tFrame, clamp(p + ivec2(i, j), ivec2(0), top), 0).a);
      if (n > most) { most = n; way = ivec2(i, j); }
    }
    float dip = (most - c.a) / max(most, 1e-3);
    if (dip > 0.08) {
      float thing = c.a;
      if (uPure > 0.5) {
        // One of the pictures alone has no shared pixels: the least circle it holds round here is the thing's own.
        for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) thing = min(thing, circleOf(texelFetch(tPure, clamp(p + ivec2(i, j), ivec2(0), top), 0).a));
      } else {
        // Without such a picture: away from the widest circle lies the thing itself. Where it goes on for two pixels at one circle, straight in and to both sides of that, the circle is its own. A hair seen along its length goes on straight in but not to the sides.
        float o1 = circleOf(texelFetch(tFrame, clamp(p - way, ivec2(0), top), 0).a);
        float o2 = circleOf(texelFetch(tFrame, clamp(p - 2 * way, ivec2(0), top), 0).a);
        float o3 = circleOf(texelFetch(tFrame, clamp(p - 2 * clamp(ivec2(way.x - way.y, way.x + way.y), ivec2(-1), ivec2(1)), ivec2(0), top), 0).a);
        float o4 = circleOf(texelFetch(tFrame, clamp(p - 2 * clamp(ivec2(way.x + way.y, way.y - way.x), ivec2(-1), ivec2(1)), ivec2(0), top), 0).a);
        if (abs(o1 - o2) <= 0.1 * o1 + 0.25 && o1 <= 1.1 * c.a + 0.25 && max(o3, o4) <= 1.1 * o1 + 0.25) thing = min(c.a, o1);
        else {
          // Where it does not, the thing is thinner than the pixel. The least circle round here is the most its own can be, and what it would be if the thing filled at least half of a pixel is the least. A hair stands on a body: with a sharp one close by it is taken for sharp, and without one for as soft as the least circle says.
          float least = c.a;
          float under = 0.0;
          for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
            float n = circleOf(texelFetch(tFrame, clamp(p + ivec2(i, j), ivec2(0), top), 0).a);
            least = min(least, n);
            under += step(n, 0.92 * most);
          }
          float body = least;
          for (int k = 0; k < 8; k++) {
            vec2 d = vec2(cos(0.7853982 * float(k)), sin(0.7853982 * float(k)));
            body = min(body, circleOf(texelFetch(tFrame, clamp(p + ivec2(round(5.0 * d)), ivec2(0), top), 0).a));
            body = min(body, circleOf(texelFetch(tFrame, clamp(p + ivec2(round(9.0 * d)), ivec2(0), top), 0).a));
            body = min(body, circleOf(texelFetch(tFrame, clamp(p + ivec2(round(14.0 * d)), ivec2(0), top), 0).a));
          }
          float sharp = 1.0 - smoothstep(1.0, 2.5, body * uRadiusScale);
          // One thin thing is a line and stands in ten of these pixels at most. More of them under the ground's circle, and none of them sharp, is a tangle of several soft things, each at its own distance: there the least circle is another thing's, and the pixel keeps its own.
          float tangle = smoothstep(10.0, 15.0, under) * smoothstep(1.0, 2.5, least * uRadiusScale);
          thing = mix(mix(least, clamp(2.0 * least - most, 0.0, least), sharp), c.a, tangle);
        }
      }
      a = mix(a, thing, smoothstep(0.08, 0.2, dip));
    }
  }
  if (uGrow > 0.5) {
    a = min(a, circle(min(p + ivec2(1, 0), top), near));
    a = min(a, circle(max(p - ivec2(1, 0), ivec2(0)), near));
    a = min(a, circle(min(p + ivec2(0, 1), top), near));
    a = min(a, circle(max(p - ivec2(0, 1), ivec2(0)), near));
  }
  // A lone pixel far brighter than everything round it is a sampling accident, not a light: no lens draws a point one pixel wide. In focus it is held to twice its brightest neighbor, so it neither sits as a hard dot nor blooms.
  vec3 rgb = sound(c.rgb);
  float most = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 q = p + ivec2(i, j);
    // A place past the border of the frame is nobody's neighbor: read as the border pixel again, a light on the border row would be its own surround and never be held.
    if ((i == 0 && j == 0) || q != clamp(q, ivec2(0), top)) continue;
    vec3 n = sound(texelFetch(tFrame, q, 0).rgb);
    most = max(most, max(n.r, max(n.g, n.b)));
  }
  float ring = 0.0;
  RING(ivec2(3, 0)) RING(ivec2(-3, 0)) RING(ivec2(0, 3)) RING(ivec2(0, -3)) RING(ivec2(2, 2)) RING(ivec2(-2, 2)) RING(ivec2(2, -2)) RING(ivec2(-2, -2))
  float own = max(rgb.r, max(rgb.g, rgb.b));
  float wide = max(a, 0.0) * uRadiusScale;
  float blurred = smoothstep(2.0, 4.0, wide);
  // Out of focus a small light far over its surround and over white is a glint, and its disc is drawn after the blur: what stands over the surround is taken out here, if the disc it makes is bright enough to be seen. A fainter one stays and is blurred with the rest.
  float limit = max(3.0 * ring, 2.0 / uExposure);
  float size = clamp(uDiscScale * c.a, 1.5, ${maxFillPx.toFixed(1)});
  float seen = smoothstep(0.004, 0.016, (own - limit) * uExposure / (3.14159265 * size * size));
  float land = mix(mix(min(1.0, (2.0 * most + 0.02) / max(own, 1e-6)), 1.0, blurred), min(1.0, limit / max(own, 1e-6)), blurred * seen);
  // The sky arrives blurred: with specks in the air a lone bright pixel of it is a light and stays.
  float air = mix(min(1.0, (2.0 * most + 0.02) / max(own, 1e-6)), 1.0, uSpecks * smoothstep(1.5, 3.0, c.a));
  rgb *= mix(land, air, sky(c.a));
  float reach = min(wide, ${maxFillPx.toFixed(1)});
  // A held sky pixel carries its reach with the sign turned: the fill reads that as a place that gathers but is never gathered. Only pure sky is held: one lens sample of a far hill in the pixel and it is the first step of that hill's edge, which has to be smoothed.
  outColor = vec4(rgb, uSkyHold > 0.5 && uFar > 0.0 && abs(c.a / uFar - 1.0) < 0.0002 ? -reach : reach);
}
`

export function discTaps(rings: number): [number, number, number][] {
  const taps: [number, number, number][] = []
  for (let j = 1; j <= rings; j++) {
    const n = 6 * j
    const r = j / (rings + 0.5)
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.37 * j) / n) * 2 * Math.PI
      taps.push([Math.cos(a) * r, Math.sin(a) * r, r])
    }
  }
  return taps
}

// Where blurred things stand close enough that their copies fall across the sky: there the sky is filled with them, as far as the horizon needs.
export function nearFragment(): string {
  const taps = discTaps(3)
    .map(([x, y, r]) => `  TAP(vec2(${x.toFixed(5)}, ${y.toFixed(5)}), ${r.toFixed(5)})`)
    .join('\n')
  return /* glsl */ `${glslCommon}
uniform sampler2D tFrame;
uniform float uRadiusScale;
uniform float uReach;
in vec2 vUv;
layout(location = 0) out vec4 outColor;
${skyness}${sound}
float needs(vec2 at, ivec2 top) {
  float a = circleOf(texelFetch(tFrame, clamp(ivec2(at), ivec2(0), top), 0).a);
  return (1.0 - sky(a)) * smoothstep(0.5, 1.5, a * uRadiusScale);
}
#define TAP(o, len) near = max(near, needs(center + o * uReach, top) * (1.0 - smoothstep(0.6, 1.0, len)));
void main() {
  ivec2 top = ivec2(uSize) - 1;
  vec2 center = vUv * uSize;
  float near = needs(center, top);
${taps}
  outColor = vec4(near);
}
`
}

// Rings close round the pixel, read only for what stands in front: a thing blurred less than the pixel reaches it from near by, where the rings of the disc hardly look.
const INNER = [0.05, 0.08, 0.125, 0.19]

// Each pixel gathers the neighbors whose own blur circle reaches it, and none past the border of the frame: read as the border pixel again and again, a light on the border row would be spread as a half disc many times too bright. A sharp neighbor reaches nobody, so the head never bleeds into the field behind it, and a sharp pixel gathers nothing.
// With `front` a neighbor blurred less than the pixel is taken as standing before it: it covers the pixel by the share of its own small circle that the tap stands for, so that the soft edge of a nearer thing is as deep on the far side of its outline as on the near side.
export function fillFragment(rings: number, front = false): string {
  const outer = (rings - 0.5) / (rings + 0.5)
  const first = 1 / (rings + 0.5)
  const bounds = [0, ...INNER.map((r, i) => Math.sqrt(r * (INNER[i + 1] ?? first)))]
  const disc = discTaps(rings)
  const share = (r: number): number => {
    const j = Math.round(r * (rings + 0.5))
    const lo = j === 1 ? bounds[bounds.length - 1] : (j - 0.5) / (rings + 0.5)
    const hi = Math.min(1, (j + 0.5) / (rings + 0.5))
    return (hi * hi - lo * lo) / (6 * j)
  }
  // Written out tap by tap: the software rasterizer runs straight code several times faster than a loop over a table.
  const taps = disc.map(([x, y, r]) => `  TAP(vec2(${x.toFixed(5)}, ${y.toFixed(5)}), ${r.toFixed(5)}, ${r > outer ? 'rim' : '1.0'}, ${front ? share(r).toFixed(5) : '0.0'})`).join('\n')
  const inner = !front
    ? ''
    : INNER.flatMap((r, i) =>
        Array.from({ length: 6 }, (_, k) => {
          const a = ((k + 0.5 * i) / 6) * 2 * Math.PI
          return `  NEAR(vec2(${(Math.cos(a) * r).toFixed(5)}, ${(Math.sin(a) * r).toFixed(5)}), ${r.toFixed(5)}, ${((bounds[i + 1] ** 2 - bounds[i] ** 2) / 6).toFixed(6)})`
        }),
      ).join('\n')
  return /* glsl */ `${glslCommon}
uniform sampler2D tFrame;
uniform float uSpread;
uniform float uEdge;
uniform float uSeed;
uniform float uTurn;
layout(location = 0) out vec4 outColor;
#define COVER(color, reach, w, area) { float e = w * area * min(radius * radius / max(reach * reach, 0.25), 144.0) * (1.0 - smoothstep(0.6, 0.9, reach / radius)); before += vec4(color, reach) * e; cover += e; }
#define TAP(o, len, gain, area) { ivec2 q = p + ivec2(round(turn * o)); ivec2 k = clamp(q, ivec2(0), top); vec4 s = texelFetch(tFrame, k, 0); float reach = abs(s.a) * uSpread; float w = q == k ? saturate(reach - len * radius + 1.0) : 0.0; vec3 color = s.a < 0.0 ? (held ? c.rgb : min(s.rgb, 2.0 * c.rgb + 0.004)) : s.rgb; sum += color * (w * gain); total += w * gain; ${front ? 'COVER(color, reach, w, area)' : ''} }
#define NEAR(o, len, area) { ivec2 q = p + ivec2(round(turn * o)); ivec2 k = clamp(q, ivec2(0), top); vec4 s = texelFetch(tFrame, k, 0); float reach = abs(s.a) * uSpread; float w = s.a < 0.0 || q != k ? 0.0 : saturate(reach - len * radius + 1.0); COVER(s.rgb, reach, w, area) }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 top = ivec2(uSize) - 1;
  vec4 c = texelFetch(tFrame, p, 0);
  float radius = abs(c.a) * uSpread;
  // A held sky pixel keeps its own color for the sky's share, and its neighbors take the sky from it without its points of light.
  bool held = c.a < 0.0;
  if (radius < 0.6) { outColor = c; return; }
  mat2 turn = mat2(radius, 0.0, 0.0, radius);
  if (radius > 2.5 && uTurn > 0.0) {
    // Past this size the taps stand more than a pixel apart, and a small light would be drawn as a lattice of its copies: turning them per pixel trades the lattice for fine noise the next pass smooths.
    float a = hash31(vec3(gl_FragCoord.xy, uSeed)) * 6.2831853 * smoothstep(2.5, 5.0, radius) * uTurn;
    float cs = cos(a) * radius;
    float sn = sin(a) * radius;
    turn = mat2(cs, sn, -sn, cs);
  }
  vec3 sum = c.rgb;
  float total = 1.0;
  float rim = 1.0 + uEdge;
  vec4 before = vec4(0.0);
  float cover = 0.0;
${taps}
${inner}
  vec4 result = vec4(sum / total, radius);
  // Where a nearer thing covers the pixel the pixel is from now on as blurred as that thing, so the rounds that follow smooth it no wider.
  // A held sky pixel that is covered stops being held and takes the covering thing's reach, so the cover is smoothed like any other.
  if (cover > 0.0) {
    result = mix(result, before / cover, min(cover, 1.0));
    if (held) result.a = before.a / cover;
  }
  outColor = vec4(result.rgb, (held && cover <= 0.0 ? -1.0 : 1.0) * result.a / uSpread);
}
`
}
