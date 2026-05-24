# Live camera feed as a trippy visual source

Hook the device camera into the existing `MediaBank` as a fourth source (alongside built-in / upload / AI). The camera becomes a live `THREE.VideoTexture` that the existing media modules (MediaKaleido, SlitScan, CollageStrobe) already know how to abuse — so the trippy treatment comes for free.

## What gets built

### 1. CameraSource (new) — `src/components/visualizer/media/CameraSource.ts`
- Wraps `navigator.mediaDevices.getUserMedia({ video: { facingMode } })`.
- Creates a hidden `<video>`, plays the stream, exposes a `THREE.VideoTexture`.
- Methods: `start(facing)`, `stop()`, `flip()` (front/back), `isActive`.
- Registers itself in `MediaBank` as a special entry with id `live-camera`, source `"camera"`, archetypes `["*"]` so it's always picked when present.
- Mirror flag for front camera so selfies aren't reversed.

### 2. MediaBank changes — `MediaBank.ts`
- New source kind: `"camera"`.
- `attachCamera(texture, videoEl)` / `detachCamera()` so MediaBank owns the lifecycle entry.
- Bias `pick()` to **prefer the live camera** when active (e.g. 60% of picks return it) — that's what makes the experience feel "you, but trippy."

### 3. New dedicated camera-only module — `CameraEcho.ts`
A purpose-built module just for the live feed, separate from the generic media modules, so the camera always has a strong showcase even when generic modules don't pick it:
- **Feedback echo + kaleido + RGB split + edge-detect Sobel** on the camera frame.
- Cuts/pulses on beat: invert / posterize / scanlines flash on transients.
- Mirror toggle for front camera.
- Tempo-locked color cycling driven by `BarClock` (already exists).
- Falls back to a "camera off" idle state when no stream.

This is registered in `presetPools.ts` `ALL` so the archetype director can weight it heavily when the camera is on.

### 4. Permission + UI — `MediaTray.tsx`
Add a section above the upload button:
- **"USE CAMERA"** toggle button (off by default — privacy-first, never auto-start).
- When on: **flip front/back** button + small live thumbnail in the tray.
- Status line: "Live camera active" or "Permission denied — tap to retry".
- Tooltip note: "Camera feed stays on your device — never sent anywhere."

### 5. Archetype bias bump
In `archetypes.ts`, add a soft weight boost for `camera-echo` across all archetypes when camera is active — handled in `ArchetypeDirector` / `Composer.applyArchetype` via a runtime weight injection rather than hard-coding in every archetype.

### 6. Cleanup hooks
- Stop tracks on `Composer.dispose()` and on tab `visibilitychange === "hidden"` (saves battery; resume on visible).
- Stop on `EXIT` button in `ControlsDock`.

## Privacy & permissions

- Camera is **opt-in**, never auto-prompted. The PermissionGate already handles mic — we don't bundle camera with it.
- Frames never leave the device. The AI archetype/mediagen calls already send only numeric audio features, not pixels — and that stays true.
- Add `Permissions-Policy: camera=(self)` consideration in docs only (no code change needed for our domain).

## Files

**New**
- `src/components/visualizer/media/CameraSource.ts`
- `src/components/visualizer/modules/media/CameraEcho.ts`

**Edited**
- `src/components/visualizer/media/MediaBank.ts` — camera entry + biased pick
- `src/components/visualizer/composer/presetPools.ts` — register `CameraEcho`
- `src/components/visualizer/composer/archetypes.ts` — soft `mediaFavor` entry for camera
- `src/components/visualizer/MediaTray.tsx` — camera toggle + flip + thumbnail
- `src/components/visualizer/composer/Composer.ts` — runtime hint boost when camera live

## Out of scope

- No ML on the camera (face detection / pose) — too heavy for mobile and adds permission scope creep. Can be a follow-up.
- No screen-capture (`getDisplayMedia`) — distinct UX; ask separately if wanted.
- No recording / saving frames.

## Risks

- iOS Safari requires `playsinline` + user gesture before `video.play()` — handled by toggling from a button tap.
- Low-light cameras look noisy; the trippy chain mostly hides this, and the SlitScan/Kaleido shaders amplify motion which is the point.
- Mobile thermal: only one video decode at a time (camera OR a user-uploaded video), enforced in `MediaBank.pick()`.
