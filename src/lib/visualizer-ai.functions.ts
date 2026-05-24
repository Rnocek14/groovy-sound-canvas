import { createServerFn } from "@tanstack/react-start";

export type AIDirection = {
  paletteHex: string[];       // 4 hex colors
  feedback: number;           // 0..1 feedback echo strength
  warp: number;               // 0..1
  chroma: number;             // 0..1
  kaleido: number;            // 0..1
  scanlines: number;          // 0..1
  glitch: number;             // 0..1
  cameraBias: string;         // one of dolly-forward|slow-orbit|side-track|spin|barrel-roll|free-roam|snap-zoom
  moduleHints: string[];      // module ids to favor: tunnel, particles, ribbons, plexus, supershape, starfield, neongrid, wormhole, bouncinggeo, ringburst, fluid, metaballs, typeburst
  mood: string;               // 1-3 word vibe label
  word: string;               // one-word kinetic typography burst to flash
};

type Features = {
  preset: string;
  phase: string;
  bpm: number;
  energy: number;
  short: number;
  bass: number;
  mid: number;
  treble: number;
  flux: number;
  dropsLastMin: number;
  elapsed: number;
};

const SYSTEM = `You are a generative-art VJ director. Given live audio features, output a JSON visual direction for a real-time WebGL visualizer. Be bold, varied, music-genre aware. Match palette and intensity to the song phase (intro/build/drop/groove/breakdown). Pick 2-4 module hints from: tunnel, particles, ribbons, plexus, supershape, starfield, neongrid, wormhole, bouncinggeo, ringburst, fluid, metaballs, typeburst. Pick cameraBias from: dolly-forward, slow-orbit, side-track, spin, barrel-roll, free-roam, snap-zoom. Output 4 distinct vivid hex colors. Higher feedback/warp/kaleido during groove/breakdown; sharper, cleaner, more chroma/glitch on drop. Provide a punchy single-word "word" to flash as kinetic typography (uppercase, <= 8 chars).`;

export const getVJDirection = createServerFn({ method: "POST" })
  .inputValidator((d: Features) => d)
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");
    const prompt = `Features: ${JSON.stringify(data)}. Respond with the JSON only.`;
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
          { role: "user", content: prompt },
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
              },
              required: ["paletteHex", "feedback", "warp", "chroma", "kaleido", "scanlines", "glitch", "cameraBias", "moduleHints", "mood", "word"],
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
