import { askCurrent } from "../../../core/llm";
import { buildPrompt, preview } from "../../../core/llm/prompt";
import type { CommandModule } from "../types";

function nowMs(): number {
  return Date.now();
}

export const explainCommand: CommandModule = {
  name: "explain",
  match: (text) => text === "!explain" || text.startsWith("!explain "),
  async run({ client, message, text }) {
    const t0 = nowMs();

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

    try {
      const t1 = nowMs();
      const answer = await askCurrent(prompt, systemInstruction);
      console.log("[explain] model done inMs:", nowMs() - t1);
      console.log("[explain] answer preview:", preview(answer, 200));

      const replyToId = replied?.id;
      console.log("[explain] sending reply", {
        replyToId,
        chatId: message.chatId?.toString?.(),
      });

      const sendStart = nowMs();
      try {
        await client.sendMessage(message.chatId!, {
          message: answer,
          ...(replyToId ? { replyTo: replyToId } : {}),
        });
      } catch (sendErr) {
        console.error("[explain] telegram send message error:", sendErr);
        try {
          await message.reply({ message: "Ошибка при отправке объяснения в Telegram." });
        } catch (replyErr) {
          console.error("[explain] failed to send telegram error reply:", replyErr);
        }
      }

      console.log("[explain] telegram send done inMs:", nowMs() - sendStart);
      console.log("[explain] total elapsed inMs:", nowMs() - t0);
      return true;
    } catch (err) {
      console.error("[explain] error:", err);
      try {
        await message.reply({ message: "Ошибка при обращении к LLM, смотри логи." });
      } catch (replyErr) {
        console.error("[explain] failed to send error reply:", replyErr);
      }
      throw err;
    }
  },
};
