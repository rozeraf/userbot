import type { MessageEvidence } from "../evidence/types";
import type { ToolDefinition } from "../../llm";

export type ToolExecution = Readonly<{
  result: unknown;
  evidence?: readonly MessageEvidence[];
}>;

export type AnalysisTool = Readonly<{
  definition: ToolDefinition;
  execute(argumentsValue: unknown): ToolExecution | Promise<ToolExecution>;
}>;
