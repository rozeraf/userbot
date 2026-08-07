# TUI synchronization

The bot is the only runtime SQLite writer. The TUI opens the same database read-only and treats its queries as disposable projections rather than an event stream.

## Consistency model

Every write uses the DB writer transaction boundary. Domain rows and their `(resource, scope)` revisions are committed atomically. A batch marks each unique key once; message revisions are scoped by `chatId`.

Resources:

- `status` — meaningful bot state and counters;
- `runtime_metrics` — heartbeat, ping and memory;
- `chats` — global recent-chat projection;
- `messages / <chatId>` — selected-chat projection;
- `llm_calls`, `events`, `commands` — global projections.

After commit, the writer emits a best-effort internal notification. Notifications are coalesced and broadcast by a separate Unix-domain socket server. Metrics-only commits deliberately do not wake clients.

## IPC protocol

Socket: `$XDG_RUNTIME_DIR/tg-userbot/default.sock`, mode `0600`.

The server sends one JSON-line handshake containing `protocol`, `schemaVersion` and the persistent random `dbInstanceId`. A successful handshake verifies identity only; the client must reconcile revisions immediately afterward. Subsequent `0x01` bytes are wake hints with no delivery or replay guarantee.

If IPC is unavailable or incompatible, the TUI remains a DB-only viewer.

## Recovery

The TUI keeps one read connection and checks its connection-local `PRAGMA data_version` every 15 seconds. A change triggers revision reconciliation. If the socket was live and a meaningful revision changed without a wake, the TUI logs a missed-notification warning. Reopening the database establishes a new `data_version` baseline.

Event Log catches up incrementally up to its bounded UI buffer; a larger backlog is replaced with the latest window. Other panels reload their current projection only when the corresponding revision changes.
