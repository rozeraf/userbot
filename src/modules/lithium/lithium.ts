import type { CommandModule } from "../types";
import { commandText } from "../../../config/commands";

interface LithiumStatus {
  level: number;
  max?: number;
  nextRegen: string;
}

export const lithiumCommand: CommandModule = {
  name: "lithium",
  match: (text) => text === commandText("lithium"),
  async run({ message }) {
    const level = "100";
    const max = "100";
    const nextRegen = "через";

    const status: LithiumStatus = {
      level: parseInt(level),
      max: max ? parseInt(max) : undefined,
      nextRegen,
    };

    const statusText = `🔋 Литий: ${level}${status.max ? `/${status.max}` : ""} ${status.nextRegen} регенерацию`;

    try {
      await message.reply({ message: statusText });
    } catch (err) {
      console.error("[lithium] failed to send reply:", err);
    }
    return true;
  },
};