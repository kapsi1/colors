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

void main() {
  vec2 corner = vec2(
    ((gl_VertexID & 1) == 1) ? 1.0 : -1.0,
    ((gl_VertexID & 2) == 2) ? 1.0 : -1.0
  );
  vec4 vc = uView * vec4(aCenter, 1.0);
  float depth = -vc.z;
  vec2 lo = vec2(-1.0);
  vec2 hi = vec2(1.0);
  if (depth > aRadius) {
    // Tangents to the sphere in the XZ and YZ planes give its exact
    // screen bounds. All coordinates here are already in view space.
    float denom = depth * depth - aRadius * aRadius;
    vec2 tangent = aRadius * sqrt(vc.xy * vc.xy + vec2(denom));
    vec2 scale = vec2(uTanHalf * uAspect, uTanHalf);
    lo = clamp((vc.xy * depth - tangent) / denom / scale, -1.0, 1.0);
    hi = clamp((vc.xy * depth + tangent) / denom / scale, -1.0, 1.0);
  } else if (depth + aRadius <= 0.0) {
    // Entirely behind the eye: degenerate the quad.
    hi = lo;
  }
  // A sphere crossing the eye plane can have unbounded projected bounds;
  // use the viewport and let the ray test reject pixels outside the sphere.
  vec2 ndc = mix(lo, hi, corner * 0.5 + 0.5);
  vec4 clip = uProj * vec4(0.0, 0.0, -max(depth, 1e-6), 1.0);
  // The quad is a rasterization proxy, not the sphere surface. Keep it
  // from being clipped at the near plane, preserving center-based depth.
  gl_Position = vec4(ndc, max(clip.z / clip.w, -1.0), 1.0);
  vColor = aColor;
  vCenterView = vc.xyz;
  vRadius = aRadius;
}
