import { eq } from "drizzle-orm";
import { appMeta } from "../db/schema";
import { db } from "../db/client";
import { writeTransaction } from "../db/writer";
import type { WorkspaceConfig } from "./types";
import { parseWorkspaceConfig } from "./config";

const WORKSPACE_META_KEY = "workspace_config_v1";

export function loadWorkspaceConfig(): WorkspaceConfig | null {
  const value = db.select({ value: appMeta.value }).from(appMeta)
    .where(eq(appMeta.key, WORKSPACE_META_KEY)).all()[0]?.value;
  if (!value) return null;
  const config = parseWorkspaceConfig(value);
  if (!config) throw new Error(`Invalid ${WORKSPACE_META_KEY} in app_meta`);
  return config;
}

export function saveWorkspaceConfig(config: WorkspaceConfig): void {
  writeTransaction((tx) => {
    tx.insert(appMeta).values({ key: WORKSPACE_META_KEY, value: JSON.stringify(config) })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: JSON.stringify(config) } })
      .run();
  });
}
