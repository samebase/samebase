// @vitest-environment jsdom

import { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AppAuthPresentationProvider } from "@/lib/AppAuthPresentationProvider";
import {
  convexAuthRefreshTokenStorageKey,
  convexAuthJwtStorageKey,
  readLocalAppAuthPresentationHint,
  useAppAuthPresentation,
} from "@/lib/appAuthPresentationState";
import { clearAppAuthPresentationPrehydration } from "@/lib/appAuthPresentationPrehydration";

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: true,
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => authState,
}));

const TEST_STORAGE_NAMESPACE = "https://example.convex.cloud";
const FUTURE_JWT = "header.eyJleHAiOjQxMDAwMDAwMDB9.signature";
const PROFILE_JWT = createJwt({
  accountLabelKind: "displayName",
  accountLabel: "Nicu",
  exp: 4100000000,
});
const LEGACY_PROFILE_JWT = createJwt({
  email: "legacy@example.com",
  name: "Provider name",
  exp: 4100000000,
});
const NON_ASCII_PROFILE_JWT = createJwt({
  accountLabelKind: "displayName",
  accountLabel: "José 中村",
  exp: 4100000000,
});
const EXPIRED_JWT = "header.eyJleHAiOjF9.signature";
const NON_FINITE_EXP_JWT = "header.eyJleHAiOjFlOTk5fQ.signature";
const NO_EXP_JWT = "header.e30.signature";

function createJwt(payload: object) {
  return ["header", Buffer.from(JSON.stringify(payload)).toString("base64url"), "signature"].join(
    ".",
  );
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

function AuthPresentationProbe() {
  const authPresentation = useAppAuthPresentation();
  return <span>{authPresentation.kind}</span>;
}

function renderPresentationProvider() {
  return renderToStaticMarkup(
    <AppAuthPresentationProvider storageNamespace={TEST_STORAGE_NAMESPACE}>
      <AuthPresentationProbe />
    </AppAuthPresentationProvider>,
  );
}

async function renderPresentationProviderAfterEffects() {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);

  await act(async () => {
    root.render(
      <AppAuthPresentationProvider storageNamespace={TEST_STORAGE_NAMESPACE}>
        <AuthPresentationProbe />
      </AppAuthPresentationProvider>,
    );
  });

  const markup = rootElement.innerHTML;
  await act(async () => {
    root.unmount();
  });
  rootElement.remove();
  return markup;
}

async function hydratePresentationProviderAfterServerRender() {
  const rootElement = document.createElement("div");
  rootElement.innerHTML = renderPresentationProvider();
  document.body.append(rootElement);
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const root = await act(() =>
    hydrateRoot(
      rootElement,
      <AppAuthPresentationProvider storageNamespace={TEST_STORAGE_NAMESPACE}>
        <AuthPresentationProbe />
      </AppAuthPresentationProvider>,
    ),
  );

  try {
    const hydrationErrors = consoleErrorSpy.mock.calls
      .map((call) => call.map((value) => String(value)).join(" "))
      .filter((message) => /hydrat|did not match|#418/i.test(message));
    return {
      hydrationErrors,
      markup: rootElement.innerHTML,
    };
  } finally {
    await act(async () => {
      root.unmount();
    });
    consoleErrorSpy.mockRestore();
    rootElement.remove();
  }
}

describe("app auth presentation", () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    window.history.replaceState({}, "", "/");
    clearAppAuthPresentationPrehydration();
  });

  it("uses the same namespaced JWT key shape as Convex Auth", () => {
    expect(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE)).toBe(
      "__convexAuthJWT_httpsexampleconvexcloud",
    );
    expect(convexAuthRefreshTokenStorageKey(TEST_STORAGE_NAMESPACE)).toBe(
      "__convexAuthRefreshToken_httpsexampleconvexcloud",
    );
  });

  it("uses signed-out presentation after hydration when there is no local auth material", async () => {
    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "signedOut" });
    expect(renderPresentationProvider()).toBe("<span>unknown</span>");
    expect(await renderPresentationProviderAfterEffects()).toBe("<span>signedOut</span>");
  });

  it("treats a profiled future local JWT as a temporary auth hint after hydration while Convex loads", async () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({
      kind: "present",
      profile: {
        accountPresentation: { kind: "displayName", label: "Nicu" },
      },
    });
    expect(renderPresentationProvider()).toBe("<span>unknown</span>");
    expect(await renderPresentationProviderAfterEffects()).toBe(
      "<span>temporaryAuthenticated</span>",
    );
  });

  it("hydrates the local JWT presentation without a React mismatch", async () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    const result = await hydratePresentationProviderAfterServerRender();

    expect(result.hydrationErrors).toEqual([]);
    expect(result.markup).toBe("<span>temporaryAuthenticated</span>");
  });

  it("clears the head prehydration marker and style after the auth hint resolves", async () => {
    document.documentElement.setAttribute("data-app-auth-presentation-prehydrated", "");
    const styleElement = document.createElement("style");
    styleElement.id = "samebase-app-auth-presentation-prehydration";
    document.head.append(styleElement);
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
      true,
    );
    expect(document.getElementById("samebase-app-auth-presentation-prehydration")).not.toBeNull();

    expect(await renderPresentationProviderAfterEffects()).toBe(
      "<span>temporaryAuthenticated</span>",
    );

    expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
      false,
    );
    expect(document.getElementById("samebase-app-auth-presentation-prehydration")).toBeNull();
  });

  it("keeps auth presentation pending while only the refresh token can restore the session", async () => {
    window.localStorage.setItem(
      convexAuthRefreshTokenStorageKey(TEST_STORAGE_NAMESPACE),
      "refresh-token",
    );

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "pending" });
    const markup = renderPresentationProvider();

    expect(markup).toBe("<span>unknown</span>");
    expect(await renderPresentationProviderAfterEffects()).toBe(markup);
  });

  it("reads presentation profile claims from the local JWT", () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({
      kind: "present",
      profile: {
        accountPresentation: { kind: "displayName", label: "Nicu" },
      },
    });
  });

  it("rejects legacy profile claims from the local JWT during hydration", async () => {
    window.localStorage.setItem(
      convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE),
      LEGACY_PROFILE_JWT,
    );

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "signedOut" });
    expect(await renderPresentationProviderAfterEffects()).toBe("<span>signedOut</span>");
  });

  it("reads non-ASCII profile claims from the local JWT", () => {
    window.localStorage.setItem(
      convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE),
      NON_ASCII_PROFILE_JWT,
    );

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({
      kind: "present",
      profile: {
        accountPresentation: { kind: "displayName", label: "José 中村" },
      },
    });
  });

  it("rejects decodable local JWTs without profile claims", () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), FUTURE_JWT);

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "signedOut" });

    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), NO_EXP_JWT);

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "signedOut" });
  });

  it("rejects expired and malformed local JWTs without a refresh token", () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), EXPIRED_JWT);

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "signedOut" });

    window.localStorage.setItem(
      convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE),
      NON_FINITE_EXP_JWT,
    );

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "signedOut" });

    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), "not-a-jwt");

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "signedOut" });
  });

  it("keeps auth presentation pending when a refresh token may recover an expired JWT", () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), EXPIRED_JWT);
    window.localStorage.setItem(
      convexAuthRefreshTokenStorageKey(TEST_STORAGE_NAMESPACE),
      "refresh-token",
    );

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "pending" });
  });

  it("keeps auth presentation pending during an active browser auth flow", () => {
    window.history.replaceState({}, "", "/?auth=google");

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "pending" });

    window.history.replaceState({}, "", "/?code=oauth-code");

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "pending" });
  });

  it("waits for the local hint before rendering confirmed Convex auth", async () => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    expect(renderPresentationProvider()).toBe("<span>unknown</span>");
    expect(await renderPresentationProviderAfterEffects()).toBe(
      "<span>confirmedAuthenticated</span>",
    );
  });

  it("lets confirmed Convex sign-out override the local hint", () => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), FUTURE_JWT);

    expect(renderPresentationProvider()).toBe("<span>signedOut</span>");
  });
});
