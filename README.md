# 16,777,216 colors — RGB Cube Flythrough

An interactive WebGL2 flythrough of the complete RGB color space, rendered as a
256 × 256 × 256 lattice of colored spheres — one sphere for every one of the
16,777,216 (256³) colors a true-color display can show. You fly through the cube
in first person: your camera position *is* an RGB color, shown live in the HUD.
Turn, accelerate, dive into the interior, and watch every color blend into its
neighbors.

Built with TypeScript, Vite, and a single runtime dependency (`gl-matrix`).
Spheres are ray-traced per pixel in custom GLSL shaders, distant geometry is
drawn as GPU-instanced point sprites, and an adaptive LOD controller keeps the
frame rate on target automatically.

## Features

- **Full 24-bit RGB lattice** — all 256³ spheres at once, frustum-culled on the
  CPU in 16³ blocks before submission.
- **Two-tier hybrid rendering** — far spheres as instanced `GL_POINTS` (lattice
  coordinates decoded from vertex IDs in the shader), near spheres as instanced
  camera-facing quads; both ray-trace an analytic sphere per pixel with correct
  perspective sizing. Near spheres keep stable silhouettes while turning,
  including when their quad centers cross the near clipping plane.
- **Automatic LOD** — tracks frame-time EMA and (when supported) GPU timer
  queries; first lowers resolution in small steps, then alternates resolution
  and sphere stride (k = 1…16) with hysteresis to avoid oscillation. Manual
  override via keys or settings.
- **Live HUD** — FPS readout, camera RGB and hex values stacked on two lines
  with a square color swatch spanning both to their left, car-style
  speedometer dial, and an isometric minimap showing camera position, viewing
  frustum, and nearest face projections.
- **Outer boundary** — the camera is kept within 3.2 cube half-extents and 60% of
  the view distance, so the cube always stays on screen with its outline;
  movement slides along the boundary instead of stopping dead.
- **Shareable state** — the full camera pose and every setting are serialized
  into the URL hash and restored on load; copy a link to share an exact view.
- **Settings panel** — spacing, radius, view distance, speed, sensitivity, FOV,
  LOD, target FPS, render scale, background color, fog, shading, cube outline,
  and a debug view.
- **Robustness** — WebGL context loss/restore handling, background-tab idle
  handling, DPR capping, and a graceful fallback when WebGL2 is unavailable.

## Requirements

- Node.js ≥ 20.19 (or ≥ 22.12) for Vite 7 and `node --test`
- A WebGL2-capable browser (current Chrome, Edge, Firefox, or Safari)

## Installation

```sh
pnpm install
# or
npm install
```

## Usage

### Development server

```sh
pnpm dev
# or
npm run dev
```

Then open the printed URL (default `http://localhost:5173`).

### Production build

```sh
pnpm build      # typechecks (tsc --noEmit) and bundles into dist/
pnpm preview    # serve the production build locally
```

The build uses relative asset paths (`base: './'`), so `dist/` can be deployed
from any static file host or subdirectory.

### Tests

```sh
pnpm test
# or
npm test
```

Runs the Node.js built-in test runner against `tests/*.test.mjs`, which
transpiles the relevant TypeScript modules on the fly and covers camera
orientation and screen-axis movement, the outer boundary, LOD, frustum
culling, GPU timer query handling, and the HUD color readout.

For the WebGL pixel regression tests, install Chromium once and run:

```sh
pnpm exec playwright install chromium
pnpm test:render
```

These JavaScript tests compile the actual sphere shaders and compare pixels
and debug normals with independent ray intersections across the reported
camera poses, a full turn, varied FOV/aspect ratios, and near/eye-plane crossings.

### Controls

| Input | Action |
| --- | --- |
| `W` / `S` | Move forward / backward |
| `A` / `D` | Move along the camera's horizontal screen axis |
| `Space` / `Ctrl` or `C` | Move along the camera's vertical screen axis |
| `Shift` | ×4 speed boost |
| Mouse wheel | Increase / decrease maximum move speed |
| Left-drag | Look around — turning is unbounded in every direction (pointer lock when available) |
| Mouse wheel in settings panel | Native scroll |
| `1`–`5` | Manual LOD stride (1, 2, 4, 8, 16) |
| `0` | Return to automatic LOD |
| `Tab` | Toggle settings panel |
| `H` | Toggle HUD — hides the minimap, info box, hint, and the gear/help buttons |
| `F` | Toggle fullscreen (locks WASD/Space/Ctrl keys where supported) |
| `Esc` | Close settings panel |
| `?` button | Toggle hint box |

> Tip: in windowed mode `Ctrl+W` closes the tab; fullscreen mode (via `F`) also
> prevents that, which is why the hint box mentions it.

### URL parameters

All state lives in the URL hash (`#key=value&…`) and round-trips through the
settings panel — the panel updates the hash, and a hash updates the panel.

| Parameter | Example | Meaning |
| --- | --- | --- |
| `cam` | `cam=160,160,160` | Camera position (lattice space); the camera then faces the origin |
| `yaw`, `pitch` | `yaw=-38.8&pitch=-32.8` | View orientation in degrees |
| `fov` | `fov=90` | Field of view in degrees (40–100) |
| `sp` | `sp=1.5` | Sphere spacing (0.5–2) |
| `r` | `r=0.4` | Sphere radius (0.02 – (spacing−0.02)/2) |
| `far` | `far=800` | View / fog distance (100–1500) |
| `speed` | `speed=20` | Base move speed |
| `sens` | `sens=1.5` | Mouse sensitivity multiplier (0.1–3) |
| `scale` | `scale=0.75` | Render scale (0.5, 0.75, 1) |
| `fps` | `fps=120` | Automatic-LOD target FPS (60–144) |
| `minscale` | `minscale=0.33` | Minimum automatic resolution scale |
| `bg` | `bg=%23002244` | Background color, `#rrggbb` |
| `fog`, `shade`, `axes` | `fog=0` | Toggle depth-cue fog, shading, cube outline (`1`/`0`) |
| `debug` | `debug=1` | Debug view: R = distance, G/B = |normal.x|/|normal.y| |
| `k` | `k=4` | Fixed LOD stride (power of two, 1–16) |
| `auto` | `auto=1` | Force automatic LOD on |
| `quads` | `quads=0` | Disable near-field quad pass entirely |
| `panel` | `panel=1` | Open the settings panel on load |

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
│   ├── hud.ts                  # FPS line, camera RGB/hex lines with spanning swatch, hint box toggle
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
    ├── hud.test.mjs            # node:test: swatch left, rgb + lowercase hex, outside-cube, throttling
    ├── performance.test.mjs    # node:test: LOD, culling, GPU query semantics
    ├── outline.test.mjs        # node:test: outline edges, near-plane clipping
    ├── outline.spec.mjs        # Playwright: outline ribbon width and color
    └── sphereQuads.spec.mjs    # Playwright: shader pixels vs. analytic rays
```

## License

MIT — see [LICENSE](LICENSE).
