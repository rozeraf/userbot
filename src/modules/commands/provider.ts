import { state } from "../../core/state";
import type { CommandModule } from "./types";

export const providerCommand: CommandModule = {
  name: "provider",
  match: (text) => text === "!gemini" || text === "!cerebras",
  async run({ message, text }) {
    if (text === "!gemini") {
      state.setProvider("gemini");
      console.log("[state] provider switched to gemini");
      await message.reply({ message: "Провайдер переключен на Gemini." });
      return true;
    }

    if (text === "!cerebras") {
      state.setProvider("cerebras");
      console.log("[state] provider switched to cerebras");
      await message.reply({ message: "Провайдер переключен на Cerebras." });
      return true;
    }

    return false;
  },
};
