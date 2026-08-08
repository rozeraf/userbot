/** Single source of truth for Telegram command syntax. */
export const COMMAND_PREFIX = "!" as const;

export function commandText(name: string): string {
  return `${COMMAND_PREFIX}${name}`;
}

export function matchesCommand(text: string, name: string): boolean {
  const command = commandText(name);
  return text === command || text.startsWith(`${command} `);
}

export function commandArgs(text: string, name: string): string {
  return text.slice(commandText(name).length).trim();
}
