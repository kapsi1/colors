uniform vec3 uBgColor;
uniform vec2 uFogRange;
uniform float uFogOn;
uniform float uShadeOn;

bool sphereHit(vec3 ro, vec3 rd, vec3 center, float r, out vec3 normal, out float tHit) {
  vec3 oc = ro - center;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - r * r;
  float h = b * b - c;
  if (h < 0.0) return false;
  tHit = -b - sqrt(h);
  normal = (ro + tHit * rd - center) / r;
  return true;
}

vec3 shadeSphere(vec3 base, vec3 n, float viewZ) {
  vec3 L = normalize(vec3(-0.35, 0.55, 0.75));
  float wrap = clamp((dot(n, L) + 0.7) / 1.7, 0.0, 1.0);
  vec3 lit = base * (0.78 + 0.34 * wrap);
  vec3 col = mix(base, lit, uShadeOn);
  float f = clamp((viewZ - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
  return mix(col, uBgColor, uFogOn * f);
}

vec4 renderSphere(vec3 color, vec3 centerView, float viewZ, float radius, vec2 offset) {
  vec3 rd = normalize(centerView + vec3(offset * radius, 0.0));
  vec3 n;
  float t;
  if (!sphereHit(vec3(0.0), rd, centerView, radius, n, t)) discard;
  return vec4(shadeSphere(color, n, viewZ), 1.0);
}
