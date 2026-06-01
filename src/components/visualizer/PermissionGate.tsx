import { useState } from "react";
import { audioEngine } from "@/lib/audio/AudioEngine";
import { useServerFn } from "@tanstack/react-start";
import { seedVibe } from "@/lib/vibe/seedVibe";
import type { VibeConfig } from "@/lib/vibe/types";

const inIframe = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

export function PermissionGate({ onReady }: { onReady: (vibe: VibeConfig | null) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [vibePrompt, setVibePrompt] = useState("");
  const [seeding, setSeeding] = useState(false);
  const fetchVibe = useServerFn(seedVibe);

  const start = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setErr("This browser doesn't expose microphone access. Try Safari or Chrome.");
      setBusy(false);
      return;
    }

    const p = navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    p.then(async (stream) => {
      try {
        await audioEngine.start(stream);
        let vibe: VibeConfig | null = null;
        const prompt = vibePrompt.trim();
        if (prompt) {
          setSeeding(true);
          try {
            vibe = await fetchVibe({ data: { prompt } });
          } catch (vErr) {
            console.debug("[seedVibe]", vErr);
          }
          setSeeding(false);
        }
        onReady(vibe);
      } catch (err2) {
        setErr(err2 instanceof Error ? err2.message : "Audio setup failed");
        setBusy(false);
        setSeeding(false);
      }
    }).catch((err2: DOMException) => {
      let msg = err2.message || "Microphone blocked";
      if (err2.name === "NotAllowedError") {
        msg = inIframe()
          ? "Mic blocked by the preview frame. Tap the ⤴ button (top right) to open in a new tab, then try again."
          : "Microphone permission denied. Enable it in your browser settings.";
      } else if (err2.name === "NotFoundError") {
        msg = "No microphone found on this device.";
      } else if (err2.name === "NotReadableError") {
        msg = "Mic is in use by another app. Close it and try again.";
      } else if (err2.name === "SecurityError") {
        msg = "Mic requires HTTPS or the published URL.";
      }
      setErr(msg);
      setBusy(false);
    });
  };

  if (seeding) {
    return (
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-black px-6 text-white">
        <div
          className="absolute inset-0 opacity-40 animate-pulse"
          style={{
            background:
              "radial-gradient(circle at 30% 20%, #ff2bd6 0%, transparent 50%), radial-gradient(circle at 70% 80%, #00f0ff 0%, transparent 55%)",
            filter: "blur(60px)",
          }}
        />
        <div className="relative z-10 flex flex-col items-center gap-4 text-center">
          <p className="text-xs font-bold tracking-[0.4em] text-white/70">SETTING THE SCENE…</p>
          <p className="max-w-sm text-balance text-sm italic text-white/80">"{vibePrompt}"</p>
        </div>
      </div>
    );
  }

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

        <div className="flex w-full max-w-xs flex-col items-center gap-2">
          <p className="text-[10px] font-bold tracking-[0.3em] text-white/50">SET THE VIBE</p>
          <input
            type="text"
            value={vibePrompt}
            onChange={(e) => setVibePrompt(e.target.value.slice(0, 80))}
            placeholder="lost in a neon city at 4am…"
            maxLength={80}
            disabled={busy}
            className="w-full bg-transparent border-b border-white/30 pb-2 text-center text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:border-white/60 tracking-wide"
          />
        </div>

        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="group relative rounded-full border-2 border-white bg-white px-10 py-5 text-sm font-black tracking-[0.3em] text-black transition-transform active:scale-95 disabled:opacity-60"
        >
          {busy ? "LISTENING…" : "TAP TO START"}
        </button>
        <p className="max-w-xs text-balance text-xs leading-relaxed text-white/60">
          Allow microphone access and play music near your phone. If you're in the Lovable
          preview, open in a new tab for mic access.
        </p>
        {err && (
          <p className="max-w-xs rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
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
