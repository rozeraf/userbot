import type { CommandModule } from "./types";
import ai from "./ai/init";
import explain from "./explain/init";
import fix from "./fix/init";
import find from "./find/init";
import help from "./help/init";
// import lithium from "./lithium/init";
import provider from "./provider/init";
import person from "./person/init";
import remind from "./remind/init";
import status from "./status/init";
import summarize from "./summarize/init";
import searchclaim from "./searchclaim/init";
import translate from "./translate/init";

// Explicit ordering makes command matching deterministic and turns a broken
// import into a startup failure instead of silently dropping functionality.
export const COMMANDS: CommandModule[] = [
  ai,
  explain,
  fix,
  find,
  help,
  lithium,
  person,
  provider,
  remind,
  status,
  searchclaim,
  summarize,
  translate,
];
