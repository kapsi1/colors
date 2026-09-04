#version 300 es
precision highp float;

in vec3 vColor;
in vec3 vCenterView;
in float vViewZ;
in float vRadius;
in vec2 vCorner;

out vec4 fragColor;

%%COMMON%%

void main() {
  fragColor = renderSphere(vColor, vCenterView, vViewZ, vRadius, vCorner);
}
