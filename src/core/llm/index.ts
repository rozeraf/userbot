import type { Provider } from "../../config/env";
import { state } from "../state";
import { askCerebras } from "./cerebras";
import { askGemini } from "./gemini";
import { database } from "../db";

export async function askByProvider(provider: Provider, prompt: string, systemPrompt?: string): Promise<string> {
  console.log("[llm] activeProvider:", provider);
  const t0 = Date.now();
  try {
    const response = provider === "cerebras"
      ? await askCerebras(prompt, systemPrompt)
      : await askGemini(prompt, systemPrompt);

    const latencyMs = Date.now() - t0;
    database.logLLMCall({
      provider,
      prompt,
      response,
      latencyMs,
      error: null
    });
    database.logEvent({
      eventType: "llm_success",
      level: "info",
      category: "llm",
      message: `LLM request to ${provider} succeeded in ${latencyMs}ms`,
    });
    return response;
  } catch (err: any) {
    const latencyMs = Date.now() - t0;
    database.logLLMCall({
      provider,
      prompt,
      response: null,
      latencyMs,
      error: err.message || String(err)
    });
    database.logEvent({
      eventType: "llm_error",
      level: "error",
      category: "llm",
      message: `LLM request to ${provider} failed: ${err.message || String(err)}`,
    });
    throw err;
  }
}

export async function askCurrent(prompt: string, systemPrompt?: string): Promise<string> {
  return await askByProvider(state.getProvider(), prompt, systemPrompt);
}
