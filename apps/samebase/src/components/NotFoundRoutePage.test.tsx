import { type LogoRouteSearch } from "@/routeSearch/logo";
import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { NotFoundRoutePage } from "./NotFoundRoutePage";

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
}));
const locationState = vi.hoisted(() => ({
  pathname: "/missing",
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className, to }: { children: ReactNode; className?: string; to: string }) => (
    <a className={className} href={to}>
      {children}
    </a>
  ),
  useLocation: ({ select }: { select: (location: typeof locationState) => unknown }) =>
    select(locationState),
}));

vi.mock("convex/react", () => ({
  Authenticated: ({ children }: { children: ReactNode }) =>
    authState.isAuthenticated ? <>{children}</> : null,
  Unauthenticated: ({ children }: { children: ReactNode }) =>
    authState.isAuthenticated ? null : <>{children}</>,
}));

vi.mock("@/components/ApprovalGate", () => ({
  ApprovalGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/logo/PublicLandingLogo", () => ({
  PublicLandingLogo: (props: {
    autoRotate?: boolean;
    routeSearch?: LogoRouteSearch;
    routeSearchSource?: "static" | "url";
    viewStateKey?: string;
  }) => (
    <div
      data-testid="not-found-logo"
      data-auto-rotate={props.autoRotate}
      data-auto-shuffle={props.routeSearch?.["auto-shuffle"]}
      data-primary={props.routeSearch?.primary}
      data-route-search-source={props.routeSearchSource}
      data-view-state-key={props.viewStateKey}
    />
  ),
}));

vi.mock("@/lib/pageMetadata", () => ({
  resolveNotFoundPageMetadata: () => ({}),
}));

vi.mock("@/lib/usePageMetadata", () => ({
  usePageMetadata: vi.fn(),
}));

vi.mock("@/lib/useAppAuthRuntimeEffects", () => ({
  useAppAuthRuntimeEffects: vi.fn(),
}));

vi.mock("@/routeSearch/root", () => ({
  useRootRouteSearch: () => ({}),
}));

describe("NotFoundRoutePage", () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    locationState.pathname = "/missing";
  });

  it("renders the animated shuffled logo with a stable path colorway", () => {
    const firstMarkup = renderToStaticMarkup(<NotFoundRoutePage />);
    const secondMarkup = renderToStaticMarkup(<NotFoundRoutePage />);

    expect(secondMarkup).toBe(firstMarkup);
    expect(firstMarkup).toContain('data-auto-rotate="true"');
    expect(firstMarkup).toContain('data-auto-shuffle="true"');
    expect(firstMarkup).toContain('data-route-search-source="static"');
    expect(firstMarkup).toContain('data-view-state-key="not-found"');
    expect(firstMarkup).toMatch(/data-primary="(?:blue|violet|rose|amber|emerald|cyan)-700"/);
  });

  it("sends signed-out visitors home", () => {
    locationState.pathname = "/new-app";

    const markup = renderToStaticMarkup(<NotFoundRoutePage />);

    expect(markup).toContain("Page not available");
    expect(markup).not.toContain("This page isn&#x27;t available.");
    expect(markup).not.toContain("/new-app");
    expect(markup).toContain('href="/"');
    expect(markup).toContain("Go home");
    expect(markup).not.toContain("Go to vaults");
  });

  it("sends signed-in visitors to vaults", () => {
    authState.isAuthenticated = true;

    const markup = renderToStaticMarkup(<NotFoundRoutePage />);

    expect(markup).toContain('href="/vault"');
    expect(markup).toContain("Go to vaults");
    expect(markup).not.toContain("Go home");
  });
});
