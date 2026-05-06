import { describe, expect, it } from "vite-plus/test";

import { resolveInfraStateAfterWorkflowFailure } from "./infraProvisioning";

describe("resolveInfraStateAfterWorkflowFailure", () => {
  it("marks failures before provider progress as failed", () => {
    expect(
      resolveInfraStateAfterWorkflowFailure({
        convexProjectId: undefined,
        hosting: undefined,
      }),
    ).toBe("failed");
  });

  it("marks failures after Convex progress as partial", () => {
    expect(
      resolveInfraStateAfterWorkflowFailure({
        convexProjectId: "project-123",
        hosting: undefined,
      }),
    ).toBe("partial");
  });

  it("marks failures after hosting progress as partial", () => {
    expect(
      resolveInfraStateAfterWorkflowFailure({
        convexProjectId: undefined,
        hosting: { provider: "cloudflare" },
      }),
    ).toBe("partial");
  });
});
