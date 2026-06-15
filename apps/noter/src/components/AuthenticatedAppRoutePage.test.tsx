// @vitest-environment jsdom

import { AppAuthPresentationProvider } from "@/lib/AppAuthPresentationProvider";
import { AUTH_FLAG_STORAGE_KEY } from "@/lib/authStorageKeys";
import { convexAuthJwtStorageKey } from "@/lib/appAuthPresentationState";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AuthenticatedAppRoutePage } from "./AuthenticatedAppRoutePage";

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
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
    useLocation: () => "/home",
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

vi.mock("@/lib/rootRouteSearch", () => ({
  useRootRouteSearch: () => ({}),
}));

vi.mock("@/lib/useAppAuthRuntimeEffects", () => ({
  useAppAuthRuntimeEffects: vi.fn(),
}));

vi.mock("@/lib/usePageMetadata", () => ({
  usePageMetadata: vi.fn(),
}));

const TEST_STORAGE_NAMESPACE = "https://example.convex.cloud";
const FUTURE_JWT = "header.eyJleHAiOjQxMDAwMDAwMDB9.signature";

function renderAuthenticatedRoutePage() {
  return renderToStaticMarkup(
    <AppAuthPresentationProvider storageNamespace={TEST_STORAGE_NAMESPACE}>
      <AuthenticatedAppRoutePage>
        <div data-testid="route-child">Route child</div>
      </AuthenticatedAppRoutePage>
    </AppAuthPresentationProvider>,
  );
}

describe("AuthenticatedAppRoutePage", () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    window.localStorage.clear();
  });

  it("renders the temporary auth shell instead of route children or the sign-in form", () => {
    authState.isLoading = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), FUTURE_JWT);

    const markup = renderAuthenticatedRoutePage();

    expect(markup).toContain("temporary-auth-route-shell");
    expect(markup).not.toContain("Route child");
    expect(markup).not.toContain("Sign in");
    expect(markup).not.toContain("approval-gate");
  });

  it("uses the remembered auth flag for the temporary auth shell", () => {
    authState.isLoading = true;
    window.localStorage.setItem(AUTH_FLAG_STORAGE_KEY, "1");

    const markup = renderAuthenticatedRoutePage();

    expect(markup).toContain("temporary-auth-route-shell");
    expect(markup).not.toContain("Route child");
    expect(markup).not.toContain("Sign in");
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
  });
});
