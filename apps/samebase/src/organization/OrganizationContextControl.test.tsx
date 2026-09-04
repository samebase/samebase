// @vitest-environment jsdom

import type { AppOrganizationSurface, ViewerOrganization } from "@/organization/context";
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
    surface: { kind: "allRepositories" },
  },
  location: { hash: "", search: {} },
  navigate: vi.fn<(options: { href?: string; to?: string }) => Promise<void>>(),
}));

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // stable values for menu entries.
  return value;
}

function organization(
  githubOwnerLogin: string,
  githubOwnerType: ViewerOrganization["githubOwnerType"] = "organization",
): ViewerOrganization {
  return {
    canCreateRepository: true,
    githubOwnerId: `github-${githubOwnerLogin}`,
    githubOwnerLogin,
    githubOwnerType,
    organizationId: fakeOrganizationId(`organization-${githubOwnerLogin}`),
    role: "owner",
  };
}

vi.mock("@/organization/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/organization/context")>();
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
    testState.context.surface = { kind: "allRepositories" };
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
    expect(container.textContent).toContain("No organization selected");
    expect(container.textContent).toContain("samebase");
    expect(
      container.querySelector(
        '[aria-label="Switch organization, current context No organization selected"]',
      ),
    ).not.toBeNull();
    const menuItems = [
      ...container.querySelectorAll('[data-testid="organization-context-menu-item"]'),
    ];
    expect(menuItems.map((item) => item.textContent)).toEqual(["samebase"]);
    await act(async () => {
      menuItems[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(testState.navigate).toHaveBeenCalledWith({ href: "/org/samebase/repositories" });
  });

  it("does not show a switch when there are no organizations", async () => {
    testState.context.organizations = [];
    const container = await mountControl();

    expect(container.textContent).toBe("");
    expect(container.querySelector('[data-testid="organization-context-control"]')).toBeNull();
  });

  it("keeps a routed organization visible when its membership is unavailable", async () => {
    testState.context.organizations = [];
    testState.context.surface = {
      kind: "organization",
      owner: "lost-org",
      section: "repositories",
      source: "organization",
    };
    const container = await mountControl();

    expect(container.textContent).toBe("lost-org");
    expect(container.querySelector('[aria-label^="Switch organization"]')).toBeNull();
  });

  it("shows that no organization is selected for multiple organizations", async () => {
    testState.context.organizations = [organization("zeta"), organization("alpha")];
    const container = await mountControl();

    expect(
      container.querySelector(
        '[aria-label="Switch organization, current context No organization selected"]',
      ),
    ).not.toBeNull();
  });

  it("matches the repository list order without repeating All repositories", async () => {
    testState.context.organizations = [
      organization("zeta"),
      organization("personal", "user"),
      organization("alpha"),
    ];
    testState.context.surface = {
      kind: "organization",
      owner: "zeta",
      section: "settings",
      source: "organization",
    };
    const container = await mountControl();
    const menuItems = [
      ...container.querySelectorAll('[data-testid="organization-context-menu-item"]'),
    ];

    expect(menuItems.map((item) => item.textContent)).toEqual(["personal", "zeta", "alpha"]);
  });

  it("announces the current context from the sidebar trigger", async () => {
    testState.context.organizations = [organization("zeta"), organization("alpha")];
    testState.context.surface = {
      kind: "organization",
      owner: "zeta",
      section: "repositories",
      source: "organization",
    };
    const container = await mountControl();

    expect(
      container.querySelector('[aria-label="Switch organization, current context zeta"]'),
    ).not.toBeNull();
  });

  it("leaves a FileView route for the target organization repository list", async () => {
    testState.context.organizations = [organization("zeta"), organization("alpha")];
    testState.context.surface = {
      kind: "organization",
      owner: "zeta",
      section: "repositories",
      source: "repository",
    };
    testState.location.hash = "#README";
    testState.location.search = { "prod-ui": true };
    const container = await mountControl();
    const menuItems = [
      ...container.querySelectorAll('[data-testid="organization-context-menu-item"]'),
    ];

    await act(async () => {
      menuItems[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(testState.navigate).toHaveBeenCalledWith({
      href: "/org/alpha/repositories?prod-ui#README",
    });
  });

  it("does not repeat account context below the account section", async () => {
    testState.context.surface = { kind: "account" };
    const container = await mountControl();

    expect(container.textContent).toBe("");
    expect(container.querySelector('[data-testid="organization-context-control"]')).toBeNull();
  });
});
