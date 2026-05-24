import { useEffect, useRef } from "react";
import { audioEngine, type AudioFrame } from "./AudioEngine";

export function useAudioRAF(onFrame: (f: AudioFrame, dt: number) => void, enabled: boolean) {
  const cbRef = useRef(onFrame);
  cbRef.current = onFrame;

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last = performance.now() / 1000;
    const tick = () => {
      const now = performance.now() / 1000;
      const dt = Math.min(0.05, now - last);
      last = now;
      const frame = audioEngine.read(now);
      cbRef.current(frame, dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
}
