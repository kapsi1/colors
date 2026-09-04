#version 300 es
precision highp float;

in vec3 vColor;
in vec3 vCenterView;
in float vRadius;
in vec2 vNdcCenter;
in vec2 vNdcExtent;

out vec4 fragColor;

%%COMMON%%

void main() {
  vec2 p = vec2(gl_PointCoord.x * 2.0 - 1.0, 1.0 - gl_PointCoord.y * 2.0);
  fragColor = renderSphere(vColor, vCenterView, vRadius, vNdcCenter, vNdcExtent, p);
}
