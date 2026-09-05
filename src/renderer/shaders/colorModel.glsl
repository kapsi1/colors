vec3 rgbModelPosition(vec3 rgb, int model) {
  float hi = max(rgb.r, max(rgb.g, rgb.b));
  float lo = min(rgb.r, min(rgb.g, rgb.b));
  float delta = hi - lo;
  float h6 = 0.0;
  if (delta > 0.0) {
    if (hi == rgb.r) h6 = mod((rgb.g - rgb.b) / delta + 6.0, 6.0);
    else if (hi == rgb.g) h6 = (rgb.b - rgb.r) / delta + 2.0;
    else h6 = (rgb.r - rgb.g) / delta + 4.0;
  }
  float t = model == 1 ? (hi + lo) * 0.5 : hi;
  float denom = model == 1 ? 1.0 - abs(2.0 * t - 1.0) : hi;
  float saturation = delta == 0.0 || denom == 0.0 ? 0.0 : delta / denom;
  float angle = h6 * 1.0471975512;
  return vec3(saturation * cos(angle), t * 2.0 - 1.0, saturation * sin(angle));
}
