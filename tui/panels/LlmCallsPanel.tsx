import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { db, llmCalls } from "../core/db";
import { desc, asc, isNotNull, eq, or, isNull } from "drizzle-orm";
import { writeFileSync } from "fs";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LlmRow {
  id:        number;
  provider:  string;
  prompt:    string;
  response:  string | null;
  latencyMs: number;
  error:     string | null;
  timestamp: number;
}

type ProviderFilter = "all" | string;   // "all" or specific provider name
type StatusFilter   = "all" | "ok" | "error";

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_MS   = 1500;
const PAGE_SIZE = 80;

// Latency thresholds for coloring
const LATENCY_WARN_MS  = 15_000;
const LATENCY_ERROR_MS = 30_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d  = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatLatency(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function latencyColor(ms: number, hasError: boolean): string {
  if (hasError)          return "red";
  if (ms >= LATENCY_ERROR_MS) return "red";
  if (ms >= LATENCY_WARN_MS)  return "yellow";
  return "green";
}

function preview(text: string, maxLen = 55): string {
  const clean = text.replace(/\n+/g, " ").trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) + "…" : clean;
}

// ── Export helpers (reuse same format as EventLogPanel) ───────────────────────

function entryToText(e: LlmRow): string {
  const lines = [
    `╔════ USERBOT LLM DEBUG ════════════════════════════`,
    `║  ID        : ${e.id}`,
    `║  Timestamp : ${new Date(e.timestamp).toISOString().replace("T", " ").replace("Z", " UTC")}`,
    `║  Provider  : ${e.provider}`,
    `║  Latency   : ${formatLatency(e.latencyMs)}`,
    `║  Status    : ${e.error ? "ERROR" : "OK"}`,
    `║`,
    `║  PROMPT:`,
    ...e.prompt.split("\n").map((l) => `║    ${l}`),
  ];
  if (e.response) {
    lines.push(`║`, `║  RESPONSE:`);
    e.response.split("\n").forEach((l) => lines.push(`║    ${l}`));
  }
  if (e.error) {
    lines.push(`║`, `║  ERROR: ${e.error}`);
  }
  lines.push(`╚═══════════════════════════════════════════════════`);
  return lines.join("\n");
}

function exportToFile(entries: LlmRow[]): string {
  const ts   = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `/tmp/userbot-debug-${ts}.txt`;
  const body = [
    `# Userbot LLM Debug Export — ${new Date().toISOString()}`,
    `# Entries: ${entries.length}`,
    ``,
    ...entries.map(entryToText),
  ].join("\n");
  writeFileSync(path, body, "utf8");
  return path;
}

function osc52Copy(text: string): void {
  try {
    process.stdout.write(`\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`);
  } catch { /* ignore */ }
}

// ── LlmCallsPanel ─────────────────────────────────────────────────────────────

interface Props {
  height?:   number;
  isFocused: boolean;
}

export function LlmCallsPanel({ height = 24, isFocused }: Props) {
  const [buffer,      setBuffer]      = useState<LlmRow[]>([]);
  const [provFilter,  setProvFilter]  = useState<ProviderFilter>("all");
  const [statFilter,  setStatFilter]  = useState<StatusFilter>("all");
  const [cursor,      setCursor]      = useState(0);
  const [page,        setPage]        = useState(0);
  const [showDetail,  setShowDetail]  = useState(false);
  const [flash,       setFlash]       = useState<string | null>(null);
  const flashTimerRef                  = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showFlash(msg: string) {
    setFlash(msg);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(null), 4000);
  }

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  // ── Polling ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;

    const fetch = () => {
      try {
        const rows = db
          .select()
          .from(llmCalls)
          .orderBy(desc(llmCalls.id))
          .limit(500)
          .all();
        if (!active) return;
        setBuffer(rows.map((r) => ({
          id:        r.id,
          provider:  r.provider,
          prompt:    r.prompt,
          response:  r.response ?? null,
          latencyMs: r.latencyMs,
          error:     r.error ?? null,
          timestamp: r.timestamp,
        })));
      } catch { /* ignore */ }
    };

    fetch();
    const id = setInterval(fetch, POLL_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

  // ── Known providers (for filter cycling) ──────────────────────────────────
  const providers = ["all", ...Array.from(new Set(buffer.map((r) => r.provider))).sort()];
  const provIdx   = providers.indexOf(provFilter);

  // ── Client-side filtering ─────────────────────────────────────────────────
  const filtered = buffer.filter((r) => {
    if (provFilter !== "all" && r.provider !== provFilter) return false;
    if (statFilter === "ok"    && r.error !== null) return false;
    if (statFilter === "error" && r.error === null) return false;
    return true;
  });

  // ── Pagination ─────────────────────────────────────────────────────────────
  const pageStart = page * PAGE_SIZE;
  const pagSlice  = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const safeCursor = Math.min(cursor, pagSlice.length - 1);

  // Detail area takes ~8 rows
  const listH = showDetail ? Math.max(3, height - 12) : Math.max(3, height - 4);
  const visible = pagSlice.slice(0, listH);

  // ── Keyboard ───────────────────────────────────────────────────────────────

  useInput((input, key) => {
    if (!isFocused) return;

    // Cycle provider filter
    if (input === "p") {
      setProvFilter(providers[(provIdx + 1) % providers.length]!);
      setCursor(0); setPage(0);
      return;
    }
    // Toggle status filter
    if (input === "o") {
      setStatFilter((f) => f === "all" ? "ok" : f === "ok" ? "error" : "all");
      setCursor(0); setPage(0);
      return;
    }

    // Navigation
    if (key.upArrow)   { setCursor((c) => Math.max(0, c - 1));              return; }
    if (key.downArrow) { setCursor((c) => Math.min(pagSlice.length - 1, c + 1)); return; }
    if (key.pageUp)    { setPage((p) => Math.max(0, p - 1)); setCursor(0);  return; }
    if (key.pageDown)  {
      if ((page + 1) * PAGE_SIZE < filtered.length) { setPage((p) => p + 1); setCursor(0); }
      return;
    }

    // Toggle detail view
    if (input === "d" || key.return) { setShowDetail((v) => !v); return; }

    // Export selected
    if (input === "x" && pagSlice[safeCursor]) {
      const path = exportToFile([pagSlice[safeCursor]!]);
      osc52Copy(entryToText(pagSlice[safeCursor]!));
      showFlash(`✓ Exported to ${path}`);
      return;
    }
    // Export all visible
    if (input === "X") {
      const path = exportToFile(filtered);
      osc52Copy(filtered.map(entryToText).join("\n\n"));
      showFlash(`✓ Exported ${filtered.length} entries → ${path}`);
      return;
    }
  }, { isActive: isFocused });

  // ── Render ─────────────────────────────────────────────────────────────────

  const borderColor = isFocused ? "magenta" : "gray";

  const statusPill = (f: StatusFilter) =>
    f === "all" ? "all" : f === "ok" ? "✓ok" : "✗err";

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor}
         height={height} overflow="hidden">
      {/* Title + filters */}
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color="magenta">
          🤖 [3] LLM Calls{" "}
          <Text color="gray">({filtered.length}/{buffer.length})</Text>
        </Text>
        <Box>
          <Text color="gray"> [p]prov: </Text>
          <Text bold color={provFilter === "all" ? "gray" : "cyan"}>{provFilter}</Text>
          <Text color="gray">  [o]stat: </Text>
          <Text bold color={statFilter === "all" ? "gray" : statFilter === "ok" ? "green" : "red"}>
            {statusPill(statFilter)}
          </Text>
          <Text color="gray">  [d]detail</Text>
        </Box>
      </Box>

      {/* Flash */}
      {flash && (
        <Box paddingX={1}><Text color="yellow" bold>{flash}</Text></Box>
      )}

      {/* Column headers */}
      <Box paddingX={1}>
        <Box width={9}><Text color="gray" bold>TIME</Text></Box>
        <Box width={10}><Text color="gray" bold>PROVIDER</Text></Box>
        <Box width={9}><Text color="gray" bold>LATENCY</Text></Box>
        <Box width={5}><Text color="gray" bold>ST</Text></Box>
        <Text color="gray" bold>PROMPT PREVIEW</Text>
      </Box>

      {/* Rows */}
      <Box flexDirection="column" paddingX={1}>
        {visible.length === 0 ? (
          <Text color="gray">No LLM calls recorded yet.</Text>
        ) : (
          visible.map((row, visIdx) => {
            const isSelected = isFocused && visIdx === safeCursor;
            const latColor   = latencyColor(row.latencyMs, row.error !== null);
            const bg         = isSelected ? "gray" : undefined;
            return (
              <Box key={row.id} backgroundColor={bg}>
                <Box width={9} flexShrink={0}>
                  <Text color={isSelected ? "black" : "gray"}>{formatTime(row.timestamp)}</Text>
                </Box>
                <Box width={10} flexShrink={0}>
                  <Text color={isSelected ? "black" : "cyan"}>{row.provider.slice(0, 9)}</Text>
                </Box>
                <Box width={9} flexShrink={0}>
                  <Text color={isSelected ? "black" : latColor}>{formatLatency(row.latencyMs)}</Text>
                </Box>
                <Box width={5} flexShrink={0}>
                  <Text color={isSelected ? "black" : (row.error ? "red" : "green")}>
                    {row.error ? "ERR" : "OK"}
                  </Text>
                </Box>
                <Text
                  color={isSelected ? "black" : (row.error ? "red" : "gray")}
                  wrap="truncate-end"
                >
                  {row.error ? `ERR: ${row.error.slice(0, 50)}` : preview(row.prompt)}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* Detail view */}
      {showDetail && pagSlice[safeCursor] && (() => {
        const e = pagSlice[safeCursor]!;
        const detailH = 7;
        return (
          <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="magenta">
            <Box>
              <Text bold color="magenta">{e.provider} </Text>
              <Text color={latencyColor(e.latencyMs, e.error !== null)}>{formatLatency(e.latencyMs)} </Text>
              <Text color="gray">{new Date(e.timestamp).toISOString()}</Text>
            </Box>
            {e.error && (
              <Text color="red" wrap="wrap">Error: {e.error.slice(0, 200)}</Text>
            )}
            <Text bold color="gray">── Prompt ──</Text>
            <Text color="white" wrap="wrap">
              {e.prompt.slice(0, 300)}{e.prompt.length > 300 ? "…" : ""}
            </Text>
            {e.response && (
              <>
                <Text bold color="gray">── Response ──</Text>
                <Text color="cyan" wrap="wrap">
                  {e.response.slice(0, 300)}{e.response.length > 300 ? "…" : ""}
                </Text>
              </>
            )}
          </Box>
        );
      })()}

      {/* Hint row */}
      {isFocused && (
        <Box paddingX={1}>
          <Text color="gray" dimColor>
            [p]provider [o]status | ↑↓ nav | [d/Enter] detail | [x]export | [X]batch
          </Text>
        </Box>
      )}
    </Box>
  );
}
