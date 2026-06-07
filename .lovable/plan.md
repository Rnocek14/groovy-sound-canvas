
## Why it still doesn't feel right

A deep scan of the audio + render pipeline found six compounding blockers. We've been tuning surface knobs (speeds, gates, multipliers) but the underlying *machinery* is missing the things that make Milkdrop / Butterchurn / Winamp AVS feel magical:

1. **No tempo prediction** — beat detection is a single-band onset detector that only *reacts*. It never predicts the next beat or locks to a tempo grid, so nothing can feel "on the one."
2. **Transients are smoothed away** — kick drum attacks (1–2 frames) get blended into EMAs before modules ever see them, turning every snap into a soft ramp.
3. **Feedback is rigid, not per-pixel** — the feedback buffer exists but only zooms/rotates the *whole frame*. Milkdrop's defining trick is per-pixel warp equations that morph each pixel independently.
4. **No waveform tracing** — the time-domain audio samples are captured and thrown away. Every classic visualizer draws the waveform; ours never does.
5. **Bar clock stalls at startup** — `BarClock` requires confidence to build (~10 beats), so the first 5–10 seconds — the moment first impressions form — has no tempo-locked events.
6. **Static sensitivity** — quiet tracks look dead, loud tracks clip. No AGC / loudness normalization.

On top of that: post-FX easing is too slow to register on beats, AI direction calls add 15+ second latency with no local fallback, and FFT bands are linear instead of log-spaced (musically wrong).

## The plan

### Phase 1 — Fix the audio brain (P0, the foundation)

**1.1 Real tempo prediction in `AudioEngine`**
- Add multi-band onset detection: sub-bass (20–80Hz), kick (80–200Hz), snare (200–3kHz), hats (3–10kHz). Each band gets its own adaptive threshold.
- Add autocorrelation BPM estimation over a ~4s energy ring buffer, with half/double-time disambiguation.
- Publish `beatPhase` (0..1 predicted position within the current beat) and `barPhase` (0..1 within bar) — so modules can pulse *between* detected beats too.
- Set `analyser.smoothingTimeConstant = 0` and own all smoothing in JS (no double-smoothing).

**1.2 Transient + envelope split**
- Expose `bassRaw`, `bassEnv`, `bassTransient` (raw minus envelope) on every frame. Same for mid/treble.
- Modules use `transient` for flashes/snaps, `env` for sustained drive.

**1.3 AGC loudness normalization**
- Track a slow RMS (1–3s window). Divide raw values by it before sensitivity. Quiet acoustic and loud EDM both land in the 0.3–0.9 reactive zone.

**1.4 Log-spaced perceptual bands**
- Replace the three linear `avg(lo,hi)` bands with 6–8 log/mel-spaced bands. Expose all of them.

**1.5 Kill BarClock stall**
- Trust the BPM estimate immediately (with low initial confidence) so bar/beat phase starts ticking from second 1, not second 10.

### Phase 2 — Rebuild the render core (P0, the visual leap)

**2.1 Per-pixel feedback warp** (single highest-impact change)
- Replace the rigid zoom+rotate in `Composer.ts` feedback pass with a per-pixel warp field: noise-domain UV distortion sampled per pixel before the feedback lookup, amplitude coupled to bass transient. This is *the* Milkdrop trick.
- Add a second octave of warp at higher frequency, coupled to treble.

**2.2 Waveform tracer module** (instant music legibility)
- New module that reads `f.time` (2048 samples), renders as a GPU line strip in polar (ring) and Cartesian (horizon) modes, palette-keyed, drawn on top of the feedback texture every frame. Always-on overlay.

**2.3 Crank up the feedback magnitudes**
- Current `fbZoom = bass * 0.012`, `fbRot = treble * 0.0012` are so small the feedback is invisible. Retune by 5–10× and let per-pixel warp carry the organic motion.

**2.4 Beat-snapped post-FX easing**
- Change post-FX ease from `dt*0.6` (~250ms settle) to `dt*(beat ? 6 : 0.8)` — instant snap on beat, slow return. Chroma, kaleido, and warp will actually *register* on hits.

### Phase 3 — Make modules beat-aware (P1)

**3.1 Spawn-on-beat instead of pulse-amplitude**
- `ParticleSwarm`, `RingBurst`, `RibbonField`, `TunnelRings`: spawn new geometry on `beat` / `drop` events, not just amplitude scaling. Topology changes on beats, not just brightness.

**3.2 Use `beatPhase` for synchronized motion**
- Modules use `sin(beatPhase * 2π)` for pulsing instead of accumulated `audioPhase` time. Everything pulses *together* on the grid.

**3.3 Skip update for fully-inactive modules**
- If `intensity < 0.01`, skip `update()` entirely (save CPU, prevent phase drift).

### Phase 4 — Director cleanup (P1)

**4.1 One bar-locked remix system**
- Delete `RemixDirector`'s wall-clock timer. Route all macro changes through `ArchetypeDirector.consumeBar()` so transitions *always* land on a downbeat.

**4.2 Local preset blender, AI for flavor only**
- Add a `PresetBlender` that crossfades archetype post-FX targets over 2–4 bars locally. AI calls keep generating palette/word/narrative but never block the render path.

**4.3 Hard camera cuts on drops**
- `CameraDirector` currently only does smooth drift. Add hard angle cuts on `drop` events; reserve smooth motion for groove sections.

### Phase 5 — Validate

- Verify no double `audioEngine.read()` calls across the component tree (`useAudioRAF` hook usage).
- Confirm sample rate / FFT band coverage extends to 16 kHz (currently caps around 6 kHz — losing hats/cymbals/air).
- A/B against Butterchurn in another tab on the same audio — confirm comparable snap, morph, and legibility.

## Technical notes (for the implementation phase)

- All Phase 1 changes are local to `src/lib/audio/AudioEngine.ts` and a new `TempoTracker.ts`. `AudioFrame` type gains ~10 fields (backward-compatible additions).
- Phase 2.1 (per-pixel warp) is ~30 lines of GLSL added to the feedback fragment shader in `Composer.ts`. No new dependencies.
- Phase 2.2 (waveform tracer) is a new module under `src/components/visualizer/modules/Waveform.ts` using `THREE.Line` with a dynamic `BufferGeometry`.
- Phases 3–4 are touch-ups across existing module/director files; no architectural changes.
- No new npm dependencies required. No backend changes. All work is frontend in `src/lib/audio/` and `src/components/visualizer/`.

## What you'll feel after this lands

- **Phase 1+2 alone** should make it visibly leap past Windows Media Player: feedback morphing instead of zooming, waveform you can read, snaps that land on the kick.
- **Phase 3+4** adds the "this VJ knows the song" feel — geometry restructuring on drops, camera cuts on bar lines, everything pulsing together.

Phase 1 and Phase 2 are independent and can ship in either order, but they multiply each other — landing both is the unlock.
