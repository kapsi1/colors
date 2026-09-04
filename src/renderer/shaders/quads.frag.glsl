#version 300 es
precision highp float;

in vec3 vColor;
in vec3 vCenterView;
in float vRadius;
in vec2 vNdcCenter;
in vec2 vNdcExtent;
in vec2 vCorner;

out vec4 fragColor;

%%COMMON%%

void main() {
  fragColor = renderSphere(vColor, vCenterView, vRadius, vNdcCenter, vNdcExtent, vCorner);
}
