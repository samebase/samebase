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
  getInstallationUrl: ReturnType<typeof vi.fn<() => Promise<string>>>;
  location: {
    hash: string;
    search: Record<string, unknown>;
  };
  navigate: ReturnType<typeof vi.fn<(options: { href: string }) => Promise<void>>>;
  openSetup: ReturnType<typeof vi.fn<(getSetupUrl: () => Promise<string>) => Promise<void>>>;
}>(() => ({
  context: {
    organizations: undefined,
    surface: { kind: "allVaults" },
  },
  getInstallationUrl: vi.fn<() => Promise<string>>(),
  location: { hash: "", search: {} },
  navigate: vi.fn<(options: { href: string }) => Promise<void>>(),
  openSetup: vi.fn<(getSetupUrl: () => Promise<string>) => Promise<void>>(),
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

vi.mock("@/lib/githubAppSetupFlow", () => ({
  getCurrentRootRelativeUrl: () => "/vault?prod-ui",
  openGitHubAppSetupPopup: (getSetupUrl: () => Promise<string>) => testState.openSetup(getSetupUrl),
}));

vi.mock("@/components/ui/use-toast", () => ({
  toast: vi.fn(),
}));

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

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useMutation: () => testState.getInstallationUrl,
  };
});

let root: Root | null = null;
let rootElement: HTMLDivElement | null = null;

async function mountControl() {
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);
  await act(async () => root?.render(<OrganizationContextControl />));
  return rootElement;
}

describe("OrganizationContextControl", () => {
  beforeEach(() => {
    testState.context.organizations = undefined;
    testState.context.surface = { kind: "allVaults" };
    testState.location.hash = "";
    testState.location.search = {};
    testState.getInstallationUrl.mockReset();
    testState.getInstallationUrl.mockResolvedValue(
      "https://github.com/apps/samebase/installations/new",
    );
    testState.navigate.mockReset();
    testState.navigate.mockResolvedValue(undefined);
    testState.openSetup.mockReset();
    testState.openSetup.mockImplementation(async (getSetupUrl: () => Promise<string>) => {
      await getSetupUrl();
    });
  });

  afterEach(async () => {
    if (root !== null) {
      await act(async () => root?.unmount());
    }
    rootElement?.remove();
    root = null;
    rootElement = null;
  });

  it("shows a static All vaults context and install action for one organization", async () => {
    testState.context.organizations = [organization("samebase")];
    const container = await mountControl();

    expect(container.textContent).toContain("All vaults");
    expect(container.querySelector('[aria-label="Switch organization"]')).toBeNull();
    const installButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Install GitHub App",
    );
    await act(async () => {
      installButton?.click();
      await Promise.resolve();
    });

    expect(testState.openSetup).toHaveBeenCalledOnce();
    expect(testState.getInstallationUrl).toHaveBeenCalledWith({
      returnToPath: "/vault?prod-ui",
    });
  });

  it("keeps backend organization order and cleans billing state for All vaults", async () => {
    testState.context.organizations = [organization("zeta"), organization("alpha")];
    testState.context.surface = {
      kind: "organization",
      owner: "zeta",
      section: "billing",
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
      "Install GitHub App",
    ]);
    await act(async () => {
      menuItems[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(testState.navigate).toHaveBeenCalledWith({
      href: "/vault?prod-ui#billing",
    });
  });
});
