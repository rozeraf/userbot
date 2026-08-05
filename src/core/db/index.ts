import { db } from "./client";
import { messages, llmCalls, eventLog } from "./schema";
import type { NewMessage, NewLLMCall, NewEvent } from "./schema";

// Re-export db and schema for TUI / external consumers
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

let flushTimeout: Timer | null = null;
const MAX_BUFFER_SIZE  = 50;   // flush immediately when total items ≥ this
const FLUSH_INTERVAL_MS = 1000; // periodic flush every 1 s

// ── Public API ────────────────────────────────────────────────────────────────

export const database = {
  logMessage(msg: PendingMessage) {
    messageBuffer.push({ ...msg, timestamp: Date.now() });
    checkFlush();
  },

  logLLMCall(call: PendingLLMCall) {
    llmCallBuffer.push({ ...call, timestamp: Date.now() });
    checkFlush();
  },

  logEvent(event: PendingEvent) {
    eventLogBuffer.push({
      ...event,
      metadata: event.metadata != null ? JSON.stringify(event.metadata) : null,
      timestamp: Date.now(),
    });
    checkFlush();
  },

  flush() {
    if (!messageBuffer.length && !llmCallBuffer.length && !eventLogBuffer.length) return;

    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }

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
    this.flush();
  },
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function checkFlush() {
  const total = messageBuffer.length + llmCallBuffer.length + eventLogBuffer.length;
  if (total >= MAX_BUFFER_SIZE) {
    database.flush();
  } else if (!flushTimeout) {
    flushTimeout = setTimeout(() => {
      flushTimeout = null;
      database.flush();
    }, FLUSH_INTERVAL_MS);
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on("beforeExit", () => database.flush());
process.on("exit",       () => database.flush());

const onSignal = () => { database.flush(); process.exit(0); };
process.on("SIGINT",  onSignal);
process.on("SIGTERM", onSignal);
