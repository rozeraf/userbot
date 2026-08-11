import { ENV } from "../../config/env";
import { combineSystemPrompts, normalizeText } from "./prompt";
import { errorMessage } from "../errors";
import { HttpError, withLlmRetries } from "./retry";
import type { CompletionRequest, CompletionResult, ConversationItem } from "./types";

interface CerebrasChatResponse {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
  }[];
  model?: string;
  usage?: unknown;
}

type CerebrasMessage = Record<string, unknown>;

export function serializeCerebrasHistory(history: readonly ConversationItem[]): CerebrasMessage[] {
  return history.map((item): CerebrasMessage => {
    switch (item.type) {
      case "user": return { role: "user", content: item.text };
      case "assistant_text": return { role: "assistant", content: item.text };
      case "assistant_tool_calls": return {
        role: "assistant",
        content: null,
        tool_calls: item.calls.map((call) => ({
          id: call.callId,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      };
      case "tool_result": return {
        role: "tool",
        tool_call_id: item.callId,
        name: item.name,
        content: JSON.stringify(item.result),
      };
    }
  });
}

function nowMs(): number {
  return Date.now();
}

function parseToolArguments(value: string): unknown {
  try { return JSON.parse(value || "{}"); }
  catch { return { invalidJson: value }; }
}

export async function askCerebras(prompt: string, systemPrompt?: string): Promise<string> {
  const result = await completeCerebras({ history: [{ type: "user", text: prompt }], systemPrompt });
  if (result.kind !== "text") throw new Error("Cerebras unexpectedly returned tool calls");
  return result.text;
}

export async function completeCerebras(request: CompletionRequest): Promise<CompletionResult> {
  const url = "https://api.cerebras.ai/v1/chat/completions";

  const t0 = nowMs();
  console.log("[cerebras] request start");

  const messages: CerebrasMessage[] = [];

  const activeSystemPrompt = combineSystemPrompts(ENV.SYSTEM_PROMPT, request.systemPrompt);
  if (activeSystemPrompt) {
    messages.push({ role: "system", content: activeSystemPrompt });
  }

  messages.push(...serializeCerebrasHistory(request.history));

  try {
    return await withLlmRetries("cerebras", ENV.CEREBRAS_API_KEYS, async (apiKey, signal) => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: ENV.CEREBRAS_MODEL,
          messages,
          temperature: 0.7,
          ...(request.tools?.length ? { tools: request.tools.map((tool) => ({
            type: "function",
            function: { name: tool.name, description: tool.description, parameters: tool.parameters },
          })) } : {}),
        }),
        signal,
      });

      console.log("[cerebras] status:", res.status, "elapsedMs:", nowMs() - t0);

      if (!res.ok) {
        const errText = await res.text();
        console.error("[cerebras] error body:", errText);
        throw new HttpError(res.status, `Cerebras API error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as CerebrasChatResponse;
      console.log("[cerebras] raw response keys:", Object.keys(data ?? {}));

      const message = data.choices?.[0]?.message;
      const toolCalls = message?.tool_calls;
      if (toolCalls?.length) {
        return { kind: "tool_calls", calls: toolCalls.map((call) => ({
          callId: call.id,
          name: call.function.name,
          arguments: parseToolArguments(call.function.arguments),
        })) };
      }
      const text = message?.content;
      if (!text) throw new Error("Cerebras returned empty response");

      console.log("[cerebras] response ok, totalMs:", nowMs() - t0);
      return { kind: "text", text: normalizeText(text) };
    }, { timeoutMs: request.timeoutMs });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Cerebras API request timed out (${Math.ceil((request.timeoutMs ?? 45_000) / 1000)}s)`);
    }
    throw new Error(errorMessage(err), { cause: err });
  }
}
