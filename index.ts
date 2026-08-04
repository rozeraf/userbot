import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { Api } from "telegram";
import input from "input";

type Provider = "gemini" | "cerebras";

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH ?? "";
const sessionString = process.env.TG_SESSION ?? "";
const systemPrompt = process.env.SYSTEM_PROMPT ?? "";
const geminiApiKey = process.env.GEMINI_API_KEY ?? "";
const geminiModel = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

const cerebrasApiKey = process.env.CEREBRAS_API_KEY ?? "";
const cerebrasModel = process.env.CEREBRAS_MODEL ?? "gpt-oss-120b";

const initialProvider = (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();
let activeProvider: Provider = initialProvider === "cerebras" ? "cerebras" : "gemini";

if (!apiId || !apiHash) {
  console.error("Заполни TG_API_ID и TG_API_HASH в .env");
  process.exit(1);
}

if (!geminiApiKey) {
  console.error("Заполни GEMINI_API_KEY в .env");
  process.exit(1);
}

if (!cerebrasApiKey) {
  console.error("Заполни CEREBRAS_API_KEY в .env");
  process.exit(1);
}

const session = new StringSession(sessionString);

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
      }[];
    };
  }[];
  usageMetadata?: unknown;
  modelVersion?: string;
  responseId?: string;
}

interface CerebrasChatResponse {
  choices?: {
    message?: {
      content?: string | null;
    };
  }[];
  model?: string;
  usage?: unknown;
}

function nowMs(): number {
  return Date.now();
}

function preview(text: string, len = 120): string {
  return text.length > len ? `${text.slice(0, len)}...` : text;
}

function normalizeText(s: string): string {
  return s.replace(/\r\n/g, "\n").trim();
}

async function askGemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

  const t0 = nowMs();
  console.log("[gemini] request start");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(systemPrompt
        ? {
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
          }
        : {}),
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    }),
  });

  console.log("[gemini] status:", res.status, "elapsedMs:", nowMs() - t0);

  if (!res.ok) {
    const errText = await res.text();
    console.error("[gemini] error body:", errText);
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as GeminiResponse;
  console.log("[gemini] raw response keys:", Object.keys(data ?? {}));

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini вернул пустой ответ");
  }

  console.log("[gemini] response ok, totalMs:", nowMs() - t0);
  return normalizeText(text);
}

async function askCerebras(prompt: string): Promise<string> {
  const url = "https://api.cerebras.ai/v1/chat/completions";

  const t0 = nowMs();
  console.log("[cerebras] request start");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cerebrasApiKey}`,
    },
    body: JSON.stringify({
      model: cerebrasModel,
      messages: [
        ...(systemPrompt
          ? [
              {
                role: "system",
                content: systemPrompt,
              },
            ]
          : []),
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    }),
  });

  console.log("[cerebras] status:", res.status, "elapsedMs:", nowMs() - t0);

  if (!res.ok) {
    const errText = await res.text();
    console.error("[cerebras] error body:", errText);
    throw new Error(`Cerebras API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as CerebrasChatResponse;
  console.log("[cerebras] raw response keys:", Object.keys(data ?? {}));

  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Cerebras вернул пустой ответ");
  }

  console.log("[cerebras] response ok, totalMs:", nowMs() - t0);
  return normalizeText(text);
}

async function askLLM(prompt: string): Promise<string> {
  console.log("[llm] activeProvider:", activeProvider);
  if (activeProvider === "cerebras") {
    return await askCerebras(prompt);
  }
  return await askGemini(prompt);
}

function buildPrompt(userPrompt: string, originalText: string): string {
  if (userPrompt && originalText) {
    return `Инструкция: ${userPrompt}\n\nСообщение, на которое нужно ответить:\n${originalText}`;
  }

  if (originalText) {
    return originalText;
  }

  return userPrompt;
}

async function main() {
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

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
        { apiId, apiHash },
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
  console.log("[tg] initial provider:", activeProvider);

  client.addEventHandler(async (event: NewMessageEvent) => {
    const message = event.message;
    const text = normalizeText(message?.text ?? "");

    console.log("[event] new message:", {
      chatId: message?.chatId?.toString?.(),
      out: message?.out,
      text: preview(text, 160),
    });

    if (!message?.out) return;
    if (!text) return;

    if (text === "!cerebras") {
      activeProvider = "cerebras";
      console.log("[state] provider switched to cerebras");
      await message.reply({ message: "Провайдер переключен на Cerebras." });
      return;
    }

    if (text === "!gemini") {
      activeProvider = "gemini";
      console.log("[state] provider switched to gemini");
      await message.reply({ message: "Провайдер переключен на Gemini." });
      return;
    }

    if (!text.startsWith("!answer")) return;

    const t0 = nowMs();

    const userPrompt = text.slice("!answer".length).trim();
    const replied = await message.getReplyMessage();
    const originalText = normalizeText(replied?.text ?? "");

    console.log("[answer] trigger detected", {
      provider: activeProvider,
      userPromptPresent: Boolean(userPrompt),
      repliedPresent: Boolean(originalText),
      chatId: message.chatId?.toString?.(),
    });

    if (!userPrompt && !originalText) {
      await message.reply({
        message: "Нужно либо ответить на сообщение, либо написать промпт после !answer.",
      });
      return;
    }

    const prompt = buildPrompt(userPrompt, originalText);
    console.log("[answer] prompt length:", prompt.length);
    console.log("[answer] prompt preview:", preview(prompt, 220));

    try {
      const t1 = nowMs();
      const answer = await askLLM(prompt);
      console.log("[answer] model done inMs:", nowMs() - t1);
      console.log("[answer] answer preview:", preview(answer, 200));

      const replyToId = replied?.id;
      console.log("[answer] sending reply", {
        replyToId,
        chatId: message.chatId?.toString?.(),
      });

      const sendStart = nowMs();
      await client.sendMessage(message.chatId!, {
        message: answer,
        ...(replyToId ? { replyTo: replyToId } : {}),
      });
      console.log("[answer] telegram send done inMs:", nowMs() - sendStart);
      console.log("[answer] total elapsed inMs:", nowMs() - t0);
    } catch (err) {
      console.error("[answer] error:", err);
      await message.reply({ message: "Ошибка при обращении к LLM, смотри логи." });
    }
  }, new NewMessage({}));
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
