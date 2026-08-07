import fs from "fs";
import path from "path";
import type { Provider } from "../config/env";
import { ENV, hasKeysFor } from "../config/env";

const STATE_FILE = path.join(import.meta.dirname, "../../.provider_state.json");

function loadSavedProvider(): Provider {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, "utf-8").trim();
      if (data === "gemini" || data === "cerebras") {
        // Validate that the loaded provider actually has its API key configured
        if (!hasKeysFor(data)) {
          console.warn(`[state] Saved provider is ${data} but no matching API keys are configured. Falling back to default.`);
          return ENV.LLM_PROVIDER;
        }
        return data;
      }
    }
  } catch (err) {
    console.error("[state] Failed to load saved provider state:", err);
  }
  return ENV.LLM_PROVIDER;
}

let activeProvider: Provider = loadSavedProvider();

export const state = {
  getProvider(): Provider {
    return activeProvider;
  },
  setProvider(next: Provider) {
    activeProvider = next;
    try {
      fs.writeFileSync(STATE_FILE, next, "utf-8");
      console.log(`[state] Saved provider state: ${next}`);
    } catch (err) {
      console.error("[state] Failed to save provider state:", err);
    }
  },
};
