import { ENV } from "../../config/env";
import { normalizeText } from "./prompt";

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
      }[];
    };
  }[];
  usageMetadata?: unknown;
  modelVersion?: string;
  responseId?: string;
}

function nowMs(): number {
  return Date.now();
}

export async function askGemini(prompt: string, systemPrompt?: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${ENV.GEMINI_MODEL}:generateContent?key=${ENV.GEMINI_API_KEY}`;

  const t0 = nowMs();
  console.log("[gemini] request start");

  const body: Record<string, unknown> = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
  };

  const activeSystemPrompt = systemPrompt ?? ENV.SYSTEM_PROMPT;
  if (activeSystemPrompt) {
    body.systemInstruction = {
      parts: [{ text: activeSystemPrompt }],
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  console.log("[gemini] status:", res.status, "elapsedMs:", nowMs() - t0);

  if (!res.ok) {
    const errText = await res.text();
    console.error("[gemini] error body:", errText);
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as GeminiResponse;
  console.log("[gemini] raw response keys:", Object.keys(data ?? {}));

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");

  console.log("[gemini] response ok, totalMs:", nowMs() - t0);
  return normalizeText(text);
}
