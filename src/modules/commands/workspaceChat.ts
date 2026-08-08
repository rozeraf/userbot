import { executeLlmReply } from "./llmReply";
import type { CommandModule } from "./types";

/** Synthetic command selected by the workspace topic router, never by text. */
export const workspaceChatCommand: CommandModule = {
  name: "workspace_chat",
  match: () => false,
  async run({ client, message, text, correlationId, provider }) {
    await executeLlmReply({
      client,
      message,
      prompt: text,
      provider,
      logPrefix: "workspace/chat",
      auditContext: {
        correlationId,
        commandName: "workspace_chat",
        chatId: message.chatId?.toString(),
        messageId: message.id,
      },
      replyToId: message.id,
      sendErrorMessage: "Не удалось отправить ответ в Chat.",
      llmErrorMessage: "Ошибка при обращении к LLM, смотри System и логи.",
    });
    return true;
  },
};
