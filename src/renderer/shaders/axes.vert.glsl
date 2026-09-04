#version 300 es
precision highp float;

in vec3 aPos;
in float aParam;
in vec3 aColor;

uniform mat4 uView;
uniform mat4 uProj;

out vec3 vColor;
out float vParam;

void main() {
  vColor = aColor;
  vParam = aParam;
  gl_Position = uProj * uView * vec4(aPos, 1.0);
}
