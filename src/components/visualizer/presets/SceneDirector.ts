import type { AudioFrame } from "@/lib/audio/AudioEngine";

export type SceneState = {
  id: string;
  index: number;
  age: number;
  progress: number;          // age / maxDuration, clamped 0..1
  justEntered: boolean;      // true for the first render of a scene
  transition01: number;      // 0 at scene start, 1 after `transitionTime`
  outro01: number;           // 0..1 ramp during last `transitionTime` of scene
};

export class SceneDirector {
  private scenes: string[];
  private minDuration: number;
  private maxDuration: number;
  private transitionTime: number;
  private advanceOnDrop: boolean;
  private index = 0;
  private enteredAt = 0;
  private currentMax: number;
  private justEnteredFlag = true;
  private started = false;
  private rng: () => number;

  constructor(opts: {
    scenes: string[];
    minDuration?: number;
    maxDuration?: number;
    transitionTime?: number;
    advanceOnDrop?: boolean;
    seed?: number;
  }) {
    this.scenes = opts.scenes;
    this.minDuration = opts.minDuration ?? 18;
    this.maxDuration = opts.maxDuration ?? 30;
    this.transitionTime = opts.transitionTime ?? 1.2;
    this.advanceOnDrop = opts.advanceOnDrop ?? true;
    // simple mulberry32
    let s = (opts.seed ?? 1) >>> 0;
    this.rng = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.currentMax = this.pickDuration();
  }

  private pickDuration() {
    return this.minDuration + this.rng() * (this.maxDuration - this.minDuration);
  }

  update(t: number, frame: AudioFrame): SceneState {
    if (!this.started) {
      this.enteredAt = t;
      this.started = true;
    }
    const age = t - this.enteredAt;
    const wantsAdvance =
      (this.advanceOnDrop && frame.drop && age > this.minDuration) ||
      age > this.currentMax;
    if (wantsAdvance) {
      this.index = (this.index + 1) % this.scenes.length;
      this.enteredAt = t;
      this.currentMax = this.pickDuration();
      this.justEnteredFlag = true;
    }
    const just = this.justEnteredFlag;
    this.justEnteredFlag = false;
    const newAge = t - this.enteredAt;
    const transition01 = Math.min(1, newAge / this.transitionTime);
    const remaining = this.currentMax - newAge;
    const outro01 = Math.min(1, Math.max(0, 1 - remaining / this.transitionTime));
    return {
      id: this.scenes[this.index],
      index: this.index,
      age: newAge,
      progress: Math.min(1, newAge / this.currentMax),
      justEntered: just,
      transition01,
      outro01,
    };
  }
}
