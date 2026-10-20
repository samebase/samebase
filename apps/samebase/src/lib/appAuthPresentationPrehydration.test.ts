// @vitest-environment jsdom

import { createContext, Script } from "node:vm";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  buildAppAuthPresentationPrehydrationScript,
  clearAppAuthPresentationPrehydration,
  type AppAuthPresentationPrehydrationArgs,
} from "@/lib/appAuthPresentationPrehydration";
import { Inlineable_createAppAuthPresentationRuntime } from "@/lib/appAuthPresentationRuntime";
import {
  APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID,
  PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
} from "@/lib/publicLanding";
import {
  AUTHORIZATION_ERROR_CODES,
  AUTHORIZATION_ERROR_QUERY_PARAM,
  AUTHORIZATION_PROVIDERS,
  AUTHORIZATION_PROVIDER_QUERY_PARAM,
} from "../../shared/authorizationError";
import { MCP_CONSENT_APP_PATH } from "../../shared/mcpOAuth";

const TEST_STORAGE_NAMESPACE = "https://example.convex.cloud";
const TEST_ARGS = {
  accountSectionTestId: PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
  authorizationErrorCodes: AUTHORIZATION_ERROR_CODES,
  authorizationErrorQueryParam: AUTHORIZATION_ERROR_QUERY_PARAM,
  authorizationProviderQueryParam: AUTHORIZATION_PROVIDER_QUERY_PARAM,
  authorizationProviders: AUTHORIZATION_PROVIDERS,
  browserConvexProxyPath: null,
  envConvexUrl: TEST_STORAGE_NAMESPACE,
  ignoredPathnames: [],
  mcpConsentPathname: MCP_CONSENT_APP_PATH,
  rootAttribute: "data-app-auth-presentation-prehydrated",
  styleElementId: "samebase-app-auth-presentation-prehydration",
  staticAccountSectionTestId: APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID,
} satisfies AppAuthPresentationPrehydrationArgs;

const { convexAuthRefreshTokenStorageKey } = Inlineable_createAppAuthPresentationRuntime();

function runAppAuthPresentationPrehydrationScript(
  args: AppAuthPresentationPrehydrationArgs = TEST_ARGS,
) {
  const script = buildAppAuthPresentationPrehydrationScript(args).replace(
    "} catch {}",
    `} catch (error) {
      const message =
        error !== null && typeof error === "object" && "message" in error
          ? error.message
          : String(error);
      Object.defineProperty(window, "__appAuthPresentationPrehydrationTestError", {
        configurable: true,
        value: message,
      });
    }`,
  );
  new Script(script).runInContext(
    createContext({
      document,
      TextDecoder,
      URL,
      window,
    }),
  );
}

function readPrehydrationTestError() {
  const descriptor = Object.getOwnPropertyDescriptor(
    window,
    "__appAuthPresentationPrehydrationTestError",
  );
  if (descriptor === undefined || !("value" in descriptor)) {
    return undefined;
  }

  const value: unknown = descriptor.value;
  return value;
}

function createTestStorage(): Storage {
  const entries = new Map<string, string>();

  return {
    clear() {
      entries.clear();
    },
    getItem(key) {
      return entries.get(String(key)) ?? null;
    },
    key(index) {
      return Array.from(entries.keys())[index] ?? null;
    },
    get length() {
      return entries.size;
    },
    removeItem(key) {
      entries.delete(String(key));
    },
    setItem(key, value) {
      entries.set(String(key), String(value));
    },
  };
}

describe("appAuthPresentationPrehydration", () => {
  beforeEach(() => {
    Object.defineProperty(window, "atob", {
      configurable: true,
      value: (value: string) => Buffer.from(value, "base64").toString("binary"),
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    clearAppAuthPresentationPrehydration();
    window.localStorage.clear();
  });

  it("visually replaces the checking login account label with signed-out presentation without local auth material", () => {
    runAppAuthPresentationPrehydrationScript();

    expect(document.documentElement.getAttribute("data-app-auth-presentation-prehydrated")).toBe(
      "signed-out",
    );
    const styleText = document.getElementById(
      "samebase-app-auth-presentation-prehydration",
    )?.textContent;
    expect(styleText).toContain('content: "Sign in or create an account";');
    expect(styleText).toContain("[data-app-auth-prehydration-signed-out]");
    expect(styleText).toContain("[data-app-auth-prehydration-signed-out-label]::after");
    expect(styleText).not.toContain("[aria-expanded]");
  });

  it.each([
    "/?signup=google",
    "/settings?signup=google",
    "/?signup=github",
    "/settings?signup=github",
  ])(
    "does not reveal signed-out auth controls before the OAuth return notice hydrates on %s",
    (route) => {
      window.history.replaceState({}, "", route);

      runAppAuthPresentationPrehydrationScript();

      expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
        false,
      );
      expect(document.getElementById("samebase-app-auth-presentation-prehydration")).toBeNull();
    },
  );

  it("uses signed-out presentation for an authorization error return", () => {
    window.history.replaceState(
      {},
      "",
      "/?signup=github&authorization-provider=github-app&authorization-error=failed",
    );

    runAppAuthPresentationPrehydrationScript();

    expect(document.documentElement.getAttribute("data-app-auth-presentation-prehydrated")).toBe(
      "signed-out",
    );
    expect(document.getElementById("samebase-app-auth-presentation-prehydration")).not.toBeNull();
  });

  it("ignores an unknown signup marker before hydration", () => {
    window.history.replaceState({}, "", "/?signup=unknown");

    runAppAuthPresentationPrehydrationScript();

    expect(document.documentElement.getAttribute("data-app-auth-presentation-prehydrated")).toBe(
      "signed-out",
    );
    expect(document.getElementById("samebase-app-auth-presentation-prehydration")).not.toBeNull();
  });

  it("keeps MCP consent controls available when a stale signup marker is present", () => {
    window.history.replaceState({}, "", `${MCP_CONSENT_APP_PATH}?signup=google`);

    runAppAuthPresentationPrehydrationScript();

    expect(document.documentElement.getAttribute("data-app-auth-presentation-prehydrated")).toBe(
      "signed-out",
    );
    expect(document.getElementById("samebase-app-auth-presentation-prehydration")).not.toBeNull();
  });

  it("does not prehydrate ignored paths", () => {
    window.history.replaceState({}, "", "/visual-fixture?mode=public-account-checking-login");

    runAppAuthPresentationPrehydrationScript({
      ...TEST_ARGS,
      ignoredPathnames: ["/visual-fixture"],
    });

    expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
      false,
    );
    expect(document.getElementById("samebase-app-auth-presentation-prehydration")).toBeNull();
  });

  it("keeps checking login while a refresh token may restore the session", () => {
    window.localStorage.setItem(
      convexAuthRefreshTokenStorageKey(TEST_STORAGE_NAMESPACE),
      "refresh-token",
    );

    runAppAuthPresentationPrehydrationScript();

    expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
      false,
    );
    expect(document.getElementById("samebase-app-auth-presentation-prehydration")).toBeNull();
  });

  it("uses signed-out presentation for an access token without a refresh token", () => {
    window.localStorage.setItem("__convexAuthJWT_httpsexampleconvexcloud", "access-token");

    runAppAuthPresentationPrehydrationScript();

    expect(
      document.getElementById("samebase-app-auth-presentation-prehydration")?.textContent,
    ).toContain('content: "Sign in or create an account";');
  });

  it.each(["/?auth=google", "/?convexAuthCode=oauth-code", "/?convexAuthError=expired"])(
    "keeps checking login during an active browser auth flow on %s",
    (route) => {
      window.history.replaceState({}, "", route);

      runAppAuthPresentationPrehydrationScript();

      expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
        false,
      );
      expect(document.getElementById("samebase-app-auth-presentation-prehydration")).toBeNull();
    },
  );

  it("uses the browser proxy URL as the Convex Auth storage namespace when configured", () => {
    const proxyNamespace = new URL("/__samebase_convex_proxy", window.location.origin).toString();
    window.localStorage.setItem(convexAuthRefreshTokenStorageKey(proxyNamespace), "refresh-token");

    runAppAuthPresentationPrehydrationScript({
      ...TEST_ARGS,
      browserConvexProxyPath: "/__samebase_convex_proxy",
      envConvexUrl: "https://ignored.convex.cloud",
    });

    expect(readPrehydrationTestError()).toBeUndefined();
    expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
      false,
    );
  });

  it("removes the temporary style when hydration removes the root marker", async () => {
    runAppAuthPresentationPrehydrationScript();

    document.documentElement.removeAttribute("data-app-auth-presentation-prehydrated");
    await Promise.resolve();

    expect(document.getElementById("samebase-app-auth-presentation-prehydration")).toBeNull();
  });

  it("clears the temporary prehydration marker and style", () => {
    runAppAuthPresentationPrehydrationScript();

    clearAppAuthPresentationPrehydration();

    expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
      false,
    );
    expect(document.getElementById("samebase-app-auth-presentation-prehydration")).toBeNull();
  });
});
