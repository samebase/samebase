// @vitest-environment jsdom

import { AppAuthPresentationProvider } from "@/lib/AppAuthPresentationProvider";
import { act } from "react";
import { createRoot } from "react-dom/client";
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
const locationState = vi.hoisted(() => ({
  pathname: "/repo",
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
  return {
    ...actual,
    useLocation: ({ select }: { select?: (value: typeof locationState) => unknown } = {}) =>
      select ? select(locationState) : locationState,
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
    window.history.replaceState({}, "", "/repo");
    locationState.pathname = "/repo";
    routeChildState.renders = 0;
    routerState.navigate.mockClear();
    rootSearchState.search = {};
    toastState.toast.mockClear();
  });

  it("shows and consumes a GitHub App setup error on a non-settings route", async () => {
    rootSearchState.search = {
      "authorization-provider": "github-app",
      "authorization-error": "canceled",
      "prod-ui": true,
    };

    await renderAuthenticatedRoutePageAfterEffects();

    expect(toastState.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: "high",
        title: "Authorization not completed",
        variant: "destructive",
      }),
    );
    expect(routerState.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ hash: true, replace: true, resetScroll: false, to: "." }),
    );
  });

  it("leaves a personal repository authorization error for the Providers route", async () => {
    locationState.pathname = "/org/nicubunu/providers";
    rootSearchState.search = {
      "authorization-provider": "github-user",
      "authorization-error": "target-mismatch",
    };

    await renderAuthenticatedRoutePageAfterEffects();

    expect(toastState.toast).not.toHaveBeenCalled();
    expect(routerState.navigate).not.toHaveBeenCalled();
  });

  it("renders the sign-in form after hydration when loading without local auth material", async () => {
    authState.isLoading = true;

    const markup = renderAuthenticatedRoutePage();
    const hydratedMarkup = await renderAuthenticatedRoutePageAfterEffects();

    expect(hydratedMarkup).toContain("Sign in");
    expect(markup).not.toContain("Route child");
    expect(markup).not.toContain("Sign in");
  });

  it("keeps the route pending while a refresh token may restore the session", async () => {
    authState.isLoading = true;
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, "refresh-token");

    const hydratedMarkup = await renderAuthenticatedRoutePageAfterEffects();

    expect(hydratedMarkup).not.toContain("Route child");
    expect(hydratedMarkup).not.toContain("Sign in");
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
