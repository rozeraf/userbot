import { sqlite } from "../../db/client";
import type { MessageEvidence } from "../evidence/types";
import { toFtsQuery } from "./search";

type SearchRow = {
  id: number;
  message_id: number;
  chat_id: string;
  sender_id: string | null;
  sender_name: string | null;
  chat_title: string | null;
  telegram_timestamp: number | null;
  timestamp: number;
  text: string;
};

// Runtime analysis repository. It uses the bot's canonical database connection
// for read-only queries. TUI database adapters must never be imported here.
export class HistoryRepository {
  searchMessages(query: string, limit = 10): MessageEvidence[] {
    const ftsQuery = toFtsQuery(query);
    if (!ftsQuery) return [];
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
    const rows = sqlite.query<SearchRow, [string, number]>(`
      SELECT m.id, m.message_id, m.chat_id, m.sender_id, m.sender_name,
             m.chat_title, m.telegram_timestamp, m.timestamp, m.text
      FROM messages_fts
      JOIN messages AS m ON m.id = messages_fts.rowid
      WHERE messages_fts MATCH ? AND m.text IS NOT NULL AND m.text <> ''
      ORDER BY bm25(messages_fts), COALESCE(m.telegram_timestamp, m.timestamp) DESC
      LIMIT ?
    `).all(ftsQuery, safeLimit);

    return rows.map((row) => ({
      dbMessageId: row.id,
      telegram: { chatId: row.chat_id, messageId: row.message_id },
      author: { senderId: row.sender_id, displayName: row.sender_name },
      chat: { title: row.chat_title },
      timestamp: row.telegram_timestamp ?? row.timestamp,
      text: row.text,
    }));
  }
}
