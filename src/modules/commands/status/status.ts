import { state } from "../../../core/state";
import type { CommandModule } from "../types";
import { commandText } from "../../../config/commands";

export const statusCommand: CommandModule = {
  name: "status",
  match: (text) => text === commandText("status"),
  async run({ message }) {
    try {
      await message.reply({
        message: `Активный провайдер: ${state.getProvider()}`,
      });
    } catch (err) {
      console.error("[status] failed to send reply:", err);
    }
    return true;
  },
};
