## Goal

Stop feeling like "one visual that moves to sound." Make every preset an **auto-cycling journey of 3–5 scenes**, with ChromeTunnel as the hero (deeper, faster, branching) and the other three as supporting tunnel-flavored rides. Audio drives both continuous motion (per-band) AND discrete events (drops trigger cuts).

## 1. Upgrade AudioEngine with drop detection + scene clock

Extend `AudioFrame` and `AudioEngine.read()`:

- `drop: boolean` — bigger threshold than `beat` (energy spike 2.5× variance, min 0.6s gap, requires sustained level rise over last ~1s). Fires on real drops, not every kick.
- `energy: number` — long-window (≈3s) EMA of `level`; used to detect quiet→loud transitions.
- `flux: number` — spectral flux (sum of positive FFT bin deltas), normalized. Highs detail without relying on beat.

Engine stays backwards compatible; presets opt in.

## 2. Shared SceneDirector (new file `presets/SceneDirector.ts`)

A tiny helper every preset uses:

```ts
new SceneDirector({
  scenes: ["approach", "warp", "break", "nebula", "rebirth"],
  minDuration: 18, // seconds
  maxDuration: 32,
  advanceOnDrop: true,
})
```

API: `update(t, frame) -> { id, age, progress, justEntered, transition01 }`.
- Auto-advances after `minDuration` if a drop hits, else hard-cuts at `maxDuration`.
- Exposes a 0→1 `transition01` (≈1.2s crossfade window) so presets can blend geometry/palette between scenes.
- Deterministic seeded order so each preset has a curated journey, not random.

## 3. ChromeTunnel → "Hyperspeed Journey" (hero)

5-scene ride, each scene swaps tunnel geometry + camera behavior + palette family. Bass drives forward speed, mids drive ring warp amplitude, treble drives chromatic-aberration intensity, drops trigger scene cuts and a flash + FOV punch.

| Scene | Geometry | Camera | Palette |
|---|---|---|---|
| approach | Sparse wide rings, gentle drift | Slow dolly-in, slight roll | Deep magenta → cyan |
| warp | Dense rings + radial speed lines (instanced) | Hard forward acceleration, FOV 75→110 | White-hot core, blue rim |
| break | Tunnel ends → open neon grid plane + distant sun | Camera pulls up & banks | Sunset orange/pink |
| corridor | Hex-prism tunnel (replaces torus rings) with branching side passages (extra ring chain offset on X) | Lissajous side-to-side | Acid green / chrome |
| rebirth | Particle wormhole (GPU points spiraling toward camera) | Spin + zoom-out reveal | Vaporwave purple |

Implementation notes:
- Build all 5 scene rigs once, toggle `.visible` + lerp `material.opacity` via `transition01`.
- Base ring forward speed: `2.5 + bass*6 + sceneSpeedMul`. Never drops below baseline so silence still moves.
- Branching passages = a second ring chain with `position.x` offset, faded in only during `corridor`.

## 4. MilkdropPlasma — supporting (kaleidoscope tunnel)

Keep ping-pong feedback shader; add a `uTunnelMode` uniform that warps UVs into a **tunnel projection** (`uv = vec2(atan(p.y,p.x), 1.0/length(p))`). Director cycles 4 scenes by modulating shader uniforms only (no geometry swap):

1. **kaleido** — current 6-segment mirror
2. **tunnel** — polar tunnel warp, scrolling Z
3. **fractal-zoom** — domain-warp amplitude ramps, continuous zoom-in
4. **shatter** — on drop: snapshot current frame, fragment into triangles via barycentric noise, reform

Per-band: bass → tunnel scroll speed, mid → warp amount, treble → palette rotation rate, drop → scene advance + 1-frame full feedback bloom.

## 5. GlitchVHS — supporting (datamosh tunnel)

Add a perspective tunnel layer rendered with 2D canvas: nested rectangles vanishing to center, color-shifted per ring. 4 scenes:

1. **broadcast** — current bars + feedback
2. **tape-tunnel** — VHS rectangle tunnel rushing forward
3. **scan-corrupt** — horizontal datamosh slabs sliding sideways
4. **kill-signal** — on drop: full-frame invert + RGB tear + tracking-error roll

Per-band: bass → tunnel ring spawn rate, mid → bar curvature, treble → static density, drop → scene advance + tape-rewind smear.

## 6. LiquidChrome — supporting (chrome wormhole)

Replace the central blob during certain scenes with a chrome wormhole mesh (cylinder tunnel with reflective env-map material). 4 scenes:

1. **bloom** — current additive blobs + particles
2. **wormhole** — camera enters chrome tunnel, particles streak forward
3. **shatter-orbit** — blob explodes into orbiting chrome shards
4. **liquid-rebirth** — shards converge back into blob

Per-band: bass → wormhole speed + blob displacement, mid → iridescence shift, treble → particle streak length, drop → scene advance + radial particle burst.

## 7. Consistency rules

- Every preset always has motion at silence (baseline scene clock + min speeds).
- Drops are visibly punctuating: a brief (≈150ms) global brightness/scale pop on every preset on `frame.drop`.
- Scene transitions use `transition01` to crossfade so cuts aren't jarring — except `kill-signal` / `shatter` which deliberately hard-cut.
- No new dependencies. No changes to routing, controls UI, or `VisualizerStage`'s preset switching.

## Files

**New**
- `src/components/visualizer/presets/SceneDirector.ts`

**Edit**
- `src/lib/audio/AudioEngine.ts` — add `drop`, `energy`, `flux` to `AudioFrame` and computation in `read()`.
- `src/components/visualizer/presets/ChromeTunnel.ts` — full rewrite to 5-scene journey.
- `src/components/visualizer/presets/MilkdropPlasma.ts` — add tunnel UV mode + 4-scene director.
- `src/components/visualizer/presets/GlitchVHS.ts` — add tape tunnel layer + 4-scene director.
- `src/components/visualizer/presets/LiquidChrome.ts` — add wormhole mesh + shard orbit + 4-scene director.

## Out of scope

- No video-layer changes.
- No control-dock additions (scene cycling is automatic; manual scene-skip can be added later if you want).
- No new audio source modes.
