import { Api, type TelegramClient } from "telegram";
import type { Provider } from "../../config/env";

export type CommandContext = {
  client: TelegramClient;
  message: Api.Message;
  text: string;
  correlationId?: string;
  /** Provider selected when the command was received, not when it eventually runs. */
  provider: Provider;
};

export type CommandModule = {
  name: string;
  match: (text: string) => boolean;
  run: (ctx: CommandContext) => Promise<boolean> | boolean;
};
