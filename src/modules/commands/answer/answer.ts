import { buildPrompt, preview } from "../../../core/llm/prompt";
import type { CommandModule } from "../types";
import { executeLlmReply } from "../llmReply";

export const answerCommand: CommandModule = {
  name: "answer",
  match: (text) => text === "!answer" || text.startsWith("!answer "),
  async run({ client, message, text }) {
    const userPrompt = text.slice("!answer".length).trim();
    const replied = await message.getReplyMessage();
    const originalText = replied?.text?.trim?.() ?? "";

    console.log("[answer] trigger detected", {
      provider: undefined,
      userPromptPresent: Boolean(userPrompt),
      repliedPresent: Boolean(originalText),
      chatId: message.chatId?.toString?.(),
    });

    if (!userPrompt && !originalText) {
      try {
        await message.reply({
          message: "Нужно либо ответить на сообщение, либо написать промпт после !answer.",
        });
      } catch (replyErr) {
        console.error("[answer] failed to send input validation reply:", replyErr);
      }
      return true;
    }

    const prompt = buildPrompt(userPrompt, originalText);

    console.log("[answer] prompt length:", prompt.length);
    console.log("[answer] prompt preview:", preview(prompt, 220));

    await executeLlmReply({
      client, message, prompt, replyToId: replied?.id, logPrefix: "answer",
      sendErrorMessage: "Ошибка при отправке ответа в Telegram.",
      llmErrorMessage: "Ошибка при обращении к LLM, смотри логи.",
    });
    return true;
  },
};
