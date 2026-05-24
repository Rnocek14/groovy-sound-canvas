import type { AudioFrame } from "@/lib/audio/AudioEngine";

export type PresetId = "tunnel" | "plasma" | "glitch" | "liquid";

export type PresetProps = {
  canvas: HTMLCanvasElement;
  getFrame: () => AudioFrame;
};

export type PresetHandle = {
  resize: (w: number, h: number, dpr: number) => void;
  render: (t: number, dt: number) => void;
  dispose: () => void;
};

export type PresetFactory = (props: PresetProps) => PresetHandle;
