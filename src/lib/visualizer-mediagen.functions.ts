import { createServerFn } from "@tanstack/react-start";

export type MediaGenResp = { dataUrl: string };

export const generateMedia = createServerFn({ method: "POST" })
  .inputValidator((d: { prompt: string }) => d)
  .handler(async ({ data }): Promise<MediaGenResp> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        modalities: ["image", "text"],
        messages: [
          { role: "user", content: `Generate a single trippy abstract texture suitable for VJ visualization. Strong colors, no text, no people, 1:1 square, high detail, suitable for tiling/sampling. Vibe: ${data.prompt}` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
    const j = await res.json();
    const url: string | undefined = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) throw new Error("No image returned");
    return { dataUrl: url };
  });
