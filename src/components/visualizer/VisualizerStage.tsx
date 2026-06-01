import { useEffect, useRef } from "react";
import { audioEngine, type AudioFrame } from "@/lib/audio/AudioEngine";
import type { PresetId } from "./presets/types";
import { Composer } from "./composer/Composer";
import { useServerFn } from "@tanstack/react-start";
import { getVJDirection } from "@/lib/visualizer-ai.functions";
import { getArchetype } from "@/lib/visualizer-archetype.functions";
import { generateMedia } from "@/lib/visualizer-mediagen.functions";
import { MediaBank } from "./media/MediaBank";
import { ARCHETYPES, type ArchetypeId } from "./composer/archetypes";
import { NarrativeEngine } from "@/lib/vibe/NarrativeEngine";
import type { VibeConfig } from "@/lib/vibe/types";

export function VisualizerStage({ preset, vibeConfig, silhouetteOn = true, onNarrative }: { preset: PresetId; vibeConfig: VibeConfig | null; silhouetteOn?: boolean; onNarrative?: (s: { memory: string; timeline: import("@/lib/vibe/types").TimelineEntry[]; lastMood?: string; lastWord?: string }) => void }) {
  const onNarrativeRef = useRef(onNarrative);
  onNarrativeRef.current = onNarrative;
  const silhouetteOnRef = useRef(silhouetteOn);
  silhouetteOnRef.current = silhouetteOn;
  const wrapRef = useRef<HTMLDivElement>(null);
  const presetRef = useRef(preset);
  presetRef.current = preset;
  const vibeRef = useRef(vibeConfig);
  vibeRef.current = vibeConfig;
  const composerRef = useRef<Composer | null>(null);
  const narrativeRef = useRef<NarrativeEngine | null>(null);
  const fetchDirection = useServerFn(getVJDirection);
  const fetchArchetype = useServerFn(getArchetype);
  const fetchMedia = useServerFn(generateMedia);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let canvas: HTMLCanvasElement | null = null;
    let composer: Composer | null = null;
    let active: PresetId | null = null;
    let raf = 0;
    let last = performance.now() / 1000;
    let lastFrame: AudioFrame = {
      fft: new Uint8Array(), time: new Uint8Array(),
      bass: 0, mid: 0, treble: 0, level: 0,
      beat: false, sinceBeat: 999, drop: false, energy: 0, flux: 0,
      phase: "intro", shortEnergy: 0, bpm: 0,
      centroid: 0, percuss: 0, bassToTreble: 1,
    };
    let prevPhase = "intro";
    let dropsInWindow: number[] = [];
    let lastAICall = -10;
    let aiInFlight = false;
    let lastArchCall = -10;
    let archInFlight = false;
    let lastMediaGenArch: ArchetypeId | null = null;
    let lastMediaGenAt = -1000;
    let mediaGenInFlight = false;
    let startedAt = performance.now() / 1000;

    const mount = (id: PresetId) => {
      if (composer) { composer.dispose(); composer = null; }
      if (canvas) { canvas.remove(); canvas = null; }
      const c = document.createElement("canvas");
      c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
      wrap.appendChild(c);
      canvas = c;
      composer = new Composer(c, id);
      composerRef.current = composer;
      active = id;
      lastAICall = -10;
      startedAt = performance.now() / 1000;
      narrativeRef.current = new NarrativeEngine(vibeRef.current ?? null);
      if (vibeRef.current) {
        composer.applyVibeConfig(vibeRef.current);
        // Kick off a media gen tied to the vibe prompt for richer textures
        if (!mediaGenInFlight) {
          mediaGenInFlight = true;
          fetchMedia({ data: { prompt: vibeRef.current.mediaPrompt } })
            .then(async (m) => {
              if (m?.dataUrl) await MediaBank.addAIGenerated(m.dataUrl, "house");
            })
            .catch((e) => console.debug("[vibe-media]", e))
            .finally(() => { mediaGenInFlight = false; });
        }
      }
      composer.initSilhouette(vibeRef.current ?? null);
      composer.setSilhouetteEnabled(silhouetteOnRef.current);
      resize();
    };
    const resize = () => {
      if (!canvas || !composer) return;
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      composer.resize(r.width, r.height, dpr);
    };

    mount(presetRef.current);

    const callAI = async (now: number) => {
      if (aiInFlight || !composer || !narrativeRef.current) return;
      aiInFlight = true;
      try {
        const elapsed = now - startedAt;
        const context = narrativeRef.current.buildContext(lastFrame, elapsed);
        const direction = await fetchDirection({ data: { context } });
        composer?.applyDirection(direction);
        if (direction.narrativeUpdate) {
          narrativeRef.current.updateMemory(direction.narrativeUpdate);
        }
        narrativeRef.current.recordAIDirection(
          now,
          `AI: ${direction.mood ?? ""} ${direction.word ?? ""}`.trim(),
        );
        onNarrativeRef.current?.({
          memory: narrativeRef.current.memory,
          timeline: narrativeRef.current.timeline.slice(),
          lastMood: direction.mood,
          lastWord: direction.word,
        });
      } catch (e) {
        console.debug("[VJ-AI]", e);
      } finally {
        aiInFlight = false;
      }
    };

    const callArchetype = async (now: number) => {
      if (archInFlight || !composer) return;
      archInFlight = true;
      try {
        const r = await fetchArchetype({ data: {
          bpm: lastFrame.bpm,
          energy: +lastFrame.energy.toFixed(3),
          centroid: +lastFrame.centroid.toFixed(3),
          bassToTreble: +lastFrame.bassToTreble.toFixed(3),
          percuss: +lastFrame.percuss.toFixed(3),
          flux: +lastFrame.flux.toFixed(3),
          level: +lastFrame.level.toFixed(3),
        } });
        if (r && (r.archetype as ArchetypeId) in ARCHETYPES) {
          composer?.setArchetypeId(r.archetype as ArchetypeId);
          narrativeRef.current?.recordArchetypeChange(now, r.archetype);
          if (
            !mediaGenInFlight &&
            now - lastMediaGenAt > 60 &&
            lastMediaGenArch !== r.archetype
          ) {
            mediaGenInFlight = true;
            lastMediaGenAt = now;
            lastMediaGenArch = r.archetype as ArchetypeId;
            try {
              const prompt = r.mediaPrompt || ARCHETYPES[r.archetype as ArchetypeId].mediaPrompt;
              const m = await fetchMedia({ data: { prompt } });
              if (m?.dataUrl) await MediaBank.addAIGenerated(m.dataUrl, r.archetype as ArchetypeId);
            } catch (e) { console.debug("[media-gen]", e); }
            finally { mediaGenInFlight = false; }
          }
        }
      } catch (e) {
        console.debug("[arch-AI]", e);
      } finally {
        archInFlight = false;
      }
    };

    const tick = () => {
      const now = performance.now() / 1000;
      const dt = Math.min(0.05, now - last);
      last = now;
      lastFrame = audioEngine.read(now);
      if (lastFrame.drop) {
        dropsInWindow.push(now);
        narrativeRef.current?.recordDrop(now);
      }
      if (lastFrame.beat) narrativeRef.current?.recordBeat();
      if (lastFrame.phase !== prevPhase) {
        narrativeRef.current?.recordPhaseChange(now, lastFrame.phase);
        prevPhase = lastFrame.phase;
      }
      if (dropsInWindow.length > 50) dropsInWindow = dropsInWindow.slice(-50);
      if (presetRef.current !== active) mount(presetRef.current);
      composer?.render(now, dt, lastFrame);

      // VJ direction cadence: first ~3s, then every 15s; faster on drops (8s)
      const interval = lastFrame.drop && now - lastAICall > 8 ? 0 : 15;
      const dueFirst = lastAICall < 0 && now - startedAt > 3 && lastFrame.energy > 0.02;
      if ((dueFirst || (lastAICall > 0 && now - lastAICall > interval)) && audioEngine.analyser) {
        lastAICall = now;
        callAI(now);
      }

      const archDueFirst = lastArchCall < 0 && now - startedAt > 8 && lastFrame.energy > 0.03;
      if ((archDueFirst || (lastArchCall > 0 && now - lastArchCall > 30)) && audioEngine.analyser) {
        lastArchCall = now;
        callArchetype(now);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const onTap = () => composerRef.current?.skip();
    wrap.addEventListener("pointerdown", onTap);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointerdown", onTap);
      composer?.dispose();
      canvas?.remove();
    };
  }, [fetchDirection, fetchArchetype, fetchMedia]);

  useEffect(() => {
    composerRef.current?.setSilhouetteEnabled(silhouetteOn);
  }, [silhouetteOn]);

  return <div ref={wrapRef} className="absolute inset-0 overflow-hidden" />;
}
