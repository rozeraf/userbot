import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loadSyncIdentity, loadTuiRevisions } from "../data/queries";
import { startSyncClient, type SyncState } from "./syncClient";

const REVISION_POLL_MS = 800;
type RevisionMap = ReadonlyMap<string, number>;
const RevisionContext = createContext<RevisionMap>(new Map());
const SyncStateContext = createContext<SyncState>("offline");

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

  useEffect(() => {
    let active = true;
    const reconcile = () => {
      const rows = loadTuiRevisions();
      if (!active || !rows) return;
      const next = new Map(rows.map((row) => [key(row.resource, row.scope), row.revision]));
      setRevisions((previous) => equal(previous, next) ? previous : next);
    };
    reconcile();
    const timer = setInterval(reconcile, REVISION_POLL_MS);
    const identity = loadSyncIdentity();
    const stopSync = identity?.db_instance_id
      ? startSyncClient({ dbInstanceId: identity.db_instance_id, onWake: reconcile, onState: setSyncState })
      : () => {};
    return () => { active = false; clearInterval(timer); stopSync(); };
  }, []);

  return (
    <SyncStateContext.Provider value={syncState}>
      <RevisionContext.Provider value={revisions}>{children}</RevisionContext.Provider>
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
