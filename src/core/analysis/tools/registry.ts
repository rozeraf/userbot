import type { ToolDefinition } from "../../llm";
import { searchMessagesTool } from "./searchMessages";
import type { AnalysisTool, ToolExecution } from "./types";

export class ToolRegistry {
  private readonly tools = new Map<string, AnalysisTool>();

  constructor(tools: readonly AnalysisTool[] = [searchMessagesTool]) {
    for (const tool of tools) this.tools.set(tool.definition.name, tool);
  }

  definitions(): ToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  async execute(name: string, args: unknown): Promise<ToolExecution> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return await tool.execute(args);
  }
}
