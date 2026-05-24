import { useEffect, useRef, useState } from "react";
import { MediaBank } from "./media/MediaBank";

export function MediaTray({ visible }: { visible: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(MediaBank.list());
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const off = MediaBank.onChange(() => setItems(MediaBank.list()));
    return () => { off; };
  }, []);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) await MediaBank.addUserFile(f);
  };

  const userCount = items.filter((i) => i.source === "user").length;
  const aiCount = items.filter((i) => i.source === "ai").length;

  return (
    <div
      className={`pointer-events-none absolute right-4 top-4 z-20 flex flex-col items-end gap-2 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto rounded-full border border-white/40 bg-black/50 px-3 py-1 text-[10px] font-bold tracking-widest text-white/80 backdrop-blur-md"
      >
        MEDIA · {items.length} ({userCount}U / {aiCount}AI)
      </button>
      {open && (
        <div className="pointer-events-auto flex max-h-[60vh] w-64 flex-col gap-2 overflow-y-auto rounded-2xl border border-white/20 bg-black/70 p-3 backdrop-blur-md">
          <button
            onClick={() => inputRef.current?.click()}
            className="rounded-full border border-white/40 bg-white/10 px-3 py-2 text-[10px] font-bold tracking-widest text-white"
          >
            + UPLOAD IMAGE / VIDEO
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/mp4"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <div className="grid grid-cols-3 gap-1">
            {items.map((it) => (
              <div
                key={it.id}
                className={`relative aspect-square overflow-hidden rounded border ${
                  it.source === "user" ? "border-emerald-400/60" : it.source === "ai" ? "border-violet-400/60" : "border-white/20"
                } bg-black/40`}
              >
                <div className="absolute inset-0 flex items-center justify-center text-[8px] tracking-wider text-white/60">
                  {it.kind === "video" ? "▶" : "◇"} {it.source[0].toUpperCase()}
                </div>
                {it.source === "user" && (
                  <button
                    onClick={() => MediaBank.removeUserFile(it.id)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/70 px-1 text-[8px] text-white/80"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-[9px] tracking-wider text-white/40">
            Uploads persist in this browser. Tap × to remove.
          </p>
        </div>
      )}
    </div>
  );
}
