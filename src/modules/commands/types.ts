import { Api, type TelegramClient } from "telegram";

export type CommandContext = {
  client: TelegramClient;
  message: Api.Message;
  text: string;
  correlationId?: string;
};

export type CommandModule = {
  name: string;
  match: (text: string) => boolean;
  run: (ctx: CommandContext) => Promise<boolean> | boolean;
};
