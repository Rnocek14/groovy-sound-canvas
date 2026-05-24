
# What's wrong today and what we're changing

Right now the visualizer is loud but dumb. It picks random modules, applies post-FX, and asks Gemini for a palette every 22s. There's no real *understanding* of the music, no *content* to play with (it's all generated geometry), and no *musical timing* — changes happen on wallclock seconds, not on bars. That's why it loses to Media Player: WMP/Milkdrop felt alive because every frame was a feedback of the previous frame deformed by audio, and every preset had a strong distinctive aesthetic.

We fix three things at once:

1. **Music understanding** — genre/archetype classification, not just energy
2. **Musical timing** — every transition snaps to detected bars/beats
3. **Real content** — a media bank of photos/videos pumped through trippy GPU shaders

# The three pillars

## 1. Archetype engine (the "language" picker)

Add a small AI classifier (Gemini Flash, called every ~30s OR on a phase change) that returns an **archetype** + tempo lock + intensity envelope, not just a palette.

Archetypes (pick ~8 to start):
- **techno** — strobe grids, hard cuts on beat, kaleido feedback, high contrast
- **house / groove** — slow camera dolly, ribbon flow, warm palette wash
- **ambient / downtempo** — heavy feedback bleed, slow melt, low-poly metaballs, breathing
- **drum&bass / dnb** — fast scanlines, glitch slice, snap zoom every bar
- **hiphop** — chrome type-bursts on the snare, halftone dot post-FX, photo collage
- **rock / punk** — high-contrast B&W photo strobe, jittery handheld camera
- **classical / orchestral** — slow particle bloom, lens flare, deep starfield
- **pop** — saturated photo collage, sticker bursts, vaporwave gradients

Each archetype maps to: (a) module weights, (b) palette family, (c) post-FX bias, (d) camera behavior set, (e) **media filter style** (see pillar 3). Local fallback uses BPM + spectral centroid to pick when AI is offline (high centroid + fast BPM → techno; low centroid + slow → ambient).

## 2. Tempo-locked scheduler

Replace `RemixDirector`'s wallclock cadence with a **bar-aware phase clock**:

- AudioEngine already estimates BPM. Add a downbeat tracker: keep a phase 0..1 advancing at BPM/60 Hz, snapped/corrected on each detected beat.
- Schedule all macro/meso events on bar boundaries (every 4 or 8 beats). Micro events (flash, invert) snap to the next beat. No more "changed mid-phrase" feeling.
- Add **bar-count modes** per archetype: techno = swap module every 8 bars, ambient = every 32 bars, dnb = every 4.

## 3. Media bank + trippy GPU pipeline

This is the big new feature.

### Sources (all three)
- **Curated pack** (built-in): ~30 looping textures shipped as assets — neon city plates, nature macro, glitch footage, abstract paint, chrome, smoke, fabric. Store as compressed `.webp` (stills) and short `.mp4` (loops, ~3s each, 480p).
- **User upload**: a small tray in the controls dock. Files saved to `IndexedDB`, decoded to `THREE.VideoTexture` / `THREE.Texture`. Persists per browser.
- **AI generation**: when archetype changes AND energy is high, fire a background `imagegen` call via Lovable AI (Gemini image preview) with a prompt derived from archetype + mood. Cached in IndexedDB so we don't regen the same vibe twice.

### Trippy treatment modules (new)
Five new modules that take a media texture as input and abuse it:

- **MediaKaleido** — radial 6/8/12-fold mirror with rotating UV, beat-driven segment count
- **SlitScan** — sample the texture at time-offset rows (the classic vertical-line warp); maps audio level → slit width
- **Datamosh** — feedback FBO with high persistence, the media texture stamped on each beat then smeared by warp shader
- **CollageStrobe** — grid of 4/9/16 tiles, each tile a random crop of a random media source, swapped on snare hits
- **DisplaceFlow** — domain-warp shader where the media is the displacement source for a particle/fluid field

All five live in `src/components/visualizer/modules/media/` and pull from a shared `MediaBank` singleton.

### MediaBank API
```ts
class MediaBank {
  registerBuiltin(): void          // load curated pack
  addUserFile(file: File): void    // upload from controls
  requestAIGenerated(archetype, mood): Promise<Texture>
  pick(filter?: { kind, mood }): Texture | VideoTexture
}
```

# Architecture

```text
AudioEngine ──► BarClock ──► Scheduler (bar-snapped events)
            └─► ArchetypeClassifier (local heuristic + AI)
                          │
                          ▼
                    ArchetypeDirector ──► sets module pool, palette family,
                          │                post-FX bias, camera bank,
                          │                media filter style
                          ▼
                       Composer
                  ┌────────┴─────────┐
              Geometry modules     Media modules ◄── MediaBank
                  └────────┬─────────┘                ▲
                           ▼                          │
                  Feedback FBO + post chain    Built-in / Upload / AI gen
```

# Files

**New:**
- `src/components/visualizer/composer/BarClock.ts` — beat-phase / downbeat tracker
- `src/components/visualizer/composer/ArchetypeDirector.ts` — replaces most of RemixDirector
- `src/components/visualizer/media/MediaBank.ts` — central media store
- `src/components/visualizer/media/builtinPack.ts` — curated asset manifest
- `src/components/visualizer/modules/media/MediaKaleido.ts`
- `src/components/visualizer/modules/media/SlitScan.ts`
- `src/components/visualizer/modules/media/Datamosh.ts`
- `src/components/visualizer/modules/media/CollageStrobe.ts`
- `src/components/visualizer/modules/media/DisplaceFlow.ts`
- `src/lib/visualizer-archetype.functions.ts` — server fn for archetype classification
- `src/lib/visualizer-mediagen.functions.ts` — server fn for AI image gen
- `src/components/visualizer/MediaTray.tsx` — UI for upload/preview
- `public/visualizer-media/` — ~30 curated assets (placeholder set generated via imagegen)

**Edited:**
- `src/lib/audio/AudioEngine.ts` — add downbeat estimate, spectral centroid, low-confidence flag
- `src/components/visualizer/composer/Composer.ts` — accept archetype + media filter; route media modules
- `src/components/visualizer/composer/presetPools.ts` — convert from preset-per-id to archetype-per-id
- `src/components/visualizer/VisualizerStage.tsx` — wire bar clock + archetype calls
- `src/components/visualizer/ControlsDock.tsx` — add media tray button

# Technical notes

- **Downbeat tracker**: simple comb-filter over a 4-beat window with octave-aware correlation; if confidence < 0.4 fall back to 2-beat. Phase is continuous (no jumps) — corrections eased over 200ms.
- **Local archetype heuristic** (used always; AI just refines): BPM bucket × spectral centroid × bass-to-treble ratio × percussiveness. Returns top-3 with confidence.
- **AI calls**: archetype classifier on phase change (≤ once / 20s), image gen on archetype change (≤ once / 60s, cached). Both fail gracefully.
- **VideoTexture management**: only the currently-active media module decodes video; others get a paused still frame to avoid GPU/CPU thrash on mobile.
- **Upload limits**: 10 MB per file, max 20 files, only `image/*` and `video/mp4`. IndexedDB store, no backend.
- **Performance**: media modules render at half-res into the feedback FBO and upscale. Curated video assets are 480p / ~3s loops to keep <2 MB each.
- **Curated pack generation**: use `imagegen--generate_image` to produce the 30 stills during build — no external dependencies. Video loops use `videogen--generate_video` for ~6 short loops.

# Out of scope (intentionally)

- Realtime audio source separation (drums vs bass vs vocals) — too heavy for browser
- Lyric overlays from the actual track (we'd need song identification — out of scope)
- WebGPU port (cool but big lift; current WebGL pipeline is enough)

# Cost / risk

- AI calls bounded: archetype every 20-30s + image-gen every 60s on archetype change. Cheap on Gemini Flash.
- Curated pack adds ~15 MB to first load — lazy-loaded only when visualizer mounts, then cached.
- Existing modules and post-FX chain stay intact; this is additive, with the scheduler swap being the main behavioral change.
