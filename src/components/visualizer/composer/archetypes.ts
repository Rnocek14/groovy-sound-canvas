import type { CameraBehavior } from "./CameraDirector";

export type ArchetypeId =
  | "techno" | "house" | "ambient" | "dnb"
  | "hiphop" | "rock" | "classical" | "pop";

export type ArchetypeDef = {
  id: ArchetypeId;
  label: string;
  // module weights — higher = picked more often
  moduleWeights: Record<string, number>;
  // post-FX bias targets
  post: {
    kaleido?: number; warp?: number; chroma?: number;
    scanlines?: number; glitch?: number; feedback?: number;
  };
  // palette family (indices into PaletteEngine palettes, or "custom")
  paletteHints: number[];
  // camera bank
  cameras: CameraBehavior[];
  // media filter modules to favor (ids of media modules)
  mediaFavor: string[];
  // bar rhythm — swap modules every N bars
  barsPerSwap: number;
  // intensity bias (0..1) for post effects
  intensityBias: number;
  // background hex
  bg: number;
  // image-gen prompt seed
  mediaPrompt: string;
};

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  techno: {
    id: "techno", label: "TECHNO",
    moduleWeights: {
      "neon-grid": 3, "media-kaleido": 3, "tunnel-rings": 2, "ring-burst": 2,
      "media-collage": 2, "fluid-shader": 1, "wormhole": 1.5,
    },
    post: { kaleido: 0.55, chroma: 0.35, glitch: 0.2, feedback: 0.55, scanlines: 0.1 },
    paletteHints: [0, 2, 3, 6],
    cameras: ["dolly-forward", "snap-zoom", "spin", "barrel-roll"],
    mediaFavor: ["media-kaleido", "media-collage", "media-datamosh"],
    barsPerSwap: 8,
    intensityBias: 0.8,
    bg: 0x05030a,
    mediaPrompt: "abstract chrome reflections, dark techno club, neon strobe, high contrast cyan and magenta, motion blur",
  },
  house: {
    id: "house", label: "HOUSE",
    moduleWeights: {
      "ribbon-field": 3, "tunnel-rings": 2, "particle-swarm": 2,
      "media-slitscan": 2.5, "media-flow": 2, "fluid-shader": 2, "starfield": 1.5,
    },
    post: { warp: 0.3, feedback: 0.7, chroma: 0.15, kaleido: 0.15 },
    paletteHints: [1, 5, 7],
    cameras: ["slow-orbit", "free-roam", "side-track", "dolly-forward"],
    mediaFavor: ["media-slitscan", "media-flow"],
    barsPerSwap: 16,
    intensityBias: 0.55,
    bg: 0x0a0214,
    mediaPrompt: "warm sunset gradient over ocean waves, golden hour palm trees, dreamy soft focus, deep house aesthetic",
  },
  ambient: {
    id: "ambient", label: "AMBIENT",
    moduleWeights: {
      "fluid-shader": 4, "meta-balls": 3, "starfield": 2,
      "media-datamosh": 3, "media-flow": 2.5, "ribbon-field": 1.5,
    },
    post: { feedback: 0.92, warp: 0.45, kaleido: 0.2 },
    paletteHints: [5, 7],
    cameras: ["slow-orbit", "free-roam"],
    mediaFavor: ["media-datamosh", "media-flow", "media-slitscan"],
    barsPerSwap: 32,
    intensityBias: 0.35,
    bg: 0x000408,
    mediaPrompt: "soft cosmic nebula, ethereal smoke clouds, deep underwater bioluminescence, slow flowing ink in water",
  },
  dnb: {
    id: "dnb", label: "DNB",
    moduleWeights: {
      "media-collage": 3, "ring-burst": 3, "tunnel-rings": 2, "neon-grid": 2,
      "wormhole": 2.5, "media-kaleido": 2, "type-burst": 2,
    },
    post: { scanlines: 0.6, glitch: 0.7, chroma: 0.6, kaleido: 0.3, feedback: 0.3 },
    paletteHints: [0, 3, 6],
    cameras: ["snap-zoom", "barrel-roll", "spin", "dolly-forward"],
    mediaFavor: ["media-collage", "media-kaleido", "media-datamosh"],
    barsPerSwap: 4,
    intensityBias: 0.95,
    bg: 0x040208,
    mediaPrompt: "high contrast cyberpunk city, neon graffiti, glitch art, sharp lime green and hot pink, broken glass",
  },
  hiphop: {
    id: "hiphop", label: "HIP-HOP",
    moduleWeights: {
      "media-collage": 4, "type-burst": 3, "media-kaleido": 2, "neon-grid": 2,
      "bouncing-geo": 2, "starfield": 1.5,
    },
    post: { chroma: 0.3, scanlines: 0.25, feedback: 0.5, kaleido: 0.2 },
    paletteHints: [1, 4, 7],
    cameras: ["snap-zoom", "side-track", "dolly-forward"],
    mediaFavor: ["media-collage", "media-kaleido"],
    barsPerSwap: 8,
    intensityBias: 0.75,
    bg: 0x0a0608,
    mediaPrompt: "gold chains and chrome rims, urban graffiti, halftone dots, 90s rap magazine aesthetic, bold red and gold",
  },
  rock: {
    id: "rock", label: "ROCK",
    moduleWeights: {
      "media-strobe": 3, "ring-burst": 2, "particle-swarm": 2,
      "media-kaleido": 1.5, "bouncing-geo": 2, "neon-grid": 1,
    },
    post: { chroma: 0.4, scanlines: 0.2, glitch: 0.35, feedback: 0.4 },
    paletteHints: [4, 6],
    cameras: ["snap-zoom", "spin", "side-track", "barrel-roll"],
    mediaFavor: ["media-collage", "media-datamosh"],
    barsPerSwap: 8,
    intensityBias: 0.85,
    bg: 0x080404,
    mediaPrompt: "high contrast black and white concert photography, motion blur stage lights, gritty film grain, fire and smoke",
  },
  classical: {
    id: "classical", label: "CLASSICAL",
    moduleWeights: {
      "starfield": 3, "particle-swarm": 3, "ribbon-field": 2.5,
      "fluid-shader": 2, "media-flow": 2, "plexus": 1.5,
    },
    post: { feedback: 0.8, warp: 0.2, chroma: 0.1, kaleido: 0.1 },
    paletteHints: [5, 7],
    cameras: ["slow-orbit", "free-roam", "dolly-forward"],
    mediaFavor: ["media-flow", "media-slitscan"],
    barsPerSwap: 16,
    intensityBias: 0.5,
    bg: 0x020208,
    mediaPrompt: "golden baroque interior, soft cathedral light, marble statues, gentle particle dust in sunbeams, opulent and serene",
  },
  pop: {
    id: "pop", label: "POP",
    moduleWeights: {
      "media-collage": 3, "media-kaleido": 2.5, "ring-burst": 2, "ribbon-field": 2,
      "particle-swarm": 1.5, "type-burst": 2, "fluid-shader": 1.5,
    },
    post: { feedback: 0.55, kaleido: 0.35, chroma: 0.25, warp: 0.15 },
    paletteHints: [0, 1, 4],
    cameras: ["spin", "snap-zoom", "free-roam", "side-track"],
    mediaFavor: ["media-collage", "media-kaleido", "media-flow"],
    barsPerSwap: 8,
    intensityBias: 0.7,
    bg: 0x0a0410,
    mediaPrompt: "y2k vaporwave collage, holographic stickers, candy colors, glitter, retro disco ball, hyper saturated pink purple cyan",
  },
};

/**
 * Local heuristic — works without AI. Returns the best-guess archetype
 * from instantaneous audio features.
 */
export function classifyLocal(opts: {
  bpm: number; centroid: number; bassToTreble: number;
  percuss: number; energy: number;
}): ArchetypeId {
  const { bpm, centroid, bassToTreble, percuss, energy } = opts;

  // Very low energy → ambient
  if (energy < 0.08) return "ambient";

  // Very fast & high centroid → dnb
  if (bpm > 150 && centroid > 0.45) return "dnb";

  // 4-on-the-floor steady — techno vs house split by brightness
  if (bpm >= 120 && bpm <= 140 && percuss > 0.25) {
    return centroid > 0.4 ? "techno" : "house";
  }

  // Slow + low brightness + sustained → classical/ambient
  if (bpm < 100 && centroid < 0.3 && percuss < 0.2) {
    return bassToTreble > 2 ? "ambient" : "classical";
  }

  // Heavy bass, slow-mid bpm, percussive → hiphop
  if (bpm < 110 && bassToTreble > 1.6 && percuss > 0.2) return "hiphop";

  // High percuss + mid energy + low brightness → rock
  if (percuss > 0.35 && centroid < 0.45) return "rock";

  return "pop";
}
