import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { getDb, eventLog } from "../core/db";
import { gt, asc, eq, desc } from "drizzle-orm";
import { writeFileSync } from "fs";
import { POLL_EVENTLOG_MS } from "../core/constants";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EventCategory = "system" | "client" | "server" | "llm" | "error";
export type EventLevel    = "info" | "warn" | "error";

export interface LogEntry {
  id:        number;
  eventType: string;
  level:     EventLevel;
  category:  EventCategory;
  message:   string;
  metadata:  string | null;
  timestamp: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BUFFER     = 1000;
const ERROR_LIMITS   = [20, 50, 100] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d  = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatDateTime(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").replace("Z", " UTC");
}

function categoryBadge(cat: EventCategory): { label: string; color: string } {
  switch (cat) {
    case "system": return { label: "SYS", color: "cyan" };
    case "client": return { label: "CLI", color: "blue" };
    case "server": return { label: "SRV", color: "green" };
    case "llm":    return { label: "LLM", color: "magenta" };
    case "error":  return { label: "ERR", color: "red" };
    default:       return { label: "---", color: "gray" };
  }
}

function levelColor(level: EventLevel): string {
  switch (level) {
    case "error": return "red";
    case "warn":  return "yellow";
    default:      return "white";
  }
}

/** Serialise one entry to a human-readable debug block */
function entryToText(e: LogEntry): string {
  const lines = [
    `╔════ USERBOT DEBUG ════════════════════════════════`,
    `║  ID        : ${e.id}`,
    `║  Timestamp : ${formatDateTime(e.timestamp)}`,
    `║  Category  : ${e.category}`,
    `║  Level     : ${e.level}`,
    `║  EventType : ${e.eventType}`,
    `║  Message   : ${e.message}`,
  ];
  if (e.metadata) {
    try {
      const parsed = JSON.parse(e.metadata);
      lines.push(`║  Metadata  : ${JSON.stringify(parsed, null, 2).replace(/\n/g, "\n║             ")}`);
    } catch {
      lines.push(`║  Metadata  : ${e.metadata}`);
    }
  }
  lines.push(`╚═══════════════════════════════════════════════════`);
  return lines.join("\n");
}

/** Write entries to /tmp file, return the path */
function exportToFile(entries: LogEntry[]): string {
  const ts   = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `/tmp/userbot-debug-${ts}.txt`;
  const body = [
    `# Userbot Debug Export — ${new Date().toISOString()}`,
    `# Entries: ${entries.length}`,
    ``,
    ...entries.map(entryToText),
  ].join("\n");
  writeFileSync(path, body, "utf8");
  return path;
}

/** OSC52 clipboard (works in modern terminals / SSH sessions) */
function osc52Copy(text: string): void {
  try {
    const b64 = Buffer.from(text).toString("base64");
    process.stdout.write(`\x1b]52;c;${b64}\x07`);
  } catch {
    // silently ignore if terminal doesn't support OSC52
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  height?:   number;
  isFocused: boolean;
}

type ViewMode = "live" | "errors";

export function EventLogPanel({ height = 20, isFocused }: Props) {
  // ── Live buffer (incremental polling) ───────────────────────────────────────
  const [buffer,  setBuffer]  = useState<LogEntry[]>([]);
  const lastIdRef             = useRef(0);

  // ── Filters ─────────────────────────────────────────────────────────────────
  type CategoryFilter = Set<EventCategory>;
  const [filters, setFilters] = useState<CategoryFilter>(
    new Set<EventCategory>(["system", "client", "server", "llm", "error"])
  );

  // ── Error-only mode ─────────────────────────────────────────────────────────
  const [viewMode,     setViewMode]     = useState<ViewMode>("live");
  const [errorEntries, setErrorEntries] = useState<LogEntry[]>([]);
  const [errorLimitIdx, setErrorLimitIdx] = useState(0);
  const errorLimit = ERROR_LIMITS[errorLimitIdx]!;

  // ── Scroll / cursor ─────────────────────────────────────────────────────────
  const [frozen,    setFrozen]    = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  // cursor index within filtered list (for export target)
  const [cursor, setCursor] = useState<number | null>(null);

  // ── Status flash message ────────────────────────────────────────────────────
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showFlash(msg: string) {
    setFlash(msg);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(null), 4000);
  }

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  // ── Incremental fetch (live mode) ───────────────────────────────────────────
  useEffect(() => {
    let active = true;

    const fetchLive = () => {
      const db = getDb();
      if (!db) return;
      try {
        const rows = db
          .select()
          .from(eventLog)
          .where(gt(eventLog.id, lastIdRef.current))
          .orderBy(asc(eventLog.id))
          .limit(200)
          .all();

        if (!active || rows.length === 0) return;
        lastIdRef.current = rows[rows.length - 1]!.id;

        setBuffer((prev) => {
          const next = [
            ...prev,
            ...rows.map((r) => ({
              id:        r.id,
              eventType: r.eventType,
              level:     (r.level ?? "info") as EventLevel,
              category:  (r.category ?? "system") as EventCategory,
              message:   r.message,
              metadata:  r.metadata ?? null,
              timestamp: r.timestamp,
            })),
          ];
          return next.length > MAX_BUFFER ? next.slice(next.length - MAX_BUFFER) : next;
        });
      } catch { /* ignore DB errors */ }
    };

    fetchLive();
    const id = setInterval(fetchLive, POLL_EVENTLOG_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

  // ── Error-mode fetch (separate query, DESC, limit N) ────────────────────────
  useEffect(() => {
    if (viewMode !== "errors") return;

    let active = true;

    const fetchErrors = () => {
      const db = getDb();
      if (!db) return;
      try {
        const rows = db
          .select()
          .from(eventLog)
          .where(eq(eventLog.category, "error"))
          .orderBy(desc(eventLog.id))
          .limit(errorLimit)
          .all();

        if (!active) return;

        setErrorEntries(
          rows.map((r) => ({
            id:        r.id,
            eventType: r.eventType,
            level:     (r.level ?? "error") as EventLevel,
            category:  "error" as EventCategory,
            message:   r.message,
            metadata:  r.metadata ?? null,
            timestamp: r.timestamp,
          })).reverse() // show oldest-first in display
        );
      } catch { /* ignore */ }
    };

    fetchErrors();
    const id = setInterval(fetchErrors, POLL_EVENTLOG_MS);
    return () => { active = false; clearInterval(id); };
  }, [viewMode, errorLimit]);

  // ── Derived view ─────────────────────────────────────────────────────────────

  const activeList: LogEntry[] =
    viewMode === "errors"
      ? errorEntries
      : buffer.filter((e) => filters.has(e.category));

  const innerH    = Math.max(2, height - 4); // title + flash row + border×2
  const maxScroll = Math.max(0, activeList.length - innerH);

  // Auto-scroll to bottom unless frozen
  const effectiveScroll = frozen
    ? Math.min(scrollTop, maxScroll)
    : maxScroll;

  const visible = activeList.slice(effectiveScroll, effectiveScroll + innerH);

  // Cursor defaults to last visible item when not explicitly set
  const activeCursor =
    cursor !== null ? Math.min(cursor, activeList.length - 1) : activeList.length - 1;

  // ── Export helpers ───────────────────────────────────────────────────────────

  function doExportSingle() {
    if (activeList.length === 0) { showFlash("⚠  No entries to export"); return; }
    const entry = activeList[activeCursor];
    if (!entry) { showFlash("⚠  Cursor out of range"); return; }
    const path = exportToFile([entry]);
    osc52Copy(entryToText(entry));
    showFlash(`✓ Exported to ${path} (OSC52 also sent)`);
  }

  function doExportBatch() {
    if (activeList.length === 0) { showFlash("⚠  No entries to export"); return; }
    const path = exportToFile(activeList);
    osc52Copy(activeList.map(entryToText).join("\n\n"));
    showFlash(`✓ Exported ${activeList.length} entries → ${path}`);
  }

  // ── Keyboard handler ─────────────────────────────────────────────────────────

  useInput((input, key) => {
    if (!isFocused) return;

    // View mode toggle
    if (input === "!") {
      setViewMode((m) => {
        const next = m === "live" ? "errors" : "live";
        setCursor(null);
        setFrozen(false);
        return next;
      });
      return;
    }

    // Error limit cycling (only in error mode)
    if (input === "n" && viewMode === "errors") {
      setErrorLimitIdx((i) => (i + 1) % ERROR_LIMITS.length);
      return;
    }

    // Filters (live mode only)
    if (viewMode === "live") {
      const catKeys: Record<string, EventCategory> = {
        s: "system", c: "client", r: "server", l: "llm", e: "error",
      };
      if (input in catKeys) {
        const cat = catKeys[input]!;
        setFilters((prev) => {
          const next = new Set(prev);
          next.has(cat) ? next.delete(cat) : next.add(cat);
          return next;
        });
        return;
      }
    }

    // Scroll / cursor navigation
    if (key.upArrow) {
      setFrozen(true);
      setCursor((c) => {
        const base = c !== null ? c : activeList.length - 1;
        return Math.max(0, base - 1);
      });
      setScrollTop((t) => Math.max(0, t - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => {
        const base = c !== null ? c : activeList.length - 1;
        const next = Math.min(activeList.length - 1, base + 1);
        if (next >= activeList.length - 1) { setFrozen(false); }
        return next;
      });
      setScrollTop((t) => {
        const next = t + 1;
        if (next >= maxScroll) { setFrozen(false); return maxScroll; }
        return next;
      });
      return;
    }
    if (key.pageUp) {
      setFrozen(true);
      setCursor(0);
      setScrollTop(0);
      return;
    }
    if (key.pageDown || input === "G") {
      setCursor(null);
      setFrozen(false);
      setScrollTop(maxScroll);
      return;
    }
    if (input === "f") {
      setFrozen((f) => {
        if (f) { setScrollTop(maxScroll); setCursor(null); }
        return !f;
      });
      return;
    }

    // Export: x = single selected entry, X = batch all visible
    if (input === "x") { doExportSingle(); return; }
    if (input === "X") { doExportBatch();  return; }
  }, { isActive: isFocused });

  // ── Render ───────────────────────────────────────────────────────────────────

  const ALL_CATS: EventCategory[] = ["system", "client", "server", "llm", "error"];
  const catLabels: Record<EventCategory, string> = {
    system: "[s]SYS", client: "[c]CLI", server: "[r]SRV", llm: "[l]LLM", error: "[e]ERR",
  };

  const borderColor = viewMode === "errors" ? "red" : "blue";
  const titleColor  = viewMode === "errors" ? "red" : "blue";

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor}
         height={height} overflow="hidden">
      {/* ── Title row ── */}
      <Box paddingX={1} justifyContent="space-between">
        <Box>
          <Text bold color={titleColor}>
            {viewMode === "errors" ? "🔴 [!] Errors" : "📝 [4] Event Log"}
          </Text>
          <Text color="gray"> ({activeList.length}{viewMode === "live" ? `/${buffer.length}` : ` / limit ${errorLimit}`})</Text>
          {frozen && <Text color="yellow"> ❄ [f]resume</Text>}
          {viewMode === "errors" && (
            <Text color="yellow"> [n] cycle limit</Text>
          )}
        </Box>

        {/* Filter pills (live mode) or error limit (error mode) */}
        <Box>
          {viewMode === "live"
            ? ALL_CATS.map((cat) => {
                const active = filters.has(cat);
                const { color } = categoryBadge(cat);
                return (
                  <Box key={cat} marginLeft={1}>
                    <Text color={active ? color : "gray"} dimColor={!active}>
                      {catLabels[cat]}
                    </Text>
                  </Box>
                );
              })
            : <Text color="red">[!] back to live</Text>
          }
        </Box>
      </Box>

      {/* ── Flash status bar ── */}
      {flash && (
        <Box paddingX={1}>
          <Text color="yellow" bold>{flash}</Text>
        </Box>
      )}

      {/* ── Log lines ── */}
      <Box flexDirection="column" paddingX={1}>
        {visible.length === 0 ? (
          <Text color="gray">
            {activeList.length === 0
              ? (viewMode === "errors" ? "No errors recorded yet." : "No events yet...")
              : "No events match active filters."}
          </Text>
        ) : (
          visible.map((entry, visIdx) => {
            const absoluteIdx = effectiveScroll + visIdx;
            const isSelected  = isFocused && absoluteIdx === activeCursor;
            const badge       = categoryBadge(entry.category);
            return (
              <Box key={entry.id} backgroundColor={isSelected ? "gray" : undefined}>
                <Text color={isSelected ? "black" : "gray"}>{formatTime(entry.timestamp)} </Text>
                <Text color={isSelected ? "black" : badge.color}>[{badge.label}] </Text>
                <Text
                  color={isSelected ? "black" : levelColor(entry.level)}
                  wrap="truncate-end"
                >
                  {entry.message}
                </Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* ── Export hint row (when focused) ── */}
      {isFocused && (
        <Box paddingX={1}>
          <Text color="gray" dimColor>
            {viewMode === "live"
              ? "[x] export entry  [X] export all visible  [!] errors mode"
              : "[x] export selected  [X] export all errors  [!] back to live"}
          </Text>
        </Box>
      )}
    </Box>
  );
}
