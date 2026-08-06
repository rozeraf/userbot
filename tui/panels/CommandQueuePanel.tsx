import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { loadCommandEvents } from "../data/queries";
import { POLL_CMDQUEUE_MS } from "../core/constants";

// ── Types ─────────────────────────────────────────────────────────────────────

type CmdStatus = "running" | "done" | "error";

interface CommandEntry {
  correlationId: string;   // unique per invocation
  commandName:   string;
  chatId:        string;
  inputText:     string;   // from command_start metadata.text
  status:        CmdStatus;
  startTs:       number;
  endTs:         number | null;
  durationMs:    number | null;
  errorMsg:      string | null;
  startEventId:  number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d  = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatDuration(ms: number | null, startTs: number, now: number): string {
  const elapsed = ms !== null ? ms : (now - startTs);
  if (elapsed < 1000) return `${elapsed}ms`;
  return `${(elapsed / 1000).toFixed(1)}s`;
}

/** Truncate chatId for display — keep last 6 digits */
function shortChat(chatId: string): string {
  return chatId.length > 8 ? `…${chatId.slice(-6)}` : chatId;
}

function statusColor(s: CmdStatus): string {
  switch (s) {
    case "running": return "yellow";
    case "done":    return "green";
    case "error":   return "red";
  }
}

function statusIcon(s: CmdStatus): string {
  switch (s) {
    case "running": return ">";
    case "done":    return "OK";
    case "error":   return "!";
  }
}

// ── Parse event_log rows → CommandEntry list ──────────────────────────────────

function buildQueue(rawRows: Array<{
  id: number;
  eventType: string;
  message: string;
  metadata: string | null;
  timestamp: number;
}>): CommandEntry[] {
  // Map correlationId → entry (use Map to preserve insertion order)
  const byCorr = new Map<string, CommandEntry>();
  // Fallback list for old events without correlationId
  const legacy: CommandEntry[] = [];

  // Process oldest-first so start comes before finish
  const rows = [...rawRows].reverse();

  for (const row of rows) {
    let meta: Record<string, string> = {};
    try { meta = row.metadata ? JSON.parse(row.metadata) : {}; } catch { /* ok */ }

    const corrId      = meta.correlationId;
    const commandName = meta.commandName ?? extractCommandName(row.message);
    const chatId      = meta.chatId ?? "";
    const text        = meta.text   ?? "";

    if (row.eventType === "command_start") {
      const entry: CommandEntry = {
        correlationId: corrId ?? `legacy-${row.id}`,
        commandName,
        chatId,
        inputText: text,
        status:    "running",
        startTs:   row.timestamp,
        endTs:     null,
        durationMs: null,
        errorMsg:  null,
        startEventId: row.id,
      };
      if (corrId) byCorr.set(corrId, entry);
      else        legacy.push(entry);

    } else if (row.eventType === "command_success") {
      if (corrId && byCorr.has(corrId)) {
        const e = byCorr.get(corrId)!;
        e.status     = "done";
        e.endTs      = row.timestamp;
        e.durationMs = row.timestamp - e.startTs;
      } else {
        // Legacy: match last running entry with same chatId
        const match = legacy.findLast((e) => e.status === "running" && e.chatId === chatId);
        if (match) {
          match.status     = "done";
          match.endTs      = row.timestamp;
          match.durationMs = row.timestamp - match.startTs;
        }
      }

    } else if (row.eventType === "command_error") {
      if (corrId && byCorr.has(corrId)) {
        const e = byCorr.get(corrId)!;
        e.status     = "error";
        e.endTs      = row.timestamp;
        e.durationMs = row.timestamp - e.startTs;
        e.errorMsg   = meta.error ?? null;
      } else {
        const match = legacy.findLast((e) => e.status === "running" && e.chatId === chatId);
        if (match) {
          match.status     = "error";
          match.endTs      = row.timestamp;
          match.durationMs = row.timestamp - match.startTs;
          match.errorMsg   = meta.error ?? null;
        }
      }
    }
  }

  // Combine: byCorr entries (newest first by startEventId), then unmatched legacy
  const all = [
    ...Array.from(byCorr.values()),
    ...legacy,
  ].sort((a, b) => b.startEventId - a.startEventId); // newest start at top

  return all;
}

/** Extract command name from log message as fallback */
function extractCommandName(msg: string): string {
  const m = msg.match(/command[:\s]+(\S+)/i);
  return m ? m[1]! : "unknown";
}

// ── CommandQueuePanel ─────────────────────────────────────────────────────────

interface Props {
  height?:   number;
  isFocused: boolean;
}

export function CommandQueuePanel({ height = 20, isFocused }: Props) {
  const [entries, setEntries] = useState<CommandEntry[]>([]);
  const [now, setNow]         = useState(Date.now());
  const [cursor, setCursor]   = useState(0);

  // Refresh clock every second (for live duration of running cmds)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Polling
  useEffect(() => {
    let active = true;

    const fetch = () => {
      const rows = loadCommandEvents();
      if (active && rows) setEntries(buildQueue(rows));
    };

    fetch();
    const id = setInterval(fetch, POLL_CMDQUEUE_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

  // Viewport
  const innerH    = Math.max(2, height - 4);
  const maxCursor = Math.max(0, entries.length - 1);
  const safeCursor = Math.min(cursor, maxCursor);

  // Keep cursor in view
  const scrollTop = Math.max(0, Math.min(safeCursor - Math.floor(innerH / 2), entries.length - innerH));
  const visible   = entries.slice(scrollTop, scrollTop + innerH);

  // Running count
  const runningCount = entries.filter((e) => e.status === "running").length;

  // ── Keyboard ──────────────────────────────────────────────────────────────

  useInput((input, key) => {
    if (!isFocused) return;
    if (key.upArrow)   { setCursor((c) => Math.max(0, c - 1));          return; }
    if (key.downArrow) { setCursor((c) => Math.min(maxCursor, c + 1));  return; }
    if (key.pageUp)    { setCursor(0);                                   return; }
    if (key.pageDown)  { setCursor(maxCursor);                           return; }
  }, { isActive: isFocused });

  // ── Render ────────────────────────────────────────────────────────────────

  const borderColor = runningCount > 0 ? "yellow" : "blue";

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor}
         height={height} overflow="hidden">
      {/* Title */}
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color={borderColor}>
          ⚙ [5] Command Queue{" "}
          <Text color="gray">({entries.length} total)</Text>
          {runningCount > 0 && (
            <Text color="yellow"> · {runningCount} running</Text>
          )}
        </Text>
        <Text color="gray">
          {isFocused ? "↑↓ navigate" : "[Tab] focus"}
        </Text>
      </Box>

      {/* Column headers */}
      <Box paddingX={1}>
        <Box width={3}  flexShrink={0}><Text color="gray" bold>ST</Text></Box>
        <Box width={9}  flexShrink={0}><Text color="gray" bold>TIME</Text></Box>
        <Box width={12} flexShrink={0}><Text color="gray" bold>COMMAND</Text></Box>
        <Box width={9}  flexShrink={0}><Text color="gray" bold>CHAT</Text></Box>
        <Box width={7}  flexShrink={0}><Text color="gray" bold>DUR</Text></Box>
        <Text color="gray" bold>INPUT</Text>
      </Box>

      {/* Rows */}
      <Box flexDirection="column" paddingX={1}>
        {visible.length === 0 ? (
          <Text color="gray">No command events yet. Run any !command via Telegram.</Text>
        ) : (
          visible.map((entry, visIdx) => {
            const absIdx     = scrollTop + visIdx;
            const isSelected = isFocused && absIdx === safeCursor;
            const sColor     = statusColor(entry.status);
            const icon       = statusIcon(entry.status);
            const dur        = formatDuration(entry.durationMs, entry.startTs, now);
            const chat       = shortChat(entry.chatId);
            // Truncate input text
            const input      = (entry.inputText || "—").slice(0, 30);
            const cmdPad     = entry.commandName.padEnd(16).slice(0, 16);
            const chatPad    = chat.padEnd(11).slice(0, 11);
            const durPad     = dur.padEnd(9).slice(0, 9);

            return (
              <Box key={entry.correlationId} backgroundColor={isSelected ? "gray" : undefined}>
                <Box width={3}  flexShrink={0}>
                  <Text color={isSelected ? "black" : sColor}>{icon}</Text>
                </Box>
                <Box width={9}  flexShrink={0}>
                  <Text color={isSelected ? "black" : "gray"}>{formatTime(entry.startTs)}</Text>
                </Box>
                <Box width={12} flexShrink={0}>
                  <Text color={isSelected ? "black" : "white"}>{entry.commandName.slice(0,11)}</Text>
                </Box>
                <Box width={9}  flexShrink={0}>
                  <Text color={isSelected ? "black" : "cyan"}>{chat}</Text>
                </Box>
                <Box width={7}  flexShrink={0}>
                  <Text color={isSelected ? "black" : sColor}>{dur}</Text>
                </Box>
                <Text
                  color={isSelected ? "black" : entry.status === "error" ? "red" : "gray"}
                  wrap="truncate-end"
                >
                  {entry.status === "error" && entry.errorMsg
                    ? `ERR: ${entry.errorMsg.slice(0, 60)}`
                    : input}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* Selected entry detail */}
      {isFocused && entries[safeCursor] && (
        <Box paddingX={1} borderStyle="single" borderColor="gray">
          {(() => {
            const e = entries[safeCursor]!;
            return (
              <Text wrap="wrap" color="gray">
                <Text bold color={statusColor(e.status)}>{e.commandName}</Text>
                {" in "}
                <Text color="cyan">{e.chatId}</Text>
                {" · "}
                <Text color={statusColor(e.status)}>{e.status.toUpperCase()}</Text>
                {e.durationMs !== null && <Text> · {formatDuration(e.durationMs, e.startTs, now)}</Text>}
                {"\n"}
                {e.inputText ? <Text>Input: {e.inputText.slice(0, 100)}</Text> : null}
                {e.errorMsg  ? <Text color="red">{"\n"}Error: {e.errorMsg.slice(0, 120)}</Text> : null}
              </Text>
            );
          })()}
        </Box>
      )}
    </Box>
  );
}
