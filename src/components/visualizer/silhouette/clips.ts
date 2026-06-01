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

export const CLIPS: ClipTag[] = [
  { id: "dancer-slow", src: dancerSlowAsset.url, duration: 6, naturalBpm: 90, energy: "low", motion: "slow-drift", archetypes: ["ambient","house","classical"], phases: ["intro","breakdown","groove"], vibeKeywords: ["dance","float","dream","soft","slow"] },
  { id: "dancer-fierce", src: dancerSlowAsset.url, duration: 4, naturalBpm: 128, energy: "high", motion: "dancing", archetypes: ["house","techno","hiphop","pop"], phases: ["drop","groove","build"], vibeKeywords: ["dance","club","energy","fierce","move"] },
  { id: "fighter-punch", src: dancerSlowAsset.url, duration: 3, naturalBpm: 160, energy: "explosive", motion: "fighting", archetypes: ["dnb","techno","rock"], phases: ["drop","build"], vibeKeywords: ["fight","power","hard","raw","punch"] },
  { id: "rain-walk", src: rainWalkAsset.url, duration: 8, naturalBpm: 85, invertLuma: true, threshold: 0.55, energy: "low", motion: "walking", archetypes: ["ambient","house","classical"], phases: ["intro","breakdown","groove"], vibeKeywords: ["rain","night","city","alone","walk","neon"] },
  { id: "city-walk", src: rainWalkAsset.url, duration: 6, naturalBpm: 100, invertLuma: true, threshold: 0.55, energy: "medium", motion: "walking", archetypes: ["hiphop","house","techno"], phases: ["groove","build","intro"], vibeKeywords: ["city","urban","street","night","cool"] },
  { id: "spinning-figure", src: fabricFlowAsset.url, duration: 4, naturalBpm: 120, invertLuma: true, threshold: 0.45, energy: "medium", motion: "spinning", archetypes: ["techno","house","dnb"], phases: ["groove","drop"], vibeKeywords: ["spin","orbit","rotate","hypnotic"] },
  { id: "reaching-up", src: reachingUpAsset.url, duration: 5, naturalBpm: 95, invertLuma: true, threshold: 0.5, energy: "medium", motion: "slow-drift", archetypes: ["ambient","classical","house"], phases: ["build","groove","breakdown"], vibeKeywords: ["reach","sky","transcend","float","rise"] },
  { id: "fabric-flow", src: fabricFlowAsset.url, duration: 7, naturalBpm: 75, invertLuma: true, threshold: 0.45, energy: "low", motion: "abstract", archetypes: ["ambient","classical"], phases: ["intro","breakdown"], vibeKeywords: ["silk","flow","soft","wind","dream","fabric"] },
  { id: "smoke-rise", src: fabricFlowAsset.url, duration: 8, naturalBpm: 70, invertLuma: true, threshold: 0.45, energy: "low", motion: "abstract", archetypes: ["ambient","hiphop"], phases: ["intro","breakdown","groove"], vibeKeywords: ["smoke","haze","chill","lo-fi","drift"] },
  { id: "birds-flock", src: reachingUpAsset.url, duration: 6, naturalBpm: 110, invertLuma: true, threshold: 0.5, energy: "medium", motion: "abstract", archetypes: ["ambient","classical","house"], phases: ["build","groove"], vibeKeywords: ["birds","free","sky","swarm","nature"] },
  { id: "city-skyline", src: rainWalkAsset.url, duration: 8, naturalBpm: 90, invertLuma: true, threshold: 0.55, energy: "medium", motion: "slow-drift", archetypes: ["techno","hiphop","house"], phases: ["intro","groove","breakdown"], vibeKeywords: ["city","skyline","urban","night","neon","4am"] },
  { id: "falling-backward", src: dancerSlowAsset.url, duration: 4, naturalBpm: 140, energy: "high", motion: "slow-drift", archetypes: ["dnb","techno","rock"], phases: ["drop","build"], vibeKeywords: ["fall","gravity","lose","drop","void"] },
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
  const scored = CLIPS.filter((c) => c.id !== lastClipId).map((c) => {
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
