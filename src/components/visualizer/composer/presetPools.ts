import type { ModuleFactory } from "../modules/types";
import { createTunnelRings } from "../modules/TunnelRings";
import { createParticleSwarm } from "../modules/ParticleSwarm";
import { createRibbonField } from "../modules/RibbonField";
import { createPlexus } from "../modules/Plexus";
import { createSupershape } from "../modules/Supershape";
import { createStarfield } from "../modules/Starfield";
import { createRingBurst } from "../modules/RingBurst";
import { createBouncingGeo } from "../modules/BouncingGeo";
import { createNeonGrid } from "../modules/NeonGrid";
import { createWormhole } from "../modules/Wormhole";
import { createFluidShader } from "../modules/FluidShader";
import { createMetaBalls } from "../modules/MetaBalls";
import { createTypeBurst } from "../modules/TypeBurst";
import { createWaveform } from "../modules/Waveform";
import { createMediaKaleido } from "../modules/media/MediaKaleido";
import { createSlitScan } from "../modules/media/SlitScan";
import { createCollageStrobe } from "../modules/media/CollageStrobe";
import { createCameraEcho } from "../modules/media/CameraEcho";
import type { CameraBehavior } from "./CameraDirector";
import type { PresetId } from "../presets/types";

export type PresetPool = {
  factories: ModuleFactory[];
  activeCount: number;
  cameraBias: CameraBehavior[];
  initialPalette: number;
  postBias: {
    kaleido?: number;
    warp?: number;
    chroma?: number;
    scanlines?: number;
    glitch?: number;
    feedback?: number;
  };
  bgColor: number;
};

const ALL: ModuleFactory[] = [
  createTunnelRings, createWormhole, createNeonGrid, createStarfield,
  createParticleSwarm, createRingBurst, createBouncingGeo, createRibbonField,
  createPlexus, createSupershape, createFluidShader, createMetaBalls, createTypeBurst,
  createWaveform,
  createMediaKaleido, createSlitScan, createCollageStrobe, createCameraEcho,
];

export const POOLS: Record<PresetId, PresetPool> = {
  tunnel: {
    factories: ALL,
    activeCount: 3,
    cameraBias: ["dolly-forward", "snap-zoom", "side-track", "free-roam"],
    initialPalette: 0,
    postBias: { chroma: 0.15, feedback: 0.6 },
    bgColor: 0x07020d,
  },
  plasma: {
    factories: ALL,
    activeCount: 3,
    cameraBias: ["slow-orbit", "free-roam", "spin", "barrel-roll"],
    initialPalette: 3,
    postBias: { kaleido: 0.5, warp: 0.3, feedback: 0.8 },
    bgColor: 0x0a0014,
  },
  glitch: {
    factories: ALL,
    activeCount: 3,
    cameraBias: ["dolly-forward", "snap-zoom", "spin", "barrel-roll", "side-track"],
    initialPalette: 6,
    postBias: { chroma: 0.6, scanlines: 1, glitch: 0.7, feedback: 0.3 },
    bgColor: 0x050207,
  },
  liquid: {
    factories: ALL,
    activeCount: 3,
    cameraBias: ["slow-orbit", "free-roam", "side-track"],
    initialPalette: 5,
    postBias: { warp: 0.25, feedback: 0.85 },
    bgColor: 0x000510,
  },
};
