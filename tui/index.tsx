import React, { useState } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import { loadTuiConfig, saveTuiConfig } from "./core/config";
import type { PanelName } from "./core/config";
import { usePoll } from "./core/usePoll";
import { db, messages, llmCalls, eventLog, statusSnapshot } from "./core/db";
import { sql } from "drizzle-orm";

interface DbCounts {
  messages: number;
  llmCalls: number;
  events: number;
  ping: number | null;
  status: string;
}

function TuiApp() {
  const { exit } = useApp();
  const initialConfig = loadTuiConfig();
  const [visiblePanels, setVisiblePanels] = useState<Set<PanelName>>(
    new Set(initialConfig.visiblePanels)
  );

  // Poll database for counts and status
  const counts = usePoll<DbCounts>(
    async () => {
      try {
        const msgCount = db.select({ count: sql<number>`count(*)` }).from(messages).all()[0]?.count ?? 0;
        const llmCount = db.select({ count: sql<number>`count(*)` }).from(llmCalls).all()[0]?.count ?? 0;
        const evCount = db.select({ count: sql<number>`count(*)` }).from(eventLog).all()[0]?.count ?? 0;
        
        const snapshot = db.select().from(statusSnapshot).where(sql`id = 1`).all()[0];

        return {
          messages: msgCount,
          llmCalls: llmCount,
          events: evCount,
          ping: snapshot?.pingMs ?? null,
          status: snapshot?.status ?? "unknown"
        };
      } catch (err) {
        return { messages: 0, llmCalls: 0, events: 0, ping: null, status: "error" };
      }
    },
    1000,
    { messages: 0, llmCalls: 0, events: 0, ping: null, status: "loading" }
  );

  // Handle hotkeys
  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
      return;
    }

    const panelMap: Record<string, PanelName> = {
      "1": "status",
      "2": "messages",
      "3": "llmCalls",
      "4": "eventLog",
    };

    if (input in panelMap) {
      const panelName = panelMap[input]!;
      const nextVisible = new Set(visiblePanels);
      if (nextVisible.has(panelName)) {
        nextVisible.delete(panelName);
      } else {
        nextVisible.add(panelName);
      }
      setVisiblePanels(nextVisible);
      saveTuiConfig({ visiblePanels: Array.from(nextVisible) });
    }
  });

  return (
    <Box flexDirection="column" width="100%" height="100%" padding={1}>
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={2} marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">⚡ TG-GEMINI-USERBOT TUI ⚡</Text>
        <Text color="gray">Status: <Text color={counts.status === "active" ? "green" : "yellow"}>{counts.status}</Text> | Ping: {counts.ping != null ? `${counts.ping}ms` : "N/A"}</Text>
      </Box>

      {/* Main Content Area */}
      <Box flexDirection="row" width="100%" flexGrow={1}>
        {/* Left Column: Status Snapshot */}
        {visiblePanels.has("status") && (
          <Box borderStyle="round" borderColor="green" flexDirection="column" width="30%" paddingX={1} marginRight={1}>
            <Text bold color="green">📊 [1] Status Snapshot</Text>
            <Box flexDirection="column" marginTop={1}>
              <Text>• Bot: {counts.status}</Text>
              <Text>• Msg Count: {counts.messages}</Text>
              <Text>• LLM Requests: {counts.llmCalls}</Text>
              <Text>• Event Logs: {counts.events}</Text>
            </Box>
          </Box>
        )}

        {/* Right Column: Dynamic Panels */}
        <Box flexDirection="column" flexGrow={1}>
          {visiblePanels.has("messages") && (
            <Box borderStyle="round" borderColor="yellow" flexGrow={1} paddingX={1} marginBottom={visiblePanels.has("llmCalls") || visiblePanels.has("eventLog") ? 1 : 0}>
              <Text bold color="yellow">💬 [2] Message History ({counts.messages} rows)</Text>
              <Box marginTop={1}>
                <Text color="gray">[Placeholder] Содержимое сообщений появится в Фазе 3...</Text>
              </Box>
            </Box>
          )}

          {visiblePanels.has("llmCalls") && (
            <Box borderStyle="round" borderColor="magenta" flexGrow={1} paddingX={1} marginBottom={visiblePanels.has("eventLog") ? 1 : 0}>
              <Text bold color="magenta">🤖 [3] LLM Calls ({counts.llmCalls} rows)</Text>
              <Box marginTop={1}>
                <Text color="gray">[Placeholder] Вызовы нейросетей появятся в Фазе 3...</Text>
              </Box>
            </Box>
          )}

          {visiblePanels.has("eventLog") && (
            <Box borderStyle="round" borderColor="blue" flexGrow={1} paddingX={1}>
              <Text bold color="blue">📝 [4] Event Log ({counts.events} rows)</Text>
              <Box marginTop={1}>
                <Text color="gray">[Placeholder] Системные события появятся в Фазе 3...</Text>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* Footer Controls */}
      <Box borderStyle="single" borderColor="gray" paddingX={2} marginTop={1} justifyContent="space-between">
        <Text color="gray">Toggle: [1] Status | [2] Messages | [3] LLM | [4] Events</Text>
        <Text color="red" bold>Press [q] to Quit</Text>
      </Box>
    </Box>
  );
}

render(<TuiApp />);
