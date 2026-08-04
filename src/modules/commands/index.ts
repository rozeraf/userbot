import { answerCommand } from "./answer";
import { providerCommand } from "./provider";
import { statusCommand } from "./status";
import { translateCommand } from "./translate";
import type { CommandModule } from "./types";

export const COMMANDS: CommandModule[] = [
  statusCommand,
  providerCommand,
  answerCommand,
  translateCommand,
];
