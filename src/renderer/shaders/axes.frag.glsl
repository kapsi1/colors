#version 300 es
precision highp float;

in vec3 vColor;
in float vParam;

uniform float uDash;
uniform float uDashPeriod;
uniform float uDashLen;

out vec4 fragColor;

void main() {
  if (uDash > 0.5 && mod(vParam, uDashPeriod) > uDashLen) discard;
  fragColor = vec4(vColor, 1.0);
}
