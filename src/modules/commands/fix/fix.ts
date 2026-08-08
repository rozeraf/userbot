import { buildPrompt } from "../../../core/llm/prompt";
import type { CommandModule } from "../types";
import { commandArgs, commandText, matchesCommand } from "../../../config/commands";
import { executeLlmReply } from "../llmReply";

export const fixCommand: CommandModule = {
  name: "fix",
  match: (text) => matchesCommand(text, "fix"),
  async run({ client, message, text, correlationId, provider }) {
    const userPrompt = commandArgs(text, "fix");
    const replied = await message.getReplyMessage();
    const originalText = replied?.text?.trim?.() ?? "";

    console.log("[fix] trigger detected", {
      userPromptPresent: Boolean(userPrompt),
      repliedPresent: Boolean(originalText),
      chatId: message.chatId?.toString?.(),
    });

    if (!userPrompt && !originalText) {
      try {
        await message.reply({
          message: `Нужно либо ответить на сообщение с ошибками с помощью ${commandText("fix")}, либо написать текст после ${commandText("fix")}.`,
        });
      } catch (replyErr) {
        console.error("[fix] failed to send input validation reply:", replyErr);
      }
      return true;
    }

    const prompt = buildPrompt(userPrompt, originalText);

    // Prepare system instructions for grammar correction
    const systemInstruction = `You are a text correction and proofreading assistant.
Your task is to correct any grammatical, spelling, punctuation, and stylistic errors in the provided text.

Rules:
- Output ONLY the corrected text. Do not include any introduction, explanations, comparison/diff, markdown code blocks, quotes, or conversational filler. Just the corrected text.
- Maintain the original meaning, tone, format, emojis, and language.
- Pay explicit attention to punctuation and capitalization: ensure sentence-starting letters are capitalized, proper names are capitalized, and missing or incorrect commas, periods, and other punctuation marks are correctly placed.
- If the original text is correct and has no errors, output the original text exactly.`;

    console.log("[fix] prompt length:", prompt.length);

    await executeLlmReply({
      client, message, prompt, systemInstruction, replyToId: replied?.id, logPrefix: "fix", provider,
      auditContext: { correlationId, commandName: "fix", chatId: message.chatId?.toString(), messageId: message.id },
      sendErrorMessage: "Ошибка при отправке исправленного текста в Telegram.",
      llmErrorMessage: "Ошибка при обращении к LLM, смотри логи.",
    });
    return true;
  },
};
