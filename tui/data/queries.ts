import { and, asc, desc, eq, gt, or } from "drizzle-orm";
import { getDb } from "../core/db";
import { appMeta, chatSummary, commandExecutions, eventLog, llmCalls, messages, statusSnapshot, tuiRevisions } from "../../src/core/db/schema";

type ReadDb = NonNullable<ReturnType<typeof getDb>>;

function read<T>(query: (db: ReadDb) => T): T | null {
  const db = getDb();
  if (!db) return null;

  const startedAt = performance.now();
  try {
    const result = query(db);
    const elapsed = performance.now() - startedAt;
    if (elapsed > 50) console.error(`[tui/db] slow query: ${elapsed.toFixed(1)}ms`);
    return result;
  } catch (err: unknown) {
    const elapsed = performance.now() - startedAt;
    const isBusy = err instanceof Error && /SQLITE_BUSY/i.test(err.message);
    console.error(`[tui/db] query failed after ${elapsed.toFixed(1)}ms${isBusy ? " (SQLITE_BUSY)" : ""}:`, err);
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

export function loadRelevantRevisions(selectedChatId: string | null) {
  return read((db) => db.select().from(tuiRevisions).where(or(
    and(eq(tuiRevisions.scope, ""), or(
      eq(tuiRevisions.resource, "status"),
      eq(tuiRevisions.resource, "runtime_metrics"),
      eq(tuiRevisions.resource, "chats"),
      eq(tuiRevisions.resource, "messages"),
      eq(tuiRevisions.resource, "llm_calls"),
      eq(tuiRevisions.resource, "events"),
      eq(tuiRevisions.resource, "commands"),
    )),
    selectedChatId
      ? and(eq(tuiRevisions.resource, "messages"), eq(tuiRevisions.scope, selectedChatId))
      : undefined,
  )).all());
}

export function loadSyncIdentity() {
  return read((db) => Object.fromEntries(
    db.select().from(appMeta).all().map((row) => [row.key, row.value]),
  ));
}

export function loadChats(): ChatSummary[] | null {
  return read((db) => db.select().from(chatSummary)
    .orderBy(desc(chatSummary.lastTimestamp))
    .limit(50)
    .all()
    .map((row) => ({
    chatId: row.chatId,
    chatTitle: row.chatTitle ?? row.chatId,
    lastTs: row.lastTimestamp,
    count: row.messageCount,
  })));
}

export function loadMessages(chatId: string): MessageRow[] | null {
  return read((db) => db.select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(desc(messages.telegramTimestamp), desc(messages.id))
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

export function loadRecentEvents(limit: number): EventRow[] | null {
  return read((db) => db.select().from(eventLog)
    .orderBy(desc(eventLog.id))
    .limit(limit)
    .all()
    .reverse());
}

export function loadErrorEvents(limit: number): EventRow[] | null {
  return read((db) => db.select()
    .from(eventLog)
    .where(eq(eventLog.category, "error"))
    .orderBy(desc(eventLog.id))
    .limit(limit)
    .all());
}

/** Durable command state; unlike the event-log projection this cannot lose a
 * long-running command when its start event falls outside a fixed log window. */
export function loadCommandExecutions() {
  return read((db) => db.select()
    .from(commandExecutions)
    .orderBy(desc(commandExecutions.startedAt))
    .limit(200)
    .all());
}

export function loadStatusSnapshot() {
  return read((db) => {
    const snapshot = db.select().from(statusSnapshot).where(eq(statusSnapshot.id, 1)).all()[0] ?? null;
    return {
      messagesCount: snapshot ? snapshot.incomingCount + snapshot.outgoingCount : 0,
      llmCallsCount: snapshot?.aiRequestCount ?? 0,
      eventsCount: snapshot?.eventCount ?? 0,
      snapshot,
    };
  });
}
