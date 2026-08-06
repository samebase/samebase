import { describe, expect, it } from "vite-plus/test";
import { ACCOUNT_EMAIL_MAX_LENGTH } from "./accountPresentation";
import {
  AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH,
  buildAuthTokenProfileCustomClaims,
  readAuthTokenProfileClaims,
  type AuthTokenAuthProvider,
} from "./authTokenClaims";

const AUTH_TOKEN_AUTH_PROVIDERS: AuthTokenAuthProvider[] = ["google", "password"];

function createEmail(length: number) {
  const suffix = "@b.co";
  return "a".repeat(length - suffix.length) + suffix;
}

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

  it.each([
    {},
    { name: "Provider name" },
    { email: "nicu@samebase.com" },
    { githubUsername: "octocat" },
    { accountLabelKind: "email" },
    { accountLabel: "nicu@samebase.com" },
    { accountLabelKind: "email", email: "nicu@samebase.com" },
    { accountLabel: "nicu@samebase.com", email: "nicu@samebase.com" },
    { accountLabelKind: "email", accountLabel: 123, email: "nicu@samebase.com" },
    {
      accountLabelKind: 123,
      accountLabel: "nicu@samebase.com",
      email: "nicu@samebase.com",
    },
    { accountLabelKind: "provider", email: "nicu@samebase.com" },
    { accountLabelKind: "provider", accountLabel: "nicu@samebase.com" },
    {
      accountLabelKind: "email",
      accountLabel: "nicu@samebase.com",
      email: "nicu@samebase.com",
    },
    {
      accountLabelKind: "displayName",
      accountLabel: "Nicu",
      name: "Provider name",
    },
    {
      accountLabelKind: "displayName",
      accountLabel: "Nicu",
      githubUsername: "octocat",
    },
    { accountLabelKind: "email", accountLabel: "NICU@SAMEBASE.COM" },
    { accountLabelKind: "email", accountLabel: " nicu@samebase.com " },
    { accountLabelKind: "email", accountLabel: "not-an-email" },
    {
      accountLabelKind: "email",
      accountLabel: createEmail(ACCOUNT_EMAIL_MAX_LENGTH + 1),
    },
    { accountLabelKind: "displayName", accountLabel: "first\nsecond" },
    {
      accountLabelKind: "email",
      accountLabel: "a".repeat(AUTH_TOKEN_PROFILE_CLAIM_MAX_LENGTH + 1),
    },
    { accountLabelKind: "email", accountLabel: "nicu@samebase.com", authProvider: "netlify" },
    { accountLabelKind: "email", accountLabel: "nicu@samebase.com", authProvider: "github" },
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

  it("round trips the maximum canonical email through token minting and reading", () => {
    const maximumEmail = createEmail(ACCOUNT_EMAIL_MAX_LENGTH);
    const claims = buildAuthTokenProfileCustomClaims({ email: maximumEmail });
    expect(claims["accountLabel"]).toHaveLength(ACCOUNT_EMAIL_MAX_LENGTH);
    expect(readAuthTokenProfileClaims(claims)).toEqual({
      accountPresentation: { kind: "email", label: maximumEmail },
    });
  });

  it.each([
    null,
    {},
    { name: "Provider name" },
    { email: "not-an-email" },
    { email: createEmail(ACCOUNT_EMAIL_MAX_LENGTH + 1) },
    { displayName: "first\nsecond", email: "nicu@samebase.com" },
  ])("rejects token minting for invalid user sources %j", (source) => {
    expect(() => buildAuthTokenProfileCustomClaims(source)).toThrow();
  });
});
