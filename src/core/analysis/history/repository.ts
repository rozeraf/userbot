import { sqlite } from "../../db/client";
import type { MessageEvidence } from "../evidence/types";
import { toFtsQuery } from "./search";

type SearchRow = {
  id: number;
  message_id: number;
  chat_id: string;
  sender_id: string | null;
  sender_name: string | null;
  sender_username: string | null;
  chat_title: string | null;
  telegram_timestamp: number | null;
  timestamp: number;
  text: string;
};

// Runtime analysis repository. It uses the bot's canonical database connection
// for read-only queries. TUI database adapters must never be imported here.
export class HistoryRepository {
  searchMessages(query: string, limit = 10, chatId?: string): MessageEvidence[] {
    const ftsQuery = toFtsQuery(query);
    if (!ftsQuery) return [];
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
    const rows = chatId
      ? sqlite.query<SearchRow, [string, string, number]>(`
          SELECT m.id, m.message_id, m.chat_id, m.sender_id, m.sender_name,
                 m.sender_username, m.chat_title, m.telegram_timestamp, m.timestamp, m.text
          FROM messages_fts
          JOIN messages AS m ON m.id = messages_fts.rowid
          WHERE messages_fts MATCH ? AND m.chat_id = ?
            AND m.text IS NOT NULL AND m.text <> ''
          ORDER BY bm25(messages_fts), COALESCE(m.telegram_timestamp, m.timestamp) DESC
          LIMIT ?
        `).all(ftsQuery, chatId, safeLimit)
      : sqlite.query<SearchRow, [string, number]>(`
      SELECT m.id, m.message_id, m.chat_id, m.sender_id, m.sender_name,
             m.sender_username, m.chat_title, m.telegram_timestamp, m.timestamp, m.text
      FROM messages_fts
      JOIN messages AS m ON m.id = messages_fts.rowid
      WHERE messages_fts MATCH ? AND m.text IS NOT NULL AND m.text <> ''
      ORDER BY bm25(messages_fts), COALESCE(m.telegram_timestamp, m.timestamp) DESC
      LIMIT ?
        `).all(ftsQuery, safeLimit);

    return rows.map((row) => ({
      dbMessageId: row.id,
      telegram: { chatId: row.chat_id, messageId: row.message_id },
      author: { senderId: row.sender_id, displayName: row.sender_name, username: row.sender_username },
      chat: { title: row.chat_title },
      timestamp: row.telegram_timestamp ?? row.timestamp,
      text: row.text,
    }));
  }

  messagesBySender(senderId: string, query = "", limit = 10, chatId?: string): MessageEvidence[] {
    const ftsQuery = toFtsQuery(query);
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
    const rows = ftsQuery
      ? chatId
        ? sqlite.query<SearchRow, [string, string, string, number]>(`
            SELECT m.id, m.message_id, m.chat_id, m.sender_id, m.sender_name,
                   m.sender_username, m.chat_title, m.telegram_timestamp, m.timestamp, m.text
            FROM messages_fts
            JOIN messages AS m ON m.id = messages_fts.rowid
            WHERE messages_fts MATCH ? AND m.sender_id = ? AND m.chat_id = ?
              AND m.text IS NOT NULL AND m.text <> ''
            ORDER BY bm25(messages_fts), COALESCE(m.telegram_timestamp, m.timestamp) DESC
            LIMIT ?
          `).all(ftsQuery, senderId, chatId, safeLimit)
        : sqlite.query<SearchRow, [string, string, number]>(`
          SELECT m.id, m.message_id, m.chat_id, m.sender_id, m.sender_name,
                 m.sender_username, m.chat_title, m.telegram_timestamp, m.timestamp, m.text
          FROM messages_fts
          JOIN messages AS m ON m.id = messages_fts.rowid
          WHERE messages_fts MATCH ? AND m.sender_id = ?
            AND m.text IS NOT NULL AND m.text <> ''
          ORDER BY bm25(messages_fts), COALESCE(m.telegram_timestamp, m.timestamp) DESC
          LIMIT ?
        `).all(ftsQuery, senderId, safeLimit)
      : chatId
        ? sqlite.query<SearchRow, [string, string, number]>(`
            SELECT id, message_id, chat_id, sender_id, sender_name, sender_username, chat_title,
                   telegram_timestamp, timestamp, text
            FROM messages
            WHERE sender_id = ? AND chat_id = ? AND text IS NOT NULL AND text <> ''
            ORDER BY COALESCE(telegram_timestamp, timestamp) DESC
            LIMIT ?
          `).all(senderId, chatId, safeLimit)
        : sqlite.query<SearchRow, [string, number]>(`
          SELECT id, message_id, chat_id, sender_id, sender_name, sender_username, chat_title,
                 telegram_timestamp, timestamp, text
          FROM messages
          WHERE sender_id = ? AND text IS NOT NULL AND text <> ''
          ORDER BY COALESCE(telegram_timestamp, timestamp) DESC
          LIMIT ?
        `).all(senderId, safeLimit);

    return rows.map((row) => ({
      dbMessageId: row.id,
      telegram: { chatId: row.chat_id, messageId: row.message_id },
      author: { senderId: row.sender_id, displayName: row.sender_name, username: row.sender_username },
      chat: { title: row.chat_title },
      timestamp: row.telegram_timestamp ?? row.timestamp,
      text: row.text,
    }));
  }
}
