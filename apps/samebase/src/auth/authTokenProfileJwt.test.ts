// @vitest-environment jsdom

import { describe, expect, it } from "vite-plus/test";
import { readCurrentAuthTokenProfileClaims } from "@/auth/authTokenProfileJwt";

function createJwt(payload: object) {
  return ["header", Buffer.from(JSON.stringify(payload)).toString("base64url"), "signature"].join(
    ".",
  );
}

describe("current auth token profile claims", () => {
  it("decodes a current JWT through the shared strict profile parser", () => {
    expect(
      readCurrentAuthTokenProfileClaims(
        createJwt({
          accountLabelKind: "displayName",
          accountLabel: "Nicu",
          exp: 4100000000,
        }),
      ),
    ).toEqual({
      accountPresentation: { kind: "displayName", label: "Nicu" },
    });
  });

  it.each([
    "opaque-token",
    "header..signature",
    "header.invalid.signature",
    createJwt({ accountLabelKind: "email", accountLabel: "not-an-email" }),
    createJwt({
      accountLabelKind: "email",
      accountLabel: "nicu@samebase.com",
      exp: 0,
    }),
  ])("rejects a malformed, invalid, or expired JWT %j", (token) => {
    expect(readCurrentAuthTokenProfileClaims(token)).toBe(null);
  });
});
