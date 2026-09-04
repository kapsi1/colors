uniform vec3 uBgColor;
uniform vec2 uFogRange;
uniform float uFogOn;
uniform float uShadeOn;
uniform float uDebugView;
uniform float uTanHalf;
uniform float uAspect;

bool sphereHit(vec3 ro, vec3 rd, vec3 center, float r, out vec3 normal, out float tHit) {
  vec3 oc = ro - center;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - r * r;
  float h = b * b - c;
  if (h < 0.0) return false;
  tHit = -b - sqrt(h);
  if (tHit <= 0.0) return false;
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

vec4 renderSphere(
  vec3 color,
  vec3 centerView,
  float hitRadius,
  vec2 ndcCenter,
  vec2 ndcExtent,
  vec2 offset
) {
  vec2 ndc = ndcCenter + offset * ndcExtent;
  vec3 rd = normalize(vec3(ndc.x * uAspect * uTanHalf, ndc.y * uTanHalf, -1.0));
  vec3 n;
  float t;
  if (!sphereHit(vec3(0.0), rd, centerView, hitRadius, n, t)) discard;
  float viewZ = max(-centerView.z, 1e-6);
  if (uDebugView > 0.5) {
    return vec4(1.0 - clamp(viewZ / 8.0, 0.0, 1.0), abs(n.x), abs(n.y), 1.0);
  }
  return vec4(shadeSphere(color, n, viewZ), 1.0);
}
