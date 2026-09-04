import { describe, expect, it } from "vite-plus/test";

import { requireAuthSessionUserCanSignIn } from "./accountLinking";

describe("auth session user lifecycle", () => {
  it("allows session creation only for active users", () => {
    expect(() => requireAuthSessionUserCanSignIn({ state: "active" })).not.toThrow();
    expect(() => requireAuthSessionUserCanSignIn({ state: "deleting" })).toThrow(
      "Account deletion is in progress.",
    );
    expect(() => requireAuthSessionUserCanSignIn({ state: "deleted" })).toThrow(
      "Account is unavailable.",
    );
    expect(() => requireAuthSessionUserCanSignIn(null)).toThrow("Account is unavailable.");
  });
});
