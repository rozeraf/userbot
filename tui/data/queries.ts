import { asc, desc, eq, gt, like, sql } from "drizzle-orm";
import { getDb } from "../core/db";
import { eventLog, llmCalls, messages, statusSnapshot } from "../../src/core/db/schema";

type ReadDb = NonNullable<ReturnType<typeof getDb>>;

function read<T>(query: (db: ReadDb) => T): T | null {
  const db = getDb();
  if (!db) return null;

  try {
    return query(db);
  } catch {
    return null;
  }
}

export interface ChatSummary {
  chatId: string;
  chatTitle: string;
  lastTs: number;
  count: number;
}

export interface MessageRow {
  id: number;
  messageId: number;
  chatId: string;
  senderId: string | null;
  senderName: string | null;
  text: string | null;
  timestamp: number;
  isOutgoing: boolean;
  chatTitle: string | null;
}

export interface EventRow {
  id: number;
  eventType: string;
  level: string;
  category: string;
  message: string;
  metadata: string | null;
  timestamp: number;
}

export function loadChats(): ChatSummary[] | null {
  return read((db) => db.all<{ chatId: string; chatTitle: string | null; lastTs: number; count: number }>(
    sql`SELECT chat_id as chatId,
               MAX(chat_title) as chatTitle,
               MAX(timestamp) as lastTs,
               COUNT(*) as count
        FROM messages
        GROUP BY chat_id
        ORDER BY lastTs DESC
        LIMIT 50`
  ).map((row) => ({
    chatId: row.chatId,
    chatTitle: row.chatTitle ?? row.chatId,
    lastTs: row.lastTs,
    count: row.count,
  })));
}

export function loadMessages(chatId: string): MessageRow[] | null {
  return read((db) => db.select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(desc(messages.id))
    .limit(300)
    .all()
    .map((row) => ({
      id: row.id,
      messageId: row.messageId,
      chatId: row.chatId,
      senderId: row.senderId ?? null,
      senderName: row.senderName ?? null,
      text: row.text ?? null,
      timestamp: row.timestamp,
      isOutgoing: row.isOutgoing,
      chatTitle: row.chatTitle ?? null,
    }))
    .reverse());
}

export function loadRecentLlmCalls() {
  return read((db) => db.select().from(llmCalls).orderBy(desc(llmCalls.id)).limit(500).all());
}

export function loadEventsAfter(id: number): EventRow[] | null {
  return read((db) => db.select()
    .from(eventLog)
    .where(gt(eventLog.id, id))
    .orderBy(asc(eventLog.id))
    .limit(200)
    .all());
}

export function loadErrorEvents(limit: number): EventRow[] | null {
  return read((db) => db.select()
    .from(eventLog)
    .where(eq(eventLog.category, "error"))
    .orderBy(desc(eventLog.id))
    .limit(limit)
    .all());
}

export function loadCommandEvents() {
  return read((db) => db.select({
    id: eventLog.id,
    eventType: eventLog.eventType,
    message: eventLog.message,
    metadata: eventLog.metadata,
    timestamp: eventLog.timestamp,
  })
    .from(eventLog)
    .where(like(eventLog.eventType, "command_%"))
    .orderBy(desc(eventLog.id))
    .limit(200)
    .all());
}

export function loadStatusSnapshot() {
  return read((db) => {
    const messagesCount = db.select({ count: sql<number>`count(*)` }).from(messages).all()[0]?.count ?? 0;
    const llmCallsCount = db.select({ count: sql<number>`count(*)` }).from(llmCalls).all()[0]?.count ?? 0;
    const eventsCount = db.select({ count: sql<number>`count(*)` }).from(eventLog).all()[0]?.count ?? 0;
    const snapshot = db.select().from(statusSnapshot).where(eq(statusSnapshot.id, 1)).all()[0] ?? null;
    return { messagesCount, llmCallsCount, eventsCount, snapshot };
  });
}
