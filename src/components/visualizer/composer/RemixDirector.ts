import type { AudioFrame } from "@/lib/audio/AudioEngine";
import type { EventBus } from "./EventBus";

type Opts = {
  events: EventBus;
  macroMin?: number;
  macroMax?: number;
  mesoMin?: number;
  mesoMax?: number;
  microMin?: number;
  microMax?: number;
  reducedMotion?: boolean;
};

const MICRO_KINDS = ["flash", "invert", "snap-zoom", "palette-flip", "kaleido-flip"] as const;

export class RemixDirector {
  private events: EventBus;
  private nextMacro = 0;
  private nextMeso = 0;
  private nextMicro = 0;
  private opts: Required<Omit<Opts, "events">>;
  private started = false;
  constructor(o: Opts) {
    this.events = o.events;
    const r = o.reducedMotion ?? false;
    this.opts = {
      macroMin: o.macroMin ?? 10,
      macroMax: o.macroMax ?? 18,
      mesoMin: o.mesoMin ?? 4,
      mesoMax: o.mesoMax ?? 8,
      microMin: r ? 6 : (o.microMin ?? 1.5),
      microMax: r ? 12 : (o.microMax ?? 4),
      reducedMotion: r,
    };
  }
  private roll(t: number, min: number, max: number) {
    return t + min + Math.random() * (max - min);
  }
  forceMacro(t: number) {
    this.nextMacro = t;
  }
  update(t: number, f: AudioFrame) {
    if (!this.started) {
      this.nextMacro = this.roll(t, this.opts.macroMin, this.opts.macroMax);
      this.nextMeso = this.roll(t, this.opts.mesoMin, this.opts.mesoMax);
      this.nextMicro = this.roll(t, this.opts.microMin, this.opts.microMax);
      this.started = true;
    }
    // Drop relays
    if (f.drop) {
      this.events.emit("drop");
      // Drops bias toward big macros if we've been on this combo a bit
      if (t > this.nextMacro - this.opts.macroMin) {
        this.events.emit("remix");
        this.nextMacro = this.roll(t, this.opts.macroMin, this.opts.macroMax);
      } else {
        // still always punctuate
        const kind = Math.random() < 0.5 ? "snap-zoom" : "flash";
        this.events.emit(kind);
      }
    }
    if (f.beat) this.events.emit("beat");
    if (t >= this.nextMacro) {
      this.events.emit("remix");
      this.nextMacro = this.roll(t, this.opts.macroMin, this.opts.macroMax);
    }
    if (t >= this.nextMeso) {
      // meso = palette half-rotate or partial palette flip
      if (Math.random() < 0.4) this.events.emit("palette-flip");
      else this.events.emit("kaleido-flip");
      this.nextMeso = this.roll(t, this.opts.mesoMin, this.opts.mesoMax);
    }
    if (t >= this.nextMicro) {
      const k = MICRO_KINDS[Math.floor(Math.random() * MICRO_KINDS.length)];
      this.events.emit(k);
      this.nextMicro = this.roll(t, this.opts.microMin, this.opts.microMax);
    }
  }
}
