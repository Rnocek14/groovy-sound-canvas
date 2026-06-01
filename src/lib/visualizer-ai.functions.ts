import { createServerFn } from "@tanstack/react-start";

export type AIDirection = {
  paletteHex: string[];
  feedback: number;
  warp: number;
  chroma: number;
  kaleido: number;
  scanlines: number;
  glitch: number;
  cameraBias: string;
  moduleHints: string[];
  mood: string;
  word: string;
  narrativeUpdate: string;
  clipHint: string;
};

const SYSTEM = `You are a generative-art VJ director with memory. You receive a JSON context containing:
- vibePrompt: the mood the user set at the start
- memory: a running narrative of how the session has evolved so far
- recentEvents: the last 8 significant moments (drops, archetype changes, your last directions)
- current audio features (phase, bpm, energy, bass/mid/treble, flux)

Your job: direct the visuals in a way that honors the original vibe, responds to the current music, AND builds on what has already happened. Create arc, tension, and resolution across the session. Don't repeat yourself — evolve from what's been done.

After choosing your direction, write a narrativeUpdate: 1-2 sentences describing what you just chose and where the session arc is heading next. This becomes part of memory for next time.

Module ids: tunnel-rings, particle-swarm, ribbon-field, plexus, supershape, starfield, neon-grid, wormhole, bouncing-geo, ring-burst, fluid-shader, meta-balls, typeburst
Camera behaviors: dolly-forward, slow-orbit, side-track, spin, barrel-roll, free-roam, snap-zoom
Higher feedback/warp/kaleido during groove/breakdown. Sharper, more chroma/glitch on drop.
Provide a punchy single-word "word" (uppercase, <=8 chars).
For clipHint pick one silhouette clip id that fits the moment: dancer-slow (dancing/crouched figure, medium energy), rain-walk (lone figure walking through rainy neon city, low energy, intro/breakdown), fabric-flow (soft flowing white fabric, dream/ambient), reaching-up (portrait with raised arm, transcendent/build).`;

export const getVJDirection = createServerFn({ method: "POST" })
  .inputValidator((d: { context: string }) => d)
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Context: ${data.context}\n\nReturn the JSON only.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "set_direction",
            description: "Set the next visual direction",
            parameters: {
              type: "object",
              properties: {
                paletteHex: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                feedback: { type: "number" },
                warp: { type: "number" },
                chroma: { type: "number" },
                kaleido: { type: "number" },
                scanlines: { type: "number" },
                glitch: { type: "number" },
                cameraBias: { type: "string" },
                moduleHints: { type: "array", items: { type: "string" } },
                mood: { type: "string" },
                word: { type: "string" },
                narrativeUpdate: { type: "string" },
                clipHint: { type: "string", description: "Silhouette clip id: dancer-slow, rain-walk, fabric-flow, reaching-up", enum: ["dancer-slow","rain-walk","fabric-flow","reaching-up"] },
              },
              required: ["paletteHex", "feedback", "warp", "chroma", "kaleido", "scanlines", "glitch", "cameraBias", "moduleHints", "mood", "word", "narrativeUpdate", "clipHint"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "set_direction" } },
      }),
    });
    if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
    const j = await res.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("No direction returned");
    return JSON.parse(args) as AIDirection;
  });
