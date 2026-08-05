// @vitest-environment jsdom

import { TestRouterProvider } from "@/test/TestRouterProvider";
import { type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AppWorkspaceShell } from "./AppWorkspaceShell";
import { McpConsentRoutePage } from "./McpConsentRoutePage";

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
}));
const routeSearchState = vi.hoisted(() => ({
  search: {
    mcp_consent_request: "mcpar_test",
  },
}));
const authorizationRequestState = vi.hoisted((): { value: unknown } => ({
  value: undefined,
}));
const authorizationActions = vi.hoisted(() => ({
  approve: vi.fn(),
  deny: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();

  return {
    ...actual,
    getRouteApi: () => ({
      useSearch: () => routeSearchState.search,
    }),
  };
});

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  const { getFunctionName } = await import("convex/server");

  return {
    ...actual,
    Authenticated: ({ children }: { children: ReactNode }) =>
      authState.isAuthenticated ? <>{children}</> : null,
    Unauthenticated: ({ children }: { children: ReactNode }) =>
      authState.isAuthenticated || authState.isLoading ? null : <>{children}</>,
    useAction: (reference: Parameters<typeof getFunctionName>[0]) => {
      switch (getFunctionName(reference)) {
        case "mcp/oauth:completeAuthorizationRequestForCurrentUser":
          return authorizationActions.approve;
        case "mcp/oauth:denyAuthorizationRequestForCurrentUser":
          return authorizationActions.deny;
        default:
          throw new Error(`Unexpected MCP consent action: ${getFunctionName(reference)}`);
      }
    },
    useConvexAuth: () => authState,
    useMutation: () => vi.fn(),
    useQuery: () => authorizationRequestState.value,
  };
});

vi.mock("@/components/useAppRightSidebarPane", () => ({
  useAppRightSidebarPane: () => ({
    content: <div data-testid="default-right-sidebar">Default right sidebar</div>,
  }),
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

describe("McpConsentRoutePage workspace shell", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    routeSearchState.search = {
      mcp_consent_request: "mcpar_test",
    };
    authorizationRequestState.value = undefined;
    authorizationActions.approve.mockReset();
    authorizationActions.deny.mockReset();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot) {
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }

    rootElement?.remove();
    rootElement = null;
  });

  it("keeps the workspace right sidebar while rendering instruction-only main content", async () => {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    await act(async () => {
      root?.render(
        <TestRouterProvider initialEntries={["/oauth/mcp/consent?mcp_consent_request=mcpar_test"]}>
          <AppWorkspaceShell>
            <McpConsentRoutePage />
          </AppWorkspaceShell>
        </TestRouterProvider>,
      );
    });

    expect(
      rootElement.querySelector('[data-testid="workspace-layout-v2-pane-right"]'),
    ).not.toBeNull();
    expect(rootElement.querySelector('[data-testid="workspace-layout-v2-pane-left"]')).toBeNull();
    expect(rootElement.querySelector('[data-testid="default-right-sidebar"]')).not.toBeNull();
    expect(rootElement.textContent).toContain("Sign in to continue");
    expect(rootElement.textContent).toContain("Use the account sidebar to sign in");
    expect(rootElement.textContent).not.toContain("https://x.com/samebasecom");
  });

  it("approves account-wide access without an organization selection", async () => {
    authState.isAuthenticated = true;
    authorizationRequestState.value = {
      requestId: "mcpar_test",
      clientId: "mcpc_test",
      clientName: "Codex",
      scope: "access_dashboard",
      scopes: ["access_dashboard"],
      resource: "https://api.samebase.test/mcp",
      status: "pending",
      dynamicallyRegistered: true,
      createdAt: 1,
      expiresAt: 2_000_000_000_000,
    };
    authorizationActions.approve.mockReturnValue(new Promise(() => {}));
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    await act(async () => {
      root?.render(
        <TestRouterProvider initialEntries={["/oauth/mcp/consent?mcp_consent_request=mcpar_test"]}>
          <McpConsentRoutePage />
        </TestRouterProvider>,
      );
    });

    expect(rootElement.textContent).toContain("access to your Samebase account");
    expect(rootElement.textContent).not.toContain("Select an organization");
    const approveButton = [...rootElement.querySelectorAll("button")].find(
      (button) => button.textContent === "Approve",
    );
    if (!approveButton) {
      throw new Error("Approve button was not rendered.");
    }
    await act(async () => {
      approveButton.click();
    });

    expect(authorizationActions.approve).toHaveBeenCalledWith({ requestId: "mcpar_test" });
  });
});
