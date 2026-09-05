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

A sphere lattice of 16.7 million objects cannot be drawn as polygons. The
renderer exploits two facts:

- **Far field** — when a sphere projects to at most a few pixels, a point
  sprite is enough. One instanced draw call covers the whole lattice: each
  instance is a 16³ block (one `aChunkOffset` vertex-buffer entry), and the
  vertex shader decodes `gl_VertexID` into (x, y, z) lattice coordinates,
  derives the sphere center, computes the color directly from those
  coordinates, and sizes the sprite from the exact perspective projection of a
  sphere (with a `gl_PointSize` hardware clamp).
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
expose holes.

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

## File structure

```
.
├── index.html                  # Page skeleton + all CSS: canvas, HUD, minimap,
│                               #   settings panel, hint box, WebGL2 fallback
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
│   │                           #   pointer lock with capture fallback, hooks for
│   │                           #   Tab/Esc/F/H/digit shortcuts
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
│           ├── common.frag.glsl    # Analytic sphere ray hit, wrap lighting,
│           │                       #   fog, debug view (shared by both passes)
│           ├── outline.vert.glsl    # Screen-space outline ribbon expansion
│           └── outline.frag.glsl    # Solid gray outline fill
└── tests/
    ├── loadTs.mjs              # node-side TS loader shared by tests
    ├── camera.test.mjs         # node:test: camera look/movement/boundary regressions
    ├── hud.test.mjs            # node:test: swatch left, model value + lowercase hex, outside-cube, throttling
    ├── performance.test.mjs    # node:test: LOD, culling, GPU query semantics
    ├── outline.test.mjs        # node:test: outline edges, near-plane clipping
    ├── outline.spec.mjs        # Playwright: outline ribbon width and color
    └── sphereQuads.spec.mjs    # Playwright: shader pixels vs. analytic rays
```
