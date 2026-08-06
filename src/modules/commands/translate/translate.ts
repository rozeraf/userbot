import { preview } from "../../../core/llm/prompt";
import type { CommandModule } from "../types";
import { executeLlmReply } from "../llmReply";

export const translateCommand: CommandModule = {
  name: "translate",
  match: (text) => text === "!translate" || text.startsWith("!translate "),
  async run({ client, message, text }) {
    const userInput = text.slice("!translate".length).trim();
    const replied = await message.getReplyMessage();
    const originalText = replied?.text?.trim?.() ?? "";

    console.log("[translate] trigger detected", {
      userInputPresent: Boolean(userInput),
      repliedPresent: Boolean(originalText),
      chatId: message.chatId?.toString?.(),
    });

    if (!userInput && !originalText) {
      try {
        await message.reply({
          message: "Нужно либо ответить на сообщение с указанием языка (например: !translate ru), либо написать текст после !translate (например: !translate apple).",
        });
      } catch (replyErr) {
        console.error("[translate] failed to send input validation reply:", replyErr);
      }
      return true;
    }

    // Prepare prompt and instructions for translation
    const systemInstruction = `You are a precise translation tool.
Your task is to translate text with auto-detection of the source language.

Instructions:
1. If "Replied text" is present, translate the "Replied text" to the target language specified in "Command input" (e.g. "ru", "en", "английский"). If "Command input" is empty or not a valid language/code, default to translating "Replied text" to Russian.
2. If "Replied text" is not present, the text to translate is in "Command input".
   - Check if the first word of "Command input" is a language name or language code (e.g. "en", "ru", "eng", "rus", "de", "русский", "english").
   - If the first word is a language code/name, translate the rest of the "Command input" to that language.
   - If the first word is not a language, translate the entire "Command input" to Russian.

Output rules:
- Output ONLY the translated text. Do not include any introduction, explanations, markdown code blocks, quotes, or conversational filler. Just the translation.
- Preserve the original tone, punctuation, formatting, emojis, and layout.`;

    const prompt = `Replied text (if any):
"""
${originalText}
"""

Command input:
"""
${userInput}
"""`;

    console.log("[translate] prompt preview:", preview(prompt, 220));

    await executeLlmReply({
      client, message, prompt, systemInstruction, replyToId: replied?.id, logPrefix: "translate",
      sendErrorMessage: "Ошибка при отправке ответа перевода в Telegram.",
      llmErrorMessage: "Ошибка при переводе, смотри логи.",
    });
    return true;
  },
};
