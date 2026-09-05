#version 300 es
precision highp float;

in vec3 vColor;
in vec3 vCenterView;
in float vRadius;
uniform vec2 uViewport;

out vec4 fragColor;

%%COMMON%%

void main() {
  vec2 ndc = gl_FragCoord.xy / uViewport * 2.0 - 1.0;
  fragColor = renderSphere(vColor, vCenterView, vRadius, ndc);
}
