import { buildPrompt, preview } from "../../../core/llm/prompt";
import type { CommandModule } from "../types";
import { executeLlmReply } from "../llmReply";

export const explainCommand: CommandModule = {
  name: "explain",
  match: (text) => text === "!explain" || text.startsWith("!explain "),
  async run({ client, message, text }) {
    const userPrompt = text.slice("!explain".length).trim();
    const replied = await message.getReplyMessage();
    const originalText = replied?.text?.trim?.() ?? "";

    console.log("[explain] trigger detected", {
      userPromptPresent: Boolean(userPrompt),
      repliedPresent: Boolean(originalText),
      chatId: message.chatId?.toString?.(),
    });

    if (!userPrompt && !originalText) {
      try {
        await message.reply({
          message: "Нужно либо ответить на сообщение с помощью !explain, либо написать текст/термин после !explain.",
        });
      } catch (replyErr) {
        console.error("[explain] failed to send input validation reply:", replyErr);
      }
      return true;
    }

    const prompt = buildPrompt(userPrompt, originalText);

    // Prepare system instructions for explanation
    const systemInstruction = `You are an educational assistant.
Your task is to explain the provided text, term, or concept clearly, concisely, and accurately.

Rules:
- Provide a clear, structured explanation suitable for the context.
- Keep the explanation concise and direct.
- Output ONLY the explanation. Do not include introductory phrases like "Sure, here is the explanation:" or conversational filler.
- Use the same language as the original text for the explanation.`;

    console.log("[explain] prompt length:", prompt.length);
    console.log("[explain] prompt preview:", preview(prompt, 220));

    await executeLlmReply({
      client, message, prompt, systemInstruction, replyToId: replied?.id, logPrefix: "explain",
      sendErrorMessage: "Ошибка при отправке объяснения в Telegram.",
      llmErrorMessage: "Ошибка при обращении к LLM, смотри логи.",
    });
    return true;
  },
};
