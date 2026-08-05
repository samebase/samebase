import { describe, expect, it } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("agent browser handoff auth provider", () => {
  it("throws instead of clearing auth when the token shape is invalid", async () => {
    const t = makeConvexTest();

    await expect(
      t.action(api.auth.signIn, {
        provider: "agent-browser-handoff",
        params: { token: "not-a-handoff" },
      }),
    ).rejects.toThrow("Browser handoff is invalid or no longer available.");
  });
});
