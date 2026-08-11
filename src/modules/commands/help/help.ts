import type { CommandModule } from "../types";
import { commandText } from "../../../config/commands";

export const helpCommand: CommandModule = {
  name: "help",
  match: (text) => text === commandText("help"),
  async run({ message }) {
    const helpText = `Доступные команды:
ℹ️ ${commandText("status")} - Показать активный LLM провайдер.
🤖 ${commandText("gemini")} / ${commandText("cerebras")} - Переключить активный провайдер на Gemini или Cerebras.
✍️ ${commandText("ai")} [инструкция] - Сгенерировать ответ с помощью нейросети. Можно использовать как ответ (reply) на сообщение.
🌐 ${commandText("translate")} [язык] [текст] - Перевести текст на указанный язык (по умолчанию русский) с автоопределением исходного языка.
📝 ${commandText("summarize")} [инструкция] - Создать краткое содержание (выжимку) длинного текста или сообщения.
🔧 ${commandText("fix")} [текст] - Исправить грамматику и пунктуацию в сообщении.
🔎 ${commandText("find")} [запрос] - Найти сообщения в локальной истории.
💡 ${commandText("explain")} [понятие] - Объяснить выделенный фрагмент текста или термин.
⏰ ${commandText("remind")} [время] [текст] - Запланировать напоминание в «Избранном».
❓ ${commandText("help")} - Показать это справочное сообщение.`;

    try {
      await message.reply({ message: helpText });
    } catch (err) {
      console.error("[help] failed to send reply:", err);
    }
    return true;
  },
};
