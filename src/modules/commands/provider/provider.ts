import { ENV, hasKeysFor } from "../../../config/env";
import type { Provider } from "../../../config/env";
import { state } from "../../../core/state";
import type { CommandModule } from "../types";
import { commandText } from "../../../config/commands";
import { database } from "../../../core/db";

export const providerCommand: CommandModule = {
  name: "provider",
  match: (text) => text === commandText("gemini") || text === commandText("cerebras"),
  async run({ message, text }) {
    const provider: Provider = text === commandText("gemini") ? "gemini" : "cerebras";
    const config = provider === "gemini"
      ? { envName: "GEMINI_API_KEYS", label: "Gemini" }
      : { envName: "CEREBRAS_API_KEYS", label: "Cerebras" };

    if (!hasKeysFor(provider)) {
      try {
        await message.reply({ message: `Ошибка: В .env не задан ${config.envName}.` });
      } catch (replyErr) {
        console.error("[provider] failed to send error reply:", replyErr);
      }
      return true;
    }

    state.setProvider(provider);
    console.log(`[state] provider switched to ${provider}`);
    database.logEvent({
      eventType: "provider_changed",
      level: "info",
      category: "llm",
      message: `LLM provider switched to ${provider}`,
      metadata: { provider },
    });
    try {
      await message.reply({ message: `Провайдер переключен на ${config.label}.` });
    } catch (replyErr) {
      console.error("[provider] failed to send success reply:", replyErr);
    }
    return true;
  },
};
