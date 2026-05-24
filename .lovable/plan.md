## What we're building

A mobile-first web app that listens to the phone mic and drives four "way cooler than Windows Media Player" visualizer presets, with optional pre-rendered video clips playing behind the visuals. Balanced reactivity — clear beat response, color shifts, camera moves, no seizure-mode strobes.

## User flow

1. Landing screen: big "TAP TO START" button (mic gesture required by iOS Safari)
2. Browser asks for microphone permission
3. Visualizer goes fullscreen, defaults to **Chrome Tunnel**
4. Bottom UI (auto-hides after 3s):
   - Preset switcher (4 chips, swipe-able)
   - Sensitivity slider
   - Toggle: video clips on/off
   - Fullscreen + lock-orientation buttons
5. Tap screen anywhere → UI reappears

## The 4 presets

1. **Chrome Tunnel** (Three.js) — Infinite extruded ring tunnel, neon grid floor, camera dolly-zooms on bass. Sun-sphere on the horizon pulses with kick. Vaporwave palette (hot pink / cyan / deep purple).
2. **Milkdrop Plasma** (WebGL fragment shader) — Single full-screen shader: feedback-style plasma + kaleidoscope mirroring. FFT bins drive color rotation, treble drives kaleido segments, bass drives zoom warp.
3. **Glitch VHS** (Canvas2D + WebGL post) — Spectrum bars + waveform on a scanline CRT background. On detected beats: RGB channel split, datamosh slice offsets, brief BSOD/"NO SIGNAL" flashes.
4. **Liquid Chrome** (Three.js + GPU particles) — Iridescent metaball blob using MeshTransmissionMaterial-style refraction, surrounded by 5k GPU particles that burst outward on each beat hit.

All four share the same audio analyser, beat detector, and "scene props" object — switching presets is instant, no reload.

## Architecture

```text
src/
  routes/
    index.tsx              # Landing → mic permission → visualizer
  components/
    visualizer/
      VisualizerStage.tsx  # Owns canvas, runs RAF loop, mounts active preset
      ControlsDock.tsx     # Bottom UI: presets, sensitivity, video toggle
      PermissionGate.tsx   # Tap-to-start + getUserMedia
      VideoBackdrop.tsx    # Placeholder clip layer (HTML5 <video>, opacity modulated)
      presets/
        ChromeTunnel.tsx
        MilkdropPlasma.tsx
        GlitchVHS.tsx
        LiquidChrome.tsx
  lib/
    audio/
      AudioEngine.ts       # getUserMedia + AudioContext + AnalyserNode
      beatDetector.ts      # Energy-based onset detection on bass band
      useAudioFrame.ts     # Hook: per-frame {bass, mid, treble, level, beat, fft[]}
  assets/
    clips/                 # 3-4 short looping placeholder MP4s
```

## Audio pipeline (the core)

- `getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })` — critical, defaults wreck music input
- `AudioContext` → `MediaStreamSource` → `AnalyserNode` (fftSize 2048, smoothing 0.7)
- Per RAF frame compute:
  - `fft` — full Uint8Array frequency data
  - `bass` — avg of bins 1–8 (≈20–250Hz)
  - `mid` — bins 9–60
  - `treble` — bins 61–256
  - `level` — RMS of time-domain
  - `beat` — boolean, energy-history onset detector on bass with refractory period
- Smoothed via exponential moving average so visuals don't jitter
- Sensitivity slider scales all bands before they reach presets

## Video backdrop layer

- 3 short looping placeholder clips ship in `src/assets/clips/` (abstract footage, royalty-free — replaceable later with AI face clips)
- Rendered as a muted, looping, playsinline `<video>` behind the canvas
- Opacity modulated by `level`, swapped between clips every ~12s or on big beats
- Toggle in controls hides it entirely for pure-visualizer mode

## Mobile correctness

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- `100dvh` everywhere, safe-area insets respected
- Audio + fullscreen only start inside the tap handler (iOS requirement)
- `screen.orientation.lock('any')` attempted, fallback if unsupported
- WebGL contexts disposed on preset switch to avoid mobile memory pressure
- `prefers-reduced-motion` → dampen camera shake and disable glitch flashes

## Tech notes

- Three.js for tunnel + liquid chrome presets (`bun add three @types/three`)
- Custom raw WebGL fragment shader for Milkdrop preset — lighter than three.js for a single fullscreen quad
- Canvas2D for spectrum bars in GlitchVHS preset
- No backend, no Lovable Cloud needed for MVP (everything runs client-side)
- Single TanStack route: `src/routes/index.tsx`. Page metadata set in its `head()`.

## Out of scope for MVP (explicitly)

- Real AI-generated face clips (placeholder clips only — drop-in replacement later)
- Recording / sharing the output as video
- User accounts, presets save, custom uploads
- Native iOS/Android wrapper

## Suggested build order

1. AudioEngine + useAudioFrame hook + a debug bars preset to verify mic data
2. ControlsDock + PermissionGate + routing
3. MilkdropPlasma (simplest WebGL — proves the pipeline)
4. ChromeTunnel (first Three.js preset)
5. GlitchVHS (beat-reactive flourishes)
6. LiquidChrome (heaviest — last)
7. VideoBackdrop with placeholder clips
8. Mobile polish pass: fullscreen, orientation, safe areas, perf check on real phone via the preview URL

Ready to start with step 1 when you hit Implement.