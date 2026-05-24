import type { AudioFrame } from "@/lib/audio/AudioEngine";

/**
 * Bar/beat-locked phase clock.
 * - Advances phase at BPM/60 Hz; one full "beat" = phase wrap 0..1.
 * - Snaps gently to detected beats (no jumps).
 * - Tracks a downbeat counter so callers can schedule on bar boundaries.
 * - Defaults to 4/4 with 4 beats per bar.
 */
export class BarClock {
  private beatPhase = 0;        // 0..1, fraction of current beat
  private beatCount = 0;        // total beats elapsed since start
  private bpm = 120;            // current tempo
  private lastBeatT = 0;
  private confidence = 0;       // 0..1, raises as we see consistent beats
  beatsPerBar = 4;

  /** Push the latest audio frame; advances phase by dt. */
  update(t: number, dt: number, f: AudioFrame) {
    if (f.bpm > 60 && f.bpm < 200) {
      // smooth BPM
      this.bpm = this.bpm * 0.92 + f.bpm * 0.08;
    }
    const bps = this.bpm / 60;
    this.beatPhase += dt * bps;

    if (f.beat) {
      // align phase to 0 on actual beat, but ease toward it
      // wrap-aware shortest path
      const wrapped = this.beatPhase - Math.floor(this.beatPhase);
      const err = wrapped > 0.5 ? wrapped - 1 : wrapped; // signed distance to 0
      // ease 60% of the error away — avoids visible jumps
      this.beatPhase -= err * 0.6;
      this.confidence = Math.min(1, this.confidence + 0.08);
      this.lastBeatT = t;
    } else {
      this.confidence = Math.max(0, this.confidence - dt * 0.02);
    }

    while (this.beatPhase >= 1) {
      this.beatPhase -= 1;
      this.beatCount += 1;
    }
  }

  /** Returns true once per beat (use as a tempo-locked tick). */
  consumeBeat(): boolean {
    if (this.beatPhase < 0.01 && performance.now() / 1000 - this._lastConsumed > 60 / Math.max(60, this.bpm) * 0.5) {
      this._lastConsumed = performance.now() / 1000;
      return true;
    }
    return false;
  }
  private _lastConsumed = 0;

  /** Current beat index in the bar (0..beatsPerBar-1). */
  get barBeat(): number { return this.beatCount % this.beatsPerBar; }
  /** True for the duration of the downbeat. */
  get isDownbeat(): boolean { return this.barBeat === 0 && this.beatPhase < 0.25; }
  /** Total bars elapsed. */
  get bar(): number { return Math.floor(this.beatCount / this.beatsPerBar); }
  /** Phase 0..1 within current bar. */
  get barPhase(): number { return ((this.beatCount % this.beatsPerBar) + this.beatPhase) / this.beatsPerBar; }
  /** Current beat phase 0..1. */
  get phase(): number { return this.beatPhase; }
  get currentBpm(): number { return this.bpm; }
  get conf(): number { return this.confidence; }
  /** Returns true exactly once each bar boundary, given the last call. */
  private _lastBar = -1;
  consumeBar(): boolean {
    const b = this.bar;
    if (b !== this._lastBar) { this._lastBar = b; return true; }
    return false;
  }
  /** Returns true exactly once every N bars. */
  consumeBarsEvery(n: number): boolean {
    if (n < 1) return false;
    const b = this.bar;
    if (b !== this._lastBar && b % n === 0) { this._lastBar = b; return true; }
    return false;
  }
}
