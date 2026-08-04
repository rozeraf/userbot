import type { TelegramClient } from "telegram";

export type CommandContext = {
  client: TelegramClient;
  message: any;
  text: string;
};

export type CommandModule = {
  name: string;
  match: (text: string) => boolean;
  run: (ctx: CommandContext) => Promise<boolean> | boolean;
};
