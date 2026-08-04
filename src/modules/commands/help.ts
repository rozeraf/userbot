import type { CommandModule } from "./types";

export const helpCommand: CommandModule = {
  name: "help",
  match: (text) => text === "!help",
  async run({ message }) {
    const helpText = `Доступные команды:
ℹ️ !status - Показать активный LLM провайдер.
🤖 !gemini / !cerebras - Переключить активный провайдер на Gemini или Cerebras.
✍️ !answer [инструкция] - Сгенерировать ответ с помощью нейросети. Можно использовать как ответ (reply) на сообщение.
🌐 !translate [язык] [текст] - Перевести текст на указанный язык (по умолчанию русский) с автоопределением исходного языка.
❓ !help - Показать это справочное сообщение.`;

    await message.reply({ message: helpText });
    return true;
  },
};
