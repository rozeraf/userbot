import { closeDb, db, secureDbFiles } from "./client";
import { chatSummary, messages, llmCalls, eventLog, statusSnapshot, commandExecutions } from "./schema";
import type { NewMessage, NewLLMCall, NewEvent } from "./schema";
import { state } from "../state";
import { ENV } from "../../config/env";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { writeTransaction } from "./writer";

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
type SystemEventSink = (event: PendingEvent) => void | Promise<void>;

// ── Buffers ───────────────────────────────────────────────────────────────────

let messageBuffer: NewMessage[] = [];
let llmCallBuffer: NewLLMCall[]  = [];
let eventLogBuffer: NewEvent[]   = [];

const FLUSH_INTERVAL_MS = 1000; // periodic flush and status snapshot tick every 1 s
const METRICS_SNAPSHOT_INTERVAL_MS = 10_000;
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
let systemEventSink: SystemEventSink | null = null;
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
  setSystemEventSink(sink: SystemEventSink | null) {
    systemEventSink = sink;
  },

  start() {
    if (isClosed) throw new Error("Cannot start a closed database");
    if (tickInterval) return;

    // Ensure chat summary is populated on startup if it's empty.
    const summaryCount = (db.select({ count: sql`count(*)` }).from(chatSummary).all()[0] as any)?.count ?? 0;
    if (summaryCount === 0) {
      database.rebuildChatSummary();
    }

    database.recoverInterruptedCommands();
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

  rebuildChatSummary() {
    writeTransaction((tx, changed) => {
      tx.delete(chatSummary).run();
      tx.run(sql`
        INSERT INTO chat_summary (chat_id, chat_title, last_timestamp, message_count)
        SELECT chat_id,
               MAX(chat_title),
               MAX(COALESCE(telegram_timestamp, timestamp)),
               COUNT(*)
        FROM messages
        GROUP BY chat_id
      `);
      changed.mark("chats");
    });
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
    return writeTransaction((tx, changed) => {
      const inserted = tx.insert(commandExecutions).values({
        ...input,
        status: "running",
        startedAt: Date.now(),
      }).onConflictDoNothing().returning({ id: commandExecutions.id }).all();
      if (inserted.length > 0) changed.mark("commands");
      return inserted.length > 0;
    });
  },

  finishCommand(chatId: string, messageId: number, status: "succeeded" | "failed", error?: string) {
    writeTransaction((tx, changed) => {
      const updated = tx.update(commandExecutions)
        .set({ status, error: error ?? null, finishedAt: Date.now() })
        .where(and(eq(commandExecutions.chatId, chatId), eq(commandExecutions.messageId, messageId)))
        .returning({ id: commandExecutions.id }).all();
      if (updated.length > 0) changed.mark("commands");
    });
  },

  recoverInterruptedCommands() {
    const recovered = writeTransaction((tx, changed) => {
      const rows = tx.update(commandExecutions)
        .set({ status: "failed", error: "Process interrupted before command completion", finishedAt: Date.now() })
        .where(eq(commandExecutions.status, "running"))
        .returning({ id: commandExecutions.id }).all();
      if (rows.length > 0) changed.mark("commands");
      return rows.length;
    });
    if (recovered > 0) {
      database.logEvent({
        eventType: "commands_recovered",
        level: "warn",
        category: "system",
        message: `Marked ${recovered} interrupted command(s) as failed`,
      });
    }
  },

  logMessage(msg: PendingMessage) {
    if (!canBuffer()) return;
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
    if (systemEventSink && (event.level === "warn" || event.level === "error")) {
      void Promise.resolve(systemEventSink(event)).catch((err) => {
        console.error("[db] System event sink failed:", err);
      });
    }
    checkFlush();
  },

  updateSnapshot() {
    const provider = state.getProvider();
    const memoryMb = Math.round(process.memoryUsage().rss / (1024 * 1024));

    const now = Date.now();
    const next = {
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
      updatedAt: now,
    };

    try {
      writeTransaction((tx, changed) => {
        const current = tx.select().from(statusSnapshot).where(eq(statusSnapshot.id, 1)).all()[0];
        const statusChanged = !current || current.status !== next.status || current.provider !== next.provider
          || current.connectedSince !== next.connectedSince || current.incomingCount !== next.incomingCount
          || current.outgoingCount !== next.outgoingCount || current.aiRequestCount !== next.aiRequestCount
          || current.errorCount !== next.errorCount || current.eventCount !== next.eventCount
          || current.queueState !== next.queueState;
        const metricsChanged = !current || current.pingMs !== next.pingMs || current.memoryMb !== next.memoryMb
          || now - current.updatedAt >= METRICS_SNAPSHOT_INTERVAL_MS;
        if (!statusChanged && !metricsChanged) return;
        const persisted = metricsChanged || !current ? next : { ...next, updatedAt: current.updatedAt };
        tx.insert(statusSnapshot).values(persisted).onConflictDoUpdate({ target: statusSnapshot.id, set: persisted }).run();
        if (statusChanged) changed.mark("status");
        if (metricsChanged) changed.mark("runtime_metrics");
      });
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
      const insertedCounts = writeTransaction((tx, changed) => {
        let incoming = 0;
        let outgoing = 0;
        if (msgs.length) {
          // Only update summaries for rows SQLite actually inserted.  Telegram
          // can redeliver updates, and counting the input buffer here would
          // make the summary drift from the unique messages table.
          const insertedMessages = tx.insert(messages).values(msgs)
            .onConflictDoNothing()
            .returning({
              chatId: messages.chatId,
              chatTitle: messages.chatTitle,
              telegramTimestamp: messages.telegramTimestamp,
              timestamp: messages.timestamp,
              isOutgoing: messages.isOutgoing,
            })
            .all();

          const summaries = new Map<string, { lastTimestamp: number; chatTitle: string | null; messageCount: number }>();
          for (const message of insertedMessages) {
            if (message.isOutgoing) outgoing++;
            else incoming++;
            changed.mark("messages", message.chatId);
            const previous = summaries.get(message.chatId);
            const timestamp = message.telegramTimestamp ?? message.timestamp;
            summaries.set(message.chatId, {
              lastTimestamp: Math.max(previous?.lastTimestamp ?? 0, timestamp),
              chatTitle: message.chatTitle ?? previous?.chatTitle ?? null,
              messageCount: (previous?.messageCount ?? 0) + 1,
            });
          }

          for (const [chatId, summary] of summaries) {
            tx.insert(chatSummary)
              .values({ chatId, ...summary })
              .onConflictDoUpdate({
                target: chatSummary.chatId,
                set: {
                  chatTitle: sql`COALESCE(${summary.chatTitle}, ${chatSummary.chatTitle})`,
                  lastTimestamp: sql`MAX(${chatSummary.lastTimestamp}, ${summary.lastTimestamp})`,
                  messageCount: sql`${chatSummary.messageCount} + ${summary.messageCount}`,
                },
              })
              .run();
          }
          if (insertedMessages.length > 0) changed.mark("chats");
        }
        if (calls.length) {
          tx.insert(llmCalls).values(calls).run();
          changed.mark("llm_calls");
        }
        if (events.length) {
          tx.insert(eventLog).values(events).run();
          changed.mark("events");
        }
        return { incoming, outgoing };
      });
      incomingCount += insertedCounts.incoming;
      outgoingCount += insertedCounts.outgoing;
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
      writeTransaction((tx, changed) => {
        tx.delete(messages).where(sql`${messages.timestamp} < ${cutoff}`).run();
        // Retention is infrequent, so rebuilding once is simpler and keeps the
        // denormalized TUI summary exact even when a chat is fully removed.
        tx.delete(chatSummary).run();
        tx.run(sql`
          INSERT INTO chat_summary (chat_id, chat_title, last_timestamp, message_count)
          SELECT chat_id,
                 MAX(chat_title),
                 MAX(COALESCE(telegram_timestamp, timestamp)),
                 COUNT(*)
          FROM messages
          GROUP BY chat_id
        `);
        tx.delete(llmCalls).where(sql`${llmCalls.timestamp} < ${cutoff}`).run();
        tx.delete(eventLog).where(sql`${eventLog.timestamp} < ${cutoff}`).run();
        tx.delete(commandExecutions).where(sql`${commandExecutions.startedAt} < ${cutoff}`).run();
        changed.mark("messages");
        changed.mark("chats");
        changed.mark("llm_calls");
        changed.mark("events");
        changed.mark("commands");
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
