#version 300 es
precision highp float;

uniform mat4 uView;
uniform mat4 uProj;
uniform float uK;
uniform float uHalfK;
uniform float uLatticeHalf;
uniform float uLatticeMax;
uniform float uSpacing;
uniform float uRadius;
uniform float uProjScale;
uniform float uMaxPoint;
uniform float uShift;
uniform float uMask;

out vec3 vColor;
out vec3 vCenterView;
out float vViewZ;
out float vRadius;

void main() {
  int id = gl_VertexID;
  int sh = int(uShift + 0.5);
  int mask = int(uMask + 0.5);
  int ix = id & mask;
  int iy = (id >> sh) & mask;
  int iz = id >> (sh + sh);
  vec3 c = vec3(float(ix), float(iy), float(iz)) * uK + uHalfK;
  vec3 center = (c - uLatticeHalf) * uSpacing;
  vec3 col = clamp(floor(c + 0.5), 0.0, uLatticeMax) / uLatticeMax;
  vec4 vc = uView * vec4(center, 1.0);
  float viewZ = max(-vc.z, 1e-6);
  gl_PointSize = clamp(2.0 * uRadius * uProjScale / viewZ, 1.0, uMaxPoint);
  gl_Position = uProj * vc;
  vColor = col;
  vCenterView = vc.xyz;
  vViewZ = viewZ;
  vRadius = uRadius;
}
