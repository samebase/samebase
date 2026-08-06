import { ConvexError } from "convex/values";
import { describe, expect, it } from "vite-plus/test";

import { validateOrganizationBillingReturnUrls } from "./billing";

describe("validateOrganizationBillingReturnUrls", () => {
  it("accepts the same normalized organization settings path", () => {
    expect(
      validateOrganizationBillingReturnUrls({
        githubOwnerLogin: "Samebase",
        successUrl: "https://samebase.com/org/Samebase/settings?checkout=success#billing",
        returnUrl: "https://samebase.com/org/samebase/settings?checkout=canceled#billing",
        server: "production",
      }),
    ).toEqual({
      successUrl: "https://samebase.com/org/Samebase/settings?checkout=success#billing",
      returnUrl: "https://samebase.com/org/samebase/settings?checkout=canceled#billing",
    });
  });

  it.each([
    "https://samebase.com/org/another-owner/settings",
    "https://samebase.com/settings",
    "https://samebase.com/org/samebase/providers",
    "https://samebase.com/org/samebase/settings/billing",
  ])("rejects an out-of-scope return path: %s", (returnUrl) => {
    expect(() =>
      validateOrganizationBillingReturnUrls({
        githubOwnerLogin: "samebase",
        successUrl: "https://samebase.com/org/samebase/settings",
        returnUrl,
        server: "production",
      }),
    ).toThrowError(
      new ConvexError("Checkout return URLs must target this organization settings page."),
    );
  });

  it("keeps the existing origin policy", () => {
    expect(() =>
      validateOrganizationBillingReturnUrls({
        githubOwnerLogin: "samebase",
        successUrl: "https://attacker.example/org/samebase/settings",
        returnUrl: "https://attacker.example/org/samebase/settings",
        server: "production",
      }),
    ).toThrowError(new ConvexError("Checkout return URL origin is not allowed."));

    expect(
      validateOrganizationBillingReturnUrls({
        githubOwnerLogin: "samebase",
        successUrl: "http://127.0.0.1:4173/org/samebase/settings#billing",
        returnUrl: "http://127.0.0.1:4173/org/samebase/settings#billing",
        server: "sandbox",
      }),
    ).toEqual({
      successUrl: "http://127.0.0.1:4173/org/samebase/settings#billing",
      returnUrl: "http://127.0.0.1:4173/org/samebase/settings#billing",
    });
  });
});
