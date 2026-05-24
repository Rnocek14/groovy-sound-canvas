import { createServerFn } from "@tanstack/react-start";

export type ArchetypeResp = {
  archetype: string; // techno|house|ambient|dnb|hiphop|rock|classical|pop
  confidence: number;
  mood: string;
  mediaPrompt: string; // tip for image gen
};

type Features = {
  bpm: number;
  energy: number;
  centroid: number;
  bassToTreble: number;
  percuss: number;
  flux: number;
  level: number;
};

const SYSTEM = `You are an expert music genre classifier for a real-time audio visualizer. Given short-window audio features, choose ONE of these archetypes that best matches the music's energy and style: techno, house, ambient, dnb, hiphop, rock, classical, pop. Be confident — pick what the features most resemble. Output a mood label (1-3 words) and a short prompt seed for generating a trippy abstract image that matches the vibe.`;

export const getArchetype = createServerFn({ method: "POST" })
  .inputValidator((d: Features) => d)
  .handler(async ({ data }): Promise<ArchetypeResp> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Features: ${JSON.stringify(data)}. Respond with the JSON only.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "set_archetype",
            description: "Choose visual archetype",
            parameters: {
              type: "object",
              properties: {
                archetype: { type: "string", enum: ["techno", "house", "ambient", "dnb", "hiphop", "rock", "classical", "pop"] },
                confidence: { type: "number" },
                mood: { type: "string" },
                mediaPrompt: { type: "string" },
              },
              required: ["archetype", "confidence", "mood", "mediaPrompt"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "set_archetype" } },
      }),
    });
    if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
    const j = await res.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("No archetype returned");
    return JSON.parse(args) as ArchetypeResp;
  });
