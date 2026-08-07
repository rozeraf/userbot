import path from "path";

export const TUI_SYNC_PROTOCOL = 1;
export const TUI_SYNC_SCHEMA = 1;
export const WAKE_BYTE = 0x01;

export type SyncHandshake = {
  protocol: number;
  schemaVersion: number;
  dbInstanceId: string;
};

export function userbotInstance(): string {
  const instance = process.env.USERBOT_INSTANCE?.trim() || "default";
  if (!/^[a-zA-Z0-9_-]+$/.test(instance)) {
    throw new Error("USERBOT_INSTANCE may contain only letters, digits, underscores, and hyphens");
  }
  return instance;
}

export function tuiSocketPath(): string {
  const runtimeDir = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? "unknown"}`;
  return path.join(runtimeDir, "tg-userbot", `${userbotInstance()}.sock`);
}
