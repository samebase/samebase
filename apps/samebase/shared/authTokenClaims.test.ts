import { describe, expect, it } from "vite-plus/test";
import {
  AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH,
  buildAuthTokenProfileCustomClaims,
  readAuthTokenProfileClaims,
  type AuthTokenAuthProvider,
} from "./authTokenClaims";

const AUTH_TOKEN_AUTH_PROVIDERS: AuthTokenAuthProvider[] = ["google", "github", "password"];

describe("auth token claims", () => {
  it("reads a strict display-name presentation pair", () => {
    expect(
      readAuthTokenProfileClaims({
        accountLabelKind: "displayName",
        accountLabel: " Nicu ",
      }),
    ).toEqual({
      accountPresentation: { kind: "displayName", label: "Nicu" },
    });
  });

  it("reads a strict canonical-email presentation pair", () => {
    expect(
      readAuthTokenProfileClaims({
        accountLabelKind: "email",
        accountLabel: "nicu@samebase.com",
      }),
    ).toEqual({
      accountPresentation: { kind: "email", label: "nicu@samebase.com" },
    });
  });

  it.each(AUTH_TOKEN_AUTH_PROVIDERS)("keeps supported %s auth provider claims", (provider) => {
    expect(
      readAuthTokenProfileClaims({
        accountLabelKind: "email",
        accountLabel: "nicu@samebase.com",
        authProvider: provider,
      }),
    ).toEqual({
      accountPresentation: { kind: "email", label: "nicu@samebase.com" },
      authProvider: provider,
    });
  });

  it("reads only the canonical email from a legacy token during the rollout window", () => {
    expect(
      readAuthTokenProfileClaims({
        email: " NICU@SAMEBASE.COM ",
        name: "Provider name",
      }),
    ).toEqual({
      accountPresentation: { kind: "email", label: "nicu@samebase.com" },
    });
  });

  it.each([
    {},
    { name: "Provider name" },
    { accountLabelKind: "email" },
    { accountLabel: "nicu@samebase.com" },
    { accountLabelKind: "email", email: "nicu@samebase.com" },
    { accountLabel: "nicu@samebase.com", email: "nicu@samebase.com" },
    { accountLabelKind: "provider", email: "nicu@samebase.com" },
    { accountLabelKind: "provider", accountLabel: "nicu@samebase.com" },
    { accountLabelKind: "email", accountLabel: "NICU@SAMEBASE.COM" },
    { accountLabelKind: "email", accountLabel: " nicu@samebase.com " },
    { accountLabelKind: "email", accountLabel: "not-an-email" },
    { accountLabelKind: "displayName", accountLabel: "first\nsecond" },
    {
      accountLabelKind: "email",
      accountLabel: "a".repeat(AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH + 1),
    },
    { accountLabelKind: "email", accountLabel: "nicu@samebase.com", authProvider: "netlify" },
  ])("rejects invalid or incomplete presentation claims %j", (input) => {
    expect(readAuthTokenProfileClaims(input)).toBe(null);
  });

  it("builds flat display-name claims from a valid user", () => {
    expect(
      buildAuthTokenProfileCustomClaims(
        {
          displayName: " Nicu ",
          email: "nicu@samebase.com",
          name: "Provider name",
        },
        "password",
      ),
    ).toEqual({
      accountLabelKind: "displayName",
      accountLabel: "Nicu",
      authProvider: "password",
    });
  });

  it("builds email claims when the user has no display name", () => {
    expect(
      buildAuthTokenProfileCustomClaims({
        email: " NICU@SAMEBASE.COM ",
        name: "Provider name",
      }),
    ).toEqual({
      accountLabelKind: "email",
      accountLabel: "nicu@samebase.com",
    });
  });

  it.each([
    null,
    {},
    { name: "Provider name" },
    { email: "not-an-email" },
    { displayName: "first\nsecond", email: "nicu@samebase.com" },
  ])("rejects token minting for invalid user sources %j", (source) => {
    expect(() => buildAuthTokenProfileCustomClaims(source)).toThrow();
  });
});
