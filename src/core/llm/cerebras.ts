import { ENV } from "../../config/env";
import { normalizeText } from "./prompt";

interface CerebrasChatResponse {
  choices?: {
    message?: {
      content?: string | null;
    };
  }[];
  model?: string;
  usage?: unknown;
}

function nowMs(): number {
  return Date.now();
}

export async function askCerebras(prompt: string): Promise<string> {
  const url = "https://api.cerebras.ai/v1/chat/completions";

  const t0 = nowMs();
  console.log("[cerebras] request start");

  const messages: Array<{ role: "system" | "user"; content: string }> = [];

  if (ENV.SYSTEM_PROMPT) {
    messages.push({ role: "system", content: ENV.SYSTEM_PROMPT });
  }

  messages.push({ role: "user", content: prompt });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.CEREBRAS_API_KEY}`,
    },
    body: JSON.stringify({
      model: ENV.CEREBRAS_MODEL,
      messages,
      temperature: 0.7,
    }),
  });

  console.log("[cerebras] status:", res.status, "elapsedMs:", nowMs() - t0);

  if (!res.ok) {
    const errText = await res.text();
    console.error("[cerebras] error body:", errText);
    throw new Error(`Cerebras API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as CerebrasChatResponse;
  console.log("[cerebras] raw response keys:", Object.keys(data ?? {}));

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Cerebras returned empty response");

  console.log("[cerebras] response ok, totalMs:", nowMs() - t0);
  return normalizeText(text);
}
