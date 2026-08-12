// @vitest-environment jsdom

import type { AppOrganizationSurface, ViewerOrganization } from "@/lib/organizationContext";
import type { Id } from "../../convex/_generated/dataModel";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { OrganizationContextControl } from "./OrganizationContextControl";

const { act } = React;

type TestOrganizationContext = {
  organizations: ViewerOrganization[] | undefined;
  surface: AppOrganizationSurface;
};

const testState = vi.hoisted<{
  context: TestOrganizationContext;
  location: {
    hash: string;
    search: Record<string, unknown>;
  };
  navigate: ReturnType<typeof vi.fn<(options: { href?: string; to?: string }) => Promise<void>>>;
}>(() => ({
  context: {
    organizations: undefined,
    surface: { kind: "allVaults" },
  },
  location: { hash: "", search: {} },
  navigate: vi.fn<(options: { href?: string; to?: string }) => Promise<void>>(),
}));

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // stable values for menu entries.
  return value;
}

function organization(githubOwnerLogin: string): ViewerOrganization {
  return {
    canCreateRepository: true,
    githubOwnerId: `github-${githubOwnerLogin}`,
    githubOwnerLogin,
    githubOwnerType: "organization",
    organizationId: fakeOrganizationId(`organization-${githubOwnerLogin}`),
    role: "owner",
  };
}

vi.mock("@/lib/organizationContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/organizationContext")>();
  return {
    ...actual,
    useOrganizationContext: () => testState.context,
  };
});

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="organization-context-menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
  }) => (
    <button
      data-testid="organization-context-menu-item"
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useLocation: () => testState.location,
    useNavigate: () => testState.navigate,
  };
});

let root: Root | null = null;
let rootElement: HTMLDivElement | null = null;

async function mountControl(content: React.ReactNode = <OrganizationContextControl />) {
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);
  await act(async () => root?.render(content));
  return rootElement;
}

describe("OrganizationContextControl", () => {
  beforeEach(() => {
    testState.context.organizations = undefined;
    testState.context.surface = { kind: "allVaults" };
    testState.location.hash = "";
    testState.location.search = {};
    testState.navigate.mockReset();
    testState.navigate.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (root !== null) {
      await act(async () => root?.unmount());
    }
    rootElement?.remove();
    root = null;
    rootElement = null;
  });

  it("uses the same switch control for one organization", async () => {
    testState.context.organizations = [organization("samebase")];
    const container = await mountControl();

    expect(container.querySelector('[data-testid="organization-context-control"]')).not.toBeNull();
    expect(container.textContent).toContain("All vaults");
    expect(container.textContent).toContain("samebase");
    expect(
      container.querySelector('[aria-label="Switch organization, current context All vaults"]'),
    ).not.toBeNull();
    const menuItems = [
      ...container.querySelectorAll('[data-testid="organization-context-menu-item"]'),
    ];
    expect(menuItems.map((item) => item.textContent)).toEqual([
      "All vaults",
      "samebase",
      "Connect organization",
    ]);
    await act(async () => {
      menuItems[2]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(testState.navigate).toHaveBeenCalledWith({ to: "/connect-organization" });
  });

  it("shows All vaults for zero organizations", async () => {
    testState.context.organizations = [];
    const container = await mountControl();

    expect(container.textContent).toContain("All vaults");
    expect(container.querySelector('[aria-label^="Switch organization"]')).toBeNull();
  });

  it("keeps All vaults as the global switch context for multiple organizations", async () => {
    testState.context.organizations = [organization("zeta"), organization("alpha")];
    const container = await mountControl();

    expect(
      container.querySelector('[aria-label="Switch organization, current context All vaults"]'),
    ).not.toBeNull();
  });

  it("keeps backend organization order and cleans billing state for All vaults", async () => {
    testState.context.organizations = [organization("zeta"), organization("alpha")];
    testState.context.surface = {
      kind: "organization",
      owner: "zeta",
      section: "settings",
      source: "organization",
    };
    testState.location.hash = "#billing";
    testState.location.search = {
      checkout: "success",
      customer_session_token: true,
      "prod-ui": true,
    };
    const container = await mountControl();
    const menuItems = [
      ...container.querySelectorAll('[data-testid="organization-context-menu-item"]'),
    ];

    expect(menuItems.map((item) => item.textContent)).toEqual([
      "All vaults",
      "zeta",
      "alpha",
      "Connect organization",
    ]);
    await act(async () => {
      menuItems[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(testState.navigate).toHaveBeenCalledWith({
      href: "/vault?prod-ui#billing",
    });
  });

  it("announces the current context from the sidebar trigger", async () => {
    testState.context.organizations = [organization("zeta"), organization("alpha")];
    testState.context.surface = {
      kind: "organization",
      owner: "zeta",
      section: "vaults",
      source: "organization",
    };
    const container = await mountControl();

    expect(
      container.querySelector('[aria-label="Switch organization, current context zeta"]'),
    ).not.toBeNull();
  });

  it("leaves a FileView route for the target organization vault list", async () => {
    testState.context.organizations = [organization("zeta"), organization("alpha")];
    testState.context.surface = {
      kind: "organization",
      owner: "zeta",
      section: "vaults",
      source: "vault",
    };
    testState.location.hash = "#README";
    testState.location.search = { "prod-ui": true };
    const container = await mountControl();
    const menuItems = [
      ...container.querySelectorAll('[data-testid="organization-context-menu-item"]'),
    ];

    await act(async () => {
      menuItems[2]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(testState.navigate).toHaveBeenCalledWith({
      href: "/org/alpha/vaults?prod-ui#README",
    });
  });

  it("does not repeat account context below the account section", async () => {
    testState.context.surface = { kind: "account" };
    const container = await mountControl();

    expect(container.textContent).toBe("");
    expect(container.querySelector('[data-testid="organization-context-control"]')).toBeNull();
  });
});
