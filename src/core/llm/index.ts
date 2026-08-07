import { ENV, type Provider } from "../../config/env";
import { state } from "../state";
import { askCerebras } from "./cerebras";
import { askGemini } from "./gemini";
import { database } from "../db";
import { errorMessage } from "../errors";
import { limitGraphemes } from "./prompt";

export type LlmRequestContext = {
  correlationId?: string;
  commandName?: string;
  chatId?: string;
  messageId?: number;
};

function modelFor(provider: Provider): string {
  return provider === "cerebras" ? ENV.CEREBRAS_MODEL : ENV.GEMINI_MODEL;
}

export async function askByProvider(
  provider: Provider,
  prompt: string,
  systemPrompt?: string,
  context: LlmRequestContext = {},
): Promise<string> {
  console.log("[llm] activeProvider:", provider);
  prompt = limitGraphemes(prompt, ENV.MAX_LLM_PROMPT_GRAPHEMES);
  const t0 = Date.now();
  try {
    const response = provider === "cerebras"
      ? await askCerebras(prompt, systemPrompt)
      : await askGemini(prompt, systemPrompt);

    const latencyMs = Date.now() - t0;
    database.logLLMCall({
      provider,
      model: modelFor(provider),
      ...context,
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
      model: modelFor(provider),
      ...context,
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

export async function askCurrent(
  prompt: string,
  systemPrompt?: string,
  context?: LlmRequestContext,
): Promise<string> {
  return await askByProvider(state.getProvider(), prompt, systemPrompt, context);
}
