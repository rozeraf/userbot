import { buildPrompt } from "../../../core/llm/prompt";
import type { CommandModule } from "../types";
import { commandArgs, commandText, matchesCommand } from "../../../config/commands";
import { executeLlmReply } from "../llmReply";

export const summarizeCommand: CommandModule = {
  name: "summarize",
  match: (text) => matchesCommand(text, "summarize"),
  async run({ client, message, text, correlationId, provider }) {
    const userPrompt = commandArgs(text, "summarize");
    const replied = await message.getReplyMessage();
    const originalText = replied?.text?.trim?.() ?? "";

    console.log("[summarize] trigger detected", {
      userPromptPresent: Boolean(userPrompt),
      repliedPresent: Boolean(originalText),
      chatId: message.chatId?.toString?.(),
    });

    if (!userPrompt && !originalText) {
      try {
        await message.reply({
          message: `Нужно либо ответить на длинное сообщение с ${commandText("summarize")}, либо написать текст после ${commandText("summarize")}.`,
        });
      } catch (replyErr) {
        console.error("[summarize] failed to send input validation reply:", replyErr);
      }
      return true;
    }

    const prompt = buildPrompt(userPrompt, originalText);

    // Prepare system instructions for summarizing
    const systemInstruction = `You are a text summarization assistant.
Your task is to provide a concise, high-quality summary of the provided text.

Rules:
- Capture all key information, main points, and conclusions.
- Output ONLY the summary. Do not include any introduction, explanations, markdown code blocks, quotes, or conversational filler. Just the summary.
- If the original text is short, make the summary extremely brief and to the point.
- Write the summary in the same language as the original text.`;

    console.log("[summarize] prompt length:", prompt.length);

    await executeLlmReply({
      client, message, prompt, systemInstruction, replyToId: replied?.id, logPrefix: "summarize", provider,
      auditContext: { correlationId, commandName: "summarize", chatId: message.chatId?.toString(), messageId: message.id },
      sendErrorMessage: "Ошибка при отправке суммаризации в Telegram.",
      llmErrorMessage: "Ошибка при обращении к LLM, смотри логи.",
    });
    return true;
  },
};
