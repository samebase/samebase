// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AppAuthPresentationProvider } from "@/lib/AppAuthPresentationProvider";
import { AUTH_FLAG_STORAGE_KEY } from "@/lib/authStorageKeys";
import {
  convexAuthJwtStorageKey,
  readLocalAppAuthPresentationHint,
  useAppAuthPresentation,
} from "@/lib/appAuthPresentationState";

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: true,
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => authState,
}));

const TEST_STORAGE_NAMESPACE = "https://example.convex.cloud";
const FUTURE_JWT = "header.eyJleHAiOjQxMDAwMDAwMDB9.signature";
const PROFILE_JWT =
  "header.eyJleHAiOjQxMDAwMDAwMDAsIm5hbWUiOiJOaWN1IiwiZW1haWwiOiJuaWN1QG5vdGVyLm1kIiwicGljdHVyZSI6Imh0dHBzOi8vZXhhbXBsZS5jb20vYXZhdGFyLnBuZyJ9.signature";
const EXPIRED_JWT = "header.eyJleHAiOjF9.signature";
const NO_EXP_JWT = "header.e30.signature";

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

describe("app auth presentation", () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
  });

  it("uses the same namespaced JWT key shape as Convex Auth", () => {
    expect(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE)).toBe(
      "__convexAuthJWT_httpsexampleconvexcloud",
    );
  });

  it("treats a future local JWT as a temporary auth hint while Convex loads", () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), FUTURE_JWT);

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({
      kind: "present",
      profile: null,
      source: "jwt",
      tokenExpiresAt: 4_100_000_000_000,
    });
    expect(renderPresentationProvider()).toBe("<span>temporaryAuthenticated</span>");
  });

  it("reads presentation profile claims from the local JWT", () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({
      kind: "present",
      profile: {
        email: "nicu@noter.md",
        image: "https://example.com/avatar.png",
        name: "Nicu",
      },
      source: "jwt",
      tokenExpiresAt: 4_100_000_000_000,
    });
  });

  it("accepts a decodable local JWT without exp as not obviously expired", () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), NO_EXP_JWT);

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({
      kind: "present",
      profile: null,
      source: "jwt",
      tokenExpiresAt: null,
    });
  });

  it("rejects expired and malformed local JWTs without a remembered auth hint", () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), EXPIRED_JWT);

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "absent" });

    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), "not-a-jwt");

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({ kind: "absent" });
  });

  it("falls back to the remembered auth flag while Convex loads", () => {
    window.localStorage.setItem(AUTH_FLAG_STORAGE_KEY, "1");

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({
      kind: "present",
      profile: null,
      source: "remembered",
      tokenExpiresAt: null,
    });
    expect(renderPresentationProvider()).toBe("<span>temporaryAuthenticated</span>");
  });

  it("keeps the remembered auth fallback when the local JWT is expired", () => {
    window.localStorage.setItem(AUTH_FLAG_STORAGE_KEY, "1");
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), EXPIRED_JWT);

    expect(readLocalAppAuthPresentationHint(TEST_STORAGE_NAMESPACE)).toEqual({
      kind: "present",
      profile: null,
      source: "remembered",
      tokenExpiresAt: null,
    });
  });

  it("lets confirmed Convex auth override the local hint", () => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), FUTURE_JWT);

    expect(renderPresentationProvider()).toBe("<span>confirmedAuthenticated</span>");
  });

  it("lets confirmed Convex sign-out override the local hint", () => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), FUTURE_JWT);

    expect(renderPresentationProvider()).toBe("<span>signedOut</span>");
  });
});
