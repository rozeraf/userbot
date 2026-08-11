import type { Provider } from "../../config/env";
import { formatEvidence } from "../analysis/evidence/format";
import type { MessageEvidence } from "../analysis/evidence/types";
import type { ToolRegistry } from "../analysis/tools/registry";
import { database } from "../db";
import { completeTurn, type ConversationItem, type LlmRequestContext } from "./index";

const DEFAULT_DEADLINE_MS = 60_000;
const DEFAULT_MAX_TOOL_ROUNDS = 3;

export type AnalysisResult = Readonly<{
  text: string;
  evidence: readonly MessageEvidence[];
  diagnostics: Readonly<{ toolRounds: number; timedOut: boolean }>;
}>;

function timeoutFallback(evidence: readonly MessageEvidence[]): string {
  if (evidence.length === 0) return "Не удалось завершить поиск вовремя.";
  return `Нашёл наиболее подходящие сообщения:\n\n${formatEvidence(evidence)}\n\nНе удалось завершить анализ ответа.`;
}

function roundLimitFallback(evidence: readonly MessageEvidence[]): string {
  if (evidence.length === 0) return "Не удалось завершить анализ за допустимое число шагов.";
  return `Нашёл наиболее подходящие сообщения:\n\n${formatEvidence(evidence)}\n\nНе удалось завершить анализ ответа.`;
}

export async function runToolConversation(options: {
  provider: Provider;
  prompt: string;
  systemPrompt?: string;
  registry: ToolRegistry;
  context?: LlmRequestContext;
  deadlineMs?: number;
  maxToolRounds?: number;
}): Promise<AnalysisResult> {
  const deadline = Date.now() + (options.deadlineMs ?? DEFAULT_DEADLINE_MS);
  const maxRounds = options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
  const history: ConversationItem[] = [{ type: "user", text: options.prompt }];
  const evidence: MessageEvidence[] = [];
  let toolRounds = 0;

  try {
    while (true) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) return { text: timeoutFallback(evidence), evidence, diagnostics: { toolRounds, timedOut: true } };
      const allowTools = toolRounds < maxRounds;
      const result = await completeTurn(options.provider, {
        history,
        systemPrompt: options.systemPrompt,
        tools: allowTools ? options.registry.definitions() : [],
        timeoutMs: Math.min(remainingMs, 45_000),
      }, options.context);

      if (result.kind === "text") {
        return { text: result.text, evidence, diagnostics: { toolRounds, timedOut: false } };
      }
      if (!allowTools) return { text: roundLimitFallback(evidence), evidence, diagnostics: { toolRounds, timedOut: false } };

      history.push({ type: "assistant_tool_calls", calls: result.calls });
      for (const call of result.calls) {
        const startedAt = Date.now();
        try {
          const execution = await options.registry.execute(call.name, call.arguments);
          if (execution.evidence) {
            for (const item of execution.evidence) {
              if (!evidence.some((existing) => existing.dbMessageId === item.dbMessageId)) evidence.push(item);
            }
          }
          history.push({ type: "tool_result", callId: call.callId, name: call.name, result: execution.result });
          database.logEvent({
            eventType: "analysis_tool_success", level: "info", category: "llm",
            message: `Tool ${call.name} succeeded in ${Date.now() - startedAt}ms`,
            metadata: { correlationId: options.context?.correlationId, callId: call.callId },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          history.push({ type: "tool_result", callId: call.callId, name: call.name, result: { error: message } });
          database.logEvent({
            eventType: "analysis_tool_error", level: "warn", category: "llm",
            message: `Tool ${call.name} failed: ${message}`,
            metadata: { correlationId: options.context?.correlationId, callId: call.callId },
          });
        }
      }
      toolRounds++;
    }
  } catch (error) {
    if (Date.now() >= deadline || (error instanceof Error && /timed out|deadline/i.test(error.message))) {
      return { text: timeoutFallback(evidence), evidence, diagnostics: { toolRounds, timedOut: true } };
    }
    throw error;
  }
}
