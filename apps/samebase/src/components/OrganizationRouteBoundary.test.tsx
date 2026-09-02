import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getFunctionName } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { OrganizationContextProvider } from "./OrganizationContext";
import { useOrganizationContext, type ViewerOrganization } from "@/lib/organizationContext";
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
  queryCalls: Array<{ args: unknown; name: string }>;
  queryResults: Map<string, unknown>;
}>(() => ({ queryCalls: [], queryResults: new Map() }));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
    useQuery: (reference: Parameters<typeof actual.useQuery>[0], args: unknown) => {
      const name = getFunctionName(reference);
      testState.queryCalls.push({ args, name });
      return args === "skip" ? undefined : testState.queryResults.get(name);
    },
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

function OrganizationCount() {
  const { organizations } = useOrganizationContext();
  return <div>{organizations?.length ?? "loading"}</div>;
}

function renderOrganizationDirectoryContext() {
  return renderToStaticMarkup(
    <TestRouterProvider initialEntries={["/org"]}>
      <OrganizationContextProvider>
        <OrganizationCount />
      </OrganizationContextProvider>
    </TestRouterProvider>,
  );
}

describe("OrganizationRouteBoundary", () => {
  beforeEach(() => {
    testState.queryCalls = [];
    testState.queryResults = new Map([
      [
        getFunctionName(api.users.currentViewerAccess),
        {
          accessKeys: ["access_public", "access_dashboard"],
          role: "role_member",
          termsAccepted: true,
        },
      ],
      [getFunctionName(api.organizations.listForViewer), undefined],
    ]);
  });

  it("does not read organizations before the viewer has dashboard access", () => {
    testState.queryResults.set(getFunctionName(api.users.currentViewerAccess), {
      accessKeys: ["access_public", "access_account_deletion", "access_account_settings"],
      role: "role_terms_pending",
      termsAccepted: false,
    });

    expect(renderBoundary("samebase")).toBe("");
    expect(testState.queryCalls).toEqual([
      { args: {}, name: getFunctionName(api.users.currentViewerAccess) },
      { args: "skip", name: getFunctionName(api.organizations.listForViewer) },
    ]);
  });

  it("waits for the membership list before it selects a route", () => {
    expect(renderBoundary("samebase")).toBe("");
  });

  it("loads memberships for the organization directory", () => {
    testState.queryResults.set(getFunctionName(api.organizations.listForViewer), [organization]);

    expect(renderOrganizationDirectoryContext()).toContain(">1<");
    expect(testState.queryCalls).toContainEqual({
      args: {},
      name: getFunctionName(api.organizations.listForViewer),
    });
  });

  it("shows the unavailable state for zero memberships or lost access", () => {
    testState.queryResults.set(getFunctionName(api.organizations.listForViewer), []);
    const markup = renderBoundary("samebase");

    expect(markup).toContain("Organization unavailable");
    expect(markup).toContain("You do not have Samebase access to samebase.");
    expect(markup).toContain('href="/vault"');
    expect(markup).toContain("All vaults");
  });

  it("renders a matching organization without changing its URL", () => {
    testState.queryResults.set(getFunctionName(api.organizations.listForViewer), [organization]);

    expect(renderBoundary("Samebase")).toContain("samebase providers");
  });
});
