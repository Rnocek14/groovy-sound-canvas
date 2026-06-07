## Goal
Make the visualizer feel like it is being driven by the music, not by its own constant tunnel/clock speed.

## What the scan found
- **The audio engine is read twice per frame**: `VisualizerStage` reads audio, and `VideoBackdrop` also calls `audioEngine.read()`. That mutates beat history twice and can make beats feel off or inconsistent.
- **The backdrop is always moving**: `VideoBackdrop` rotates with wall-clock time even when the music is quiet.
- **The bar clock free-runs at 120 BPM**: `BarClock` advances even before it has reliable detected beats, so bar/remix/camera events can happen at an invented tempo.
- **Drop events can fire twice**: both `ArchetypeDirector` and `RemixDirector` emit `drop`, which can double-trigger impulses.
- **Several modules still use raw time**: `FluidShader`, `MetaBalls`, `RibbonField`, `NeonGrid`, `ParticleSwarm`, `Plexus`, `Supershape`, `SlitScan`, `MediaKaleido`, `Wormhole`, and `VideoBackdrop` keep some motion alive from `t`/wall-clock rather than music phase.
- **Tunnel still has baseline conveyor speed**: even after slowing it down, `TunnelRings` still moves every frame from a nonzero baseline plus smoothed energy.

## Implementation plan
1. **Make audio single-source per frame**
   - Stop `VideoBackdrop` from calling `audioEngine.read()`.
   - Use `audioEngine.getLastFrame()` for passive UI/backdrop consumers.
   - Keep `VisualizerStage` as the single owner that advances audio analysis.

2. **Add a proper music pulse envelope**
   - Add derived values based on `sinceBeat`, `beat`, `drop`, bass, flux, and level: a fast beat pulse, a slower groove pulse, and an energy gate.
   - Use these values to drive motion instead of raw wall-clock time.

3. **Fix beat/tempo locking**
   - Tune beat detection to avoid tiny constant triggers from noise.
   - Raise the minimum beat gap slightly so the visual rhythm cannot race.
   - Make `BarClock` trust detected BPM only after confidence builds, and avoid bar/remix events while audio energy/confidence is too low.

4. **Remove duplicate/drop over-triggering**
   - Let only one director relay drop events.
   - Keep macro/remix changes bar/beat-locked, not timer-only.

5. **Make tunnel movement beat-driven**
   - Replace the tunnel’s constant z conveyor with a low idle state and beat/drop impulses.
   - Rings should surge forward on kick/downbeat, then coast/settle; between beats they should barely move.
   - Reduce shader wobble speed so it breathes with bass instead of spinning independently.

6. **Retune always-moving modules**
   - Convert raw `t` usage in major modules to local audio phases that advance mostly from bass/beat/level.
   - Reduce or remove baseline speeds in starfield, wormhole, neon grid, ribbons, fluid, metaballs, particles, media kaleido, and slit-scan.
   - Keep small ambient drift only where needed so the screen doesn’t freeze completely.

7. **Tone down the constant backdrop motion**
   - Make backdrop scale/rotate respond to bass/beat pulse only.
   - Remove the slow always-on rotation that matches the “blob tunneling at its own speed” complaint.

8. **Validate by checking the live signal**
   - Confirm the preview no longer has constant scale/rotate changes when music is low.
   - Confirm beat events, tunnel surges, flashes, and camera impulses happen on detected music pulses rather than at a fixed invented tempo.