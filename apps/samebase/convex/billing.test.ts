import { ConvexError } from "convex/values";
import { describe, expect, it } from "vite-plus/test";

import { validateOrganizationBillingReturnUrls } from "./billing";

describe("validateOrganizationBillingReturnUrls", () => {
  it("accepts the same normalized organization billing path", () => {
    expect(
      validateOrganizationBillingReturnUrls({
        githubOwnerLogin: "Samebase",
        successUrl: "https://samebase.com/org/Samebase/settings/billing?checkout=success",
        returnUrl: "https://samebase.com/org/samebase/settings/billing?checkout=canceled",
        server: "production",
      }),
    ).toEqual({
      successUrl: "https://samebase.com/org/Samebase/settings/billing?checkout=success",
      returnUrl: "https://samebase.com/org/samebase/settings/billing?checkout=canceled",
    });
  });

  it.each([
    "https://samebase.com/org/another-owner/settings/billing",
    "https://samebase.com/settings",
    "https://samebase.com/org/samebase/providers",
  ])("rejects an out-of-scope return path: %s", (returnUrl) => {
    expect(() =>
      validateOrganizationBillingReturnUrls({
        githubOwnerLogin: "samebase",
        successUrl: "https://samebase.com/org/samebase/settings/billing",
        returnUrl,
        server: "production",
      }),
    ).toThrowError(
      new ConvexError("Checkout return URLs must target this organization billing page."),
    );
  });

  it("keeps the existing origin policy", () => {
    expect(() =>
      validateOrganizationBillingReturnUrls({
        githubOwnerLogin: "samebase",
        successUrl: "https://attacker.example/org/samebase/settings/billing",
        returnUrl: "https://attacker.example/org/samebase/settings/billing",
        server: "production",
      }),
    ).toThrowError(new ConvexError("Checkout return URL origin is not allowed."));

    expect(
      validateOrganizationBillingReturnUrls({
        githubOwnerLogin: "samebase",
        successUrl: "http://127.0.0.1:4173/org/samebase/settings/billing",
        returnUrl: "http://127.0.0.1:4173/org/samebase/settings/billing",
        server: "sandbox",
      }),
    ).toEqual({
      successUrl: "http://127.0.0.1:4173/org/samebase/settings/billing",
      returnUrl: "http://127.0.0.1:4173/org/samebase/settings/billing",
    });
  });
});
