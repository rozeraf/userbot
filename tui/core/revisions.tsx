import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loadTuiRevisions } from "../data/queries";

const REVISION_POLL_MS = 800;
type RevisionMap = ReadonlyMap<string, number>;
const RevisionContext = createContext<RevisionMap>(new Map());

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
    return () => { active = false; clearInterval(timer); };
  }, []);

  return <RevisionContext.Provider value={revisions}>{children}</RevisionContext.Provider>;
}

export function useRevision(resource: string, scope = ""): number {
  const revisions = useContext(RevisionContext);
  return useMemo(() => revisions.get(key(resource, scope)) ?? 0, [revisions, resource, scope]);
}
