## Goal

Make the visualizer feel like classic WMP / Milkdrop: always evolving, layered, surprising. The fix is architectural — stop building monolithic per-preset shaders, and instead compose 2–3 small **visual modules** at a time from a shared library, then aggressively remix them.

## 1. Module library (`src/components/visualizer/modules/`)

Each module is a tiny self-contained renderer with `mount(layer)`, `update(t, dt, frame, intensity)`, `dispose()`, and a `layer` hint (`bg`, `mid`, `fg`, `post`). All are GPU-accelerated where possible; 2D modules render into a shared offscreen canvas.

Build ~10 modules:

| Module | Layer | Description |
|---|---|---|
| `TunnelRings` | mid | Forward-flying torus/hex rings, color cycles by depth |
| `ParticleSwarm` | mid | 3000-pt GPU swarm with curl-noise flow field, beat bursts outward |
| `RibbonField` | mid | 60 sinusoidal ribbons in 3D, mid-frequency drives twist |
| `Plexus` | mid | Floating points + lines between near neighbors, classic music-app look |
| `Supershape` | fg | Morphing superformula geometry, parameters drift continuously |
| `Kaleidoscope` | post | Polar mirror post-effect with rotating segment count |
| `Starfield` | bg | Parallax 3-layer starfield, treble = density |
| `RingBurst` | fg | Spawns expanding rings on beats/drops, palette per ring |
| `BouncingGeo` | mid | 4–8 chrome platonic solids tumbling with spring physics, beat impulses |
| `FractalWarp` | post | Domain-warp + zoom post on the back canvas |
| `NeonGrid` | bg | Synthwave grid floor + sun, scrolls forward |
| `Wormhole` | bg | Cylindrical chrome tunnel, camera-aligned |

Modules share `intensity` (0..1) from the director so they can fade in/out smoothly.

## 2. Composition engine (`Composer.ts`)

One shared `THREE.WebGLRenderer` + `Scene` per preset instance (or a hybrid 2D+3D pipeline for GlitchVHS). The composer:

- Keeps the active module set (≤3 active at a time).
- Per remix, picks a new module combo from a curated pool that fits the preset's genre.
- Crossfades modules in/out via their `intensity` over ~1s.
- Per remix, also randomizes a `CameraDirector` behavior (dolly, orbit, spin, snap-zoom-out, free-roam Bezier).
- Runs a `PaletteEngine` that lerps between 8 hand-picked palettes; flips palette on drops 40% of the time.

## 3. RemixDirector

Replaces the current SceneDirector. Three timing layers running concurrently:

- **Macro (remix)** every 10–18s OR on drop: swap 1–2 of the active modules, swap camera behavior, optionally flip palette.
- **Meso (variation)** every 4–8s: tweak module parameters (segment count, swarm flow speed, ring spawn rate), no module swaps.
- **Micro (events)** every 1.5–4s + every drop/beat: fire a one-shot event (white flash, RGB invert blip, snap zoom punch, ring burst, geometry morph, kaleido segment-count jump, palette rotate 60°). Continuous low-level background ensures something is always changing even in silence.

A small `EventBus` lets any module subscribe to events (e.g. `RingBurst` listens for `beat-burst`, `Kaleidoscope` listens for `mirror-flip`).

## 4. Preset genres

Each preset becomes a curated module pool + visual identity, not a unique implementation. The director still rotates within each preset's pool so each preset feels distinct.

- **Hyperspeed Tunnel** — pool: TunnelRings, Wormhole, NeonGrid, Starfield, ParticleSwarm, RingBurst, BouncingGeo. Camera bias: forward dolly. Palette: vaporwave/chrome.
- **Acid Plasma** — pool: FractalWarp, Kaleidoscope, RibbonField, ParticleSwarm, Plexus, Supershape. Camera bias: slow orbit. Palette: hot acid.
- **Datamosh VHS** — pool: TunnelRings (2D variant), RibbonField, ParticleSwarm, Plexus, BouncingGeo, plus 2D glitch post (RGB drift, scanlines, tape rewind, kill-signal). Palette: high-contrast neon.
- **Liquid Chrome** — pool: Supershape, Wormhole, BouncingGeo, ParticleSwarm, RibbonField, RingBurst. Camera bias: free orbit. Palette: iridescent chrome.

## 5. Audio reactivity (per-module mapping)

Modules opt into specific bands. Examples:
- TunnelRings: bass → forward speed, mid → warp amplitude.
- ParticleSwarm: bass → outward burst, treble → flow noise scale.
- RibbonField: mid → twist, level → amplitude.
- Plexus: treble → connection distance.
- Kaleidoscope: drop → segment-count jump.
- RingBurst: every beat → spawn one ring at palette-shifted hue.
- BouncingGeo: drop → spring impulse + axis change.

Drop and beat both broadcast on the EventBus; modules consume what they want.

## 6. Tap-to-skip + always-on motion

- `VisualizerStage` wires a `pointerdown` on the wrapper to call `composer.skip()` which forces a macro remix immediately (with a quick flash so it feels intentional).
- During silence the director still fires meso/micro events at min cadence so the screen never sits still.
- Reduced-motion check: if `prefers-reduced-motion`, micro events go from 1.5–4s to 6–12s and camera snaps soften.

## 7. Performance

- Single renderer per preset instance, modules add/remove `Object3D`s to one scene.
- Module pool: every module is instantiated once on mount and toggled via `intensity`, no runtime allocation during remix.
- Hard cap: ≤3 active modules; particle counts scale down on mobile (devicePixelRatio > 2 or width < 500).
- Aim for 60fps on a recent phone; expect 45–55 on older devices.

## 8. Files

**New (most of the work lives here)**
- `src/components/visualizer/modules/types.ts`
- `src/components/visualizer/modules/TunnelRings.ts`
- `src/components/visualizer/modules/ParticleSwarm.ts`
- `src/components/visualizer/modules/RibbonField.ts`
- `src/components/visualizer/modules/Plexus.ts`
- `src/components/visualizer/modules/Supershape.ts`
- `src/components/visualizer/modules/Kaleidoscope.ts`
- `src/components/visualizer/modules/Starfield.ts`
- `src/components/visualizer/modules/RingBurst.ts`
- `src/components/visualizer/modules/BouncingGeo.ts`
- `src/components/visualizer/modules/FractalWarp.ts`
- `src/components/visualizer/modules/NeonGrid.ts`
- `src/components/visualizer/modules/Wormhole.ts`
- `src/components/visualizer/composer/Composer.ts`
- `src/components/visualizer/composer/RemixDirector.ts`
- `src/components/visualizer/composer/CameraDirector.ts`
- `src/components/visualizer/composer/PaletteEngine.ts`
- `src/components/visualizer/composer/EventBus.ts`
- `src/components/visualizer/composer/presetPools.ts`

**Edit**
- `src/components/visualizer/VisualizerStage.tsx` — mount the Composer with a preset's pool, wire `pointerdown` to `composer.skip()`.
- Delete (or rewrite as thin shells) `presets/ChromeTunnel.ts`, `presets/MilkdropPlasma.ts`, `presets/GlitchVHS.ts`, `presets/LiquidChrome.ts`, `presets/SceneDirector.ts` — replaced by composer + module pools.

**Unchanged**
- `src/lib/audio/*` — AudioEngine already provides bass/mid/treble/level/beat/drop/energy/flux.
- Controls dock, routing, permission gate.

## Out of scope

- No new audio sources or controls.
- No mic gain UI changes.
- No video-layer changes.

## Risk + verification

- **Risk**: too many active modules tank mobile FPS. Mitigation: hard cap at 3, particle/instance counts tied to viewport size.
- **Verify**: load preview, watch for 20+ seconds per preset, confirm visible module swaps, palette flips, micro events, and that tap-to-skip works. Check console for WebGL errors.
