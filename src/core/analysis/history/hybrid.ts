import { ENV } from "../../../config/env";
import type { MessageEvidence } from "../evidence/types";
import { embedQuery } from "../embeddings/gemini";
import { normalizeVector } from "../embeddings/vector";
import { HistoryRepository } from "./repository";
import { database } from "../../db";

const history = new HistoryRepository();

export async function hybridSearch(options: {
  query: string;
  senderId?: string;
  chatId?: string;
  limit?: number;
}): Promise<MessageEvidence[]> {
  const limit = Math.max(1, Math.min(20, Math.trunc(options.limit ?? 12)));
  const lexical = options.senderId
    ? history.messagesBySender(options.senderId, options.query, limit, options.chatId)
    : history.searchMessages(options.query, limit, options.chatId);
  if (!ENV.SEMANTIC_SEARCH_ENABLED || !options.query.trim()) return lexical;

  try {
    const startedAt = Date.now();
    const vector = normalizeVector(await embedQuery(`Query: ${options.query}`));
    const semantic = history.semanticSearch(vector, {
      senderId: options.senderId, chatId: options.chatId, limit,
    });
    const scores = new Map<number, { evidence: MessageEvidence; score: number }>();
    lexical.forEach((evidence, rank) => scores.set(evidence.dbMessageId, {
      evidence, score: 1 / (60 + rank + 1),
    }));
    semantic.forEach(({ evidence }, rank) => {
      const current = scores.get(evidence.dbMessageId);
      scores.set(evidence.dbMessageId, {
        evidence,
        score: (current?.score ?? 0) + 1 / (60 + rank + 1),
      });
    });
    const result = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.evidence);
    database.logEvent({
      eventType: "hybrid_search_complete", level: "info", category: "llm",
      message: `Hybrid search returned ${result.length} result(s)`,
      metadata: {
        query: options.query,
        senderId: options.senderId,
        chatId: options.chatId,
        lexicalIds: lexical.map((item) => item.dbMessageId),
        semanticIds: semantic.map((item) => item.evidence.dbMessageId),
        resultIds: result.map((item) => item.dbMessageId),
        latencyMs: Date.now() - startedAt,
      },
    });
    return result;
  } catch (err) {
    console.warn("[semantic] query failed; using lexical fallback:", err);
    database.logEvent({
      eventType: "hybrid_search_fallback", level: "warn", category: "llm",
      message: `Semantic search failed; used lexical fallback: ${err instanceof Error ? err.message : String(err)}`,
      metadata: { query: options.query, senderId: options.senderId, chatId: options.chatId },
    });
    return lexical;
  }
}
