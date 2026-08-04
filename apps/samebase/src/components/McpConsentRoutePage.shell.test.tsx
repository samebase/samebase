// @vitest-environment jsdom

import { TestRouterProvider } from "@/test/TestRouterProvider";
import { getFunctionName } from "convex/server";
import { type ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AppWorkspaceShell } from "./AppWorkspaceShell";
import { McpConsentRoutePage } from "./McpConsentRoutePage";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type OrganizationList = (typeof api.organizations.listForViewer)["_returnType"];

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
const organizationListState = vi.hoisted((): { value: OrganizationList | undefined } => ({
  value: undefined,
}));
const completeAuthorizationRequestMock = vi.hoisted(() =>
  vi.fn(() => new Promise<never>(() => {})),
);
const denyAuthorizationRequestMock = vi.hoisted(() => vi.fn());

function fakeOrganizationId(): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test needs one stable organization id.
  return "organization_test";
}

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

  return {
    ...actual,
    Authenticated: ({ children }: { children: ReactNode }) =>
      authState.isAuthenticated ? <>{children}</> : null,
    Unauthenticated: ({ children }: { children: ReactNode }) =>
      authState.isAuthenticated || authState.isLoading ? null : <>{children}</>,
    useAction: (action: Parameters<typeof actual.useAction>[0]) => {
      switch (getFunctionName(action)) {
        case "mcp/oauth:completeAuthorizationRequestForCurrentUser":
          return completeAuthorizationRequestMock;
        case "mcp/oauth:denyAuthorizationRequestForCurrentUser":
          return denyAuthorizationRequestMock;
        default:
          throw new Error(`Unexpected action: ${getFunctionName(action)}`);
      }
    },
    useConvexAuth: () => authState,
    useMutation: () => vi.fn(),
    useQuery: (query: Parameters<typeof actual.useQuery>[0]) => {
      switch (getFunctionName(query)) {
        case "mcp/oauth:getAuthorizationRequestForCurrentUser":
          return authorizationRequestState.value;
        case "organizations:listForViewer":
          return organizationListState.value;
        default:
          return undefined;
      }
    },
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
    organizationListState.value = undefined;
    completeAuthorizationRequestMock.mockClear();
    denyAuthorizationRequestMock.mockClear();
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

  it("renders a readable label for the browser handoff scope", async () => {
    const organizationId = fakeOrganizationId();
    authState.isAuthenticated = true;
    authorizationRequestState.value = {
      requestId: "mcpar_test",
      clientId: "mcpc_test",
      clientName: "Local Codex handoff smoke",
      resource: "http://127.0.0.1:12469/mcp",
      scope: "access_browser_login_handoff",
      scopes: ["access_browser_login_handoff"],
      status: "pending",
      dynamicallyRegistered: true,
      createdAt: 1,
      expiresAt: 2,
    };
    organizationListState.value = [
      {
        organizationId,
        label: "Test organization",
      },
    ];
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

    expect(rootElement.textContent).toContain("Open Samebase in a browser as your account");
    expect(rootElement.textContent).not.toContain("access_browser_login_handoff");
    expect(rootElement.textContent).toContain("Test organization");

    const approveButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent === "Approve",
    );
    if (approveButton === undefined) {
      throw new Error("Expected the MCP approval button.");
    }
    await act(async () => {
      approveButton.click();
    });
    expect(completeAuthorizationRequestMock).toHaveBeenCalledWith({
      requestId: "mcpar_test",
      organizationId,
    });
  });

  it("shows the selected organization label instead of its id", async () => {
    const firstOrganizationId = fakeOrganizationId();
    // @ts-expect-error Convex ids are strings at runtime; this test needs a second stable id.
    const secondOrganizationId: Id<"organizations"> = "organization_second";
    authState.isAuthenticated = true;
    authorizationRequestState.value = {
      requestId: "mcpar_test",
      clientId: "mcpc_test",
      clientName: "Local Codex handoff smoke",
      resource: "http://127.0.0.1:12469/mcp",
      scope: "access_browser_login_handoff",
      scopes: ["access_browser_login_handoff"],
      status: "pending",
      dynamicallyRegistered: true,
      createdAt: 1,
      expiresAt: 2,
    };
    organizationListState.value = [
      { organizationId: firstOrganizationId, label: "First organization" },
      { organizationId: secondOrganizationId, label: "Second organization" },
    ];
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

    const trigger = rootElement.querySelector<HTMLButtonElement>('[aria-label="Organization"]');
    if (trigger === null) {
      throw new Error("Expected the organization selector.");
    }
    await act(async () => {
      trigger.click();
    });

    const firstOption = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]'),
    ).find((option) => option.textContent === "First organization");
    if (firstOption === undefined) {
      throw new Error("Expected the first organization option.");
    }
    await act(async () => {
      firstOption.click();
    });

    expect(trigger.textContent).toContain("First organization");
    expect(trigger.textContent).not.toContain(firstOrganizationId);
  });
});
