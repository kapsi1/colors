#version 300 es
precision highp float;

in vec3 aCenter;
in vec3 aColor;
in float aRadius;

uniform mat4 uView;
uniform mat4 uProj;

out vec3 vColor;
out vec3 vCenterView;
out float vViewZ;
out float vRadius;
out vec2 vCorner;

void main() {
  vec2 corner = vec2(
    ((gl_VertexID & 1) == 1) ? 1.0 : -1.0,
    ((gl_VertexID & 2) == 2) ? 1.0 : -1.0
  );
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);
  vec3 up = vec3(uView[0][1], uView[1][1], uView[2][1]);
  vec4 vc = uView * vec4(aCenter, 1.0);
  vec3 pos = vc.xyz + (right * corner.x + up * corner.y) * aRadius;
  gl_Position = uProj * vec4(pos, 1.0);
  vColor = aColor;
  vCenterView = vc.xyz;
  vViewZ = max(-vc.z, 1e-6);
  vRadius = aRadius;
  vCorner = corner;
}
