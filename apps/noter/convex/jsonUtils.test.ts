import { describe, expect, it } from "vite-plus/test";

import { toErrorMessage } from "./jsonUtils";

describe("toErrorMessage", () => {
  it("returns the message from Error instances", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("reads a small allowlist of safe message fields from plain objects", () => {
    expect(
      toErrorMessage({
        detail: "Request failed",
        token: "secret-token",
      }),
    ).toBe("Request failed");
  });

  it("falls back instead of serializing arbitrary thrown objects", () => {
    expect(
      toErrorMessage({
        nested: {
          accessToken: "secret-token",
        },
      }),
    ).toBe("Unknown error");
  });
});
