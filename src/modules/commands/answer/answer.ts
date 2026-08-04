import { askCurrent } from "../../../core/llm";
import { buildPrompt, preview } from "../../../core/llm/prompt";
import type { CommandModule } from "../types";

function nowMs(): number {
  return Date.now();
}

export const answerCommand: CommandModule = {
  name: "answer",
  match: (text) => text.startsWith("!answer"),
  async run({ client, message, text }) {
    const t0 = nowMs();

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
      await message.reply({
        message: "Нужно либо ответить на сообщение, либо написать промпт после !answer.",
      });
      return true;
    }

    const prompt = buildPrompt(userPrompt, originalText);

    console.log("[answer] prompt length:", prompt.length);
    console.log("[answer] prompt preview:", preview(prompt, 220));

    try {
      const t1 = nowMs();
      const answer = await askCurrent(prompt);
      console.log("[answer] model done inMs:", nowMs() - t1);
      console.log("[answer] answer preview:", preview(answer, 200));

      const replyToId = replied?.id;
      console.log("[answer] sending reply", {
        replyToId,
        chatId: message.chatId?.toString?.(),
      });

      const sendStart = nowMs();
      await client.sendMessage(message.chatId!, {
        message: answer,
        ...(replyToId ? { replyTo: replyToId } : {}),
      });

      console.log("[answer] telegram send done inMs:", nowMs() - sendStart);
      console.log("[answer] total elapsed inMs:", nowMs() - t0);
      return true;
    } catch (err) {
      console.error("[answer] error:", err);
      await message.reply({ message: "Ошибка при обращении к LLM, смотри логи." });
      return true;
    }
  },
};
