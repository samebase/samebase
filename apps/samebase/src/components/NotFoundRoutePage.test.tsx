// @vitest-environment jsdom

import { type LogoRouteSearch } from "@/routeSearch/logo";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
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

vi.mock("@samebase/convex-auth-tanstack-start", () => ({
  SignedIn: ({ children }: { children: ReactNode }) =>
    authState.isAuthenticated ? children : null,
  SignedOut: ({ children }: { children: ReactNode }) =>
    authState.isAuthenticated ? null : children,
}));

vi.mock("@/components/ApprovalGate", () => ({
  ApprovalGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/logo/PublicLandingLogo", () => ({
  PublicLandingLogo: (props: { routeSearch?: LogoRouteSearch }) => (
    <div
      data-testid="not-found-logo"
      data-primary={props.routeSearch?.primary}
      data-secondary={props.routeSearch?.secondary}
      data-top={props.routeSearch?.top}
    />
  ),
}));

function readLogoColorFamilies(markup: string) {
  return ["primary", "secondary", "top"].map(
    (slot) => new RegExp(`data-${slot}="([a-z]+)-`).exec(markup)?.[1],
  );
}

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the first colorway on the server and picks three distinct families on mount", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const serverMarkupWithLowRandom = renderToStaticMarkup(<NotFoundRoutePage />);
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    const serverMarkup = renderToStaticMarkup(<NotFoundRoutePage />);
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(<NotFoundRoutePage />);
    });
    const mountedMarkup = container.innerHTML;
    act(() => {
      root.unmount();
    });

    expect(serverMarkup).toBe(serverMarkupWithLowRandom);
    const mountedFamilies = readLogoColorFamilies(mountedMarkup);
    expect(new Set(mountedFamilies).size).toBe(3);
    expect(mountedFamilies).not.toEqual(readLogoColorFamilies(serverMarkup));
  });

  it("sends signed-out visitors to the landing page", () => {
    const markup = renderToStaticMarkup(<NotFoundRoutePage />);

    expect(markup).toContain('href="/"');
    expect(markup).not.toContain('href="/repo"');
  });

  it("sends signed-in visitors to repositories", () => {
    authState.isAuthenticated = true;

    const markup = renderToStaticMarkup(<NotFoundRoutePage />);

    expect(markup).toContain('href="/repo"');
    expect(markup).not.toContain('href="/"');
  });
});
