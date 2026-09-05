# Rendering performance

Automatic LOD is enabled by default. In Settings (Tab), **Target FPS** defaults
to 60 and can be raised to 144. **Minimum auto scale** limits automatic
resolution reduction relative to the selected render scale (50% by default).
Disable auto LOD, or press 1–5, to use fixed detail and resolution; press 0 to
return to automatic quality.

The renderer culls blocks outside the camera's view before submitting spheres,
caches the minimap background, and reuses nearby sphere data while turning.
Zero mouse-look deltas do not advance the camera orientation version, so the
scene signature stays unchanged while idle: the render loop keeps servicing
input and HUD state, but submits no GPU scene work and URL persistence can
settle after movement or settings changes.
Automatic quality first reduces resolution in small steps, then alternates
resolution and sphere detail. Completed GPU timing queries, when supported,
allow it to leave rendering headroom even at 60 FPS. Recovery requires sustained
headroom; idle frames and background-tab pauses do not raise quality. Movement
speed stays independent of rendering quality.

The FPS setting is a target, not a guaranteed minimum: display refresh rate,
hardware, browser scheduling and other applications still affect frame delivery.
The controller needs several active frames to respond to a new workload. Without
GPU timing support, recovery is deliberately conservative on a 60 Hz display.

Validation: `pnpm test` runs camera, controller, culling, HUD and GPU-query
regression tests; `pnpm build` checks TypeScript and builds the application.

Near-sphere quads use per-axis tangent bounds clipped to the viewport instead
of oversized, rotated billboards. This bounds their raster area and removes
the turning artifacts without adding instances or draw calls. Eye-plane
crossings fall back to one viewport-sized quad per affected sphere; ray misses
are discarded. Near-plane proxy clamping preserves center-based depth ordering.
No new frame-rate measurement is claimed for this correctness fix.

`npm run test:render` runs WebGL pixel/normal regression checks in headless
Chromium (install it first with `pnpm exec playwright install chromium`). The
114 cases cover the seven reported poses, full yaw turns, steep pitch, multiple
FOVs/aspect ratios, near/eye-plane crossings, and spheres behind the camera or
beyond the far plane. The original shaders fail this regression. A browser
check of the full lattice at all seven poses also completed without WebGL or
JavaScript errors.

A local Chromium/SwiftShader test at 1280 × 720, rotating inside the cube, measured
about 32 → 39 FPS at fixed stride 4 and full resolution. With auto LOD enabled,
the original ran at about 1.5 FPS (it forced stride 1 inside the cube); the updated
renderer settled near 60 FPS at stride 4 and 70% resolution. These software-renderer
measurements are indicative, not hardware performance guarantees. A fixed-quality
comparison of the scene's central 750 × 500 pixels was identical. Browser checks
also covered mouse look, settings/link round trips, idle rendering and context
restoration.
