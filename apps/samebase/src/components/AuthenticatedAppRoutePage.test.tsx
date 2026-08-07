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
import { AuthenticatedAppRoutePage, AuthenticatedUserRoutePage } from "./AuthenticatedAppRoutePage";
import type { RootRouteSearch } from "@/routeSearch/root";

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
}));
const routeChildState = vi.hoisted(() => ({
  renders: 0,
}));
const routerState = vi.hoisted(() => ({
  navigate: vi.fn(async () => undefined),
}));
const rootSearchState = vi.hoisted((): { search: RootRouteSearch } => ({
  search: {},
}));
const toastState = vi.hoisted(() => ({
  toast: vi.fn(),
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
  const location = { pathname: "/vault" };

  return {
    ...actual,
    useLocation: ({ select }: { select?: (value: typeof location) => unknown } = {}) =>
      select ? select(location) : location,
    useRouter: () => routerState,
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
  useRootRouteSearch: () => rootSearchState.search,
}));

vi.mock("@/components/ui/use-toast", () => ({
  toast: toastState.toast,
}));

vi.mock("@/lib/useAppAuthRuntimeEffects", () => ({
  useAppAuthRuntimeEffects: vi.fn(),
}));

vi.mock("@/lib/usePageMetadata", () => ({
  usePageMetadata: vi.fn(),
}));

const TEST_STORAGE_NAMESPACE = "https://example.convex.cloud";
const PROFILE_JWT = [
  "header",
  Buffer.from(
    JSON.stringify({
      accountLabelKind: "displayName",
      accountLabel: "Nicu",
      exp: 4100000000,
    }),
  ).toString("base64url"),
  "signature",
].join(".");

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
    window.history.replaceState({}, "", "/vault");
    routeChildState.renders = 0;
    routerState.navigate.mockClear();
    rootSearchState.search = {};
    toastState.toast.mockClear();
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

  it("shows and consumes a GitHub App setup error on a non-settings route", async () => {
    rootSearchState.search = {
      "authorization-provider": "github-app",
      "authorization-error": "canceled",
      "prod-ui": true,
    };

    await renderAuthenticatedRoutePageAfterEffects();

    expect(toastState.toast).toHaveBeenCalledWith({
      description: "GitHub App setup was canceled. The existing connection was not changed.",
      priority: "high",
      title: "Authorization not completed",
      variant: "destructive",
    });
    expect(routerState.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ hash: true, replace: true, resetScroll: false, to: "." }),
    );
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

  it("lets authenticated user routes bypass the approval gate", () => {
    authState.isAuthenticated = true;

    const markup = renderToStaticMarkup(
      <AppAuthPresentationProvider storageNamespace={TEST_STORAGE_NAMESPACE}>
        <AuthenticatedUserRoutePage>
          <ProtectedRouteChild />
        </AuthenticatedUserRoutePage>
      </AppAuthPresentationProvider>,
    );

    expect(markup).toContain("Route child");
    expect(markup).not.toContain("approval-gate");
  });
});
