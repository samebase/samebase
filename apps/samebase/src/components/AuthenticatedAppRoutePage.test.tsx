// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AuthenticatedAppRoutePage, AuthenticatedUserRoutePage } from "./AuthenticatedAppRoutePage";
import type { RootRouteSearch } from "@/routeSearch/root";

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

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useLocation: ({ select }: { select?: (value: typeof locationState) => unknown } = {}) =>
      select ? select(locationState) : locationState,
    useRouter: () => routerState,
  };
});

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

function ProtectedRouteChild() {
  routeChildState.renders += 1;

  return <div data-testid="route-child">Route child</div>;
}

function createAuthenticatedRoutePageElement() {
  return (
    <AuthenticatedAppRoutePage>
      <ProtectedRouteChild />
    </AuthenticatedAppRoutePage>
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

  it("keeps the approval gate on app routes", () => {
    const markup = renderAuthenticatedRoutePage();

    expect(markup).toContain("approval-gate");
    expect(markup).toContain("Route child");
    expect(routeChildState.renders).toBe(1);
  });

  it("lets authenticated user routes bypass the approval gate", () => {
    const markup = renderToStaticMarkup(
      <AuthenticatedUserRoutePage>
        <ProtectedRouteChild />
      </AuthenticatedUserRoutePage>,
    );

    expect(markup).toContain("Route child");
    expect(markup).not.toContain("approval-gate");
  });
});
