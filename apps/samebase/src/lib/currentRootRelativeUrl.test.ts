// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vite-plus/test";

import { getCurrentRootRelativeUrl } from "./currentRootRelativeUrl";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("getCurrentRootRelativeUrl", () => {
  it("preserves unrelated values and removes authorization data", () => {
    window.history.replaceState(
      null,
      "",
      "/org/Samebase/providers?prod-ui&devtools=1&code=provider-code&state=provider-state&authorization-provider=convex&authorization-error=target-mismatch#connections",
    );

    expect(getCurrentRootRelativeUrl()).toBe(
      "/org/Samebase/providers?prod-ui&devtools=1#connections",
    );
  });
});
