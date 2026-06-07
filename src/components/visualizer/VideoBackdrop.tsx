import { useEffect, useRef } from "react";
import { audioEngine } from "@/lib/audio/AudioEngine";

// Simple animated CSS-only "video" backdrops as placeholders.
// Three different abstract loops, swapped on cadence / big beats.
const STYLES = [
  // 1: warm gradient sweep
  {
    background:
      "conic-gradient(from 0deg at 50% 50%, #ff2bd6, #ff7e3a, #ffd23f, #00f0ff, #ff2bd6)",
    filter: "blur(40px) saturate(140%)",
  },
  // 2: cool noise-like
  {
    background:
      "radial-gradient(circle at 30% 30%, #2bff8a, transparent 50%), radial-gradient(circle at 70% 60%, #00f0ff, transparent 55%), radial-gradient(circle at 50% 80%, #ff2bd6, transparent 60%), #000",
    filter: "blur(50px) saturate(160%)",
  },
  // 3: sunset bars
  {
    background:
      "linear-gradient(180deg, #2a0a4a 0%, #ff2bd6 40%, #ffd23f 70%, #00f0ff 100%)",
    filter: "blur(30px) saturate(150%)",
  },
] as const;

export function VideoBackdrop({ enabled }: { enabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const idxRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let lastSwap = performance.now() / 1000;
    let rot = 0; // accumulated rotation driven by bass only
    let beatPulse = 0;
    let prevBeat = false;
    const tick = () => {
      const now = performance.now() / 1000;
      // Passive consumer: do NOT call read() (that would mutate beat history twice/frame)
      const f = audioEngine.getLastFrame();
      const el = ref.current;
      if (el) {
        if (f.beat && !prevBeat) beatPulse = Math.min(1, beatPulse + 0.6);
        prevBeat = f.beat;
        beatPulse *= 0.94;
        // Only move when there is audio energy
        const energyGate = Math.min(1, f.level * 2.2);
        rot += (f.bass - 0.15) * 0.6 * energyGate;
        const op = Math.min(0.55, 0.08 + f.level * 0.95);
        el.style.opacity = String(op);
        el.style.transform = `scale(${1.02 + f.bass * 0.09 + beatPulse * 0.04}) rotate(${rot}deg)`;
        if (f.beat && f.bass > 0.55 && now - lastSwap > 4) {
          idxRef.current = (idxRef.current + 1) % STYLES.length;
          Object.assign(el.style, STYLES[idxRef.current]);
          lastSwap = now;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 -z-0"
      style={{ ...STYLES[0], opacity: 0.2, transition: "background 800ms ease, filter 800ms ease" }}
    />
  );
}
