import { HistoryRepository } from "../history/repository";
import type { AnalysisTool } from "./types";

const history = new HistoryRepository();

export type IdentityAliases = ReadonlyMap<string, string>;

function normalizedAlias(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export function createSearchMessagesTool(identityAliases: IdentityAliases = new Map()): AnalysisTool {
  return {
  definition: {
    name: "search_messages",
    description: "Search the user's local Telegram message history. Use this for questions about past messages, people, codes, agreements, dates, or facts from chats.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional literal content keywords. Leave empty when only looking for an author's latest messages." },
        sender: { type: "string", description: "Optional @username whose own messages must be searched" },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
    },
  },
  execute(argumentsValue) {
    if (!argumentsValue || typeof argumentsValue !== "object") throw new Error("search_messages arguments must be an object");
    const args = argumentsValue as Record<string, unknown>;
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const sender = typeof args.sender === "string" ? args.sender : "";
    if (!query && !sender) throw new Error("search_messages requires query or sender");
    const limit = typeof args.limit === "number" ? args.limit : 8;
    const queryTerms = query.split(/\s+/);
    const aliasFromQuery = queryTerms.find((term) => identityAliases.has(normalizedAlias(term)));
    const alias = normalizedAlias(sender || aliasFromQuery || "");
    const senderId = identityAliases.get(alias);
    const contentQuery = aliasFromQuery ? queryTerms.filter((term) => term !== aliasFromQuery).join(" ") : query;
    const evidence = senderId
      ? history.messagesBySender(senderId, contentQuery, limit)
      : history.searchMessages(query || sender, limit);
    return { result: evidence, evidence };
  },
  };
}

export const searchMessagesTool = createSearchMessagesTool();
