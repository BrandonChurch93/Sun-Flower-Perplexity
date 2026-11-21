// The skin of the plant: one way of lighting every part of it.
// `real` turns true once this folder holds the plant's skin at its real quality.
export const real = false

// A part fills a Tissue for the pixel and gives it to shadeTissue. Needs the chunks of `makePartSurface` before it.
export const tissueGlsl = /* glsl */ `
struct Tissue {
  // The color of the skin.
  vec3 albedo;
  // The color of sunlight that has come through from the far side. Black for a part too thick to light up.
  vec3 through;
  // The normal used for light, in the world, with the relief of the skin in it, on the viewer's side.
  vec3 normal;
  // The normal of the surface itself, on the viewer's side.
  vec3 face;
  // 0 glossy to 1 dull.
  float rough;
  // How strong the glossy layer is, 0 to 1.
  float wax;
  // How strongly fine hair lights up along an edge against the light, 0 to 1.
  float sheen;
  // 1 open to 0 buried: creases, the inside of the bud, the foot of a petal.
  float occlusion;
};

// A normal bent by a height in meters, with no need of tangents.
vec3 reliefNormal(vec3 n, vec3 world, float height, float strength) {
  vec3 dx = dFdx(world);
  vec3 dy = dFdy(world);
  float hx = dFdx(height);
  float hy = dFdy(height);
  vec3 r1 = cross(dy, n);
  vec3 r2 = cross(n, dx);
  float det = dot(dx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  return normalize(abs(det) * n - strength * grad);
}

vec3 shadeTissue(Tissue t, vec3 world, vec3 view) {
  float ndl = dot(t.normal, uSunDir);
  vec3 lit = dot(t.face, uSunDir) >= 0.0 ? t.face : -t.face;
  float sun = plantSun(world, lit);
  float sky = plantSky(world) * t.occlusion;
  vec3 albedo = t.albedo * plantTone();
  vec3 color = albedo * (uSunColor * max(ndl, 0.0) * sun + skyAmbient(t.normal) * sky);
  color += t.through * (uSunColor * max(-ndl, 0.0) * sun + skyAmbient(-t.normal) * sky) * 0.25;
  vec3 h = normalize(uSunDir + view);
  float shine = pow(max(dot(t.normal, h), 0.0), mix(120.0, 8.0, t.rough)) * t.wax;
  color += uSunColor * shine * 0.08 * sun * step(0.0, ndl);
  float rim = pow(1.0 - saturate(dot(t.normal, view)), 4.0);
  color += uSunColor * rim * t.sheen * 0.06 * sun * saturate(0.4 + dot(-view, uSunDir));
  return color;
}
`
