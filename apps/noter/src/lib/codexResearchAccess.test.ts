import { describe, expect, it } from "vitest";

import { canAccessCodexResearch } from "./codexResearchAccess";

describe("canAccessCodexResearch", () => {
  it("always allows the local development server", () => {
    expect(
      canAccessCodexResearch({
        email: null,
        isDev: true,
      }),
    ).toBe(true);
  });

  it("allows the explicit email allowlist outside local dev", () => {
    expect(
      canAccessCodexResearch({
        email: "nicuchiciuc@gmail.com",
        isDev: false,
      }),
    ).toBe(true);
    expect(
      canAccessCodexResearch({
        email: " NICU.DEV@GMAIL.COM ",
        isDev: false,
      }),
    ).toBe(true);
  });

  it("denies everyone else outside local dev", () => {
    expect(
      canAccessCodexResearch({
        email: null,
        isDev: false,
      }),
    ).toBe(false);
    expect(
      canAccessCodexResearch({
        email: "someone@example.com",
        isDev: false,
      }),
    ).toBe(false);
  });
});
