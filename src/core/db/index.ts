import { closeDb, db } from "./client";
import { messages, llmCalls, eventLog, statusSnapshot } from "./schema";
import type { NewMessage, NewLLMCall, NewEvent } from "./schema";
import { state } from "../state";
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
let tickInterval: ReturnType<typeof setInterval> | null = null;
let isClosed = false;

// ── In-Memory Counters & Status ───────────────────────────────────────────────

let incomingCount = 0;
let outgoingCount = 0;
let aiRequestCount = 0;
let errorCount = 0;

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
} catch (err) {
  console.error("[db] Failed to load initial counters:", err);
}

// ── Public API ────────────────────────────────────────────────────────────────

export const database = {
  start() {
    if (isClosed) throw new Error("Cannot start a closed database");
    if (tickInterval) return;
    tickInterval = setInterval(() => {
      database.flush();
      database.updateSnapshot();
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

  logMessage(msg: PendingMessage) {
    if (msg.isOutgoing) {
      outgoingCount++;
    } else {
      incomingCount++;
    }

    messageBuffer.push({ ...msg, timestamp: Date.now() });
    checkFlush();
  },

  logLLMCall(call: PendingLLMCall) {
    aiRequestCount++;
    if (call.error) {
      errorCount++;
    }

    llmCallBuffer.push({ ...call, timestamp: Date.now() });
    checkFlush();
  },

  logEvent(event: PendingEvent) {
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

  flush() {
    if (!messageBuffer.length && !llmCallBuffer.length && !eventLogBuffer.length) return;

    const msgs   = messageBuffer.splice(0);
    const calls  = llmCallBuffer.splice(0);
    const events = eventLogBuffer.splice(0);

    try {
      db.transaction((tx) => {
        if (msgs.length)   tx.insert(messages).values(msgs).run();
        if (calls.length)  tx.insert(llmCalls).values(calls).run();
        if (events.length) tx.insert(eventLog).values(events).run();
      });
    } catch (err) {
      console.error("[db] Batch transaction failed, restoring buffers:", err);
      messageBuffer.unshift(...msgs);
      llmCallBuffer.unshift(...calls);
      eventLogBuffer.unshift(...events);
    }
  },

  close() {
    if (isClosed) return;
    isClosed = true;
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
    this.flush();
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
