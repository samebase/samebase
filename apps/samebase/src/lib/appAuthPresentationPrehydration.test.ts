// @vitest-environment jsdom

import { createContext, Script } from "node:vm";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  buildAppAuthPresentationPrehydrationScript,
  clearAppAuthPresentationPrehydration,
  type AppAuthPresentationPrehydrationArgs,
} from "@/lib/appAuthPresentationPrehydration";
import {
  convexAuthJwtStorageKey,
  convexAuthRefreshTokenStorageKey,
} from "@/lib/appAuthPresentationState";
import {
  APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID,
  PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
} from "@/lib/publicLanding";
import { MCP_CONSENT_APP_PATH } from "../../shared/mcpOAuth";

const TEST_STORAGE_NAMESPACE = "https://example.convex.cloud";
const TEST_ARGS = {
  accountSectionTestId: PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
  browserConvexProxyPath: null,
  envConvexUrl: TEST_STORAGE_NAMESPACE,
  ignoredPathnames: [],
  mcpConsentPathname: MCP_CONSENT_APP_PATH,
  rootAttribute: "data-app-auth-presentation-prehydrated",
  styleElementId: "samebase-app-auth-presentation-prehydration",
  staticAccountSectionTestId: APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID,
} satisfies AppAuthPresentationPrehydrationArgs;

function createJwt(payload: object) {
  return ["header", Buffer.from(JSON.stringify(payload)).toString("base64url"), "signature"].join(
    ".",
  );
}

function createJwtFromPayloadJson(payloadJson: string) {
  return ["header", Buffer.from(payloadJson).toString("base64url"), "signature"].join(".");
}

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

function writeLocalAuthSession(jwt: string) {
  window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), jwt);
  window.localStorage.setItem(
    convexAuthRefreshTokenStorageKey(TEST_STORAGE_NAMESPACE),
    "refresh-token",
  );
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

  it("visually replaces the checking login account label with the JWT account presentation", () => {
    writeLocalAuthSession(
      createJwt({
        accountLabelKind: "displayName",
        accountLabel: "Nicu",
        exp: 4100000000,
      }),
    );

    runAppAuthPresentationPrehydrationScript();

    expect(readPrehydrationTestError()).toBeUndefined();
    expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
      true,
    );
    const styleText = document.getElementById(
      "samebase-app-auth-presentation-prehydration",
    )?.textContent;
    expect(styleText).toContain(
      `[data-testid="${PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID}"] [data-vault-dashboard-account-section-label]::after`,
    );
    expect(styleText).toContain('content: "Nicu";');
  });

  it("rejects a legacy profile JWT before hydration", () => {
    window.localStorage.setItem(
      convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE),
      createJwt({
        email: "legacy@example.com",
        name: "Provider name",
        exp: 4100000000,
      }),
    );

    runAppAuthPresentationPrehydrationScript();

    const styleText = document.getElementById(
      "samebase-app-auth-presentation-prehydration",
    )?.textContent;
    expect(document.documentElement.getAttribute("data-app-auth-presentation-prehydrated")).toBe(
      "signed-out",
    );
    expect(styleText).toContain('content: "Sign in or create an account";');
    expect(styleText).not.toContain("legacy@example.com");
    expect(styleText).not.toContain("Provider name");
  });

  it.each(["NICU@SAMEBASE.COM", " nicu@samebase.com "])(
    "rejects a noncanonical typed email claim %j before hydration",
    (accountLabel) => {
      window.localStorage.setItem(
        convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE),
        createJwt({
          accountLabelKind: "email",
          accountLabel,
          exp: 4100000000,
        }),
      );

      runAppAuthPresentationPrehydrationScript();

      expect(document.documentElement.getAttribute("data-app-auth-presentation-prehydrated")).toBe(
        "signed-out",
      );
      const styleText = document.getElementById(
        "samebase-app-auth-presentation-prehydration",
      )?.textContent;
      expect(styleText).toContain('content: "Sign in or create an account";');
      expect(styleText).not.toContain(accountLabel.trim());
    },
  );

  it("visually fills the signed-in account row and ignores a legacy provider claim", () => {
    writeLocalAuthSession(
      createJwt({
        accountLabelKind: "email",
        accountLabel: "nicu@samebase.com",
        authProvider: "password",
        exp: 4100000000,
      }),
    );

    runAppAuthPresentationPrehydrationScript();

    const styleText = document.getElementById(
      "samebase-app-auth-presentation-prehydration",
    )?.textContent;
    expect(document.documentElement.getAttribute("data-app-auth-presentation-prehydrated")).toBe(
      "signed-in",
    );
    expect(styleText).toContain(`[data-testid="${APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID}"]`);
    expect(styleText).toContain("[data-app-auth-prehydration-signed-in]");
    expect(styleText).toContain("[data-app-auth-prehydration-account-label]::after");
    expect(styleText).toContain('content: "nicu@samebase.com";');
    expect(styleText).not.toContain("data-app-auth-prehydration-provider");
    expect(styleText).not.toContain("Signed in with");
  });

  it("does not use public landing password auth mode as session provider evidence", () => {
    window.localStorage.setItem("samebase_public_landing_password_auth_mode", "preview_seed");
    writeLocalAuthSession(
      createJwt({
        accountLabelKind: "email",
        accountLabel: "nicu@samebase.com",
        exp: 4100000000,
      }),
    );

    runAppAuthPresentationPrehydrationScript();

    const styleText = document.getElementById(
      "samebase-app-auth-presentation-prehydration",
    )?.textContent;
    expect(styleText).not.toContain("[data-app-auth-prehydration-provider]::after");
    expect(styleText).not.toContain('content: "Signed in with Password";');
  });

  it("does not invent a provider label without a JWT provider claim", () => {
    writeLocalAuthSession(
      createJwt({
        accountLabelKind: "email",
        accountLabel: "nicu@samebase.com",
        exp: 4100000000,
      }),
    );

    runAppAuthPresentationPrehydrationScript();

    const styleText = document.getElementById(
      "samebase-app-auth-presentation-prehydration",
    )?.textContent;
    expect(styleText).not.toContain("[data-app-auth-prehydration-provider]::after");
    expect(styleText).not.toContain('content: "Signed in with Password";');
  });

  it("ignores a legacy GitHub provider claim before hydration", () => {
    window.localStorage.setItem(
      convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE),
      createJwt({
        accountLabelKind: "displayName",
        accountLabel: "Nicu",
        authProvider: "github",
        exp: 4100000000,
      }),
    );

    runAppAuthPresentationPrehydrationScript();

    const styleText = document.getElementById(
      "samebase-app-auth-presentation-prehydration",
    )?.textContent;
    expect(document.documentElement.getAttribute("data-app-auth-presentation-prehydrated")).toBe(
      "signed-in",
    );
    expect(styleText).toContain('content: "Nicu";');
    expect(styleText).not.toContain("GitHub");
  });

  it("escapes hostile JWT profile labels inside CSS content", () => {
    writeLocalAuthSession(
      createJwt({
        accountLabelKind: "displayName",
        accountLabel: 'a"b\\c</style>',
        exp: 4100000000,
      }),
    );

    runAppAuthPresentationPrehydrationScript();

    const styles = document.querySelectorAll("style");
    const styleText = document.getElementById(
      "samebase-app-auth-presentation-prehydration",
    )?.textContent;
    expect(styles).toHaveLength(1);
    expect(styleText).toContain('content: "a\\"b\\\\c</style>";');
  });

  it("visually replaces the checking login account label from a valid JWT without a refresh token", () => {
    window.localStorage.setItem(
      convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE),
      createJwt({
        accountLabelKind: "displayName",
        accountLabel: "Nicu",
        exp: 4100000000,
      }),
    );

    runAppAuthPresentationPrehydrationScript();

    expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
      true,
    );
    expect(
      document.getElementById("samebase-app-auth-presentation-prehydration")?.textContent,
    ).toContain('content: "Nicu";');
  });

  it("uses signed-out presentation for a JWT without profile claims", () => {
    window.localStorage.setItem(
      convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE),
      createJwt({
        exp: 4100000000,
      }),
    );

    runAppAuthPresentationPrehydrationScript();

    expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
      true,
    );
    expect(
      document.getElementById("samebase-app-auth-presentation-prehydration")?.textContent,
    ).toContain('content: "Sign in or create an account";');
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
    "does not reveal signed-out auth controls before the closed-signup state hydrates on %s",
    (route) => {
      window.history.replaceState({}, "", route);

      runAppAuthPresentationPrehydrationScript();

      expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
        false,
      );
      expect(document.getElementById("samebase-app-auth-presentation-prehydration")).toBeNull();
    },
  );

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

  it("uses signed-out presentation for an expired JWT without a refresh token", () => {
    window.localStorage.setItem(
      convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE),
      createJwt({
        accountLabelKind: "displayName",
        accountLabel: "Nicu",
        exp: 1,
      }),
    );

    runAppAuthPresentationPrehydrationScript();

    expect(
      document.getElementById("samebase-app-auth-presentation-prehydration")?.textContent,
    ).toContain('content: "Sign in or create an account";');
  });

  it("uses signed-out presentation for malformed JWTs without a refresh token", () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), "not-a-jwt");

    runAppAuthPresentationPrehydrationScript();

    expect(
      document.getElementById("samebase-app-auth-presentation-prehydration")?.textContent,
    ).toContain('content: "Sign in or create an account";');
  });

  it("does not paint an account label from a JWT with non-finite exp", () => {
    window.localStorage.setItem(
      convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE),
      createJwtFromPayloadJson(
        '{"accountLabelKind":"displayName","accountLabel":"Nicu","exp":1e999}',
      ),
    );

    runAppAuthPresentationPrehydrationScript();

    expect(
      document.getElementById("samebase-app-auth-presentation-prehydration")?.textContent,
    ).toContain('content: "Sign in or create an account";');
    expect(
      document.getElementById("samebase-app-auth-presentation-prehydration")?.textContent,
    ).not.toContain('content: "Nicu";');
  });

  it("keeps checking login when a refresh token may recover an expired JWT", () => {
    writeLocalAuthSession(
      createJwt({
        accountLabelKind: "displayName",
        accountLabel: "Nicu",
        exp: 1,
      }),
    );

    runAppAuthPresentationPrehydrationScript();

    expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
      false,
    );
    expect(document.getElementById("samebase-app-auth-presentation-prehydration")).toBeNull();
  });

  it("keeps checking login during an active browser auth flow", () => {
    window.history.replaceState({}, "", "/?auth=google");

    runAppAuthPresentationPrehydrationScript();

    expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
      false,
    );
    expect(document.getElementById("samebase-app-auth-presentation-prehydration")).toBeNull();
  });

  it("uses the browser proxy URL as the Convex Auth storage namespace when configured", () => {
    const proxyNamespace = new URL("/__samebase_convex_proxy", window.location.origin).toString();
    window.localStorage.setItem(
      convexAuthJwtStorageKey(proxyNamespace),
      createJwt({
        accountLabelKind: "email",
        accountLabel: "proxy@samebase.com",
        exp: 4100000000,
      }),
    );
    window.localStorage.setItem(convexAuthRefreshTokenStorageKey(proxyNamespace), "refresh-token");

    runAppAuthPresentationPrehydrationScript({
      ...TEST_ARGS,
      browserConvexProxyPath: "/__samebase_convex_proxy",
      envConvexUrl: "https://ignored.convex.cloud",
    });

    expect(readPrehydrationTestError()).toBeUndefined();
    expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
      true,
    );
    expect(
      document.getElementById("samebase-app-auth-presentation-prehydration")?.textContent,
    ).toContain('content: "proxy@samebase.com";');
  });

  it("removes the temporary style when hydration removes the root marker", async () => {
    writeLocalAuthSession(
      createJwt({
        accountLabelKind: "displayName",
        accountLabel: "Nicu",
        exp: 4100000000,
      }),
    );
    runAppAuthPresentationPrehydrationScript();

    document.documentElement.removeAttribute("data-app-auth-presentation-prehydrated");
    await Promise.resolve();

    expect(document.getElementById("samebase-app-auth-presentation-prehydration")).toBeNull();
  });

  it("clears the temporary prehydration marker and style", () => {
    writeLocalAuthSession(
      createJwt({
        accountLabelKind: "displayName",
        accountLabel: "Nicu",
        exp: 4100000000,
      }),
    );
    runAppAuthPresentationPrehydrationScript();

    clearAppAuthPresentationPrehydration();

    expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
      false,
    );
    expect(document.getElementById("samebase-app-auth-presentation-prehydration")).toBeNull();
  });
});
