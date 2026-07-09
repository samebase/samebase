import { describe, expect, it } from "vite-plus/test";
import {
  buildAgentBrowserHandoffUrl,
  hasAgentBrowserHandoffFragment,
  normalizeAgentBrowserHandoffReturnToPath,
  parseAgentBrowserHandoffFragment,
} from "./agentBrowserHandoff";

describe("agent browser handoff URLs", () => {
  it("puts the one-time token in the fragment only", () => {
    const url = new URL(
      buildAgentBrowserHandoffUrl({
        returnToPath: "/vault/samebase/samebase?prod-ui#files",
        siteUrl: "https://samebase.com/",
        token: "agbh_secret",
      }),
    );

    expect(url.origin).toBe("https://samebase.com");
    expect(url.pathname).toBe("/agents/connect");
    expect(url.search).toBe("");
    expect(url.hash).toContain("handoff=agbh_secret");
    expect(url.hash).toContain("returnTo=%2Fvault%2Fsamebase%2Fsamebase%3Fprod-ui%23files");
  });

  it("normalizes return paths to same-origin app paths", () => {
    expect(normalizeAgentBrowserHandoffReturnToPath("/vault/?prod-ui#files")).toBe(
      "/vault/?prod-ui#files",
    );
    expect(normalizeAgentBrowserHandoffReturnToPath("https://evil.test/vault")).toBe("/vault/");
    expect(normalizeAgentBrowserHandoffReturnToPath("//evil.test/vault")).toBe("/vault/");
    expect(normalizeAgentBrowserHandoffReturnToPath("/agents/connect")).toBe("/vault/");
  });

  it("parses the fragment and detects the handoff key", () => {
    expect(
      parseAgentBrowserHandoffFragment("#handoff=agbh_secret&returnTo=%2Fvault%2Frepo"),
    ).toEqual({
      token: "agbh_secret",
      returnToPath: "/vault/repo",
    });
    expect(hasAgentBrowserHandoffFragment("#handoff=agbh_secret")).toBe(true);
    expect(hasAgentBrowserHandoffFragment("#section")).toBe(false);
  });
});
