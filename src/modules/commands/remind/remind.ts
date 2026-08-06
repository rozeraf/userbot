import type { CommandModule } from "../types";

export const remindCommand: CommandModule = {
  name: "remind",
  match: (text) => text === "!remind" || text.startsWith("!remind "),
  async run({ client, message, text }) {
    const userInput = text.slice("!remind".length).trim();

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

    try {
      console.log("[remind] sending forward to @longarmraf_bot");
      await client.sendMessage("@longarmraf_bot", {
        message: `/remind ${userInput}`,
      });

      try {
        await message.reply({
          message: `Запрос на напоминание отправлен боту @longarmraf_bot: \`/remind ${userInput}\``,
        });
      } catch (replyErr) {
        console.error("[remind] failed to send success reply:", replyErr);
      }
      return true;
    } catch (err) {
      console.error("[remind] error forwarding to @longarmraf_bot:", err);
      try {
        await message.reply({ message: "Ошибка при отправке запроса в @longarmraf_bot." });
      } catch (replyErr) {
        console.error("[remind] failed to send error reply:", replyErr);
      }
      throw err;
    }
  },
};
