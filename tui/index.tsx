import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import { loadTuiConfig, saveTuiConfig } from "./core/config";
import type { PanelName } from "./core/config";
import { usePoll } from "./core/usePoll";
import { isDbReady, getDb, messages, llmCalls, eventLog, statusSnapshot } from "./core/db";
import { POLL_SNAPSHOT_MS } from "./core/constants";
import { sql } from "drizzle-orm";
import { EventLogPanel }     from "./panels/EventLogPanel";
import { CommandQueuePanel } from "./panels/CommandQueuePanel";
import { MessagesPanel }     from "./panels/MessagesPanel";
import { LlmCallsPanel }     from "./panels/LlmCallsPanel";
import { WaitingScreen }     from "./panels/WaitingScreen";

// ── Graceful shutdown: Ctrl+C / SIGINT never crashes the terminal ──────────────
process.on("SIGINT",  () => { process.exit(0); });
process.on("SIGTERM", () => { process.exit(0); });
process.on("uncaughtException", (err) => {
  // Log to stderr (won't corrupt Ink's stdout rendering) then exit cleanly
  process.stderr.write(`[TUI] Uncaught exception: ${err?.message ?? err}\n`);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  process.stderr.write(`[TUI] Unhandled rejection: ${reason}\n`);
});

// ── Interfaces ─────────────────────────────────────────────────────────────────

interface StatusData {
  messages:      number;
  llmCalls:      number;
  events:        number;
  status:        string;
  provider:      string;
  connectedSince: number | null;
  pingMs:        number | null;
  incomingCount: number;
  outgoingCount: number;
  aiRequestCount: number;
  errorCount:    number;
  queueState:    string;
  memoryMb:      number;
  updatedAt:     number | null;
  isStale:       boolean;
}

// ── Uptime formatter ───────────────────────────────────────────────────────────

function formatUptime(ms: number | null): string {
  if (ms == null || ms < 0) return "N/A";
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours   = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days    = Math.floor(ms / (1000 * 60 * 60 * 24));
  const parts: string[] = [];
  if (days > 0)                              parts.push(`${days}d`);
  if (hours > 0   || days > 0)              parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

// ── Focus modes ────────────────────────────────────────────────────────────────

type FocusMode = "main" | "messages" | "llm" | "log" | "queue";

// Ordered cycle list — skip modes whose panels are hidden
const FOCUS_ORDER: FocusMode[] = ["main", "messages", "llm", "log", "queue"];
const FOCUS_PANEL: Record<FocusMode, PanelName | null> = {
  main:     null,
  messages: "messages",
  llm:      "llmCalls",
  log:      "eventLog",
  queue:    "commandQueue",
};

// ── Main TUI component ─────────────────────────────────────────────────────────

function TuiApp() {
  const { exit } = useApp();
  const initialConfig = loadTuiConfig();

  const [visiblePanels, setVisiblePanels] = useState<Set<PanelName>>(
    new Set(initialConfig.visiblePanels)
  );
  const [focus, setFocus] = useState<FocusMode>("main");

  const { stdout } = useStdout();
  const [termRows, setTermRows] = useState(stdout.rows ?? 40);
  const [termCols, setTermCols] = useState(stdout.columns ?? 120);
  useEffect(() => {
    const onResize = () => {
      setTermRows(stdout.rows ?? 40);
      setTermCols(stdout.columns ?? 120);
    };
    stdout.on("resize", onResize);
    return () => { stdout.off("resize", onResize); };
  }, [stdout]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Snapshot polling ─────────────────────────────────────────────────────────

  const data = usePoll<StatusData>(
    async () => {
      const db = getDb();
      if (!db) return {
        messages: 0, llmCalls: 0, events: 0,
        status: "waiting", provider: "N/A", connectedSince: null,
        pingMs: null, incomingCount: 0, outgoingCount: 0, aiRequestCount: 0,
        errorCount: 0, queueState: "waiting", memoryMb: 0, updatedAt: null, isStale: true,
      };
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
    POLL_SNAPSHOT_MS,
    {
      messages: 0, llmCalls: 0, events: 0,
      status: "loading", provider: "N/A", connectedSince: null,
      pingMs: null, incomingCount: 0, outgoingCount: 0, aiRequestCount: 0,
      errorCount: 0, queueState: "loading", memoryMb: 0, updatedAt: null, isStale: true,
    }
  );

  const uptimeMs  = data.connectedSince ? (now - data.connectedSince) : null;
  const uptimeStr = (data.status === "disconnected" || data.status === "error" || data.status === "loading" || data.status === "waiting")
    ? "N/A"
    : formatUptime(uptimeMs);

  // ── Global hotkeys ──────────────────────────────────────────────────────────

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) { exit(); return; }

    // Tab: cycle focus forward through visible panels
    if (key.tab) {
      setFocus((cur) => {
        for (let i = 1; i <= FOCUS_ORDER.length; i++) {
          const next = FOCUS_ORDER[(FOCUS_ORDER.indexOf(cur) + i) % FOCUS_ORDER.length]!;
          const panel = FOCUS_PANEL[next];
          if (!panel || visiblePanels.has(panel)) return next;
        }
        return "main";
      });
      return;
    }

    // Panel toggles — only in main focus
    if (focus === "main") {
      const panelMap: Record<string, PanelName> = {
        "1": "status", "2": "messages", "3": "llmCalls", "4": "eventLog", "5": "commandQueue",
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

  const msgFocused   = focus === "messages" && visiblePanels.has("messages");
  const llmFocused   = focus === "llm"      && visiblePanels.has("llmCalls");
  const logFocused   = focus === "log"      && visiblePanels.has("eventLog");
  const queueFocused = focus === "queue"    && visiblePanels.has("commandQueue");

  // ── Height budget ──────────────────────────────────────────────────────────
  // Header: 1 row, footer: 1 row, paddingY: 0 → 4 fixed rows (2 separators + 2 content)
  const CHROME_ROWS = 4;
  const availH = Math.max(8, termRows - CHROME_ROWS);

  // Right-column panels share available height equally
  const rightPanelNames = (["messages", "llmCalls", "eventLog", "commandQueue"] as PanelName[])
    .filter((p) => visiblePanels.has(p));
  const panelH = rightPanelNames.length > 0
    ? Math.max(6, Math.floor(availH / rightPanelNames.length))
    : availH;

  const focusLabel =
    msgFocused   ? "MSGS [Tab→]"  :
    llmFocused   ? "LLM [Tab→]"   :
    logFocused   ? "LOG [Tab→]"   :
    queueFocused ? "QUEUE [Tab→]" :
    "MAIN [Tab→]";

  if (!isDbReady()) {
    return <WaitingScreen width={termCols} height={termRows} />;
  }

  return (
    <Box flexDirection="column" width={termCols} height={termRows} paddingX={1} overflow="hidden">
      {/* ── Header: single line ── */}
      <Box justifyContent="space-between" paddingX={1}
           borderStyle="single" borderColor="cyan"
           borderTop={false} borderLeft={false} borderRight={false}>
        <Text bold color="cyan">⚡ TG-GEMINI-USERBOT</Text>
        <Text color="gray">
          <Text bold color={headerStatusColor}>{data.isStale ? "DISCONNECTED" : data.status.toUpperCase()}</Text>
          {" · "}
          Ping: <Text color={data.pingMs ? "green" : "gray"}>{data.pingMs != null ? `${data.pingMs}ms` : "N/A"}</Text>
          {" · "}
          <Text color={focus !== "main" ? "yellow" : "gray"}>Focus: {focusLabel}</Text>
          {"  [q]quit"}
        </Text>
      </Box>

      {/* ── Main Content ── */}
      <Box flexDirection="row" width="100%" height={availH} overflow="hidden">
        {/* Left: Status snapshot — fixed width, full height */}
        {visiblePanels.has("status") && (
          <Box borderStyle="round" borderColor={statusPanelColor} flexDirection="column"
               width={26} height={availH} paddingX={1} marginRight={1} overflow="hidden">
            <Text bold color={statusPanelColor}>📊 [1] Status</Text>
            <Box flexDirection="column" marginTop={1}>
              <Text>Status:{" "}<Text bold color={headerStatusColor}>{data.isStale ? "DISCO" : data.status.toUpperCase()}</Text></Text>
              <Text>Prov: <Text bold color="cyan">{data.provider}</Text></Text>
              <Text>Up:   <Text color="yellow">{uptimeStr}</Text></Text>
              <Text>Ping: <Text color={data.pingMs && data.pingMs < 200 ? "green" : "yellow"}>{data.pingMs != null ? `${data.pingMs}ms` : "N/A"}</Text></Text>

              <Box marginTop={1}><Text color="gray">─ Counters ─</Text></Box>
              <Text>In:  <Text color={data.isStale ? "gray" : "white"}>{data.incomingCount}</Text></Text>
              <Text>Out: <Text color={data.isStale ? "gray" : "white"}>{data.outgoingCount}</Text></Text>
              <Text>AI:  <Text color={data.isStale ? "gray" : "white"}>{data.aiRequestCount}</Text></Text>
              <Text>Err: <Text color={data.errorCount > 0 ? "red" : "gray"}>{data.errorCount}</Text></Text>

              <Box marginTop={1}><Text color="gray">─ System ─</Text></Box>
              <Text>Q: <Text color={data.isStale ? "gray" : data.queueState === "idle" ? "green" : "yellow"}>{data.queueState}</Text></Text>
              <Text>Mem: <Text color={data.isStale ? "gray" : "white"}>{data.memoryMb}MB</Text></Text>

              <Box marginTop={1}><Text color="gray">─ Panels ─</Text></Box>
              <Text color="gray">[1]St [2]Msg [3]LLM</Text>
              <Text color="gray">[4]Log [5]Queue</Text>
            </Box>
          </Box>
        )}

        {/* Right: stacked panels, each with exact equal height */}
        <Box flexDirection="column" flexGrow={1} height={availH} overflow="hidden">
          {visiblePanels.has("messages") && (
            <MessagesPanel height={panelH} isFocused={msgFocused} />
          )}
          {visiblePanels.has("llmCalls") && (
            <LlmCallsPanel height={panelH} isFocused={llmFocused} />
          )}
          {visiblePanels.has("eventLog") && (
            <EventLogPanel height={panelH} isFocused={logFocused} />
          )}
          {visiblePanels.has("commandQueue") && (
            <CommandQueuePanel height={panelH} isFocused={queueFocused} />
          )}
        </Box>
      </Box>

      {/* ── Footer: single line ── */}
      <Box paddingX={1}
           borderStyle="single" borderColor="gray"
           borderBottom={false} borderLeft={false} borderRight={false}>
        {msgFocused
          ? <Text color="yellow">Msgs: ←→ sides · ↑↓ nav · PgUp/Dn · [Tab]→</Text>
          : llmFocused
          ? <Text color="yellow">LLM: [p]prov [o]stat · ↑↓ · [d]detail · [x]export · [X]batch · [Tab]→</Text>
          : logFocused
          ? <Text color="yellow">Log: [s/c/r/l/e] filter · ↑↓ · [x]export · [X]batch · [!]errors · [f]freeze · [Tab]→</Text>
          : queueFocused
          ? <Text color="yellow">Queue: ↑↓ nav · [Tab]→</Text>
          : <Text color="gray">[1]Status [2]Msgs [3]LLM [4]Log [5]Queue · [Tab] cycle focus</Text>
        }
      </Box>
    </Box>

  );
}

render(<TuiApp />);
