import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { appMeta } from "../db/schema";
import { onWriterCommit } from "../db/writer";
import { TUI_SYNC_PROTOCOL, TUI_SYNC_SCHEMA, WAKE_BYTE, tuiSocketPath, type SyncHandshake } from "./protocol";

type ClientSocket = Bun.Socket<undefined>;

export type TuiSyncServer = { close(): void; socketPath: string };

async function removeStaleSocket(socketPath: string): Promise<void> {
  if (!fs.existsSync(socketPath)) return;
  try {
    const socket = await Bun.connect({
      unix: socketPath,
      socket: { data() {}, open(socket) { socket.end(); } },
    });
    socket.end();
    throw new Error(`Another tg-userbot instance is already listening on ${socketPath}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Another tg-userbot")) throw err;
    const code = err instanceof Error && "code" in err ? err.code : undefined;
    if (code !== "ECONNREFUSED" && code !== "ENOENT") throw err;
    try { fs.unlinkSync(socketPath); } catch (unlinkErr) {
      if (!(unlinkErr instanceof Error && "code" in unlinkErr && unlinkErr.code === "ENOENT")) throw unlinkErr;
    }
  }
}

export async function startTuiSyncServer(): Promise<TuiSyncServer> {
  const dbInstanceId = db.select({ value: appMeta.value }).from(appMeta)
    .where(eq(appMeta.key, "db_instance_id")).all()[0]?.value;
  if (!dbInstanceId) throw new Error("Missing db_instance_id");

  const socketPath = tuiSocketPath();
  fs.mkdirSync(path.dirname(socketPath), { recursive: true, mode: 0o700 });
  await removeStaleSocket(socketPath);

  const clients = new Set<ClientSocket>();
  const handshake: SyncHandshake = { protocol: TUI_SYNC_PROTOCOL, schemaVersion: TUI_SYNC_SCHEMA, dbInstanceId };
  const listener = Bun.listen<undefined>({
    unix: socketPath,
    socket: {
      open(socket) {
        const payload = `${JSON.stringify(handshake)}\n`;
        if (socket.write(payload) !== Buffer.byteLength(payload)) socket.terminate();
        else clients.add(socket);
      },
      close(socket) { clients.delete(socket); },
      error(socket, error) {
        clients.delete(socket);
        console.warn("[tui-sync] client socket error:", error.message);
      },
      data() { /* server protocol is write-only after handshake */ },
    },
  });
  fs.chmodSync(socketPath, 0o600);

  let wakePending = false;
  const unsubscribe = onWriterCommit((changes) => {
    if (changes.every(({ resource }) => resource === "runtime_metrics")) return;
    if (wakePending) return;
    wakePending = true;
    queueMicrotask(() => {
      wakePending = false;
      const wake = new Uint8Array([WAKE_BYTE]);
      for (const client of clients) {
        if (client.write(wake) !== 1) {
          clients.delete(client);
          client.terminate();
        }
      }
    });
  });

  console.log("[tui-sync] listening:", socketPath);
  return {
    socketPath,
    close() {
      unsubscribe();
      for (const client of clients) client.end();
      clients.clear();
      listener.stop(true);
      try { fs.unlinkSync(socketPath); } catch { /* already removed */ }
    },
  };
}
