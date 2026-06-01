import dancerSlowAsset from "@/assets/silhouette/dancer-slow.mp4.asset.json";
import fabricFlowAsset from "@/assets/silhouette/fabric-flow.mp4.asset.json";
import rainWalkAsset from "@/assets/silhouette/rain-walk.mp4.asset.json";
import reachingUpAsset from "@/assets/silhouette/reaching-up.mp4.asset.json";

export type ClipTag = {
  id: string;
  src: string;
  duration: number;
  naturalBpm: number;
  /** When true, the silhouette shader keeps BRIGHT pixels as the figure (subject lighter than bg). */
  invertLuma?: boolean;
  /** Optional override for the luma threshold (0..1). */
  threshold?: number;
  energy: "low" | "medium" | "high" | "explosive";
  motion: "slow-drift" | "walking" | "dancing" | "fighting" | "spinning" | "abstract";
  archetypes: string[];
  phases: string[];
  vibeKeywords: string[];
};

// Only real footage — no aliases. Each clip points to a distinct video.
export const CLIPS: ClipTag[] = [
  {
    id: "dancer-slow",
    src: dancerSlowAsset.url,
    duration: 6, naturalBpm: 95,
    invertLuma: true, threshold: 0.5,
    energy: "medium", motion: "dancing",
    archetypes: ["ambient","house","classical","techno","hiphop","pop","dnb","rock"],
    phases: ["intro","breakdown","groove","build","drop"],
    vibeKeywords: ["dance","crouch","shadow","light","move","body","fierce","club","energy"],
  },
  {
    id: "rain-walk",
    src: rainWalkAsset.url,
    duration: 8, naturalBpm: 85,
    invertLuma: true, threshold: 0.55,
    energy: "low", motion: "walking",
    archetypes: ["ambient","house","hiphop","classical","techno"],
    phases: ["intro","breakdown","groove"],
    vibeKeywords: ["rain","night","city","alone","walk","neon","street","4am","urban","cool"],
  },
  {
    id: "fabric-flow",
    src: fabricFlowAsset.url,
    duration: 7, naturalBpm: 75,
    invertLuma: true, threshold: 0.45,
    energy: "low", motion: "abstract",
    archetypes: ["ambient","classical","house"],
    phases: ["intro","breakdown","groove"],
    vibeKeywords: ["silk","flow","soft","wind","dream","fabric","smoke","haze","drift","spin"],
  },
  {
    id: "reaching-up",
    src: reachingUpAsset.url,
    duration: 5, naturalBpm: 95,
    invertLuma: true, threshold: 0.5,
    energy: "medium", motion: "slow-drift",
    archetypes: ["ambient","classical","house","pop","rock"],
    phases: ["build","groove","breakdown","drop"],
    vibeKeywords: ["reach","sky","transcend","float","rise","portrait","arm"],
  },
];

export function pickClip(opts: {
  archetype: string;
  phase: string;
  energy: number;
  vibeKeywords: string[];
  lastClipId: string | null;
  clipHint: string | null;
}): ClipTag {
  const { archetype, phase, energy, vibeKeywords, lastClipId, clipHint } = opts;
  if (clipHint) {
    const direct = CLIPS.find((c) => c.id === clipHint || c.vibeKeywords.includes(clipHint.toLowerCase()));
    if (direct && direct.id !== lastClipId) return direct;
  }
  const energyLevel: ClipTag["energy"] =
    energy > 0.7 ? "explosive" : energy > 0.45 ? "high" : energy > 0.2 ? "medium" : "low";
  const order = ["low", "medium", "high", "explosive"];
  const candidates = CLIPS.filter((c) => c.id !== lastClipId);
  const pool = candidates.length ? candidates : CLIPS;
  const scored = pool.map((c) => {
    let score = 0;
    if (c.archetypes.includes(archetype)) score += 3;
    if (c.phases.includes(phase)) score += 2;
    if (c.energy === energyLevel) score += 2;
    else if (Math.abs(order.indexOf(c.energy) - order.indexOf(energyLevel)) === 1) score += 1;
    const overlap = c.vibeKeywords.filter((k) =>
      vibeKeywords.some((v) => v.toLowerCase().includes(k) || k.includes(v.toLowerCase()))
    ).length;
    score += overlap * 2;
    score += Math.random() * 0.5;
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.c ?? CLIPS[0];
}
