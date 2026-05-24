import { useEffect, useState } from "react";
import type { PresetId } from "./presets/types";
import { audioEngine } from "@/lib/audio/AudioEngine";

const PRESETS: { id: PresetId; label: string }[] = [
  { id: "tunnel", label: "TUNNEL" },
  { id: "plasma", label: "PLASMA" },
  { id: "glitch", label: "GLITCH" },
  { id: "liquid", label: "CHROME" },
];

export function ControlsDock({
  preset,
  setPreset,
  sensitivity,
  setSensitivity,
  videoOn,
  setVideoOn,
  onExit,
  visible,
}: {
  preset: PresetId;
  setPreset: (p: PresetId) => void;
  sensitivity: number;
  setSensitivity: (n: number) => void;
  videoOn: boolean;
  setVideoOn: (v: boolean) => void;
  onExit: () => void;
  visible: boolean;
}) {
  useEffect(() => {
    audioEngine.sensitivity = sensitivity;
  }, [sensitivity]);

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="pointer-events-auto flex gap-2 overflow-x-auto">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={`flex-shrink-0 rounded-full border px-4 py-2 text-xs font-bold tracking-widest backdrop-blur-md transition-colors ${
              preset === p.id
                ? "border-white bg-white text-black"
                : "border-white/40 bg-black/40 text-white/80"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/20 bg-black/50 px-4 py-3 backdrop-blur-md">
        <span className="text-[10px] font-bold tracking-widest text-white/70">GAIN</span>
        <input
          type="range"
          min={0.3}
          max={3}
          step={0.05}
          value={sensitivity}
          onChange={(e) => setSensitivity(parseFloat(e.target.value))}
          className="flex-1 accent-white"
        />
        <button
          onClick={() => setVideoOn(!videoOn)}
          className={`rounded-full border px-3 py-1 text-[10px] font-bold tracking-widest ${
            videoOn ? "border-white bg-white text-black" : "border-white/40 text-white/70"
          }`}
        >
          VIDEO
        </button>
        <button
          onClick={onExit}
          className="rounded-full border border-white/40 px-3 py-1 text-[10px] font-bold tracking-widest text-white/70"
        >
          EXIT
        </button>
      </div>
    </div>
  );
}

export function TopBadge({ preset, visible }: { preset: PresetId; visible: boolean }) {
  const [beats, setBeats] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = () => {
      const now = performance.now() / 1000;
      const f = audioEngine.read(now);
      if (f.beat) {
        setBeats((b) => b + 1);
        last = now;
      }
      void last;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] text-[10px] font-bold tracking-[0.3em] text-white/80 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <span>● LIVE · {preset.toUpperCase()}</span>
      <span>BEATS {beats}</span>
    </div>
  );
}
