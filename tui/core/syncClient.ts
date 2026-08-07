import {
  TUI_SYNC_PROTOCOL, TUI_SYNC_SCHEMA, WAKE_BYTE, tuiSocketPath, type SyncHandshake,
} from "../../src/core/tuiSync/protocol";

export type SyncState = "connecting" | "live" | "offline" | "incompatible";
type Options = {
  dbInstanceId: string;
  onWake: () => void;
  onState: (state: SyncState) => void;
};

export function startSyncClient({ dbInstanceId, onWake, onState }: Options): () => void {
  let stopped = false;
  let socket: Bun.Socket<{ handshaken: boolean; buffer: Buffer }> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let retryMs = 250;
  let generation = 0;

  const reconnect = () => {
    if (stopped || reconnectTimer) return;
    onState("offline");
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, retryMs);
    retryMs = Math.min(5_000, retryMs * 2);
  };

  const connect = async () => {
    if (stopped) return;
    const connectionGeneration = ++generation;
    onState("connecting");
    try {
      const connected = await Bun.connect<{ handshaken: boolean; buffer: Buffer }>({
        unix: tuiSocketPath(),
        data: { handshaken: false as boolean, buffer: Buffer.alloc(0) },
        socket: {
          open() { /* handshake arrives as the first frame */ },
          data(current, chunk) {
            if (!current.data.handshaken) {
              current.data.buffer = Buffer.concat([current.data.buffer, chunk]);
              const newline = current.data.buffer.indexOf(0x0a);
              if (newline < 0) return;
              let handshake: SyncHandshake;
              try { handshake = JSON.parse(current.data.buffer.subarray(0, newline).toString("utf8")); }
              catch { current.terminate(); return; }
              if (handshake.protocol !== TUI_SYNC_PROTOCOL || handshake.schemaVersion !== TUI_SYNC_SCHEMA
                  || handshake.dbInstanceId !== dbInstanceId) {
                onState("incompatible");
                current.end();
                return;
              }
              current.data.handshaken = true;
              retryMs = 250;
              onState("live");
              onWake(); // mandatory reconcile after handshake
              const remaining = current.data.buffer.subarray(newline + 1);
              current.data.buffer = Buffer.alloc(0);
              if (remaining.includes(WAKE_BYTE)) onWake();
              return;
            }
            if (chunk.includes(WAKE_BYTE)) onWake();
          },
          close(current) {
            if (socket !== current || connectionGeneration !== generation) return;
            socket = null;
            reconnect();
          },
          error(_socket, error) { if (!stopped) console.warn("[tui-sync] socket error:", error.message); },
          connectError() { reconnect(); },
        },
      });
      if (stopped || connectionGeneration !== generation) connected.end();
      else socket = connected;
    } catch {
      if (connectionGeneration === generation) reconnect();
    }
  };

  void connect();
  return () => {
    stopped = true;
    generation++;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    socket?.end();
  };
}
