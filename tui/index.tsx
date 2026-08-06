import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { loadTuiConfig, saveTuiConfig } from "./core/config";
import type { PanelName } from "./core/config";
import { usePoll } from "./core/usePoll";
import { db, messages, llmCalls, eventLog, statusSnapshot } from "./core/db";
import { sql } from "drizzle-orm";
import { EventLogPanel } from "./panels/EventLogPanel";

// ── Interfaces ─────────────────────────────────────────────────────────────────

interface StatusData {
  messages: number;
  llmCalls: number;
  events: number;
  status: string;
  provider: string;
  connectedSince: number | null;
  pingMs: number | null;
  incomingCount: number;
  outgoingCount: number;
  aiRequestCount: number;
  errorCount: number;
  queueState: string;
  memoryMb: number;
  updatedAt: number | null;
  isStale: boolean;
}

// ── Uptime formatter ───────────────────────────────────────────────────────────

function formatUptime(ms: number | null): string {
  if (ms == null || ms < 0) return "N/A";
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours   = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days    = Math.floor(ms / (1000 * 60 * 60 * 24));
  const parts: string[] = [];
  if (days > 0)                            parts.push(`${days}d`);
  if (hours > 0   || days > 0)            parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

// ── Main TUI component ─────────────────────────────────────────────────────────

function TuiApp() {
  const { exit } = useApp();
  const initialConfig = loadTuiConfig();

  const [visiblePanels, setVisiblePanels] = useState<Set<PanelName>>(
    new Set(initialConfig.visiblePanels)
  );

  // Which panel has keyboard focus: "main" (panel toggles) or "log" (filter / scroll)
  const [focus, setFocus] = useState<"main" | "log">("main");

  // local clock for client-side uptime ticking
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Snapshot polling ─────────────────────────────────────────────────────────

  const data = usePoll<StatusData>(
    async () => {
      try {
        const msgCount = db.select({ count: sql<number>`count(*)` }).from(messages).all()[0]?.count ?? 0;
        const llmCount = db.select({ count: sql<number>`count(*)` }).from(llmCalls).all()[0]?.count ?? 0;
        const evCount  = db.select({ count: sql<number>`count(*)` }).from(eventLog).all()[0]?.count ?? 0;
        const snapshot = db.select().from(statusSnapshot).where(sql`id = 1`).all()[0];
        const isStale  = snapshot ? (Date.now() - snapshot.updatedAt > 3000) : true;
        return {
          messages: msgCount, llmCalls: llmCount, events: evCount,
          status:         isStale ? "disconnected" : (snapshot?.status ?? "unknown"),
          provider:       snapshot?.provider ?? "N/A",
          connectedSince: snapshot?.connectedSince ?? null,
          pingMs:         isStale ? null : (snapshot?.pingMs ?? null),
          incomingCount:  snapshot?.incomingCount ?? 0,
          outgoingCount:  snapshot?.outgoingCount ?? 0,
          aiRequestCount: snapshot?.aiRequestCount ?? 0,
          errorCount:     snapshot?.errorCount ?? 0,
          queueState:     isStale ? "offline" : (snapshot?.queueState ?? "unknown"),
          memoryMb:       snapshot?.memoryMb ?? 0,
          updatedAt:      snapshot?.updatedAt ?? null,
          isStale,
        };
      } catch {
        return {
          messages: 0, llmCalls: 0, events: 0,
          status: "error", provider: "N/A", connectedSince: null,
          pingMs: null, incomingCount: 0, outgoingCount: 0, aiRequestCount: 0,
          errorCount: 0, queueState: "offline", memoryMb: 0, updatedAt: null, isStale: true,
        };
      }
    },
    500,
    {
      messages: 0, llmCalls: 0, events: 0,
      status: "loading", provider: "N/A", connectedSince: null,
      pingMs: null, incomingCount: 0, outgoingCount: 0, aiRequestCount: 0,
      errorCount: 0, queueState: "loading", memoryMb: 0, updatedAt: null, isStale: true,
    }
  );

  const uptimeMs  = data.connectedSince ? (now - data.connectedSince) : null;
  const uptimeStr = (data.status === "disconnected" || data.status === "error" || data.status === "loading")
    ? "N/A"
    : formatUptime(uptimeMs);

  // ── Global hotkeys ──────────────────────────────────────────────────────────

  useInput((input, key) => {
    // Always: quit
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }

    // Tab toggles focus between main controls and log panel filter mode
    if (key.tab) {
      setFocus((f) => (f === "main" ? "log" : "main"));
      return;
    }

    // Panel visibility toggles — only in main focus mode
    if (focus === "main") {
      const panelMap: Record<string, PanelName> = {
        "1": "status", "2": "messages", "3": "llmCalls", "4": "eventLog",
      };
      if (input in panelMap) {
        const panelName = panelMap[input]!;
        const next = new Set(visiblePanels);
        next.has(panelName) ? next.delete(panelName) : next.add(panelName);
        setVisiblePanels(next);
        saveTuiConfig({ visiblePanels: Array.from(next) });
      }
    }
  });

  const headerStatusColor = data.isStale ? "red" : data.status === "active" ? "green" : "yellow";
  const statusPanelColor  = data.isStale ? "red" : "green";
  const logFocused = focus === "log" && visiblePanels.has("eventLog");

  return (
    <Box flexDirection="column" width="100%" height="100%" padding={1}>
      {/* ── Header ── */}
      <Box borderStyle="single" borderColor="cyan" paddingX={2} marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">⚡ TG-GEMINI-USERBOT TUI ⚡</Text>
        <Text color="gray">
          Status: <Text bold color={headerStatusColor}>{data.isStale ? "DISCONNECTED" : data.status.toUpperCase()}</Text>
          {" | "}
          Ping: <Text color={data.pingMs ? "green" : "gray"}>{data.pingMs != null ? `${data.pingMs}ms` : "N/A"}</Text>
          {" | "}
          <Text color={logFocused ? "yellow" : "gray"}>Focus: {logFocused ? "LOG [Tab]" : "MAIN [Tab]"}</Text>
        </Text>
      </Box>

      {/* ── Main Content ── */}
      <Box flexDirection="row" width="100%" flexGrow={1}>
        {/* Left: Status snapshot panel */}
        {visiblePanels.has("status") && (
          <Box borderStyle="round" borderColor={statusPanelColor} flexDirection="column" width={32} paddingX={1} marginRight={1}>
            <Text bold color={statusPanelColor}>📊 [1] Status Snapshot</Text>
            <Box flexDirection="column" marginTop={1}>
              <Text>Status:{" "}<Text bold color={headerStatusColor}>{data.isStale ? "DISCONNECTED" : data.status.toUpperCase()}</Text></Text>
              <Text>Provider: <Text bold color="cyan">{data.provider}</Text></Text>
              <Text>Uptime:   <Text color="yellow">{uptimeStr}</Text></Text>
              <Text>Ping:{" "}<Text color={data.pingMs && data.pingMs < 200 ? "green" : "yellow"}>{data.pingMs != null ? `${data.pingMs}ms` : "N/A"}</Text></Text>

              <Box marginTop={1}><Text bold color="gray">── Counters ──</Text></Box>
              <Text>Incoming:    <Text color={data.isStale ? "gray" : "white"}>{data.incomingCount}</Text></Text>
              <Text>Outgoing:    <Text color={data.isStale ? "gray" : "white"}>{data.outgoingCount}</Text></Text>
              <Text>AI Requests: <Text color={data.isStale ? "gray" : "white"}>{data.aiRequestCount}</Text></Text>
              <Text>Errors:      <Text color={data.errorCount > 0 ? "red" : "gray"}>{data.errorCount}</Text></Text>

              <Box marginTop={1}><Text bold color="gray">── System ──</Text></Box>
              <Text>Queue:  <Text color={data.isStale ? "gray" : data.queueState === "idle" ? "green" : "yellow"}>{data.queueState}</Text></Text>
              <Text>Memory: <Text color={data.isStale ? "gray" : "white"}>{data.memoryMb} MB</Text></Text>
            </Box>
          </Box>
        )}

        {/* Right: stacked panels */}
        <Box flexDirection="column" flexGrow={1}>
          {visiblePanels.has("messages") && (
            <Box borderStyle="round" borderColor="yellow" flexGrow={1} paddingX={1}
                 marginBottom={visiblePanels.has("llmCalls") || visiblePanels.has("eventLog") ? 1 : 0}>
              <Text bold color="yellow">💬 [2] Message History ({data.messages} rows)</Text>
              <Box marginTop={1}>
                <Text color="gray">[Placeholder — Фаза 5]</Text>
              </Box>
            </Box>
          )}

          {visiblePanels.has("llmCalls") && (
            <Box borderStyle="round" borderColor="magenta" flexGrow={1} paddingX={1}
                 marginBottom={visiblePanels.has("eventLog") ? 1 : 0}>
              <Text bold color="magenta">🤖 [3] LLM Calls ({data.llmCalls} rows)</Text>
              <Box marginTop={1}>
                <Text color="gray">[Placeholder — Фаза 5]</Text>
              </Box>
            </Box>
          )}

          {visiblePanels.has("eventLog") && (
            <Box flexGrow={1}>
              <EventLogPanel isFocused={logFocused} />
            </Box>
          )}
        </Box>
      </Box>

      {/* ── Footer ── */}
      <Box borderStyle="single" borderColor="gray" paddingX={2} marginTop={1} justifyContent="space-between">
        {logFocused
          ? <Text color="yellow">Log focus: [s]SYS [c]CLI [r]SRV [l]LLM [e]ERR | ↑↓ scroll | [f] freeze | [Tab] back</Text>
          : <Text color="gray">Toggle: [1] Status | [2] Messages | [3] LLM | [4] Events | [Tab] log focus</Text>
        }
        <Text color="red" bold>Press [q] to Quit</Text>
      </Box>
    </Box>
  );
}

render(<TuiApp />);
