export type ClipTag = {
  id: string;
  src: string;
  duration: number;
  naturalBpm: number;
  energy: "low" | "medium" | "high" | "explosive";
  motion: "slow-drift" | "walking" | "dancing" | "fighting" | "spinning" | "abstract";
  archetypes: string[];
  phases: string[];
  vibeKeywords: string[];
};

export const CLIPS: ClipTag[] = [
  { id: "dancer-slow", src: "dancer-slow.mp4", duration: 6, naturalBpm: 90, energy: "low", motion: "slow-drift", archetypes: ["ambient","house","classical"], phases: ["intro","breakdown","groove"], vibeKeywords: ["dance","float","dream","soft","slow"] },
  { id: "dancer-fierce", src: "dancer-fierce.mp4", duration: 4, naturalBpm: 128, energy: "high", motion: "dancing", archetypes: ["house","techno","hiphop","pop"], phases: ["drop","groove","build"], vibeKeywords: ["dance","club","energy","fierce","move"] },
  { id: "fighter-punch", src: "fighter-punch.mp4", duration: 3, naturalBpm: 160, energy: "explosive", motion: "fighting", archetypes: ["dnb","techno","rock"], phases: ["drop","build"], vibeKeywords: ["fight","power","hard","raw","punch"] },
  { id: "rain-walk", src: "rain-walk.mp4", duration: 8, naturalBpm: 85, energy: "low", motion: "walking", archetypes: ["ambient","house","classical"], phases: ["intro","breakdown","groove"], vibeKeywords: ["rain","night","city","alone","walk","neon"] },
  { id: "city-walk", src: "city-walk.mp4", duration: 6, naturalBpm: 100, energy: "medium", motion: "walking", archetypes: ["hiphop","house","techno"], phases: ["groove","build","intro"], vibeKeywords: ["city","urban","street","night","cool"] },
  { id: "spinning-figure", src: "spinning-figure.mp4", duration: 4, naturalBpm: 120, energy: "medium", motion: "spinning", archetypes: ["techno","house","dnb"], phases: ["groove","drop"], vibeKeywords: ["spin","orbit","rotate","hypnotic"] },
  { id: "reaching-up", src: "reaching-up.mp4", duration: 5, naturalBpm: 95, energy: "medium", motion: "slow-drift", archetypes: ["ambient","classical","house"], phases: ["build","groove","breakdown"], vibeKeywords: ["reach","sky","transcend","float","rise"] },
  { id: "fabric-flow", src: "fabric-flow.mp4", duration: 7, naturalBpm: 75, energy: "low", motion: "abstract", archetypes: ["ambient","classical"], phases: ["intro","breakdown"], vibeKeywords: ["silk","flow","soft","wind","dream","fabric"] },
  { id: "smoke-rise", src: "smoke-rise.mp4", duration: 8, naturalBpm: 70, energy: "low", motion: "abstract", archetypes: ["ambient","hiphop"], phases: ["intro","breakdown","groove"], vibeKeywords: ["smoke","haze","chill","lo-fi","drift"] },
  { id: "birds-flock", src: "birds-flock.mp4", duration: 6, naturalBpm: 110, energy: "medium", motion: "abstract", archetypes: ["ambient","classical","house"], phases: ["build","groove"], vibeKeywords: ["birds","free","sky","swarm","nature"] },
  { id: "city-skyline", src: "city-skyline.mp4", duration: 8, naturalBpm: 90, energy: "medium", motion: "slow-drift", archetypes: ["techno","hiphop","house"], phases: ["intro","groove","breakdown"], vibeKeywords: ["city","skyline","urban","night","neon","4am"] },
  { id: "falling-backward", src: "falling-backward.mp4", duration: 4, naturalBpm: 140, energy: "high", motion: "slow-drift", archetypes: ["dnb","techno","rock"], phases: ["drop","build"], vibeKeywords: ["fall","gravity","lose","drop","void"] },
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
