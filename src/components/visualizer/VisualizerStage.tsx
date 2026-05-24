import { useEffect, useRef } from "react";
import { audioEngine, type AudioFrame } from "@/lib/audio/AudioEngine";
import type { PresetId } from "./presets/types";
import { Composer } from "./composer/Composer";
import { useServerFn } from "@tanstack/react-start";
import { getVJDirection } from "@/lib/visualizer-ai.functions";

export function VisualizerStage({ preset }: { preset: PresetId }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const presetRef = useRef(preset);
  presetRef.current = preset;
  const composerRef = useRef<Composer | null>(null);
  const fetchDirection = useServerFn(getVJDirection);

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
    };
    let dropsInWindow: number[] = [];
    let lastAICall = -10;
    let aiInFlight = false;
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
      if (aiInFlight || !composer) return;
      aiInFlight = true;
      try {
        const dropsLastMin = dropsInWindow.filter((d) => now - d < 60).length;
        const direction = await fetchDirection({ data: {
          preset: presetRef.current,
          phase: lastFrame.phase,
          bpm: lastFrame.bpm,
          energy: +lastFrame.energy.toFixed(3),
          short: +lastFrame.shortEnergy.toFixed(3),
          bass: +lastFrame.bass.toFixed(3),
          mid: +lastFrame.mid.toFixed(3),
          treble: +lastFrame.treble.toFixed(3),
          flux: +lastFrame.flux.toFixed(3),
          dropsLastMin,
          elapsed: +(now - startedAt).toFixed(1),
        } });
        composer?.applyDirection(direction);
      } catch (e) {
        // silent fallback to local director
        console.debug("[VJ-AI]", e);
      } finally {
        aiInFlight = false;
      }
    };

    const tick = () => {
      const now = performance.now() / 1000;
      const dt = Math.min(0.05, now - last);
      last = now;
      lastFrame = audioEngine.read(now);
      if (lastFrame.drop) dropsInWindow.push(now);
      if (dropsInWindow.length > 50) dropsInWindow = dropsInWindow.slice(-50);
      if (presetRef.current !== active) mount(presetRef.current);
      composer?.render(now, dt, lastFrame);

      // AI director cadence: first call ~4s in, then every 22s; faster on drops if it's been >12s
      const interval = lastFrame.drop && now - lastAICall > 12 ? 0 : 22;
      const dueFirst = lastAICall < 0 && now - startedAt > 4 && lastFrame.energy > 0.02;
      if ((dueFirst || (lastAICall > 0 && now - lastAICall > interval)) && audioEngine.analyser) {
        lastAICall = now;
        callAI(now);
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
  }, [fetchDirection]);

  return <div ref={wrapRef} className="absolute inset-0 overflow-hidden" />;
}
