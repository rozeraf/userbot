import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";
// @ts-ignore
import input from "input";
import { ENV } from "./config/env";
import { onNewMessage } from "./modules/events/onNewMessage";

// Global process error catchers to prevent bot crashes on network failures
process.on("unhandledRejection", (reason, promise) => {
  console.error("[process] Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[process] Uncaught Exception thrown:", error);
});

async function main() {
  const session = new StringSession(ENV.TG_SESSION);

  const client = new TelegramClient(session, ENV.TG_API_ID, ENV.TG_API_HASH, {
    connectionRetries: 5,
  });

  // Log connection info
  if (client.disconnected) {
    console.log("[tg] Client starting in disconnected state");
  }

  console.log("[tg] start connect");
  await client.connect();
  console.log("[tg] connected");

  const authorized = await client.checkAuthorization();
  console.log("[tg] already authorized:", authorized);

  if (!authorized) {
    const phone = (await input.text("Номер телефона: ")).trim();
    console.log("[tg] phone entered:", phone);

    try {
      console.log("[tg] sending code...");
      const sendResult = await client.sendCode(
        { apiId: ENV.TG_API_ID, apiHash: ENV.TG_API_HASH },
        phone,
        false
      );

      console.log("[tg] sendCode result:", {
        isCodeViaApp: sendResult.isCodeViaApp,
        phoneCodeHash: sendResult.phoneCodeHash ? "[present]" : "[empty]",
      });

      const codePrompt = sendResult.isCodeViaApp
        ? "Код из Telegram (в приложении, не SMS): "
        : "Код из Telegram: ";

      const code = (await input.text(codePrompt)).trim();
      console.log("[tg] code entered:", {
        len: code.length,
        numeric: /^\d+$/.test(code),
      });

      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash: sendResult.phoneCodeHash,
          phoneCode: code,
        })
      );

      console.log("[tg] sign in ok");
      console.log("Сохрани эту строку в .env как TG_SESSION:");
      console.log(client.session.save());
    } catch (err) {
      console.error("[tg] auth error:", err);
      process.exit(1);
    }
  }

  console.log("Юзербот запущен.");
  console.log("[tg] initial provider:", ENV.LLM_PROVIDER);

  client.addEventHandler(
    (event) => onNewMessage(event, client),
    new NewMessage({})
  );
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
