import type { Provider } from "../config/env";
import { ENV } from "../config/env";

let activeProvider: Provider = ENV.LLM_PROVIDER;

export const state = {
  getProvider(): Provider {
    return activeProvider;
  },
  setProvider(next: Provider) {
    activeProvider = next;
  },
};
