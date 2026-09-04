#version 300 es
precision highp float;

in vec3 vColor;
in vec3 vCenterView;
in float vViewZ;
in float vRadius;

out vec4 fragColor;

%%COMMON%%

void main() {
  vec2 p = vec2(gl_PointCoord.x * 2.0 - 1.0, 1.0 - gl_PointCoord.y * 2.0);
  fragColor = renderSphere(vColor, vCenterView, vViewZ, vRadius, p);
}
