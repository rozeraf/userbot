import type { CommandModule } from "../types";

export const helpCommand: CommandModule = {
  name: "help",
  match: (text) => text === "!help",
  async run({ message }) {
    const helpText = `Доступные команды:
ℹ️ !status - Показать активный LLM провайдер.
🤖 !gemini / !cerebras - Переключить активный провайдер на Gemini или Cerebras.
✍️ !answer [инструкция] - Сгенерировать ответ с помощью нейросети. Можно использовать как ответ (reply) на сообщение.
🌐 !translate [язык] [текст] - Перевести текст на указанный язык (по умолчанию русский) с автоопределением исходного языка.
📝 !summarize [инструкция] - Создать краткое содержание (выжимку) длинного текста или сообщения.
🔧 !fix [текст] - Исправить грамматику и пунктуацию в сообщении.
💡 !explain [понятие] - Объяснить выделенный фрагмент текста или термин.
⏰ !remind [время] [текст] - Установить напоминание (пересылает команду боту @longarmraf_bot).
❓ !help - Показать это справочное сообщение.`;

    try {
      await message.reply({ message: helpText });
    } catch (err) {
      console.error("[help] failed to send reply:", err);
    }
    return true;
  },
};
