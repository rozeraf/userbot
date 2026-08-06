import type { CommandModule } from "./types";
import answer from "./answer/init";
import explain from "./explain/init";
import fix from "./fix/init";
import help from "./help/init";
import provider from "./provider/init";
import remind from "./remind/init";
import status from "./status/init";
import summarize from "./summarize/init";
import translate from "./translate/init";

// Explicit ordering makes command matching deterministic and turns a broken
// import into a startup failure instead of silently dropping functionality.
export const COMMANDS: CommandModule[] = [
  answer,
  explain,
  fix,
  help,
  provider,
  remind,
  status,
  summarize,
  translate,
];
