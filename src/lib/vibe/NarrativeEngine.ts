import type { NarrativeState, TimelineEntry, VibeConfig } from "./types";
import type { AudioFrame } from "@/lib/audio/AudioEngine";

export class NarrativeEngine {
  private state: NarrativeState;
  private vibeConfig: VibeConfig | null;

  constructor(vibeConfig: VibeConfig | null) {
    this.vibeConfig = vibeConfig;
    const now = performance.now() / 1000;
    this.state = {
      memory: vibeConfig?.narrativeSeed ?? "Session just started. No data yet.",
      timeline: [],
      totalDrops: 0,
      totalBeats: 0,
      sessionStartedAt: now,
      lastDirectionAt: now,
    };
  }

  get memory(): string { return this.state.memory; }
  get timeline(): TimelineEntry[] { return this.state.timeline; }
  get totalDrops(): number { return this.state.totalDrops; }
  get sessionStartedAt(): number { return this.state.sessionStartedAt; }

  updateMemory(newMemory: string) {
    if (newMemory && newMemory.trim()) this.state.memory = newMemory.trim().slice(0, 400);
  }

  recordDrop(t: number) {
    this.state.totalDrops++;
    this.addEntry(t, "drop", `Drop #${this.state.totalDrops}`);
  }

  recordBeat() { this.state.totalBeats++; }

  recordArchetypeChange(t: number, archetype: string) {
    this.addEntry(t, "archetype-change", `Archetype → ${archetype}`);
  }

  recordAIDirection(t: number, note: string) {
    this.state.lastDirectionAt = t;
    this.addEntry(t, "ai-direction", note);
  }

  recordPhaseChange(t: number, phase: string) {
    this.addEntry(t, "phase-change", `Phase → ${phase}`);
  }

  private addEntry(t: number, type: TimelineEntry["type"], note: string) {
    const elapsed = t - this.state.sessionStartedAt;
    this.state.timeline.push({ t: elapsed, type, note });
    if (this.state.timeline.length > 30) {
      this.state.timeline = this.state.timeline.slice(-30);
    }
  }

  buildContext(f: AudioFrame, elapsed: number): string {
    const recentTimeline = this.state.timeline
      .slice(-8)
      .map((e) => `[${e.t.toFixed(0)}s] ${e.note}`)
      .join(" → ");

    return JSON.stringify({
      vibePrompt: this.vibeConfig ? `"${this.vibeConfig.moodLabel}"` : "none",
      memory: this.state.memory,
      recentEvents: recentTimeline || "none yet",
      elapsed: elapsed.toFixed(0) + "s",
      totalDrops: this.state.totalDrops,
      phase: f.phase,
      bpm: f.bpm,
      energy: +f.energy.toFixed(3),
      bass: +f.bass.toFixed(3),
      mid: +f.mid.toFixed(3),
      treble: +f.treble.toFixed(3),
      flux: +f.flux.toFixed(3),
    });
  }
}
