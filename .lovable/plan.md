## Core principle

Right now the presets are too "reactive-only" — when audio is quiet they sit still. Acid trip = **the visuals are always morphing**, audio just multiplies the intensity. Every preset gets:

- **Idle motion floor** — slow continuous transformation even with silence (rotation, palette drift, fractal zoom)
- **Palette cycling** — colors shift continuously through HSL, not locked
- **Persistent feedback layer** — previous frame stays partially visible, creating trails / smears
- **Time-domain noise warp** — UV coordinates warped by slow noise so nothing stays in place

## Per-preset changes

### 1. Chrome Tunnel → "Hyperspeed Tunnel"
- Tunnel rings deform per-vertex with sin/cos noise — they're no longer circles, they wobble like jelly
- Continuous baseline speed (always flying through) — audio adds to it instead of being the only motion
- Ring colors cycle through full HSL spectrum based on `z` distance + time, not just pink/cyan
- Grid floor scrolls infinitely; horizon sun melts/swells continuously
- Add radial chromatic-aberration post effect that pulses gently always
- Camera does a constant lazy lissajous orbit so the framing never sits still

### 2. Milkdrop Plasma → "Acid Plasma"
- Replace single-pass shader with **feedback loop**: render to a framebuffer, sample previous frame, blend with current — creates the classic trippy smear/trail effect
- Add domain warping: UVs distorted by their own noise output (fractal feedback)
- Kaleidoscope segments morph continuously (not stepped by treble)
- Palette uses a 4-color gradient that rotates through 360° hue per ~6s
- Slow rotation + slow zoom always running; audio modulates speed not presence

### 3. Glitch VHS → "Datamosh Trip"
- Add a **canvas feedback layer**: draw previous frame back with scale 1.02 + slight rotation + low alpha → infinite trail/zoom effect
- Spectrum bars become melting/curving (bezier-warped) instead of straight rectangles
- Continuous slow RGB drift even without beats
- Add scrolling noise overlay (TV static) that's always present at low opacity
- Random "tape rewind" smear every ~8s independent of beats
- Hue rotation on the whole canvas via `filter: hue-rotate()` cycling 0–360°

### 4. Liquid Chrome → "Morphing Chrome"
- Add a fullscreen background shader behind the blob: swirling iridescent gradient that's always animating
- Blob noise displacement scales up: more dramatic morphing, more vertices oscillating
- Blob rotates continuously on a lazy 3-axis lissajous (always tumbling)
- Add 2 ghost copies of the blob at different scales with additive blending → motion-trail feel
- Particles get a constant orbital drift (currents) — they always swirl even without beats

## Tech notes

- The feedback loop in Plasma + Glitch needs ping-pong framebuffers (Plasma WebGL) or a back-canvas drawn over itself (Glitch 2D — cheaper, looks great)
- All palette cycling driven by a shared `time` value — no extra state
- Audio multipliers boost amplitude of motions that already exist; they no longer gate motion to on/off
- Keep `prefers-reduced-motion` check to dampen for users who need it
- Performance: feedback effects are the heaviest add — will spot-check on mobile via the preview URL

## Files touched

- `src/components/visualizer/presets/ChromeTunnel.ts` — rewrite ring deformation, camera path, palette
- `src/components/visualizer/presets/MilkdropPlasma.ts` — add ping-pong FBO, domain warp, palette cycle
- `src/components/visualizer/presets/GlitchVHS.ts` — add feedback canvas trail, curved bars, hue rotate
- `src/components/visualizer/presets/LiquidChrome.ts` — add bg shader, ghost blobs, particle currents

No new dependencies. No structural changes to the audio engine, controls, or routing.

Hit Implement when ready.