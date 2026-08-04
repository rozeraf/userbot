import { state } from "../../core/state";
import type { CommandModule } from "./types";

export const statusCommand: CommandModule = {
  name: "status",
  match: (text) => text === "!status",
  async run({ message }) {
    await message.reply({
      message: `Активный провайдер: ${state.getProvider()}`,
    });
    return true;
  },
};
