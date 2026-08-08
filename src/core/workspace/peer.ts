import bigInt from "big-integer";
import { Api } from "telegram";
import type { WorkspaceConfig } from "./types";

export function workspaceInputChannel(config: WorkspaceConfig): Api.InputChannel {
  return new Api.InputChannel({
    channelId: bigInt(config.channelId),
    accessHash: bigInt(config.accessHash),
  });
}
