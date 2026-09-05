## Architecture

The application is a small, dependency-light ES-module graph orchestrated by a
single render loop in `src/main.ts`.

### Render loop

Each animation frame:

1. **Input** — `input.consume()` returns a `FrameIntent` (movement axes, boost,
   accumulated look deltas); the camera applies look immediately.
2. **Timing & LOD** — `GpuTimer.poll()` collects any *completed* GPU timing
   queries (never blocking), and `LodController.update()` compares frame-time
   EMA plus GPU/CPU work time against the target-FPS budget, choosing a sphere
   stride `k` and an effective render scale. Idle frames and background-tab
   pauses are excluded from adaptation.
3. **Camera update** — exponential velocity smoothing (`velTau`) toward the
   intent-derived target velocity; view/projection matrices recomputed.
4. **Dirty check** — a signature of camera pose, orientation, stride, canvas
   size, and every render-relevant setting is compared against the previous
   frame; the GPU pass runs only when something changed.
5. **Draw** — clear, then three passes: `SpherePoints` (far field),
   `SphereQuads` (near field, rebuilt only when the camera/stride changes),
   `Outline` (thick gray cube outline).
6. **HUD & persistence** — FPS/RGB/speedometer/minimap update (DOM writes only
   on change, throttled to 4 Hz); the URL hash is rewritten once movement has
   settled (≥ 500 ms cadence, ≥ 300 ms after the last scene change).

### Rendering model

A set of 16.7 million spheres cannot be drawn as polygons. RGB indices are the
canonical sphere identities in every model: their color is always the original
8-bit RGB value, while HSL/HSV modes transform that value into a cylinder
position. The renderer exploits two facts:

- **Far field** — when a sphere projects to at most a few pixels, a point
  sprite is enough. One instanced draw call covers the whole lattice: each
  instance is a 16³ block (one `aChunkOffset` vertex-buffer entry), and the
  vertex shader decodes `gl_VertexID` into (R, G, B) indices. RGB mode uses
  those indices as cube coordinates; HSL/HSV mode converts them to hue,
  saturation, and lightness/value, then maps those parameters to a cylinder
  position. The original RGB indices remain the sphere color. The shader sizes
  the sprite from the exact perspective projection of a sphere (with a
  `gl_PointSize` hardware clamp).
- **Near field** — within the distance where point sprites would exceed the
  GPU's maximum point size, `SphereQuads` uploads instanced camera-facing
  quads (center + color + radius per instance, capped at `maxInstances`). Both
  paths share `common.frag.glsl`, which ray-traces the sphere analytically from
  the NDC ray — producing per-pixel normals, wrap lighting, and depth-cue fog
  with no tessellation anywhere.

Near quads use projected sphere tangent bounds clamped to the viewport, with
rays reconstructed from actual fragment coordinates. Their proxy geometry is
kept at the near plane when its center passes it, so rotating cannot clip or
fold the billboard. Spheres crossing the eye plane use viewport-sized bounds;
the ray test rejects pixels that miss. Depth ordering remains center-based.

Chunk culling (`visibleChunks.ts`) rejects whole 16³ blocks against the view
frustum with bounds that include edge spheres, so rotating the camera can never
expose holes. Cube bounds are analytic. Cylinder bounds are exact cached AABBs
of each transformed RGB block; larger LOD blocks conservatively combine those
base bounds. The near pass first rejects transformed chunks against the camera's
search sphere, then tests their individual RGB-mapped positions.

At stride `k = 1`, every model renders all 16,777,216 source colors exactly
once. Higher LOD strides intentionally sample the RGB index lattice for
performance, just as they do in cube mode.

Color completeness is an intentional performance trade-off for the cylinder
modes: they now contain about 28% more spheres than the former clipped lattice,
and RGB-to-cylinder positioning costs more vertex-shader work. Automatic LOD
and transformed chunk culling keep that extra work bounded in normal use.

### Adaptive quality

`LodController` combines two mechanisms:

- **Performance stride** — sustained over-budget frames first reduce resolution
  in small steps (1.0 → 0.33), then double the sphere stride `k`; recovery
  requires sustained headroom (6 s) and a 1.5 s settling delay, with a larger
  margin before halving `k` again (halving the stride submits 8× the spheres).
- **Distance stride** — stride increases (subpixel hysteresis: 0.8 px / 1.2 px)
  when the projected spacing between spheres at the camera's distance falls
  below a pixel, independent of frame rate.

`k` is the maximum of the two, so detail is spent where it is visible. Without
`EXT_disjoint_timer_query_webgl2` the controller relies on frame cadence alone
and recovers conservatively.

### State flow

`config.ts` is a single mutable singleton read everywhere; the settings panel,
URL parser, input wheel handler, and LOD controller all write to it, and the
render loop reads it. UI modules (`hud`, `minimap`, `speedometer`, `settings`)
are passive DOM updaters fed from the loop; `main.ts` wires them together with
explicit hooks.

### Phone mode

`phone.ts` decides whether the touch-first layout applies: forced by the
`phone=1`/`phone=0` hash parameter, otherwise derived from
`(pointer: coarse) and (hover: none) and (max-width: 1024px)` and kept in sync
via a `matchMedia` change listener. The decision lives in
`config.phoneMode` and is mirrored onto a `body.phone` class; all layout
switching is CSS on that class. In phone mode:

- A touch on the left half of the canvas spawns a floating joystick
  (`joystick.ts`): the knob's deflection drives analog forward/backward/strafe
  movement via the new `magnitude` rate scale on `FrameIntent`, while touches
  elsewhere (and the mouse) still steer the view.
- The speedometer dial is replaced by a vertical `SpeedSlider` on the left
  screen edge with the speed shown above the track; the slider maps track
  position to speed on the same logarithmic scale as the settings panel.
- The hint box and its `?` toggle are removed, and the info box stretches
  across the width with the color model radios beside the color display.

The settings gear row also hosts a reset button that restores the camera to
the startup pose (`Camera.resetPose`) and hides together with the HUD chrome.

## File structure

```
.
├── index.html                  # Page skeleton + all CSS: canvas, HUD, minimap,
│                               #   speed slider, settings panel, hint box,
│                               #   phone-mode overrides, WebGL2 fallback
├── package.json                # Scripts and dependencies (gl-matrix only)
├── tsconfig.json               # Strict ES2022 TypeScript config (no emit)
├── vite.config.ts              # Vite config (relative base for static deploys)
├── pnpm-workspace.yaml         # pnpm build-script allowlist (esbuild)
├── PERFORMANCE.md              # Performance design notes and measurements
├── src/
│   ├── main.ts                 # Entry point: bootstrap, URL hash state, render
│   │                           #   loop, dirty-signature check, context loss,
│   │                           #   fullscreen, window.__cube debug handle
│   ├── config.ts               # Central Config interface + singleton values
│   ├── camera.ts               # Path-independent yaw/pitch camera: unbounded
│   │                           #   vertical turning, screen-axis movement,
│   │                           #   smoothed velocity, boundary and matrices
│   ├── input.ts                # Keyboard/pointer/wheel handling → FrameIntent;
│   │                           #   pointer lock with capture fallback, touch
│   │                           #   forward in phone mode, hooks for
│   │                           #   Tab/Esc/F/H/digit shortcuts
│   ├── phone.ts                # Phone-mode detection: phone=1/0 override or
│   │                           #   pointer/hover/width media query, body class
│   ├── joystick.ts             # Phone-mode floating thumbstick: spawns under
│   │                           #   the touch, analog deflection, dead zone
│   ├── speedSlider.ts          # Phone-mode vertical speed slider on the left
│   │                           #   edge, logarithmic mapping, speed readout
│   ├── lod.ts                  # Automatic LOD controller: EMA frame timing,
│   │                           #   GPU/CPU work budget, scale steps, distance
│   │                           #   stride with hysteresis, manual override
│   ├── hud.ts                  # FPS line, camera model value/hex lines with spanning swatch, hint box toggle
│   ├── minimap.ts              # 2D-canvas isometric cube minimap: shaded faces,
│   │                           #   camera dot, frustum cone, axis projections
│   ├── speedometer.ts          # Canvas car-style speed dial with damped needle
│   ├── settings.ts             # Settings panel: DOM build, config bindings,
│   │                           #   share-URL generation, hex/RGB helpers
│   ├── vite-env.d.ts           # Vite client types
│   └── renderer/
│       ├── gl.ts               # Context creation, program compile/link, uniform
│       │                       #   cache, max point size query, FrameState type
│       ├── lattice.ts          # Lattice math: block offsets, coordinate→color,
│       │                       #   radius scaling, sprite clamp distance
│       ├── modelGeometry.ts    # RGB→cylinder positions and cached transformed
│       │                       #   chunk bounds for culling/near-field queries
│       ├── visibleChunks.ts    # CPU frustum culling of 16³ lattice blocks
│       ├── spherePoints.ts     # Instanced GL_POINTS far-field pass
│       ├── sphereQuads.ts      # Instanced camera-facing quad near-field pass
│       ├── outline.ts           # Thick gray cube outline (screen-space ribbon)
│       ├── outlineGeometry.ts   # Outline edges, near-plane clip, quad expansion
│       ├── gpuTimer.ts         # EXT_disjoint_timer_query_webgl2 wrapper
│       └── shaders/
│           ├── points.vert.glsl    # gl_VertexID → lattice cell, sprite sizing
│           ├── points.frag.glsl    # Point-sprite entry to shared sphere shading
│           ├── quads.vert.glsl     # Viewport-clamped sphere tangent bounds
│           ├── quads.frag.glsl     # Quad entry to shared sphere shading
│           ├── colorModel.glsl     # Shared RGB→HSL/HSV cylinder positioning
│           ├── common.frag.glsl    # Analytic sphere ray hit, wrap lighting,
│           │                       #   fog, debug view (shared by both passes)
│           ├── outline.vert.glsl    # Screen-space outline ribbon expansion
│           └── outline.frag.glsl    # Solid gray outline fill
└── tests/
    ├── loadTs.mjs              # node-side TS loader shared by tests
    ├── camera.test.mjs         # node:test: camera look/movement/boundary regressions
    ├── hud.test.mjs            # node:test: swatch left, model value + lowercase hex, outside-cube, throttling
    ├── phone.test.mjs          # node:test: phone detection + body class, touch
    │                           #   forward, slider mapping, phone CSS presence
    ├── performance.test.mjs    # node:test: LOD, culling, GPU query semantics
    ├── outline.test.mjs        # node:test: outline edges, near-plane clipping
    ├── outline.spec.mjs        # Playwright: outline ribbon width and color
    ├── colorModel.spec.mjs     # Playwright: model switching, minimap, hash links
    ├── reset.spec.mjs          # Playwright: camera reset button and chrome visibility
    ├── phone.spec.mjs          # Playwright: phone layout, slider drag, joystick
    │                           #   movement, auto detection and phone=0 opt-out
    └── sphereQuads.spec.mjs    # Playwright: shader pixels vs. analytic rays
```
