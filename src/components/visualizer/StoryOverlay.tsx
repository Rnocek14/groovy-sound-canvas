import { useEffect, useState } from "react";
import type { TimelineEntry } from "@/lib/vibe/types";

export type StorySnapshot = {
  memory: string;
  timeline: TimelineEntry[];
  vibeLabel: string | null;
  lastWord?: string;
  lastMood?: string;
};

export function StoryOverlay({
  open,
  onClose,
  snapshot,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: StorySnapshot | null;
}) {
  // Tick to refresh elapsed times
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!open) return;
    const i = window.setInterval(() => setNow((n) => n + 1), 1000);
    return () => window.clearInterval(i);
  }, [open]);

  if (!open) return null;
  const events = snapshot?.timeline?.slice(-12).reverse() ?? [];

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-black/70 p-4 text-white/90 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-[0.3em] text-white/70">
            ● STORY {snapshot?.vibeLabel ? `· ${snapshot.vibeLabel.toUpperCase()}` : ""}
          </span>
          <button
            onClick={onClose}
            className="rounded-full border border-white/30 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white/70"
          >
            CLOSE
          </button>
        </div>

        <div className="mb-3">
          <div className="mb-1 text-[10px] font-bold tracking-widest text-white/50">MEMORY</div>
          <p className="text-sm leading-snug text-white/90">
            {snapshot?.memory || "Listening…"}
          </p>
        </div>

        {(snapshot?.lastMood || snapshot?.lastWord) && (
          <div className="mb-3 flex gap-2 text-[10px] font-bold tracking-widest">
            {snapshot?.lastMood && (
              <span className="rounded-full border border-white/30 px-2 py-0.5">
                MOOD · {snapshot.lastMood.toUpperCase()}
              </span>
            )}
            {snapshot?.lastWord && (
              <span className="rounded-full border border-white/30 px-2 py-0.5">
                WORD · {snapshot.lastWord.toUpperCase()}
              </span>
            )}
          </div>
        )}

        <div>
          <div className="mb-1 text-[10px] font-bold tracking-widest text-white/50">TIMELINE</div>
          <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {events.length === 0 && (
              <li className="text-xs text-white/40">No events yet.</li>
            )}
            {events.map((e, i) => (
              <li key={i} className="flex gap-2 text-xs">
                <span className="w-10 shrink-0 text-white/40">{e.t.toFixed(0)}s</span>
                <span className="text-white/80">{e.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
