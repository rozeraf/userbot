import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { db, eventLog } from "../core/db";
import { gt, asc } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EventCategory = "system" | "client" | "server" | "llm" | "error";
export type EventLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: number;
  eventType: string;
  level: EventLevel;
  category: EventCategory;
  message: string;
  timestamp: number;
}

export type CategoryFilter = Set<EventCategory>;

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BUFFER = 1000;   // max entries kept in memory
const POLL_MS    = 500;    // fetch interval
const SCROLL_STEP = 5;    // lines per arrow key press

// ── Helper utils ──────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
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

// ── EventLogPanel component ───────────────────────────────────────────────────

interface Props {
  /** Outer height in terminal rows available for this panel (including border) */
  height?: number;
  isFocused: boolean;
}

export function EventLogPanel({ height = 20, isFocused }: Props) {
  const [buffer, setBuffer] = useState<LogEntry[]>([]);
  const lastIdRef  = useRef(0);
  const [filters, setFilters] = useState<CategoryFilter>(
    new Set<EventCategory>(["system", "client", "server", "llm", "error"])
  );
  const [frozen,    setFrozen]    = useState(false);
  const [scrollTop, setScrollTop] = useState(0);

  // ── Incremental fetch ───────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;

    const fetch = () => {
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
              timestamp: r.timestamp,
            })),
          ];
          // cap to MAX_BUFFER — keep newest entries
          return next.length > MAX_BUFFER ? next.slice(next.length - MAX_BUFFER) : next;
        });
      } catch {
        // silently ignore DB errors in TUI polling
      }
    };

    fetch();
    const id = setInterval(fetch, POLL_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

  // ── Derived: filtered view ──────────────────────────────────────────────────

  const filtered = buffer.filter((e) => filters.has(e.category));

  // ── Inner viewport height (border + title = 2 rows) ────────────────────────

  const innerH = Math.max(1, height - 3);

  // Clamp scrollTop so we never go past the content
  const maxScroll = Math.max(0, filtered.length - innerH);
  const effectiveScroll = frozen ? Math.min(scrollTop, maxScroll) : maxScroll;
  const visible = filtered.slice(effectiveScroll, effectiveScroll + innerH);

  // ── Hotkeys (only when panel is focused) ───────────────────────────────────

  useInput((input, key) => {
    if (!isFocused) return;

    // Category filter toggles
    const catKeys: Record<string, EventCategory> = {
      "s": "system", "c": "client", "r": "server", "l": "llm", "e": "error",
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

    // Scroll / freeze
    if (key.upArrow) {
      setFrozen(true);
      setScrollTop((t) => Math.max(0, t - SCROLL_STEP));
      return;
    }
    if (key.downArrow) {
      setScrollTop((t) => {
        const next = t + SCROLL_STEP;
        if (next >= maxScroll) { setFrozen(false); return maxScroll; }
        return next;
      });
      return;
    }
    if (input === "f") {
      setFrozen((f) => {
        if (f) setScrollTop(maxScroll); // jump to bottom on unfreeze
        return !f;
      });
      return;
    }
    // Home / End
    if (key.pageUp) {
      setFrozen(true);
      setScrollTop(0);
      return;
    }
    if (key.pageDown || input === "G") {
      setFrozen(false);
      setScrollTop(maxScroll);
      return;
    }
  }, { isActive: isFocused });

  // ── Filter pills ────────────────────────────────────────────────────────────

  const ALL_CATS: EventCategory[] = ["system", "client", "server", "llm", "error"];
  const catLabels: Record<EventCategory, string> = {
    system: "[s]SYS", client: "[c]CLI", server: "[r]SRV", llm: "[l]LLM", error: "[e]ERR",
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue">
      {/* Title + filters + freeze indicator */}
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color="blue">
          📝 [4] Event Log{" "}
          <Text color="gray">({filtered.length}/{buffer.length})</Text>
          {frozen && <Text color="yellow"> ❄ FROZEN [f] to resume</Text>}
        </Text>
        <Box>
          {ALL_CATS.map((cat) => {
            const active = filters.has(cat);
            const { color } = categoryBadge(cat);
            return (
              <Box key={cat} marginLeft={1}>
                <Text color={active ? color : "gray"} dimColor={!active}>
                  {catLabels[cat]}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Log lines */}
      <Box flexDirection="column" paddingX={1}>
        {visible.length === 0 ? (
          <Text color="gray">
            {buffer.length === 0 ? "No events yet..." : "No events match active filters."}
          </Text>
        ) : (
          visible.map((entry) => {
            const badge = categoryBadge(entry.category);
            return (
              <Box key={entry.id}>
                <Text color="gray">{formatTime(entry.timestamp)} </Text>
                <Text color={badge.color}>[{badge.label}] </Text>
                <Text color={levelColor(entry.level)} wrap="truncate-end">
                  {entry.message}
                </Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
