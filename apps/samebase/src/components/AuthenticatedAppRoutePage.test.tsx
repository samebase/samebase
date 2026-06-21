// @vitest-environment jsdom

import { AppAuthPresentationProvider } from "@/lib/AppAuthPresentationProvider";
import {
  convexAuthJwtStorageKey,
  convexAuthRefreshTokenStorageKey,
} from "@/lib/appAuthPresentationState";
import { act } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AuthenticatedAppRoutePage } from "./AuthenticatedAppRoutePage";

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
}));
const routeChildState = vi.hoisted(() => ({
  renders: 0,
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    Authenticated: ({ children }: { children: React.ReactNode }) =>
      authState.isAuthenticated ? <>{children}</> : null,
    Unauthenticated: ({ children }: { children: React.ReactNode }) =>
      !authState.isAuthenticated && !authState.isLoading ? <>{children}</> : null,
    useConvexAuth: () => authState,
  };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  const location = { pathname: "/home" };

  return {
    ...actual,
    useLocation: ({ select }: { select?: (value: typeof location) => unknown } = {}) =>
      select ? select(location) : location,
  };
});

vi.mock("@/SignInForm", () => ({
  SignInForm: () => <div data-testid="sign-in-form">Sign in</div>,
}));

vi.mock("@/components/ApprovalGate", () => ({
  ApprovalGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="approval-gate">{children}</div>
  ),
}));

vi.mock("@/routeSearch/root", () => ({
  useRootRouteSearch: () => ({}),
}));

vi.mock("@/lib/useAppAuthRuntimeEffects", () => ({
  useAppAuthRuntimeEffects: vi.fn(),
}));

vi.mock("@/lib/usePageMetadata", () => ({
  usePageMetadata: vi.fn(),
}));

const TEST_STORAGE_NAMESPACE = "https://example.convex.cloud";
const PROFILE_JWT =
  "header.eyJleHAiOjQxMDAwMDAwMDAsIm5hbWUiOiJOaWN1IiwiZW1haWwiOiJuaWN1QG5vdGVyLm1kIn0.signature";

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

function ProtectedRouteChild() {
  routeChildState.renders += 1;

  return <div data-testid="route-child">Route child</div>;
}

function createAuthenticatedRoutePageElement() {
  return (
    <AppAuthPresentationProvider storageNamespace={TEST_STORAGE_NAMESPACE}>
      <AuthenticatedAppRoutePage>
        <ProtectedRouteChild />
      </AuthenticatedAppRoutePage>
    </AppAuthPresentationProvider>
  );
}

function renderAuthenticatedRoutePage() {
  return renderToStaticMarkup(createAuthenticatedRoutePageElement());
}

async function renderAuthenticatedRoutePageAfterEffects() {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);

  await act(async () => {
    root.render(createAuthenticatedRoutePageElement());
  });

  const markup = rootElement.innerHTML;
  await act(async () => {
    root.unmount();
  });
  rootElement.remove();
  return markup;
}

describe("AuthenticatedAppRoutePage", () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    window.history.replaceState({}, "", "/home");
    routeChildState.renders = 0;
  });

  it("renders the temporary auth shell after hydration instead of route children or the sign-in form", async () => {
    authState.isLoading = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    const markup = renderAuthenticatedRoutePage();
    const hydratedMarkup = await renderAuthenticatedRoutePageAfterEffects();

    expect(markup).not.toContain("temporary-auth-route-shell");
    expect(hydratedMarkup).toContain("temporary-auth-route-shell");
    expect(markup).not.toContain("Route child");
    expect(markup).not.toContain("Sign in");
    expect(markup).not.toContain("approval-gate");
  });

  it("renders the sign-in form after hydration when loading without local auth material", async () => {
    authState.isLoading = true;

    const markup = renderAuthenticatedRoutePage();
    const hydratedMarkup = await renderAuthenticatedRoutePageAfterEffects();

    expect(markup).not.toContain("temporary-auth-route-shell");
    expect(hydratedMarkup).toContain("Sign in");
    expect(hydratedMarkup).not.toContain("temporary-auth-route-shell");
    expect(markup).not.toContain("Route child");
    expect(markup).not.toContain("Sign in");
  });

  it("keeps the route pending while a refresh token may restore the session", async () => {
    authState.isLoading = true;
    window.localStorage.setItem(
      convexAuthRefreshTokenStorageKey(TEST_STORAGE_NAMESPACE),
      "refresh-token",
    );

    const hydratedMarkup = await renderAuthenticatedRoutePageAfterEffects();

    expect(hydratedMarkup).not.toContain("temporary-auth-route-shell");
    expect(hydratedMarkup).not.toContain("Route child");
    expect(hydratedMarkup).not.toContain("Sign in");
  });

  it("hydrates temporary auth without a React mismatch", async () => {
    authState.isLoading = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);
    const rootElement = document.createElement("div");
    rootElement.innerHTML = renderAuthenticatedRoutePage();
    document.body.append(rootElement);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = await act(() => hydrateRoot(rootElement, createAuthenticatedRoutePageElement()));

    try {
      const hydrationErrors = consoleErrorSpy.mock.calls
        .map((call) => call.map((value) => String(value)).join(" "))
        .filter((message) => /hydrat|did not match|#418/i.test(message));
      expect(hydrationErrors).toEqual([]);
      expect(rootElement.innerHTML).toContain("temporary-auth-route-shell");
    } finally {
      await act(async () => {
        root.unmount();
      });
      consoleErrorSpy.mockRestore();
      rootElement.remove();
    }
  });

  it("keeps the normal signed-out form when Convex is signed out and there is no hint", () => {
    const markup = renderAuthenticatedRoutePage();

    expect(markup).toContain("Sign in");
    expect(markup).not.toContain("Route child");
  });

  it("keeps the approval gate on confirmed authenticated renders", () => {
    authState.isAuthenticated = true;

    const markup = renderAuthenticatedRoutePage();

    expect(markup).toContain("approval-gate");
    expect(markup).toContain("Route child");
    expect(markup).not.toContain("Sign in");
    expect(routeChildState.renders).toBe(1);
  });
});
