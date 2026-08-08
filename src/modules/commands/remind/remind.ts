import type { CommandModule } from "../types";
import { commandArgs, commandText, matchesCommand } from "../../../config/commands";
import { parseReminderInput } from "./parse";

export const remindCommand: CommandModule = {
  name: "remind",
  match: (text) => matchesCommand(text, "remind"),
  async run({ client, message, text }) {
    const userInput = commandArgs(text, "remind").replace(/[\r\n]+/g, " ").trim();

    console.log("[remind] trigger detected", {
      userInputPresent: Boolean(userInput),
      chatId: message.chatId?.toString?.(),
    });

    const parsed = parseReminderInput(userInput);
    if (!parsed) {
      try {
        await message.reply({
          message: `Использование: ${commandText("remind")} <время> <текст>\nЕдиницы: s/с, m/м, h/ч, d/д\nПример: ${commandText("remind")} 20m Позвонить маме`,
        });
      } catch (replyErr) {
        console.error("[remind] failed to send input validation reply:", replyErr);
      }
      return true;
    }

    try {
      const scheduledAt = new Date(Date.now() + parsed.delayMs);
      console.log("[remind] scheduling message in Saved Messages", { scheduledAt: scheduledAt.toISOString() });
      await client.sendMessage("me", {
        message: `⏰ ${parsed.reminderText}`,
        schedule: Math.floor(scheduledAt.getTime() / 1000),
      });

      try {
        await message.reply({
          message: `Напоминание запланировано в «Избранном» на ${scheduledAt.toLocaleString("ru-RU")}.`,
        });
      } catch (replyErr) {
        console.error("[remind] failed to send success reply:", replyErr);
      }
      return true;
    } catch (err) {
      console.error("[remind] failed to schedule Saved Messages reminder:", err);
      try {
        await message.reply({ message: "Не удалось запланировать напоминание в «Избранном»." });
      } catch (replyErr) {
        console.error("[remind] failed to send error reply:", replyErr);
      }
      throw err;
    }
  },
};
