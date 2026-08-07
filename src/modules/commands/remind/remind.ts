import type { CommandModule } from "../types";
import { ENV } from "../../../config/env";

export const remindCommand: CommandModule = {
  name: "remind",
  match: (text) => text === "!remind" || text.startsWith("!remind "),
  async run({ client, message, text }) {
    const userInput = text.slice("!remind".length).replace(/[\r\n]+/g, " ").trim();

    console.log("[remind] trigger detected", {
      userInputPresent: Boolean(userInput),
      chatId: message.chatId?.toString?.(),
    });

    if (!userInput) {
      try {
        await message.reply({
          message: "Использование:\n!remind [время] [текст]\nПример: !remind 20m Позвонить маме",
        });
      } catch (replyErr) {
        console.error("[remind] failed to send input validation reply:", replyErr);
      }
      return true;
    }

    const reminderBot = ENV.REMINDER_BOT_USERNAME;
    if (!reminderBot) {
      await message.reply({
        message: "Команда !remind не настроена: укажи REMINDER_BOT_USERNAME в .env.",
      });
      return true;
    }

    try {
      console.log(`[remind] sending forward to ${reminderBot}`);
      await client.sendMessage(reminderBot, {
        message: `/remind ${userInput}`,
      });

      try {
        await message.reply({
          message: `Запрос на напоминание отправлен боту ${reminderBot}: \`/remind ${userInput}\``,
        });
      } catch (replyErr) {
        console.error("[remind] failed to send success reply:", replyErr);
      }
      return true;
    } catch (err) {
      console.error(`[remind] error forwarding to ${reminderBot}:`, err);
      try {
        await message.reply({ message: `Ошибка при отправке запроса в ${reminderBot}.` });
      } catch (replyErr) {
        console.error("[remind] failed to send error reply:", replyErr);
      }
      throw err;
    }
  },
};
