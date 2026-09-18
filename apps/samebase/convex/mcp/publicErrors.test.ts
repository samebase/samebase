import { ConvexError } from "convex/values";
import { describe, expect, it } from "vite-plus/test";

import { AppResourceNameConflictError } from "../../shared/appResourceNames";
import { publicMcpErrorMessage } from "./publicErrors";

describe("MCP public errors", () => {
  it("uses the public Convex payload instead of nested transport diagnostics", () => {
    const error = new ConvexError("Organization connection limit reached (6).");
    error.message =
      "Uncaught ConvexError: private@example.com\n at internalMutation (server.ts:10)";
    expect(publicMcpErrorMessage(error)).toBe("Organization connection limit reached (6).");
    expect(
      publicMcpErrorMessage(
        new AppResourceNameConflictError({
          provider: "cloudflare",
          name: "existing-worker",
        }),
      ),
    ).toBe("A Cloudflare Worker named existing-worker already exists.");
  });

  it.each([
    new Error("Provider failed: private@example.com secret=private-token"),
    new ConvexError({ message: "private@example.com", debug: { token: "private-token" } }),
    "private@example.com",
  ])("does not return unapproved error data", (error) => {
    expect(publicMcpErrorMessage(error)).toBe(
      "Samebase could not complete this request. Check the app in Samebase before retrying.",
    );
  });
});
