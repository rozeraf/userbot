import fs from "fs";
import path from "path";
import type { CommandModule } from "./types";

const COMMANDS: CommandModule[] = [];

const currentDir = import.meta.dirname;

// Read all items in the current directory to find command subfolders
const items = fs.readdirSync(currentDir);

for (const item of items) {
  const itemPath = path.join(currentDir, item);
  if (fs.statSync(itemPath).isDirectory()) {
    const initPath = path.join(itemPath, "init.ts");
    if (fs.existsSync(initPath)) {
      try {
        const module = (await import(`./${item}/init.ts`)) as { default?: CommandModule };
        const command = module.default;
        if (command && typeof command.match === "function" && typeof command.run === "function") {
          COMMANDS.push(command);
          console.log(`[commands] Loaded module: ${command.name}`);
        }
      } catch (err) {
        console.error(`[commands] Failed to load module in ${item}:`, err);
      }
    }
  }
}

export { COMMANDS };
