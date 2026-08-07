import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadRelevantRevisions, loadSyncIdentity } from "../data/queries";
import { startSyncClient, type SyncState } from "./syncClient";
import { getDataVersion } from "./db";

const WATCHDOG_MS = 15_000;
type RevisionMap = ReadonlyMap<string, number>;
const RevisionContext = createContext<RevisionMap>(new Map());
const SyncStateContext = createContext<SyncState>("offline");
const MessagesScopeContext = createContext<(scope: string | null) => void>(() => {});

function key(resource: string, scope: string): string {
  return `${resource}\0${scope}`;
}

function equal(a: RevisionMap, b: RevisionMap): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) if (b.get(key) !== value) return false;
  return true;
}

export function RevisionProvider({ children }: { children: React.ReactNode }) {
  const [revisions, setRevisions] = useState<RevisionMap>(new Map());
  const [syncState, setSyncState] = useState<SyncState>("offline");
  const messagesScopeHandler = useRef<(scope: string | null) => void>(() => {});
  const selectMessagesScope = useCallback((scope: string | null) => messagesScopeHandler.current(scope), []);

  useEffect(() => {
    let active = true;
    let currentRevisions: RevisionMap = new Map();
    let lastDataVersion = getDataVersion();
    let wakeGeneration = 0;
    let checkedWakeGeneration = 0;
    let socketLive = false;
    let selectedChatId: string | null = null;

    const reconcile = (source: "startup" | "wake" | "watchdog") => {
      const rows = loadRelevantRevisions(selectedChatId);
      if (!active || !rows) return;
      const next = new Map(rows.map((row) => [key(row.resource, row.scope), row.revision]));
      if (source === "watchdog" && socketLive && wakeGeneration === checkedWakeGeneration) {
        const meaningfulChange = [...next].some(([revisionKey, revision]) =>
          !revisionKey.startsWith("runtime_metrics\0") && currentRevisions.get(revisionKey) !== revision,
        );
        if (meaningfulChange) console.warn("[tui-sync] missed IPC notification; recovered via data_version watchdog");
      }
      currentRevisions = next;
      setRevisions((previous) => equal(previous, next) ? previous : next);
    };
    const onMessagesScope = (scope: string | null) => {
      if (selectedChatId === scope) return;
      selectedChatId = scope;
      reconcile("startup");
    };
    messagesScopeHandler.current = onMessagesScope;
    const onWake = () => {
      wakeGeneration++;
      reconcile("wake");
    };

    reconcile("startup");
    const identity = loadSyncIdentity();
    const stopSync = identity?.db_instance_id
      ? startSyncClient({
          dbInstanceId: identity.db_instance_id,
          onWake,
          onState: (state) => { socketLive = state === "live"; setSyncState(state); },
        })
      : () => {};
    const watchdog = setInterval(() => {
      const dataVersion = getDataVersion();
      if (dataVersion != null && lastDataVersion != null && dataVersion !== lastDataVersion) reconcile("watchdog");
      lastDataVersion = dataVersion;
      checkedWakeGeneration = wakeGeneration;
    }, WATCHDOG_MS);
    return () => { active = false; messagesScopeHandler.current = () => {}; clearInterval(watchdog); stopSync(); };
  }, []);

  return (
    <SyncStateContext.Provider value={syncState}>
      <MessagesScopeContext.Provider value={selectMessagesScope}>
        <RevisionContext.Provider value={revisions}>{children}</RevisionContext.Provider>
      </MessagesScopeContext.Provider>
    </SyncStateContext.Provider>
  );
}

export function useSyncState(): SyncState {
  return useContext(SyncStateContext);
}

export function useRevision(resource: string, scope = ""): number {
  const revisions = useContext(RevisionContext);
  return useMemo(() => revisions.get(key(resource, scope)) ?? 0, [revisions, resource, scope]);
}

export function useSelectedMessagesRevision(chatId: string | null): string {
  const selectScope = useContext(MessagesScopeContext);
  const globalRevision = useRevision("messages");
  const scopedRevision = useRevision("messages", chatId ?? "");
  useEffect(() => {
    selectScope(chatId);
    return () => selectScope(null);
  }, [chatId, selectScope]);
  return `${globalRevision}:${scopedRevision}`;
}
