export type ToolCall = Readonly<{
  callId: string;
  name: string;
  arguments: unknown;
}>;

export type ConversationItem =
  | Readonly<{ type: "user"; text: string }>
  | Readonly<{ type: "assistant_text"; text: string }>
  | Readonly<{ type: "assistant_tool_calls"; calls: readonly ToolCall[] }>
  | Readonly<{ type: "tool_result"; callId: string; name: string; result: unknown }>;

export type ToolDefinition = Readonly<{
  name: string;
  description: string;
  parameters: Readonly<Record<string, unknown>>;
}>;

export type CompletionRequest = Readonly<{
  history: readonly ConversationItem[];
  systemPrompt?: string;
  tools?: readonly ToolDefinition[];
  timeoutMs?: number;
}>;

export type CompletionResult =
  | Readonly<{ kind: "text"; text: string }>
  | Readonly<{ kind: "tool_calls"; calls: readonly ToolCall[] }>;
