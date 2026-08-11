import { HistoryRepository } from "../history/repository";
import type { AnalysisTool } from "./types";
import { IdentityResolver } from "../history/identity";
import { hybridSearch } from "../history/hybrid";

const history = new HistoryRepository();

export type IdentityAliases = ReadonlyMap<string, string>;

function normalizedAlias(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

function modelEvidence(evidence: readonly ReturnType<HistoryRepository["searchMessages"]>[number][]) {
  return evidence.map((item) => ({
    ...item,
    timestamp: new Date(item.timestamp).toISOString(),
  }));
}

export function createSearchMessagesTool(identityAliases: IdentityAliases = new Map()): AnalysisTool {
  const identities = new IdentityResolver();
  let activeSenderId: string | undefined;
  let activeChatId: string | undefined;
  return {
  definition: {
    name: "search_messages",
    description: "Search the user's local Telegram message history. Use this for questions about past messages, people, codes, agreements, dates, or facts from chats.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional literal content keywords. Leave empty when only looking for an author's latest messages." },
        sender: { type: "string", description: "Optional @username or display name whose own messages must be searched. Keep using it for every author-specific search." },
        chat: { type: "string", description: "Optional chat title whose messages must be searched. Keep using it for every chat-specific search." },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
    },
  },
  async execute(argumentsValue) {
    if (!argumentsValue || typeof argumentsValue !== "object") throw new Error("search_messages arguments must be an object");
    const args = argumentsValue as Record<string, unknown>;
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const sender = typeof args.sender === "string" ? args.sender : "";
    const chat = typeof args.chat === "string" ? args.chat.trim() : "";
    if (!query && !sender && !chat) throw new Error("search_messages requires query, sender, or chat");
    const limit = typeof args.limit === "number" ? Math.max(1, Math.min(20, Math.trunc(args.limit))) : 20;
    const queryTerms = query.split(/\s+/);
    const aliasFromQuery = queryTerms.find((term) => identityAliases.has(normalizedAlias(term)));
    const alias = normalizedAlias(sender || aliasFromQuery || "");
    let senderId = identityAliases.get(alias);
    let contentQuery = aliasFromQuery ? queryTerms.filter((term) => term !== aliasFromQuery).join(" ") : query;
    if (!senderId && sender) {
      const candidates = identities.resolve(sender, 5).filter((candidate) => candidate.kind === "sender");
      if (candidates.length === 1) senderId = candidates[0]!.id;
    }
    if (!senderId && !sender && queryTerms.length === 1) {
      const candidates = identities.resolve(query, 5).filter((candidate) => candidate.kind === "sender");
      if (candidates.length === 1) {
        senderId = candidates[0]!.id;
        contentQuery = "";
      }
    }
    if (senderId) activeSenderId = senderId;
    senderId ??= activeSenderId;
    const resolvedChat = chat ? identities.findChatInText(chat) : null;
    if (resolvedChat) activeChatId = resolvedChat.id;
    const chatId = resolvedChat?.id ?? activeChatId;

    if (senderId && contentQuery) {
      const matches = await hybridSearch({ query: contentQuery, senderId, chatId, limit: Math.min(12, limit) });
      const recentByAuthor = history.messagesBySender(senderId, "", Math.min(8, limit), chatId)
        .filter((item) => !matches.some((match) => match.dbMessageId === item.dbMessageId));
      const evidence = [...matches, ...recentByAuthor];
      return {
        result: {
          resolvedFilters: {
            sender: senderId ? { requested: sender || aliasFromQuery || null, senderId } : null,
            chat: chatId ? { requested: chat || null, chatId } : null,
          },
          matches: modelEvidence(matches),
          recentByAuthor: modelEvidence(recentByAuthor),
        },
        evidence,
      };
    }
    const matches = senderId
      ? history.messagesBySender(senderId, "", limit, chatId)
      : await hybridSearch({ query: query || sender || chat, chatId, limit });
    return {
      result: {
        resolvedFilters: {
          sender: senderId ? { requested: sender || aliasFromQuery || null, senderId } : null,
          chat: chatId ? { requested: chat || null, chatId } : null,
        },
        matches: modelEvidence(matches),
        recentByAuthor: [],
      },
      evidence: matches,
    };
  },
  };
}

export const searchMessagesTool = createSearchMessagesTool();
