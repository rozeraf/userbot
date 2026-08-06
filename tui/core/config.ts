import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".config", "userbot-tui");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export type PanelName = "status" | "messages" | "llmCalls" | "eventLog";

export interface TuiConfig {
  visiblePanels: PanelName[];
}

const DEFAULT_CONFIG: TuiConfig = {
  visiblePanels: ["status", "messages", "llmCalls", "eventLog"]
};

export function loadTuiConfig(): TuiConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(data) as TuiConfig;
      if (Array.isArray(parsed.visiblePanels)) {
        return parsed;
      }
    }
  } catch (err) {
    // Return default on error
  }
  return DEFAULT_CONFIG;
}

export function saveTuiConfig(config: TuiConfig) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("[TUI Config] Failed to save config:", err);
  }
}
