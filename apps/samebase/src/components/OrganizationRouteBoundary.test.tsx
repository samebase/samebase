// @vitest-environment jsdom

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { useLocation } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Id } from "../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { OrganizationContextProvider } from "./OrganizationContext";
import type { ViewerOrganization } from "@/lib/organizationContext";
import { OrganizationRouteBoundary } from "./OrganizationRouteBoundary";

const { act } = React;

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // a stable value for route matching.
  return value;
}

const organization = {
  canCreateRepository: true,
  deletionState: "not_deleting" as const,
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

function renderBoundary(owner: string, section = "providers") {
  return renderToStaticMarkup(
    <TestRouterProvider initialEntries={[`/org/${owner}/${section}`]}>
      <OrganizationContextProvider>
        <OrganizationRouteBoundary owner={owner}>
          {(selectedOrganization) => (
            <div>
              {selectedOrganization.githubOwnerLogin} {section}
            </div>
          )}
        </OrganizationRouteBoundary>
      </OrganizationContextProvider>
    </TestRouterProvider>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-href={location.href} data-testid="router-location" />;
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
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    rootElement?.remove();
    rootElement = null;
  });

  async function renderInteractiveBoundary(initialEntry: string) {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    await act(async () => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={[initialEntry]}>
          <OrganizationContextProvider>
            <OrganizationRouteBoundary owner="samebase">
              {(selectedOrganization) => <div>{selectedOrganization.githubOwnerLogin}</div>}
            </OrganizationRouteBoundary>
          </OrganizationContextProvider>
          <LocationProbe />
        </TestRouterProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
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

  it("renders a matching organization without changing its URL", () => {
    testState.organizations = [organization];

    expect(renderBoundary("Samebase")).toContain("samebase providers");
  });

  it("routes a deleting organization to its settings status and keeps location state", async () => {
    testState.organizations = [{ ...organization, deletionState: "deleting" }];

    await renderInteractiveBoundary("/org/samebase/providers?dev#credentials");

    expect(readLocationHref()).toContain("/org/samebase/settings");
    expect(readLocationHref()).toContain("?dev");
    expect(readLocationHref()).toContain("#credentials");
  });

  it("keeps a deleting organization on its settings status", () => {
    testState.organizations = [{ ...organization, deletionState: "deleting" }];

    expect(renderBoundary("samebase", "settings")).toContain("samebase settings");
  });
});
