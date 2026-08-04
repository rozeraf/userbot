import { answerCommand } from "./answer";
import { helpCommand } from "./help";
import { providerCommand } from "./provider";
import { statusCommand } from "./status";
import { translateCommand } from "./translate";
import type { CommandModule } from "./types";

export const COMMANDS: CommandModule[] = [
  helpCommand,
  statusCommand,
  providerCommand,
  answerCommand,
  translateCommand,
];
