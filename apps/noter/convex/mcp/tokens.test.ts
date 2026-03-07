import { describe, expect, it } from "vitest";
import { createCodeChallenge } from "../oauthUtils";
import {
  createAccessTokenValue,
  createAuthorizationCodeValue,
  createRefreshTokenValue,
  sha256Hex,
  verifyPkceS256,
} from "./tokens";

describe("opaque token creators", () => {
  it("creates prefixed authorization, access, and refresh tokens", () => {
    const authCode = createAuthorizationCodeValue();
    const accessToken = createAccessTokenValue();
    const refreshToken = createRefreshTokenValue();

    expect(authCode.startsWith("mcpac_")).toBe(true);
    expect(accessToken.startsWith("mcpat_")).toBe(true);
    expect(refreshToken.startsWith("mcprt_")).toBe(true);
  });
});

describe("sha256Hex", () => {
  it("hashes input deterministically", async () => {
    const digest = await sha256Hex("abc");
    expect(digest).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("verifyPkceS256", () => {
  it("validates matching code verifier and challenge", async () => {
    const verifier =
      "0123456789012345678901234567890123456789012345678901234567890123";
    const expectedChallenge = await createCodeChallenge(verifier);
    const valid = await verifyPkceS256({
      codeVerifier: verifier,
      expectedCodeChallenge: expectedChallenge,
    });
    expect(valid).toBe(true);
  });
});
