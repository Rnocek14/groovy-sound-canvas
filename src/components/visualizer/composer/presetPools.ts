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
import type { CameraBehavior } from "./CameraDirector";
import type { PresetId } from "../presets/types";

export type PresetPool = {
  factories: ModuleFactory[];
  activeCount: number;
  cameraBias: CameraBehavior[];
  initialPalette: number;
  postBias: {
    kaleido?: number;   // 0..1 default kaleido strength
    warp?: number;
    chroma?: number;
    scanlines?: number;
    glitch?: number;
  };
  bgColor: number;
};

export const POOLS: Record<PresetId, PresetPool> = {
  tunnel: {
    factories: [
      createTunnelRings, createWormhole, createNeonGrid, createStarfield,
      createParticleSwarm, createRingBurst, createBouncingGeo, createRibbonField,
    ],
    activeCount: 3,
    cameraBias: ["dolly-forward", "snap-zoom", "side-track", "free-roam"],
    initialPalette: 0,
    postBias: { chroma: 0.15 },
    bgColor: 0x07020d,
  },
  plasma: {
    factories: [
      createRibbonField, createParticleSwarm, createPlexus, createSupershape,
      createTunnelRings, createStarfield, createRingBurst,
    ],
    activeCount: 3,
    cameraBias: ["slow-orbit", "free-roam", "spin", "barrel-roll"],
    initialPalette: 3,
    postBias: { kaleido: 0.6, warp: 0.3 },
    bgColor: 0x0a0014,
  },
  glitch: {
    factories: [
      createTunnelRings, createRibbonField, createParticleSwarm, createPlexus,
      createBouncingGeo, createRingBurst, createSupershape,
    ],
    activeCount: 3,
    cameraBias: ["dolly-forward", "snap-zoom", "spin", "barrel-roll", "side-track"],
    initialPalette: 6,
    postBias: { chroma: 0.6, scanlines: 1, glitch: 0.7 },
    bgColor: 0x050207,
  },
  liquid: {
    factories: [
      createSupershape, createWormhole, createBouncingGeo, createParticleSwarm,
      createRibbonField, createRingBurst, createPlexus,
    ],
    activeCount: 3,
    cameraBias: ["slow-orbit", "free-roam", "side-track"],
    initialPalette: 5,
    postBias: { warp: 0.2 },
    bgColor: 0x000510,
  },
};
