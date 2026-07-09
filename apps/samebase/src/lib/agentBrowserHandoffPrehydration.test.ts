// @vitest-environment jsdom

import { createContext, Script } from "node:vm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  AGENT_BROWSER_HANDOFF_HISTORY_STATE_KEY,
  AGENT_BROWSER_HANDOFF_STORAGE_KEY,
  agentBrowserHandoffPrehydrationScript,
  clearStoredAgentBrowserHandoff,
  consumeStoredAgentBrowserHandoff,
  stripAgentBrowserHandoffFragmentBeforeHydration,
} from "@/lib/agentBrowserHandoffPrehydration";

function runAgentBrowserHandoffPrehydrationScript() {
  new Script(agentBrowserHandoffPrehydrationScript).runInContext(
    createContext({
      URL,
      URLSearchParams,
      window,
    }),
  );
}

describe("agent browser handoff prehydration", () => {
  afterEach(() => {
    clearStoredAgentBrowserHandoff();
    window.history.replaceState(null, "", "/");
    window.sessionStorage.clear();
  });

  it("moves the handoff fragment into per-tab state before hydration", () => {
    window.history.replaceState(
      { tanstack: "state" },
      "",
      "/agents/connect#handoff=agbh_secret&returnTo=%2Fvault%2Frepo%3Fprod-ui",
    );

    runAgentBrowserHandoffPrehydrationScript();

    expect(window.location.href).toBe("http://localhost:3000/agents/connect");
    expect(
      JSON.parse(window.sessionStorage.getItem(AGENT_BROWSER_HANDOFF_STORAGE_KEY) ?? "{}"),
    ).toEqual({
      returnToPath: "/vault/repo?prod-ui",
      token: "agbh_secret",
    });
    expect(window.history.state).toEqual({
      tanstack: "state",
      [AGENT_BROWSER_HANDOFF_HISTORY_STATE_KEY]: {
        returnToPath: "/vault/repo?prod-ui",
        token: "agbh_secret",
      },
    });
  });

  it("falls back to history state when session storage is unavailable", () => {
    window.history.replaceState(null, "", "/agents/connect#handoff=agbh_secret");
    const originalSessionStorage = window.sessionStorage;
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        setItem() {
          throw new Error("blocked");
        },
      },
    });

    runAgentBrowserHandoffPrehydrationScript();

    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: originalSessionStorage,
    });

    expect(window.location.href).toBe("http://localhost:3000/agents/connect");
    expect(window.history.state).toEqual({
      [AGENT_BROWSER_HANDOFF_HISTORY_STATE_KEY]: {
        returnToPath: "/vault/",
        token: "agbh_secret",
      },
    });
  });

  it("lets the client fallback strip a fragment that survived the inline script", () => {
    window.history.replaceState(
      null,
      "",
      "/agents/connect#handoff=agbh_secret&returnTo=%2Fvault%2Frepo",
    );

    stripAgentBrowserHandoffFragmentBeforeHydration();

    expect(window.location.href).toBe("http://localhost:3000/agents/connect");
    expect(consumeStoredAgentBrowserHandoff()).toEqual({
      returnToPath: "/vault/repo",
      token: "agbh_secret",
    });
    expect(consumeStoredAgentBrowserHandoff()).toBeNull();
  });

  it("defaults a dot-segment return path that normalizes to another origin", () => {
    window.history.replaceState(
      null,
      "",
      "/agents/connect#handoff=agbh_secret&returnTo=%2Fvault%2F..%2F%2Fevil.test",
    );

    runAgentBrowserHandoffPrehydrationScript();

    expect(consumeStoredAgentBrowserHandoff()).toEqual({
      returnToPath: "/vault/",
      token: "agbh_secret",
    });
  });

  it("strips the fragment from the trailing-slash route spelling", () => {
    window.history.replaceState(null, "", "/agents/connect/#handoff=agbh_secret");

    runAgentBrowserHandoffPrehydrationScript();

    expect(window.location.href).toBe("http://localhost:3000/agents/connect/");
    expect(consumeStoredAgentBrowserHandoff()).toEqual({
      returnToPath: "/vault/",
      token: "agbh_secret",
    });
  });
});
