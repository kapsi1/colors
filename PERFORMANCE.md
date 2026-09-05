# Rendering performance

Automatic LOD is enabled by default. In Settings (Tab), **Target FPS** defaults
to 60 and can be raised to 144. **Minimum auto scale** limits automatic
resolution reduction relative to the selected render scale (50% by default).
Disable auto LOD, or press 1–5, to use fixed detail and resolution; press 0 to
return to automatic quality.

The renderer culls blocks outside the camera's view before submitting spheres,
caches the minimap background, and reuses nearby sphere data while turning.
Automatic quality first reduces resolution in small steps, then alternates
resolution and sphere detail. Completed GPU timing queries, when supported,
allow it to leave rendering headroom even at 60 FPS. Recovery requires sustained
headroom; idle frames and background-tab pauses do not raise quality. Movement
speed stays independent of rendering quality.

The FPS setting is a target, not a guaranteed minimum: display refresh rate,
hardware, browser scheduling and other applications still affect frame delivery.
The controller needs several active frames to respond to a new workload. Without
GPU timing support, recovery is deliberately conservative on a 60 Hz display.

Validation: `npm test` runs controller, culling and GPU-query regression tests;
`npm run build` checks TypeScript and builds the application.

A local Chromium/SwiftShader test at 1280 × 720, rotating inside the cube, measured
about 32 → 39 FPS at fixed stride 4 and full resolution. With auto LOD enabled,
the original ran at about 1.5 FPS (it forced stride 1 inside the cube); the updated
renderer settled near 60 FPS at stride 4 and 70% resolution. These software-renderer
measurements are indicative, not hardware performance guarantees. A fixed-quality
comparison of the scene's central 750 × 500 pixels was identical. Browser checks
also covered mouse look, settings/link round trips, idle rendering and context
restoration.
