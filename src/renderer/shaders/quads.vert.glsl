#version 300 es
precision highp float;

in vec3 aCenter;
in vec3 aColor;
in float aRadius;

uniform mat4 uView;
uniform mat4 uProj;
uniform float uTanHalf;
uniform float uAspect;

out vec3 vColor;
out vec3 vCenterView;
out float vRadius;
out vec2 vNdcCenter;
out vec2 vNdcExtent;
out vec2 vCorner;

void main() {
  vec2 corner = vec2(
    ((gl_VertexID & 1) == 1) ? 1.0 : -1.0,
    ((gl_VertexID & 2) == 2) ? 1.0 : -1.0
  );
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);
  vec3 up = vec3(uView[0][1], uView[1][1], uView[2][1]);
  vec4 vc = uView * vec4(aCenter, 1.0);
  float viewZ = max(-vc.z, 1e-6);
  float t = length(vc.xy) / viewZ;
  float ta = aRadius / sqrt(max(dot(vc.xyz, vc.xyz) - aRadius * aRadius, 1e-6));
  float extTan = (t + ta) / max(1.0 - t * ta, 1e-3) - t;
  float ext = viewZ * extTan * 1.02;
  vec3 pos = vc.xyz + (right * corner.x + up * corner.y) * ext;
  vec4 clip = uProj * vec4(pos, 1.0);
  vec4 centerClip = uProj * vc;
  gl_Position = clip;
  vColor = aColor;
  vCenterView = vc.xyz;
  vRadius = aRadius;
  vNdcCenter = centerClip.xy / max(centerClip.w, 1e-6);
  vNdcExtent = vec2(extTan / (uTanHalf * uAspect), extTan / uTanHalf);
  vCorner = corner;
}
