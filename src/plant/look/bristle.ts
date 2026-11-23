// A bristle of the stem or a stalk at the close lens reads vWorld, vNormal, vDepth, vBristle (x along it from 0 at its foot to 1 at its tip, y its own number from 0 to 1, z its length and w its radius there, in meters) and the tissue text.
export const bristleMain = /* glsl */ `void main() {
  vec3 view = normalize(uCamPos - vWorld);
  vec3 face = normalize(vNormal);
  if (dot(face, view) < 0.0) face = -face;
  float along = vBristle.x;
  // One long clear cell, near white and glassy, on a dome of small green cells with a dark ring where it leaves them.
  float foot = 1.0 - smoothstep(0.05, 0.22, along);
  float ring = smoothstep(0.0, 0.06, along) * foot;
  vec3 cell = vec3(0.34, 0.36, 0.31) * (0.9 + 0.2 * vBristle.y);
  vec3 dome = mix(vec3(0.08, 0.12, 0.025), vec3(0.04, 0.03, 0.018), ring);
  float limb = 1.0 - abs(dot(face, view));
  Tissue t;
  t.albedo = mix(cell, dome, foot);
  t.through = mix(vec3(1.5, 1.45, 1.38) * (0.6 + 0.4 * limb), vec3(0.05, 0.07, 0.012), foot);
  t.face = face;
  t.normal = face;
  t.rough = mix(0.3, 0.8, foot);
  t.wax = mix(0.7, 0.15, foot);
  t.sheen = 0.0;
  t.occlusion = 1.0 - 0.4 * foot;
  outColor = finish(shadeTissue(t, vWorld, view), vWorld, vDepth, -1.0);
}
`
