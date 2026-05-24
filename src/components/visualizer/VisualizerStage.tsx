import { useEffect, useRef } from "react";
import { audioEngine, type AudioFrame } from "@/lib/audio/AudioEngine";
import { createChromeTunnel } from "./presets/ChromeTunnel";
import { createMilkdropPlasma } from "./presets/MilkdropPlasma";
import { createGlitchVHS } from "./presets/GlitchVHS";
import { createLiquidChrome } from "./presets/LiquidChrome";
import type { PresetFactory, PresetHandle, PresetId } from "./presets/types";

const FACTORIES: Record<PresetId, PresetFactory> = {
  tunnel: createChromeTunnel,
  plasma: createMilkdropPlasma,
  glitch: createGlitchVHS,
  liquid: createLiquidChrome,
};

const NEEDS_2D: Record<PresetId, boolean> = {
  tunnel: false,
  plasma: false,
  glitch: true,
  liquid: false,
};

export function VisualizerStage({ preset }: { preset: PresetId }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const presetRef = useRef(preset);
  presetRef.current = preset;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let canvas: HTMLCanvasElement | null = null;
    let handle: PresetHandle | null = null;
    let activePreset: PresetId | null = null;
    let raf = 0;
    let last = performance.now() / 1000;
    let lastFrame: AudioFrame = {
      fft: new Uint8Array(),
      time: new Uint8Array(),
      bass: 0,
      mid: 0,
      treble: 0,
      level: 0,
      beat: false,
      sinceBeat: 999,
      drop: false,
      energy: 0,
      flux: 0,
    };

    const mountPreset = (id: PresetId) => {
      if (handle) {
        handle.dispose();
        handle = null;
      }
      if (canvas) {
        canvas.remove();
        canvas = null;
      }
      const c = document.createElement("canvas");
      c.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
      // For Canvas2D presets we want no .getContext('webgl') competition; we just create a fresh canvas anyway.
      wrap.appendChild(c);
      canvas = c;
      void NEEDS_2D[id];
      handle = FACTORIES[id]({ canvas: c, getFrame: () => lastFrame });
      activePreset = id;
      resize();
    };

    const resize = () => {
      if (!canvas || !handle) return;
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      handle.resize(r.width, r.height, dpr);
    };

    mountPreset(presetRef.current);

    const tick = () => {
      const now = performance.now() / 1000;
      const dt = Math.min(0.05, now - last);
      last = now;
      lastFrame = audioEngine.read(now);
      if (presetRef.current !== activePreset) mountPreset(presetRef.current);
      handle?.render(now, dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      handle?.dispose();
      canvas?.remove();
    };
  }, []);

  return <div ref={wrapRef} className="absolute inset-0 overflow-hidden" />;
}
