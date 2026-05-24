import type { ArchetypeId } from "../composer/archetypes";

export type MediaAsset = {
  id: string;
  url: string;
  archetypes: ArchetypeId[]; // which archetypes prefer this asset
  mood: string;
};

export const BUILTIN_PACK: MediaAsset[] = [
  { id: "chrome-neon",       url: "/visualizer-media/chrome-neon.jpg",       archetypes: ["techno", "dnb", "pop"],          mood: "neon chrome" },
  { id: "sunset-palms",      url: "/visualizer-media/sunset-palms.jpg",      archetypes: ["house", "ambient", "pop"],       mood: "warm sunset" },
  { id: "nebula-ink",        url: "/visualizer-media/nebula-ink.jpg",        archetypes: ["ambient", "classical", "house"], mood: "ethereal" },
  { id: "cyberpunk-street",  url: "/visualizer-media/cyberpunk-street.jpg",  archetypes: ["dnb", "techno", "hiphop"],       mood: "cyberpunk" },
  { id: "vapor-collage",     url: "/visualizer-media/vapor-collage.jpg",     archetypes: ["pop", "hiphop", "house"],        mood: "y2k vapor" },
  { id: "concert-bw",        url: "/visualizer-media/concert-bw.jpg",        archetypes: ["rock", "dnb"],                   mood: "gritty live" },
  { id: "cathedral-gold",    url: "/visualizer-media/cathedral-gold.jpg",    archetypes: ["classical", "ambient"],          mood: "baroque" },
  { id: "urban-gold",        url: "/visualizer-media/urban-gold.jpg",        archetypes: ["hiphop", "rock", "pop"],         mood: "graffiti gold" },
];
