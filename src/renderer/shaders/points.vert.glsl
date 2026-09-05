#version 300 es
precision highp float;
in vec3 aChunkOffset;

uniform int uColorModel;
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
  if (uColorModel != 0) {
    vec3 p = (c - uLatticeHalf) / uLatticeHalf;
    float s = length(p.xz);
    if (s > 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 1.0;
      return;
    }
    float h = (s == 0.0 ? 0.0 : atan(p.z, p.x)) / 6.28318530718;
    float t = (p.y + 1.0) * 0.5;
    float chroma = uColorModel == 1 ? (1.0 - abs(2.0 * t - 1.0)) * s : t * s;
    float m = uColorModel == 1 ? t - chroma * 0.5 : t - chroma;
    col = m + chroma * clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }
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
