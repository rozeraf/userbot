import type { Provider } from "../../config/env";
import { state } from "../state";
import { askCerebras } from "./cerebras";
import { askGemini } from "./gemini";

export async function askByProvider(provider: Provider, prompt: string, systemPrompt?: string): Promise<string> {
  console.log("[llm] activeProvider:", provider);
  if (provider === "cerebras") return await askCerebras(prompt, systemPrompt);
  return await askGemini(prompt, systemPrompt);
}

export async function askCurrent(prompt: string, systemPrompt?: string): Promise<string> {
  return await askByProvider(state.getProvider(), prompt, systemPrompt);
}
