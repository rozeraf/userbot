import { sql } from "drizzle-orm";
import { db } from "./client";
import { tuiRevisions } from "./schema";

export type TuiResource = "status" | "runtime_metrics" | "chats" | "messages" | "llm_calls" | "events" | "commands";
export type RevisionKey = Readonly<{ resource: TuiResource; scope: string }>;
export type WriteTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class RevisionChanges {
  readonly resources = new Map<TuiResource, Set<string>>();

  mark(resource: TuiResource, scope = ""): void {
    let scopes = this.resources.get(resource);
    if (!scopes) {
      scopes = new Set<string>();
      this.resources.set(resource, scopes);
    }
    scopes.add(scope);
  }

  keys(): RevisionKey[] {
    return [...this.resources].flatMap(([resource, scopes]) =>
      [...scopes].map((scope) => ({ resource, scope })),
    );
  }

  get size(): number {
    let size = 0;
    for (const scopes of this.resources.values()) size += scopes.size;
    return size;
  }
}

type CommitListener = (changes: readonly RevisionKey[]) => void;
const commitListeners = new Set<CommitListener>();

export function onWriterCommit(listener: CommitListener): () => void {
  commitListeners.add(listener);
  return () => commitListeners.delete(listener);
}

export function bumpRevisions(tx: WriteTransaction, changes: RevisionChanges): void {
  for (const key of changes.keys()) {
    tx.insert(tuiRevisions)
      .values({ ...key, revision: 1 })
      .onConflictDoUpdate({
        target: [tuiRevisions.resource, tuiRevisions.scope],
        set: { revision: sql`${tuiRevisions.revision} + 1` },
      })
      .run();
  }
}

/** All runtime writes pass through here so data and invalidation revisions commit atomically. */
export function writeTransaction<T>(work: (tx: WriteTransaction, changes: RevisionChanges) => T): T {
  const changes = new RevisionChanges();
  const result = db.transaction((tx) => {
    const value = work(tx, changes);
    bumpRevisions(tx, changes);
    return value;
  });

  if (changes.size > 0) {
    const keys = changes.keys();
    for (const listener of commitListeners) {
      try { listener(keys); } catch (err) { console.error("[db/writer] post-commit listener failed:", err); }
    }
  }
  return result;
}
