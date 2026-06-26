import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
}));
const routeSearchState = vi.hoisted<{
  search: {
    mcp_consent_request?: string;
  };
}>(() => ({
  search: {},
}));

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({
    useSearch: () => routeSearchState.search,
  }),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    Authenticated: ({ children }: { children: ReactNode }) =>
      authState.isAuthenticated ? <>{children}</> : null,
    Unauthenticated: ({ children }: { children: ReactNode }) =>
      authState.isAuthenticated ? null : <>{children}</>,
    useAction: () => vi.fn(),
    useConvexAuth: () => authState,
    useQuery: () => undefined,
  };
});

vi.mock("@/components/AppWorkspaceShell", () => ({
  AppWorkspaceRouteChrome: ({
    children,
    headerVisible,
    left,
    right,
  }: {
    children?: ReactNode;
    headerVisible?: boolean;
    left?: unknown;
    right?: unknown;
  }) => (
    <div
      data-header-visible={String(headerVisible)}
      data-left={left === null ? "null" : "default"}
      data-right={right === null ? "null" : "default"}
    >
      {children}
    </div>
  ),
}));

vi.mock("@/SignInForm", () => ({
  SignInForm: ({ authPlacement }: { authPlacement: string }) => (
    <div data-auth-placement={authPlacement}>Sign in form</div>
  ),
}));

vi.mock("@/McpConsentSignInView", () => ({
  McpConsentSignInView: () => <div data-testid="mcp-consent-sign-in">MCP consent sign in</div>,
}));

vi.mock("@/components/ApprovalGate", () => ({
  ApprovalGate: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/useCloseOAuthPopup", () => ({
  useCloseOAuthPopup: vi.fn(),
}));

vi.mock("@/lib/usePageMetadata", () => ({
  usePageMetadata: vi.fn(),
}));

vi.mock("@/lib/pageMetadata", () => ({
  resolvePageMetadata: () => ({}),
}));

import { McpConsentRoutePage } from "./McpConsentRoutePage";

describe("McpConsentRoutePage", () => {
  it("renders signed-out consent login without the app sidebars", () => {
    authState.isAuthenticated = false;
    routeSearchState.search = {
      mcp_consent_request: "mcpar_test",
    };

    const markup = renderToStaticMarkup(<McpConsentRoutePage />);

    expect(markup).toContain('data-header-visible="false"');
    expect(markup).toContain('data-left="null"');
    expect(markup).toContain('data-right="null"');
    expect(markup).toContain('data-testid="mcp-consent-sign-in"');
  });

  it("keeps missing-request sign-in inline on the chromeless consent route", () => {
    authState.isAuthenticated = false;
    routeSearchState.search = {};

    const markup = renderToStaticMarkup(<McpConsentRoutePage />);

    expect(markup).toContain('data-header-visible="false"');
    expect(markup).toContain('data-left="null"');
    expect(markup).toContain('data-right="null"');
    expect(markup).toContain('data-auth-placement="inline"');
    expect(markup).not.toContain('data-auth-placement="sidebar"');
  });
});
