import { describe, expect, it } from "vite-plus/test";
import { isMcpOauthClientInactive } from "./client";

describe("isMcpOauthClientInactive", () => {
  it("rejects clients with an inactive registration status", () => {
    expect(
      isMcpOauthClientInactive({
        client: { registrationStatus: "expired" },
        now: 1_000,
      }),
    ).toBe(true);
    expect(
      isMcpOauthClientInactive({
        client: { registrationStatus: "disabled" },
        now: 1_000,
      }),
    ).toBe(true);
  });

  it("treats the provisional expiry timestamp as an inclusive boundary", () => {
    expect(
      isMcpOauthClientInactive({
        client: { registrationStatus: "provisional", provisionalExpiresAt: 1_001 },
        now: 1_000,
      }),
    ).toBe(false);
    expect(
      isMcpOauthClientInactive({
        client: { registrationStatus: "provisional", provisionalExpiresAt: 1_000 },
        now: 1_000,
      }),
    ).toBe(true);
    expect(
      isMcpOauthClientInactive({
        client: { registrationStatus: "active" },
        now: 1_000,
      }),
    ).toBe(false);
  });
});
