import { buildPrompt } from "../../../core/llm/prompt";
import type { CommandModule } from "../types";
import { commandArgs, commandText, matchesCommand } from "../../../config/commands";
import { executeLlmReply } from "../llmReply";

export const answerCommand: CommandModule = {
  name: "answer",
  match: (text) => matchesCommand(text, "answer"),
  async run({ client, message, text, correlationId, provider }) {
    const userPrompt = commandArgs(text, "answer");
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
          message: `Нужно либо ответить на сообщение, либо написать промпт после ${commandText("answer")}.`,
        });
      } catch (replyErr) {
        console.error("[answer] failed to send input validation reply:", replyErr);
      }
      return true;
    }

    const prompt = buildPrompt(userPrompt, originalText);

    console.log("[answer] prompt length:", prompt.length);

    await executeLlmReply({
      client, message, prompt, replyToId: replied?.id, logPrefix: "answer", provider,
      auditContext: { correlationId, commandName: "answer", chatId: message.chatId?.toString(), messageId: message.id },
      sendErrorMessage: "Ошибка при отправке ответа в Telegram.",
      llmErrorMessage: "Ошибка при обращении к LLM, смотри логи.",
    });
    return true;
  },
};
