import { closeDb, db, secureDbFiles, sqlite } from "./client";
import { messages, llmCalls, eventLog, statusSnapshot, commandExecutions } from "./schema";
import type { NewMessage, NewLLMCall, NewEvent } from "./schema";
import { state } from "../state";
import { ENV } from "../../config/env";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";

// Re-export the write-side database API for bot-only consumers.
export { db } from "./client";
export * from "./schema";

// ── Public logging API ────────────────────────────────────────────────────────
// Types drop the `id` and `timestamp` — callers only provide business fields.

export type PendingMessage = Omit<NewMessage, "id" | "timestamp">;
export type PendingLLMCall  = Omit<NewLLMCall,  "id" | "timestamp">;
// metadata is serialized to JSON inside logEvent — callers pass plain objects
export type PendingEvent    = Omit<NewEvent,     "id" | "timestamp" | "metadata"> & {
  metadata?: Record<string, unknown> | null;
};

// ── Buffers ───────────────────────────────────────────────────────────────────

let messageBuffer: NewMessage[] = [];
let llmCallBuffer: NewLLMCall[]  = [];
let eventLogBuffer: NewEvent[]   = [];

const FLUSH_INTERVAL_MS = 1000; // periodic flush and status snapshot tick every 1 s
const MAX_BUFFER_SIZE  = 50;
const MAX_BUFFERED_RECORDS = 10_000;
const MAX_FLUSH_BACKOFF_MS = 30_000;
let tickInterval: ReturnType<typeof setInterval> | null = null;
let isClosed = false;
let consecutiveFlushFailures = 0;
let nextFlushAt = 0;
let droppedRecords = 0;
let lastDropWarningAt = 0;
let nextRetentionPruneAt = 0;
const RETENTION_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// ── In-Memory Counters & Status ───────────────────────────────────────────────

let incomingCount = 0;
let outgoingCount = 0;
let aiRequestCount = 0;
let errorCount = 0;
let eventCount = 0;

let botStatus: "active" | "connecting" | "disconnected" = "connecting";
let connectedSince: number | null = null;
let pingMs: number | null = null;
let queueState: string = "idle";

// Load initial counters from DB
try {
  const msgOutgoing = db.select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(eq(messages.isOutgoing, true))
    .all()[0];
  if (msgOutgoing) outgoingCount = msgOutgoing.count;

  const msgIncoming = db.select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(eq(messages.isOutgoing, false))
    .all()[0];
  if (msgIncoming) incomingCount = msgIncoming.count;

  const llmCount = db.select({ count: sql<number>`count(*)` })
    .from(llmCalls)
    .all()[0];
  if (llmCount) aiRequestCount = llmCount.count;

  const errorLlm = db.select({ count: sql<number>`count(*)` })
    .from(llmCalls)
    .where(isNotNull(llmCalls.error))
    .all()[0];
  const errorEvents = db.select({ count: sql<number>`count(*)` })
    .from(eventLog)
    .where(and(eq(eventLog.level, "error"), ne(eventLog.category, "llm")))
    .all()[0];
  
  errorCount = (errorLlm?.count ?? 0) + (errorEvents?.count ?? 0);

  const eventTotal = db.select({ count: sql<number>`count(*)` }).from(eventLog).all()[0];
  if (eventTotal) eventCount = eventTotal.count;
} catch (err) {
  console.error("[db] Failed to load initial counters:", err);
}

// ── Public API ────────────────────────────────────────────────────────────────

export const database = {
  start() {
    if (isClosed) throw new Error("Cannot start a closed database");
    if (tickInterval) return;
    database.pruneOldRecords();
    nextRetentionPruneAt = Date.now() + RETENTION_PRUNE_INTERVAL_MS;
    tickInterval = setInterval(() => {
      database.flush();
      database.updateSnapshot();
      if (Date.now() >= nextRetentionPruneAt) {
        database.pruneOldRecords();
        nextRetentionPruneAt = Date.now() + RETENTION_PRUNE_INTERVAL_MS;
      }
    }, FLUSH_INTERVAL_MS);
  },

  setStatus(status: "active" | "connecting" | "disconnected") {
    botStatus = status;
    if (status === "disconnected") {
      connectedSince = null;
      pingMs = null;
      return;
    }
    if (status === "active" && !connectedSince) {
      connectedSince = Date.now();
    }
  },

  setPing(ms: number | null) {
    pingMs = ms;
  },

  setQueueState(stateStr: string) {
    queueState = stateStr;
  },

  /**
   * Claims a Telegram command exactly once.  Telegram updates may be delivered
   * again after reconnects, so logging a message is not sufficient deduplication.
   */
  beginCommand(input: {
    chatId: string;
    messageId: number;
    commandName: string;
    correlationId: string;
    provider: "gemini" | "cerebras";
  }): boolean {
    const result = sqlite.run(
      `INSERT INTO command_executions
        (chat_id, message_id, command_name, correlation_id, provider, status, started_at)
       VALUES (?, ?, ?, ?, ?, 'running', ?)
       ON CONFLICT(chat_id, message_id) DO NOTHING`,
      [input.chatId, input.messageId, input.commandName, input.correlationId, input.provider, Date.now()],
    );
    return result.changes > 0;
  },

  finishCommand(chatId: string, messageId: number, status: "succeeded" | "failed", error?: string) {
    db.update(commandExecutions)
      .set({ status, error: error ?? null, finishedAt: Date.now() })
      .where(and(eq(commandExecutions.chatId, chatId), eq(commandExecutions.messageId, messageId)))
      .run();
  },

  logMessage(msg: PendingMessage) {
    if (!canBuffer()) return;
    if (msg.isOutgoing) {
      outgoingCount++;
    } else {
      incomingCount++;
    }

    messageBuffer.push({ ...msg, timestamp: Date.now() });
    checkFlush();
  },

  logLLMCall(call: PendingLLMCall) {
    if (!canBuffer()) return;
    aiRequestCount++;
    if (call.error) {
      errorCount++;
    }

    llmCallBuffer.push({ ...call, timestamp: Date.now() });
    checkFlush();
  },

  logEvent(event: PendingEvent) {
    if (!canBuffer()) return;
    eventCount++;
    // LLM failures already increment the counter in logLLMCall().
    if (event.level === "error" && event.category !== "llm") {
      errorCount++;
    }

    eventLogBuffer.push({
      ...event,
      metadata: event.metadata != null ? JSON.stringify(event.metadata) : null,
      timestamp: Date.now(),
    });
    checkFlush();
  },

  updateSnapshot() {
    const provider = state.getProvider();
    const memoryMb = Math.round(process.memoryUsage().rss / (1024 * 1024));

    try {
      db.insert(statusSnapshot)
        .values({
          id: 1,
          status: botStatus,
          provider,
          connectedSince,
          pingMs,
          incomingCount,
          outgoingCount,
          aiRequestCount,
          errorCount,
          eventCount,
          queueState,
          memoryMb,
          updatedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: statusSnapshot.id,
          set: {
            status: botStatus,
            provider,
            connectedSince,
            pingMs,
            incomingCount,
            outgoingCount,
            aiRequestCount,
            errorCount,
            eventCount,
            queueState,
            memoryMb,
            updatedAt: Date.now(),
          }
        })
        .run();
    } catch (err) {
      console.error("[db] Failed to update status_snapshot:", err);
    }
  },

  flush(force = false): boolean {
    if (!messageBuffer.length && !llmCallBuffer.length && !eventLogBuffer.length) return false;
    if (!force && Date.now() < nextFlushAt) return false;

    const msgs   = messageBuffer.splice(0);
    const calls  = llmCallBuffer.splice(0);
    const events = eventLogBuffer.splice(0);

    try {
      db.transaction((tx) => {
        if (msgs.length)   tx.insert(messages).values(msgs).onConflictDoNothing().run();
        if (calls.length)  tx.insert(llmCalls).values(calls).run();
        if (events.length) tx.insert(eventLog).values(events).run();
      });
      secureDbFiles();
      consecutiveFlushFailures = 0;
      nextFlushAt = 0;
      return true;
    } catch (err) {
      console.error("[db] Batch transaction failed, restoring buffers:", err);
      messageBuffer.unshift(...msgs);
      llmCallBuffer.unshift(...calls);
      eventLogBuffer.unshift(...events);
      consecutiveFlushFailures++;
      const backoffMs = Math.min(MAX_FLUSH_BACKOFF_MS, 1_000 * 2 ** Math.min(consecutiveFlushFailures, 5));
      nextFlushAt = Date.now() + backoffMs;
      return false;
    }
  },

  /** Retention is opt-in; deleting private history is never the default. */
  pruneOldRecords() {
    if (ENV.DB_RETENTION_DAYS === 0) return;
    const cutoff = Date.now() - ENV.DB_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    try {
      db.transaction((tx) => {
        tx.delete(messages).where(sql`${messages.timestamp} < ${cutoff}`).run();
        tx.delete(llmCalls).where(sql`${llmCalls.timestamp} < ${cutoff}`).run();
        tx.delete(eventLog).where(sql`${eventLog.timestamp} < ${cutoff}`).run();
        tx.delete(commandExecutions).where(sql`${commandExecutions.startedAt} < ${cutoff}`).run();
      });
      database.logEvent({
        eventType: "db_retention_prune",
        level: "info",
        category: "system",
        message: `Deleted records older than ${ENV.DB_RETENTION_DAYS} day(s)`,
      });
    } catch (err) {
      console.error("[db] Retention prune failed:", err);
    }
  },

  close() {
    if (isClosed) return;
    isClosed = true;
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
    this.flush(true);
    this.updateSnapshot();
    closeDb();
  },
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function checkFlush() {
  const total = messageBuffer.length + llmCallBuffer.length + eventLogBuffer.length;
  if (total >= MAX_BUFFER_SIZE) {
    database.flush();
  }
}

function canBuffer(): boolean {
  const total = messageBuffer.length + llmCallBuffer.length + eventLogBuffer.length;
  if (total < MAX_BUFFERED_RECORDS) return true;

  droppedRecords++;
  const now = Date.now();
  if (now - lastDropWarningAt >= 30_000) {
    lastDropWarningAt = now;
    console.error(`[db] Logging buffer is full; dropped ${droppedRecords} record(s). Check database availability and free disk space.`);
  }
  return false;
}
