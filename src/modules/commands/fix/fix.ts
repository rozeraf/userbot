import { askCurrent } from "../../../core/llm";
import { buildPrompt, preview } from "../../../core/llm/prompt";
import type { CommandModule } from "../types";

function nowMs(): number {
  return Date.now();
}

export const fixCommand: CommandModule = {
  name: "fix",
  match: (text) => text.startsWith("!fix"),
  async run({ client, message, text }) {
    const t0 = nowMs();

    const userPrompt = text.slice("!fix".length).trim();
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
          message: "Нужно либо ответить на сообщение с ошибками с помощью !fix, либо написать текст после !fix.",
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
    console.log("[fix] prompt preview:", preview(prompt, 220));

    try {
      const t1 = nowMs();
      const answer = await askCurrent(prompt, systemInstruction);
      console.log("[fix] model done inMs:", nowMs() - t1);
      console.log("[fix] answer preview:", preview(answer, 200));

      const replyToId = replied?.id;
      console.log("[fix] sending reply", {
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
        console.error("[fix] telegram send message error:", sendErr);
        try {
          await message.reply({ message: "Ошибка при отправке исправленного текста в Telegram." });
        } catch (replyErr) {
          console.error("[fix] failed to send telegram error reply:", replyErr);
        }
      }

      console.log("[fix] telegram send done inMs:", nowMs() - sendStart);
      console.log("[fix] total elapsed inMs:", nowMs() - t0);
      return true;
    } catch (err) {
      console.error("[fix] error:", err);
      try {
        await message.reply({ message: "Ошибка при обращении к LLM, смотри логи." });
      } catch (replyErr) {
        console.error("[fix] failed to send error reply:", replyErr);
      }
      throw err;
    }
  },
};
