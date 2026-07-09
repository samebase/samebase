import { describe, expect, it } from "vite-plus/test";
import { createCodeChallenge } from "../oauthUtils";
import {
  createAccessTokenValue,
  createAgentBrowserHandoffTokenValue,
  createAuthorizationCodeValue,
  createMachineControlTokenValue,
  createRefreshTokenValue,
  isAgentBrowserHandoffTokenValue,
  sha256Hex,
  verifyPkceS256,
} from "./tokens";

describe("opaque token creators", () => {
  it("creates prefixed authorization, access, refresh, handoff, and machine-control tokens", () => {
    const authCode = createAuthorizationCodeValue();
    const accessToken = createAccessTokenValue();
    const browserHandoffToken = createAgentBrowserHandoffTokenValue();
    const machineControlToken = createMachineControlTokenValue();
    const refreshToken = createRefreshTokenValue();

    expect(authCode.startsWith("mcpac_")).toBe(true);
    expect(accessToken.startsWith("mcpat_")).toBe(true);
    expect(isAgentBrowserHandoffTokenValue(browserHandoffToken)).toBe(true);
    expect(machineControlToken.startsWith("mmct_")).toBe(true);
    expect(refreshToken.startsWith("mcprt_")).toBe(true);
  });

  it("rejects malformed browser handoff token values", () => {
    expect(isAgentBrowserHandoffTokenValue("agbh_short")).toBe(false);
    expect(isAgentBrowserHandoffTokenValue(`agbh_${"a".repeat(42)}!`)).toBe(false);
    expect(isAgentBrowserHandoffTokenValue(`agbh_${"a".repeat(43)}\n`)).toBe(false);
    expect(isAgentBrowserHandoffTokenValue(`mcpat_${"a".repeat(43)}`)).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("hashes input deterministically", async () => {
    const digest = await sha256Hex("abc");
    expect(digest).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("verifyPkceS256", () => {
  it("validates matching code verifier and challenge", async () => {
    const verifier = "0123456789012345678901234567890123456789012345678901234567890123";
    const expectedChallenge = await createCodeChallenge(verifier);
    const valid = await verifyPkceS256({
      codeVerifier: verifier,
      expectedCodeChallenge: expectedChallenge,
    });
    expect(valid).toBe(true);
  });
});
