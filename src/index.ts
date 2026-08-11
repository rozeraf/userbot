import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";
// @ts-ignore
import input from "input";
import { ENV } from "./config/env";
import { onNewMessage } from "./modules/events/onNewMessage";
import { database } from "./core/db";
import { startTuiSyncServer, type TuiSyncServer } from "./core/tuiSync/server";
import { createWorkspaceSystemNotifier, initializeWorkspace, type WorkspaceRouter } from "./core/workspace";
import { BRAND } from "./config/branding";

let isShuttingDown = false;
let tuiSyncServer: TuiSyncServer | null = null;

function shutdown(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  database.setStatus("disconnected");
  database.close();
  tuiSyncServer?.close();
  tuiSyncServer = null;
  process.exit(exitCode);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("beforeExit", () => database.close());

// Rejections can be logged and observed; an uncaught exception leaves the
// process state unreliable, so it is persisted and then the process exits.
process.on("unhandledRejection", (reason, promise) => {
  console.error("[process] Unhandled Rejection at:", promise, "reason:", reason);
  database.logEvent({
    eventType: "process_unhandled_rejection",
    level: "error",
    category: "error",
    message: String(reason),
  });
  database.flush();
});

process.on("uncaughtException", (error) => {
  console.error("[process] Uncaught Exception thrown:", error);
  database.logEvent({
    eventType: "process_uncaught_exception",
    level: "error",
    category: "error",
    message: error.message || String(error),
    metadata: { stack: error.stack },
  });
  database.flush();
  shutdown(1);
});

async function main() {
  database.start();
  tuiSyncServer = await startTuiSyncServer();
  database.setStatus("connecting");
  database.logEvent({
    eventType: "bot_start",
    level: "info",
    category: "system",
    message: `Starting ${BRAND.name}`,
    metadata: { hasSession: Boolean(ENV.TG_SESSION) },
  });
  const session = new StringSession(ENV.TG_SESSION);

  const client = new TelegramClient(session, ENV.TG_API_ID, ENV.TG_API_HASH, {
    connectionRetries: Infinity,
    autoReconnect: true,
    floodSleepThreshold: 60,
  });

  // Log connection info
  if (client.disconnected) {
    console.log("[tg] Client starting in disconnected state");
  }

  console.log("[tg] start connect");
  await client.connect();
  console.log("[tg] connected");
  
  database.logEvent({
    eventType: "tg_connected",
    level: "info",
    category: "client",
    message: "Telegram client connected successfully",
  });

  const authorized = await client.checkAuthorization();
  console.log("[tg] already authorized:", authorized);

  if (!authorized) {
    try {
      await client.start({
        phoneNumber: async () => (await input.text("Номер телефона: ")).trim(),
        phoneCode: async (isCodeViaApp?: boolean) => (await input.text(
          isCodeViaApp ? "Код из Telegram (в приложении, не SMS): " : "Код из Telegram: "
        )).trim(),
        password: async (hint?: string) => await input.password(
          hint ? `Пароль двухэтапной проверки (${hint}): ` : "Пароль двухэтапной проверки: "
        ),
        onError: async (err: Error) => {
          console.error("[tg] auth error:", err);
          return true;
        },
      });
      console.log("[tg] sign in ok");
      console.log("Сохрани эту строку в .env как TG_SESSION:");
      console.log(client.session.save());
    } catch (err) {
      console.error("[tg] auth error:", err);
      shutdown(1);
    }
  }

  database.setStatus("active");
  try {
    const pingStart = Date.now();
    await client.getEntity("me");
    database.setPing(Date.now() - pingStart);
  } catch (e) {
    console.warn("[tg] failed to ping Telegram", e);
  }

  console.log(`${BRAND.name} запущен.`);
  console.log("[tg] initial provider:", ENV.LLM_PROVIDER);
  database.logEvent({
    eventType: "bot_ready",
    level: "info",
    category: "system",
    message: `${BRAND.name} is running and listening for messages`,
    metadata: { initialProvider: ENV.LLM_PROVIDER },
  });

  let workspace: WorkspaceRouter | undefined;
  try {
    workspace = await initializeWorkspace(client);
    const systemNotifier = createWorkspaceSystemNotifier(client, workspace);
    database.setSystemEventSink((event) => systemNotifier.notifyEvent(event));
    void systemNotifier.notify(`✅ ${BRAND.name} workspace ready`).catch(() => {});
    console.log("[workspace] ready:", workspace.config.chatId, workspace.config.topics);
    database.logEvent({
      eventType: "workspace_ready",
      level: "info",
      category: "system",
      message: `${BRAND.workspaceTitle} initialized`,
      metadata: { chatId: workspace.config.chatId, topics: workspace.config.topics },
    });
  } catch (err) {
    console.error("[workspace] initialization failed:", err);
    database.logEvent({
      eventType: "workspace_init_error",
      level: "error",
      category: "error",
      message: `Workspace initialization failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  client.addEventHandler(
    (event) => onNewMessage(event, client, workspace),
    new NewMessage({})
  );

  // Periodic ping to Telegram every 15 seconds
  const pingInterval = setInterval(async () => {
    if (client.connected) {
      try {
        const start = Date.now();
        await client.invoke(new Api.updates.GetState());
        const latency = Date.now() - start;
        database.setPing(latency);
      } catch (err) {
        console.error("[tg] ping failed:", err);
        database.setPing(null);
        database.logEvent({
          eventType: "tg_ping_error",
          level: "error",
          category: "error",
          message: `Telegram ping failed: ${err instanceof Error ? err.message : String(err)}`
        });
      }
    }
  }, 15000);

  pingInterval.unref(); // Prevent keeping the event loop active
}

main().catch((err) => {
  console.error("[fatal]", err);
  database.setStatus("disconnected");
  database.logEvent({
    eventType: "bot_fatal",
    level: "error",
    category: "error",
    message: err.message || String(err),
    metadata: { stack: err.stack },
  });
  database.flush();
  shutdown(1);
});
