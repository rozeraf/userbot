import path from "path";

export const TUI_SYNC_PROTOCOL = 1;
export const TUI_SYNC_SCHEMA = 1;
export const WAKE_BYTE = 0x01;

export type SyncHandshake = {
  protocol: number;
  schemaVersion: number;
  dbInstanceId: string;
};

export function tuiSocketPath(): string {
  const runtimeDir = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? "unknown"}`;
  return path.join(runtimeDir, "tg-userbot", "default.sock");
}
