import { useState } from "react";
import { audioEngine } from "@/lib/audio/AudioEngine";

export function PermissionGate({ onReady }: { onReady: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      await audioEngine.start();
      onReady();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Mic access denied");
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-black px-6 text-white">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, #ff2bd6 0%, transparent 50%), radial-gradient(circle at 70% 80%, #00f0ff 0%, transparent 55%)",
          filter: "blur(60px)",
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-8 text-center">
        <div>
          <h1 className="text-[clamp(2.5rem,12vw,5rem)] font-black leading-none tracking-tight">
            WAVE<span className="text-pink-400">.</span>FM
          </h1>
          <p className="mt-3 text-xs font-bold tracking-[0.4em] text-white/70">
            MIC-REACTIVE VISUALIZER
          </p>
        </div>
        <button
          onClick={start}
          disabled={busy}
          className="group relative rounded-full border-2 border-white bg-white px-10 py-5 text-sm font-black tracking-[0.3em] text-black transition-transform active:scale-95 disabled:opacity-60"
        >
          {busy ? "LISTENING…" : "TAP TO START"}
          <span className="pointer-events-none absolute -inset-2 rounded-full border border-white/50 opacity-0 group-active:opacity-100" />
        </button>
        <p className="max-w-xs text-balance text-xs leading-relaxed text-white/60">
          Allow microphone access and play music near your phone. Best with headphones off and
          phone speaker pointed at the source.
        </p>
        {err && (
          <p className="rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {err}
          </p>
        )}
      </div>
      <p className="absolute bottom-4 z-10 text-[10px] tracking-widest text-white/40">
        TUNNEL · PLASMA · GLITCH · CHROME
      </p>
    </div>
  );
}
