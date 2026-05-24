import { useEffect, useRef } from "react";
import { audioEngine, type AudioFrame } from "@/lib/audio/AudioEngine";
import type { PresetId } from "./presets/types";
import { Composer } from "./composer/Composer";

export function VisualizerStage({ preset }: { preset: PresetId }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const presetRef = useRef(preset);
  presetRef.current = preset;
  const composerRef = useRef<Composer | null>(null);

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
    };

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
      resize();
    };
    const resize = () => {
      if (!canvas || !composer) return;
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      composer.resize(r.width, r.height, dpr);
    };

    mount(presetRef.current);

    const tick = () => {
      const now = performance.now() / 1000;
      const dt = Math.min(0.05, now - last);
      last = now;
      lastFrame = audioEngine.read(now);
      if (presetRef.current !== active) mount(presetRef.current);
      composer?.render(now, dt, lastFrame);
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
  }, []);

  return <div ref={wrapRef} className="absolute inset-0 overflow-hidden" />;
}
