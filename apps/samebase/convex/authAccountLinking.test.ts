import { describe, expect, it } from "vite-plus/test";

import { requireAuthSessionUserCanSignIn } from "./authAccountLinking";

describe("auth session user lifecycle", () => {
  it("allows active and deletion-recovery session creation only", () => {
    expect(() => requireAuthSessionUserCanSignIn({ state: "active" })).not.toThrow();
    expect(() => requireAuthSessionUserCanSignIn({ state: "deleting" })).not.toThrow();
    expect(() => requireAuthSessionUserCanSignIn({ state: "finalizing" })).toThrow(
      "Account deletion is already finalizing.",
    );
    expect(() => requireAuthSessionUserCanSignIn({ state: "deleted" })).toThrow(
      "Account is unavailable.",
    );
    expect(() => requireAuthSessionUserCanSignIn(null)).toThrow("Account is unavailable.");
  });
});
