import { HistoryRepository } from "../history/repository";
import type { AnalysisTool } from "./types";

const history = new HistoryRepository();

export const searchMessagesTool: AnalysisTool = {
  definition: {
    name: "search_messages",
    description: "Search the user's local Telegram message history. Use this for questions about past messages, people, codes, agreements, dates, or facts from chats.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Literal keywords likely to occur in the messages" },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  execute(argumentsValue) {
    if (!argumentsValue || typeof argumentsValue !== "object") throw new Error("search_messages arguments must be an object");
    const args = argumentsValue as Record<string, unknown>;
    if (typeof args.query !== "string" || !args.query.trim()) throw new Error("search_messages.query must be a non-empty string");
    const limit = typeof args.limit === "number" ? args.limit : 8;
    const evidence = history.searchMessages(args.query, limit);
    return { result: evidence, evidence };
  },
};
