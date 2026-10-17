import { route } from "./router.js";
import { mockRead } from "./reading/mock.js";

export default {
  async fetch(request, env) {
    const handled = await route(request, env, env.MOCK_ENGINE === "1" ? { readDocument: mockRead } : {});
    if (handled) return handled;
    return env.ASSETS.fetch(request);
  },
};
