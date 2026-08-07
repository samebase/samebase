// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  handleGitHubAppSetupCompletionMessage,
  openGitHubAppSetupPopup,
} from "./githubAppSetupFlow";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHub App popup completion", () => {
  it("navigates the opener to the exact same-origin return URL", () => {
    const navigate = vi.fn();
    const returnTo = `${window.location.origin}/org/acme/settings?prod-ui#github`;

    expect(
      handleGitHubAppSetupCompletionMessage({
        event: new MessageEvent("message", {
          data: { type: "github-app-setup-complete", returnTo },
          origin: "https://api.samebase.com",
          source: window,
        }),
        expectedCallbackOrigin: "https://api.samebase.com",
        expectedReturnOrigin: window.location.origin,
        navigate,
        popup: window,
      }),
    ).toBe(true);
    expect(navigate).toHaveBeenCalledWith(returnTo);
  });

  it("ignores another popup and a cross-origin return URL", () => {
    const navigate = vi.fn();
    const otherPopup = { closed: false };

    expect(
      handleGitHubAppSetupCompletionMessage({
        event: new MessageEvent("message", {
          data: {
            type: "github-app-setup-complete",
            returnTo: `${window.location.origin}/settings`,
          },
          origin: "https://api.samebase.com",
          source: window,
        }),
        expectedCallbackOrigin: "https://api.samebase.com",
        expectedReturnOrigin: window.location.origin,
        navigate,
        // @ts-expect-error The handler only compares the popup identity in this test.
        popup: otherPopup,
      }),
    ).toBe(false);
    expect(
      handleGitHubAppSetupCompletionMessage({
        event: new MessageEvent("message", {
          data: {
            type: "github-app-setup-complete",
            returnTo: "https://evil.example/settings",
          },
          origin: "https://api.samebase.com",
          source: window,
        }),
        expectedCallbackOrigin: "https://api.samebase.com",
        expectedReturnOrigin: window.location.origin,
        navigate,
        popup: window,
      }),
    ).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("ignores a message from the wrong callback origin", () => {
    const navigate = vi.fn();
    const returnTo = `${window.location.origin}/org/acme/settings`;

    expect(
      handleGitHubAppSetupCompletionMessage({
        event: new MessageEvent("message", {
          data: { type: "github-app-setup-complete", returnTo },
          origin: "https://evil.example",
          source: window,
        }),
        expectedCallbackOrigin: "https://api.samebase.com",
        expectedReturnOrigin: window.location.origin,
        navigate,
        popup: window,
      }),
    ).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("opens the setup popup and cleans its completion listener after navigation", async () => {
    const popupAssign = vi.fn();
    const returnReplace = vi.fn();
    const removeEventListener = vi.fn();
    let messageHandler: ((event: MessageEvent) => void) | undefined;
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
      clearTimeout: vi.fn(),
      location: {
        assign: vi.fn(),
        origin: "https://samebase.com",
        replace: returnReplace,
      },
      open: vi.fn(() => popup),
      removeEventListener,
      setTimeout: vi.fn(() => 42),
    };
    vi.stubGlobal("window", fakeWindow);

    await openGitHubAppSetupPopup(async () => ({
      callbackOrigin: "https://api.samebase.com",
      setupUrl: "https://github.com/apps/samebase/installations/new?state=safe-state",
    }));
    expect(popupAssign).toHaveBeenCalledWith(
      "https://github.com/apps/samebase/installations/new?state=safe-state",
    );
    expect(messageHandler).toBeDefined();
    if (messageHandler === undefined) {
      throw new Error("GitHub completion listener was not installed.");
    }
    messageHandler(
      new MessageEvent("message", {
        data: {
          type: "github-app-setup-complete",
          returnTo: "https://samebase.com/org/acme/settings?prod-ui#github",
        },
        origin: "https://api.samebase.com",
        // @ts-expect-error The fake popup implements the fields used by this boundary.
        source: popup,
      }),
    );
    expect(returnReplace).toHaveBeenCalledWith(
      "https://samebase.com/org/acme/settings?prod-ui#github",
    );
    expect(fakeWindow.clearTimeout).toHaveBeenCalledWith(42);
    expect(removeEventListener).toHaveBeenCalledWith("message", messageHandler);
  });

  it("uses direct navigation when the browser blocks the popup", async () => {
    const assign = vi.fn();
    const fakeWindow = {
      location: { assign, origin: "https://samebase.com", replace: vi.fn() },
      open: vi.fn(() => null),
    };
    vi.stubGlobal("window", fakeWindow);

    await openGitHubAppSetupPopup(async () => ({
      callbackOrigin: "https://api.samebase.com",
      setupUrl: "https://github.com/apps/samebase/installations/new?state=safe-state",
    }));

    expect(assign).toHaveBeenCalledWith(
      "https://github.com/apps/samebase/installations/new?state=safe-state",
    );
  });
});
