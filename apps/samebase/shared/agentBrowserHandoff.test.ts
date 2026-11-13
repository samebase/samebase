import { describe, expect, it } from "vite-plus/test";
import {
  buildAgentBrowserHandoffUrl,
  hasAgentBrowserHandoffFragment,
  isAgentBrowserHandoffRoute,
  normalizeAgentBrowserHandoffReturnToPath,
  parseAgentBrowserHandoffFragment,
} from "./agentBrowserHandoff";

const token = `agbh_${"a".repeat(43)}`;

describe("agent browser handoff URLs", () => {
  it("puts the one-time token in the fragment only", () => {
    const url = new URL(
      buildAgentBrowserHandoffUrl({
        returnToPath: "/repo/samebase/samebase?prod-ui#files",
        siteUrl: "https://samebase.com/",
        token,
      }),
    );

    expect(url.origin).toBe("https://samebase.com");
    expect(url.pathname).toBe("/agents/connect");
    expect(url.search).toBe("");
    expect(url.hash).toContain(`handoff=${token}`);
    expect(url.hash).toContain("returnTo=%2Frepo%2Fsamebase%2Fsamebase%3Fprod-ui%23files");
  });

  it("normalizes return paths to same-origin app paths", () => {
    expect(normalizeAgentBrowserHandoffReturnToPath("/repo/?prod-ui#files")).toBe(
      "/repo/?prod-ui#files",
    );
    expect(normalizeAgentBrowserHandoffReturnToPath("https://evil.test/vault")).toBe("/repo/");
    expect(normalizeAgentBrowserHandoffReturnToPath("//evil.test/vault")).toBe("/repo/");
    expect(normalizeAgentBrowserHandoffReturnToPath("/agents/connect")).toBe("/repo/");
    expect(normalizeAgentBrowserHandoffReturnToPath("/agents/connect/")).toBe("/repo/");
  });

  it("keeps normalized return paths idempotent and same-origin", () => {
    const baseOrigin = "https://samebase.test";
    const inputs = [
      "/repo/../providers?prod-ui#github",
      "/repo/..//evil.test",
      "/%2e%2e//evil.test",
    ];

    for (const input of inputs) {
      const normalized = normalizeAgentBrowserHandoffReturnToPath(input);
      expect(normalizeAgentBrowserHandoffReturnToPath(normalized)).toBe(normalized);
      expect(new URL(normalized, baseOrigin).origin).toBe(baseOrigin);
    }
    expect(normalizeAgentBrowserHandoffReturnToPath("/repo/..//evil.test")).toBe("/repo/");
    expect(normalizeAgentBrowserHandoffReturnToPath("/%2e%2e//evil.test")).toBe("/repo/");
  });

  it("accepts deployment HTTPS and loopback HTTP site URLs only", () => {
    expect(
      new URL(
        buildAgentBrowserHandoffUrl({
          returnToPath: "/repo/",
          siteUrl: "http://localhost:5176",
          token,
        }),
      ).origin,
    ).toBe("http://localhost:5176");
    expect(() =>
      buildAgentBrowserHandoffUrl({
        returnToPath: "/repo/",
        siteUrl: "http://example.test",
        token,
      }),
    ).toThrow("SITE_URL must use https");
    expect(() =>
      buildAgentBrowserHandoffUrl({
        returnToPath: "/repo/",
        siteUrl: "javascript:alert(1)",
        token,
      }),
    ).toThrow("SITE_URL must use https");
    expect(() =>
      buildAgentBrowserHandoffUrl({
        returnToPath: "/repo/",
        siteUrl: "https://user:password@example.test",
        token,
      }),
    ).toThrow("SITE_URL must not include credentials");
    expect(() =>
      buildAgentBrowserHandoffUrl({
        returnToPath: "/repo/",
        siteUrl: "https://example.test/app",
        token,
      }),
    ).toThrow("SITE_URL must be an origin");
    expect(() =>
      buildAgentBrowserHandoffUrl({
        returnToPath: "/repo/",
        siteUrl: "https://example.test/?preview=1",
        token,
      }),
    ).toThrow("SITE_URL must be an origin");
  });

  it("treats the trailing-slash spelling as the same handoff route", () => {
    expect(isAgentBrowserHandoffRoute("/agents/connect")).toBe(true);
    expect(isAgentBrowserHandoffRoute("/agents/connect/")).toBe(true);
    expect(isAgentBrowserHandoffRoute("/agents/connect/extra")).toBe(false);
  });

  it("parses the fragment and detects the handoff key", () => {
    expect(parseAgentBrowserHandoffFragment(`#handoff=${token}&returnTo=%2Frepo%2Frepo`)).toEqual({
      token,
      returnToPath: "/repo/repo",
    });
    expect(parseAgentBrowserHandoffFragment("#handoff=agbh_short").token).toBeNull();
    expect(hasAgentBrowserHandoffFragment(`#handoff=${token}`)).toBe(true);
    expect(hasAgentBrowserHandoffFragment("#section")).toBe(false);
  });
});
