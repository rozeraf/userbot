import { ENV } from "../../config/env";
import { combineSystemPrompts, normalizeText } from "./prompt";
import { errorMessage } from "../errors";
import { HttpError, withLlmRetries } from "./retry";

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

export async function askCerebras(prompt: string, systemPrompt?: string): Promise<string> {
  const url = "https://api.cerebras.ai/v1/chat/completions";

  const t0 = nowMs();
  console.log("[cerebras] request start");

  const messages: Array<{ role: "system" | "user"; content: string }> = [];

  const activeSystemPrompt = combineSystemPrompts(ENV.SYSTEM_PROMPT, systemPrompt);
  if (activeSystemPrompt) {
    messages.push({ role: "system", content: activeSystemPrompt });
  }

  messages.push({ role: "user", content: prompt });

  try {
    return await withLlmRetries("cerebras", ENV.CEREBRAS_API_KEYS, async (apiKey, signal) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: ENV.CEREBRAS_MODEL,
          messages,
          temperature: 0.7,
        }),
        signal,
      });

      console.log("[cerebras] status:", res.status, "elapsedMs:", nowMs() - t0);

      if (!res.ok) {
        const errText = await res.text();
        console.error("[cerebras] error body:", errText);
        throw new HttpError(res.status, `Cerebras API error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as CerebrasChatResponse;
      console.log("[cerebras] raw response keys:", Object.keys(data ?? {}));

      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("Cerebras returned empty response");

      console.log("[cerebras] response ok, totalMs:", nowMs() - t0);
      return normalizeText(text);
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Cerebras API request timed out (45s)");
    }
    throw new Error(errorMessage(err), { cause: err });
  }
}
