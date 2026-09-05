#version 300 es
precision highp float;

in vec3 aPos;
in vec3 aOther;
in float aSide;

uniform mat4 uView;
uniform mat4 uProj;
uniform vec2 uViewport;
uniform float uWidth;

void main() {
  vec4 clipA = uProj * uView * vec4(aPos, 1.0);
  vec4 clipB = uProj * uView * vec4(aOther, 1.0);
  vec2 ndcA = clipA.xy / clipA.w;
  vec2 ndcB = clipB.xy / clipB.w;
  vec2 delta = ndcB - ndcA;
  vec2 n = vec2(-delta.y * uViewport.y, delta.x * uViewport.x);
  float len = length(n);
  vec2 offset = len > 1e-9 ? (n / len) * (uWidth * aSide) * 2.0 / uViewport : vec2(0.0);
  gl_Position = vec4((ndcA + offset) * clipA.w, clipA.z, clipA.w);
}
