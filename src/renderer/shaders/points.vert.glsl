#version 300 es
precision highp float;
in vec3 aChunkOffset;

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
uniform float uTanHalf;
uniform float uAspect;

out vec3 vColor;
out vec3 vCenterView;
out float vRadius;
out vec2 vNdcCenter;
out vec2 vNdcExtent;

void main() {
  int id = gl_VertexID;
  int sh = int(uShift + 0.5);
  int mask = int(uMask + 0.5);
  int ix = id & mask;
  int iy = (id >> sh) & mask;
  int iz = id >> (sh + sh);
  vec3 c = (aChunkOffset + vec3(float(ix), float(iy), float(iz))) * uK + uHalfK;
  vec3 center = (c - uLatticeHalf) * uSpacing;
  vec3 col = clamp(floor(c + 0.5), 0.0, uLatticeMax) / uLatticeMax;
  vec4 vc = uView * vec4(center, 1.0);
  float viewZ = max(-vc.z, 1e-6);
  float t = length(vc.xy) / viewZ;
  float ta = uRadius / sqrt(max(dot(vc.xyz, vc.xyz) - uRadius * uRadius, 1e-6));
  float extTan = (t + ta) / max(1.0 - t * ta, 1e-3) - t;
  float sizeTan = min(extTan, uMaxPoint / (2.0 * uProjScale));
  vec4 clip = uProj * vc;
  gl_PointSize = clamp(2.0 * uProjScale * extTan, 1.0, uMaxPoint);
  gl_Position = clip;
  vColor = col;
  vCenterView = vc.xyz;
  vRadius = uRadius;
  vNdcCenter = clip.xy / max(clip.w, 1e-6);
  vNdcExtent = vec2(sizeTan / (uTanHalf * uAspect), sizeTan / uTanHalf);
}
