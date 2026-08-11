import type { CommandModule } from "../types";
import { commandArgs, commandText, matchesCommand } from "../../../config/commands";
import { HistoryRepository } from "../../../core/analysis/history/repository";
import { formatEvidence } from "../../../core/analysis/evidence/format";
import { sendLlmResponse } from "../../../core/telegram";

const history = new HistoryRepository();

export const findCommand: CommandModule = {
  name: "find",
  match: (text) => matchesCommand(text, "find"),
  async run({ client, message, text }) {
    const query = commandArgs(text, "find");
    if (!query) {
      await message.reply({ message: `Напиши поисковый запрос после ${commandText("find")}.` });
      return true;
    }
    const evidence = history.searchMessages(query, 10);
    await sendLlmResponse(client, message.chatId!, formatEvidence(evidence), message.id);
    return true;
  },
};
