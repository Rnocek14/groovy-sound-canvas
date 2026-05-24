import type { AudioFrame } from "@/lib/audio/AudioEngine";
import type { PaletteEngine } from "../composer/PaletteEngine";
import type { EventBus } from "../composer/EventBus";
import type * as THREE from "three";

export type ModuleLayer = "bg" | "mid" | "fg";

export type ModuleCtx = {
  scene: THREE.Scene;
  palette: PaletteEngine;
  events: EventBus;
};

export type VModule = {
  id: string;
  layer: ModuleLayer;
  setIntensity: (v: number) => void;
  update: (t: number, dt: number, f: AudioFrame, intensity: number) => void;
  dispose: () => void;
};

export type ModuleFactory = (ctx: ModuleCtx) => VModule;
