// @vitest-environment jsdom

import { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AppAuthPresentationProvider } from "@/lib/AppAuthPresentationProvider";
import {
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
const REFRESH_TOKEN_STORAGE_KEY = "__convexAuthRefreshToken_httpsexampleconvexcloud";

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

  it("uses signed-out presentation after hydration when there is no local auth material", async () => {
    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "signedOut" });
    expect(renderPresentationProvider()).toBe("<span>unknown</span>");
    expect(await renderPresentationProviderAfterEffects()).toBe("<span>signedOut</span>");
  });

  it("keeps auth presentation pending while a refresh token can restore the session", async () => {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, "refresh-token");

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "pending" });
    const markup = renderPresentationProvider();

    expect(markup).toBe("<span>unknown</span>");
    expect(await renderPresentationProviderAfterEffects()).toBe(markup);
  });

  it("hydrates the pending presentation without a React mismatch", async () => {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, "refresh-token");

    const result = await hydratePresentationProviderAfterServerRender();

    expect(result.hydrationErrors).toEqual([]);
    expect(result.markup).toBe("<span>unknown</span>");
  });

  it("clears the head prehydration marker and style after the auth hint resolves", async () => {
    document.documentElement.setAttribute("data-app-auth-presentation-prehydrated", "");
    const styleElement = document.createElement("style");
    styleElement.id = "samebase-app-auth-presentation-prehydration";
    document.head.append(styleElement);

    expect(await renderPresentationProviderAfterEffects()).toBe("<span>signedOut</span>");

    expect(document.documentElement.hasAttribute("data-app-auth-presentation-prehydrated")).toBe(
      false,
    );
    expect(document.getElementById("samebase-app-auth-presentation-prehydration")).toBeNull();
  });

  it("keeps auth presentation pending during an active browser auth flow", () => {
    window.history.replaceState({}, "", "/?auth=google");

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "pending" });

    window.history.replaceState({}, "", "/?convexAuthCode=oauth-code");

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "pending" });
  });

  it("renders confirmed Convex auth", async () => {
    authState.isAuthenticated = true;
    authState.isLoading = false;

    expect(await renderPresentationProviderAfterEffects()).toBe(
      "<span>confirmedAuthenticated</span>",
    );
  });

  it("lets confirmed Convex sign-out override the local hint", () => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, "refresh-token");

    expect(renderPresentationProvider()).toBe("<span>signedOut</span>");
  });
});
