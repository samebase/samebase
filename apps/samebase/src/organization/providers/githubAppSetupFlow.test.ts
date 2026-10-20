// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { openGitHubAppSetupPopup } from "./githubAppSetupFlow";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHub App popup completion", () => {
  it("opens the setup popup and cleans its completion listener after navigation", async () => {
    const popupAssign = vi.fn();
    const returnReplace = vi.fn();
    const removeEventListener = vi.fn();
    let messageHandler: ((event: MessageEvent) => void) | undefined;
    let popupPoll: (() => void) | undefined;
    const popup = {
      closed: false,
      close: vi.fn(),
      location: { assign: popupAssign },
    };
    const fakeWindow = {
      addEventListener: vi.fn((eventName: string, handler: (event: MessageEvent) => void) => {
        if (eventName === "message") {
          messageHandler = handler;
        }
      }),
      clearInterval: vi.fn(),
      clearTimeout: vi.fn(),
      location: {
        assign: vi.fn(),
        hash: "#github",
        origin: "https://samebase.com",
        pathname: "/org/acme/providers",
        replace: returnReplace,
        search: "?prod-ui",
      },
      open: vi.fn(() => popup),
      removeEventListener,
      setInterval: vi.fn((handler: () => void) => {
        popupPoll = handler;
        return 43;
      }),
      setTimeout: vi.fn((_handler: () => void, timeoutMs: number) =>
        timeoutMs === 1000 ? 44 : 42,
      ),
    };
    vi.stubGlobal("window", fakeWindow);

    await openGitHubAppSetupPopup("github-app", async () => ({
      callbackOrigin: "https://samebase.com",
      setupUrl: "https://github.com/apps/samebase/installations/new?state=safe-state",
    }));
    expect(popupAssign).toHaveBeenCalledWith(
      "https://github.com/apps/samebase/installations/new?state=safe-state",
    );
    expect(messageHandler).toBeDefined();
    if (messageHandler === undefined) {
      throw new Error("GitHub completion listener was not installed.");
    }
    popup.closed = true;
    popupPoll?.();
    expect(returnReplace).not.toHaveBeenCalled();
    messageHandler(
      new MessageEvent("message", {
        data: {
          type: "github-app-setup-complete",
          returnTo: "https://samebase.com/org/acme/providers?prod-ui#github",
        },
        origin: "https://samebase.com",
        // @ts-expect-error The fake popup implements the fields used by this boundary.
        source: popup,
      }),
    );
    expect(returnReplace).toHaveBeenCalledWith(
      "https://samebase.com/org/acme/providers?prod-ui#github",
    );
    expect(fakeWindow.clearTimeout).toHaveBeenCalledWith(42);
    expect(fakeWindow.clearTimeout).toHaveBeenCalledWith(44);
    expect(fakeWindow.clearInterval).toHaveBeenCalledWith(43);
    expect(removeEventListener).toHaveBeenCalledWith("message", messageHandler);
  });

  it("returns to the current page when the GitHub popup closes without a callback", async () => {
    const returnReplace = vi.fn();
    let popupClose: (() => void) | undefined;
    let popupPoll: (() => void) | undefined;
    const popup = {
      closed: false,
      close: vi.fn(),
      location: { assign: vi.fn() },
    };
    const fakeWindow = {
      addEventListener: vi.fn(),
      clearInterval: vi.fn(),
      clearTimeout: vi.fn(),
      location: {
        assign: vi.fn(),
        hash: "#github",
        origin: "https://samebase.com",
        pathname: "/org/acme/providers",
        replace: returnReplace,
        search: "?prod-ui",
      },
      open: vi.fn(() => popup),
      removeEventListener: vi.fn(),
      setInterval: vi.fn((handler: () => void) => {
        popupPoll = handler;
        return 43;
      }),
      setTimeout: vi.fn((handler: () => void, timeoutMs: number) => {
        if (timeoutMs === 1000) {
          popupClose = handler;
          return 44;
        }
        return 42;
      }),
    };
    vi.stubGlobal("window", fakeWindow);

    await openGitHubAppSetupPopup("github-app", async () => ({
      callbackOrigin: "https://samebase.com",
      setupUrl: "https://github.com/apps/samebase/installations/new?state=safe-state",
    }));
    popup.closed = true;
    popupPoll?.();
    expect(returnReplace).not.toHaveBeenCalled();
    popupClose?.();

    expect(returnReplace).toHaveBeenCalledWith(
      "/org/acme/providers?prod-ui=&authorization-provider=github-app&authorization-error=canceled#github",
    );
  });

  it("uses direct navigation when the browser blocks the popup", async () => {
    const assign = vi.fn();
    const fakeWindow = {
      location: {
        assign,
        hash: "",
        origin: "https://samebase.com",
        pathname: "/repo",
        replace: vi.fn(),
        search: "",
      },
      open: vi.fn(() => null),
    };
    vi.stubGlobal("window", fakeWindow);

    await openGitHubAppSetupPopup("github-app", async () => ({
      callbackOrigin: "https://samebase.com",
      setupUrl: "https://github.com/apps/samebase/installations/new?state=safe-state",
    }));

    expect(assign).toHaveBeenCalledWith(
      "https://github.com/apps/samebase/installations/new?state=safe-state",
    );
  });
});
