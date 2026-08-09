import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
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

describe("OrganizationRouteBoundary", () => {
  beforeEach(() => {
    testState.organizations = undefined;
  });

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

  it("matches an owner login without case sensitivity", () => {
    testState.organizations = [organization];

    expect(renderBoundary("Samebase")).toContain("samebase providers");
  });
});
