import type { Provider } from "../../config/env";
import { state } from "../state";
import { askCerebras } from "./cerebras";
import { askGemini } from "./gemini";
import { database } from "../db";
import { errorMessage } from "../errors";

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
  } catch (err: unknown) {
    const latencyMs = Date.now() - t0;
    database.logLLMCall({
      provider,
      prompt,
      response: null,
      latencyMs,
      error: errorMessage(err)
    });
    database.logEvent({
      eventType: "llm_error",
      level: "error",
      category: "llm",
      message: `LLM request to ${provider} failed: ${errorMessage(err)}`,
    });
    throw err;
  }
}

export async function askCurrent(prompt: string, systemPrompt?: string): Promise<string> {
  return await askByProvider(state.getProvider(), prompt, systemPrompt);
}
