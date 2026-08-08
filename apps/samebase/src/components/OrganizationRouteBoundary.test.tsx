// @vitest-environment jsdom

import { useLocation } from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Id } from "../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { OrganizationContextProvider } from "./OrganizationContext";
import type { ViewerOrganization } from "@/lib/organizationContext";
import { OrganizationRouteBoundary } from "./OrganizationRouteBoundary";

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // a stable value for route matching.
  return value;
}

const organization = {
  canCreateRepository: true,
  githubOwnerId: "456",
  githubOwnerLogin: "samebase",
  githubOwnerType: "organization" as const,
  organizationId: fakeOrganizationId("organization_samebase"),
  role: "owner" as const,
} satisfies ViewerOrganization;

const testState = vi.hoisted<{
  organizations: ViewerOrganization[] | undefined;
}>(() => ({ organizations: undefined }));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
    useQuery: () => testState.organizations,
  };
});

function renderBoundary(owner: string) {
  return renderToStaticMarkup(
    <TestRouterProvider initialEntries={[`/org/${owner}/providers`]}>
      <OrganizationContextProvider>
        <OrganizationRouteBoundary owner={owner}>
          {(selectedOrganization) => <div>{selectedOrganization.githubOwnerLogin} providers</div>}
        </OrganizationRouteBoundary>
      </OrganizationContextProvider>
    </TestRouterProvider>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-href={location.href} data-testid="router-location" />;
}

function mountedBoundaryTree(initialEntry: string, owner: string) {
  return (
    <TestRouterProvider initialEntries={[initialEntry]}>
      <OrganizationContextProvider>
        <OrganizationRouteBoundary owner={owner}>
          {(selectedOrganization) => <div>{selectedOrganization.githubOwnerLogin} providers</div>}
        </OrganizationRouteBoundary>
        <LocationProbe />
      </OrganizationContextProvider>
    </TestRouterProvider>
  );
}

describe("OrganizationRouteBoundary", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    testState.organizations = undefined;
  });

  afterEach(() => {
    if (root) {
      const mountedRoot = root;
      act(() => mountedRoot.unmount());
      root = null;
    }
    rootElement?.remove();
    rootElement = null;
  });

  async function settleRouteUpdate() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  async function renderMountedBoundary(initialEntry: string, owner: string) {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    await act(async () => {
      mountedRoot.render(mountedBoundaryTree(initialEntry, owner));
      await settleRouteUpdate();
    });
  }

  async function rerenderMountedBoundary(initialEntry: string, owner: string) {
    if (!root) {
      throw new Error("Organization boundary test root is not mounted.");
    }
    await act(async () => {
      root?.render(mountedBoundaryTree(initialEntry, owner));
      await settleRouteUpdate();
    });
  }

  function readLocationHref() {
    return (
      rootElement?.querySelector('[data-testid="router-location"]')?.getAttribute("data-href") ?? ""
    );
  }

  it("waits for the membership list before it selects a route", () => {
    expect(renderBoundary("samebase")).toBe("");
  });

  it("shows the unavailable state for zero memberships or lost access", () => {
    testState.organizations = [];
    const markup = renderBoundary("samebase");

    expect(markup).toContain("Organization unavailable");
    expect(markup).toContain("You do not have Samebase access to samebase.");
    expect(markup).toContain('href="/vault"');
    expect(markup).toContain("All vaults");
  });

  it("renders a matching organization", () => {
    testState.organizations = [organization];

    expect(renderBoundary("samebase")).toContain("samebase providers");
  });

  it("replaces an active organization route after its owner login changes", async () => {
    const beforeOrganization = {
      ...organization,
      githubOwnerLogin: "before-owner",
    } satisfies ViewerOrganization;
    testState.organizations = [beforeOrganization];
    await renderMountedBoundary("/org/before-owner/providers?dev#connections", "before-owner");

    testState.organizations = [
      {
        ...beforeOrganization,
        githubOwnerLogin: "after-owner",
      },
    ];
    await rerenderMountedBoundary("/org/before-owner/providers?dev#connections", "before-owner");

    expect(rootElement?.textContent).toContain("after-owner providers");
    expect(readLocationHref()).toBe("/org/after-owner/providers?dev#connections");
  });

  it("does not switch organizations when another organization reuses the old login", async () => {
    const beforeOrganization = {
      ...organization,
      githubOwnerLogin: "before-owner",
    } satisfies ViewerOrganization;
    testState.organizations = [beforeOrganization];
    await renderMountedBoundary("/org/before-owner/providers", "before-owner");

    testState.organizations = [
      {
        ...beforeOrganization,
        githubOwnerLogin: "after-owner",
      },
      {
        ...organization,
        githubOwnerId: "789",
        organizationId: fakeOrganizationId("organization_replacement"),
        githubOwnerLogin: "before-owner",
      },
    ];
    await rerenderMountedBoundary("/org/before-owner/providers", "before-owner");

    expect(rootElement?.textContent).toContain("after-owner providers");
    expect(readLocationHref()).toBe("/org/after-owner/providers");
  });

  it("keeps an active route unavailable after organization access is lost", async () => {
    const beforeOrganization = {
      ...organization,
      githubOwnerLogin: "before-owner",
    } satisfies ViewerOrganization;
    testState.organizations = [beforeOrganization];
    await renderMountedBoundary("/org/before-owner/providers?dev", "before-owner");

    testState.organizations = [];
    await rerenderMountedBoundary("/org/before-owner/providers?dev", "before-owner");

    expect(rootElement?.textContent).toContain("Organization unavailable");
    expect(readLocationHref()).toBe("/org/before-owner/providers?dev");
  });
});
