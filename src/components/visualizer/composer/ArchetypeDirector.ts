import type { AudioFrame } from "@/lib/audio/AudioEngine";
import { ARCHETYPES, classifyLocal, type ArchetypeDef, type ArchetypeId } from "./archetypes";
import { BarClock } from "./BarClock";
import type { EventBus } from "./EventBus";

/**
 * Tempo-locked director.
 * - Drives a BarClock from audio frames.
 * - Picks an archetype via local heuristic (smoothed) — may be overridden by AI.
 * - Emits remix/flash/palette-flip/snap-zoom events on bar boundaries.
 */
export class ArchetypeDirector {
  private clock = new BarClock();
  private events: EventBus;
  private current: ArchetypeId = "house";
  private lastArchetypeSwitch = 0;
  private lastRemixBar = -999;
  private candidateCounts = new Map<ArchetypeId, number>();
  private lockedByAI = false;
  private lockUntil = 0;
  private onChangeCb?: (a: ArchetypeDef) => void;

  constructor(events: EventBus) {
    this.events = events;
  }

  onArchetypeChange(cb: (a: ArchetypeDef) => void) { this.onChangeCb = cb; }

  /** AI can override locally-classified archetype for a window. */
  setAIArchetype(id: ArchetypeId, holdSec = 25) {
    if (!ARCHETYPES[id]) return;
    this.lockedByAI = true;
    this.lockUntil = performance.now() / 1000 + holdSec;
    if (id !== this.current) this.switchTo(id);
  }

  private switchTo(id: ArchetypeId) {
    this.current = id;
    this.lastArchetypeSwitch = performance.now() / 1000;
    this.onChangeCb?.(ARCHETYPES[id]);
  }

  get archetype(): ArchetypeDef { return ARCHETYPES[this.current]; }
  get bpm(): number { return this.clock.currentBpm; }
  get barClock(): BarClock { return this.clock; }

  update(t: number, dt: number, f: AudioFrame) {
    this.clock.update(t, dt, f);

    // Vote on archetype every frame, switch only after consistent votes.
    if (this.lockedByAI && t > this.lockUntil) this.lockedByAI = false;
    if (!this.lockedByAI && f.energy > 0.04) {
      const vote = classifyLocal({
        bpm: f.bpm || this.clock.currentBpm,
        centroid: f.centroid,
        bassToTreble: f.bassToTreble,
        percuss: f.percuss,
        energy: f.energy,
      });
      this.candidateCounts.set(vote, (this.candidateCounts.get(vote) ?? 0) + 1);
      // Decay other counts
      for (const [k, v] of this.candidateCounts) {
        if (k !== vote) this.candidateCounts.set(k, v * 0.998);
      }
      // Switch if a different archetype wins by margin AND it's been ≥20s
      if (t - this.lastArchetypeSwitch > 20) {
        const sorted = [...this.candidateCounts.entries()].sort((a, b) => b[1] - a[1]);
        if (sorted[0] && sorted[0][0] !== this.current && sorted[0][1] > 60) {
          this.switchTo(sorted[0][0]);
          this.candidateCounts.clear();
        }
      }
    }

    // Tempo-locked events on bar boundaries.
    const arch = ARCHETYPES[this.current];
    if (this.clock.consumeBar()) {
      const bar = this.clock.bar;
      if (bar - this.lastRemixBar >= arch.barsPerSwap) {
        this.lastRemixBar = bar;
        this.events.emit("remix");
        // High-intensity archetypes flip palette more often
        if (Math.random() < arch.intensityBias * 0.6) this.events.emit("palette-flip");
      }
      // Snap zoom on every other bar for fast archetypes
      if (arch.barsPerSwap <= 4 && bar % 2 === 0) this.events.emit("snap-zoom");
      // Kaleido flip occasionally
      if (Math.random() < arch.intensityBias * 0.15) this.events.emit("kaleido-flip");
    }

    // On-drop: forward to bus
    if (f.drop) this.events.emit("drop");
  }
}
