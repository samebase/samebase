// @vitest-environment jsdom

import { createContext, Script } from "node:vm";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  buildAppAuthPresentationPrehydrationScript,
  clearAppAuthPresentationPrehydration,
  type AppAuthPresentationPrehydrationArgs,
} from "@/lib/appAuthPresentationPrehydration";
import { AUTH_PROVIDER_STORAGE_KEY } from "@/lib/authStorageKeys";
import {
  convexAuthJwtStorageKey,
  convexAuthRefreshTokenStorageKey,
} from "@/lib/appAuthPresentationState";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "@/lib/publicLanding";

const TEST_STORAGE_NAMESPACE = "https://example.convex.cloud";
const TEST_ARGS = {
  accountSectionTestId: PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
  authProviderStorageKey: AUTH_PROVIDER_STORAGE_KEY,
  browserConvexProxyPath: null,
  envConvexUrl: TEST_STORAGE_NAMESPACE,
  ignoredPathnames: [],
  rootAttribute: "data-app-auth-presentation-prehydrated",
  styleElementId: "samebase-app-auth-presentation-prehydration",
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

  it("visually replaces the checking login account label with the JWT profile email", () => {
    writeLocalAuthSession(
      createJwt({
        email: "nicu@samebase.com",
        exp: 4100000000,
        name: "Nicu",
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
    expect(styleText).toContain('content: "nicu@samebase.com";');
  });

  it("visually fills the signed-in account row with the stored provider label", () => {
    window.localStorage.setItem(AUTH_PROVIDER_STORAGE_KEY, "password");
    writeLocalAuthSession(
      createJwt({
        email: "nicu@samebase.com",
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
    expect(styleText).toContain("[data-app-auth-prehydration-signed-in]");
    expect(styleText).toContain("[data-app-auth-prehydration-email]::after");
    expect(styleText).toContain('content: "nicu@samebase.com";');
    expect(styleText).toContain("[data-app-auth-prehydration-provider]::after");
    expect(styleText).toContain('content: "Signed in with Password";');
  });

  it("escapes hostile JWT profile labels inside CSS content", () => {
    writeLocalAuthSession(
      createJwt({
        exp: 4100000000,
        name: 'a"b\\c\n</style>',
      }),
    );

    runAppAuthPresentationPrehydrationScript();

    const styles = document.querySelectorAll("style");
    const styleText = document.getElementById(
      "samebase-app-auth-presentation-prehydration",
    )?.textContent;
    expect(styles).toHaveLength(1);
    expect(styleText).toContain('content: "a\\"b\\\\c\\a </style>";');
  });

  it("visually replaces the checking login account label from a valid JWT without a refresh token", () => {
    window.localStorage.setItem(
      convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE),
      createJwt({
        exp: 4100000000,
        name: "Nicu",
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
    ).toContain('content: "not logged in";');
  });

  it("visually replaces the checking login account label with signed-out presentation without local auth material", () => {
    runAppAuthPresentationPrehydrationScript();

    expect(document.documentElement.getAttribute("data-app-auth-presentation-prehydrated")).toBe(
      "signed-out",
    );
    const styleText = document.getElementById(
      "samebase-app-auth-presentation-prehydration",
    )?.textContent;
    expect(styleText).toContain('content: "not logged in";');
    expect(styleText).toContain("[data-app-auth-prehydration-signed-out]");
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
        exp: 1,
        name: "Nicu",
      }),
    );

    runAppAuthPresentationPrehydrationScript();

    expect(
      document.getElementById("samebase-app-auth-presentation-prehydration")?.textContent,
    ).toContain('content: "not logged in";');
  });

  it("uses signed-out presentation for malformed JWTs without a refresh token", () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), "not-a-jwt");

    runAppAuthPresentationPrehydrationScript();

    expect(
      document.getElementById("samebase-app-auth-presentation-prehydration")?.textContent,
    ).toContain('content: "not logged in";');
  });

  it("does not paint an account label from a JWT with non-finite exp", () => {
    window.localStorage.setItem(
      convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE),
      createJwtFromPayloadJson('{"exp":1e999,"name":"Nicu"}'),
    );

    runAppAuthPresentationPrehydrationScript();

    expect(
      document.getElementById("samebase-app-auth-presentation-prehydration")?.textContent,
    ).toContain('content: "not logged in";');
    expect(
      document.getElementById("samebase-app-auth-presentation-prehydration")?.textContent,
    ).not.toContain('content: "Nicu";');
  });

  it("keeps checking login when a refresh token may recover an expired JWT", () => {
    writeLocalAuthSession(
      createJwt({
        exp: 1,
        name: "Nicu",
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
        email: "proxy@samebase.com",
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
        exp: 4100000000,
        name: "Nicu",
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
        exp: 4100000000,
        name: "Nicu",
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
