import { createServerFn } from "@tanstack/react-start";
import type { VibeConfig } from "./types";

const SYSTEM = `You are a generative-art VJ director seeding a visual session from a user's mood description.
Parse the vibe and return a complete VibeConfig that will govern the entire visualizer session.

Available module ids: tunnel-rings, particle-swarm, ribbon-field, plexus, supershape, starfield, neon-grid, wormhole, bouncing-geo, ring-burst, fluid-shader, meta-balls, typeburst
Available camera behaviors: dolly-forward, slow-orbit, free-roam, spin, snap-zoom, side-track, barrel-roll
Available archetypes: techno, house, ambient, dnb, hiphop, rock, classical, pop

Be bold and specific. Match the palette to the emotional tone.
Pick 3-5 modules that best express the vibe (give them weights 2-4, others can be omitted).
Generate 6-10 short uppercase words (<=8 chars) that feel right for kinetic typography bursts.
Write a 1-sentence narrativeSeed that describes the opening visual scene — this anchors the AI's memory throughout the session.
moodLabel should be 2-3 uppercase words max.`;

export const seedVibe = createServerFn({ method: "POST" })
  .inputValidator((d: { prompt: string }) => d)
  .handler(async ({ data }): Promise<VibeConfig> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `User vibe: "${data.prompt}". Return the VibeConfig JSON only.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "set_vibe",
            description: "Set the complete visual session vibe",
            parameters: {
              type: "object",
              properties: {
                paletteHex: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 6 },
                paletteLabel: { type: "string" },
                moduleWeights: { type: "object", additionalProperties: { type: "number" } },
                post: {
                  type: "object",
                  properties: {
                    kaleido: { type: "number" }, warp: { type: "number" },
                    chroma: { type: "number" }, scanlines: { type: "number" },
                    glitch: { type: "number" }, feedback: { type: "number" },
                  },
                  required: ["kaleido", "warp", "chroma", "scanlines", "glitch", "feedback"],
                },
                cameraBias: { type: "string" },
                words: { type: "array", items: { type: "string" }, minItems: 6, maxItems: 10 },
                archetypeHint: { type: "string" },
                mediaPrompt: { type: "string" },
                narrativeSeed: { type: "string" },
                moodLabel: { type: "string" },
              },
              required: [
                "paletteHex", "paletteLabel", "moduleWeights", "post",
                "cameraBias", "words", "archetypeHint", "mediaPrompt",
                "narrativeSeed", "moodLabel",
              ],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "set_vibe" } },
      }),
    });

    if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
    const j = await res.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("No vibe config returned");
    return JSON.parse(args) as VibeConfig;
  });
