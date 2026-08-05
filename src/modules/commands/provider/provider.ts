import { ENV } from "../../../config/env";
import { state } from "../../../core/state";
import type { CommandModule } from "../types";
import { database } from "../../../core/db";

export const providerCommand: CommandModule = {
  name: "provider",
  match: (text) => text === "!gemini" || text === "!cerebras",
  async run({ message, text }) {
    if (text === "!gemini") {
      if (!ENV.GEMINI_API_KEY) {
        try {
          await message.reply({ message: "Ошибка: В .env не задан GEMINI_API_KEY." });
        } catch (replyErr) {
          console.error("[provider] failed to send error reply:", replyErr);
        }
        return true;
      }
      state.setProvider("gemini");
      console.log("[state] provider switched to gemini");
      database.logEvent({
        eventType: "provider_changed",
        level: "info",
        message: "LLM provider switched to gemini",
        metadata: { provider: "gemini" },
      });
      try {
        await message.reply({ message: "Провайдер переключен на Gemini." });
      } catch (replyErr) {
        console.error("[provider] failed to send success reply:", replyErr);
      }
      return true;
    }

    if (text === "!cerebras") {
      if (!ENV.CEREBRAS_API_KEY) {
        try {
          await message.reply({ message: "Ошибка: В .env не задан CEREBRAS_API_KEY." });
        } catch (replyErr) {
          console.error("[provider] failed to send error reply:", replyErr);
        }
        return true;
      }
      state.setProvider("cerebras");
      console.log("[state] provider switched to cerebras");
      database.logEvent({
        eventType: "provider_changed",
        level: "info",
        message: "LLM provider switched to cerebras",
        metadata: { provider: "cerebras" },
      });
      try {
        await message.reply({ message: "Провайдер переключен на Cerebras." });
      } catch (replyErr) {
        console.error("[provider] failed to send success reply:", replyErr);
      }
      return true;
    }

    return false;
  },
};
