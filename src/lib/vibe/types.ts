export type VibeConfig = {
  paletteHex: string[];
  paletteLabel: string;
  moduleWeights: Record<string, number>;
  post: {
    kaleido: number;
    warp: number;
    chroma: number;
    scanlines: number;
    glitch: number;
    feedback: number;
  };
  cameraBias: string;
  words: string[];
  archetypeHint: string;
  mediaPrompt: string;
  narrativeSeed: string;
  moodLabel: string;
};

export type TimelineEntry = {
  t: number;
  type: "drop" | "archetype-change" | "ai-direction" | "remix" | "phase-change";
  note: string;
};

export type NarrativeState = {
  memory: string;
  timeline: TimelineEntry[];
  totalDrops: number;
  totalBeats: number;
  sessionStartedAt: number;
  lastDirectionAt: number;
};
