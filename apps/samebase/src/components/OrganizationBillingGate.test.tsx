import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Id } from "../../convex/_generated/dataModel";
import { OrganizationBillingGate } from "@/components/OrganizationBillingGate";
import {
  OrganizationContext,
  readAppOrganizationSurface,
  type ViewerOrganization,
} from "@/lib/organizationContext";
import { TestRouterProvider } from "@/test/TestRouterProvider";

const testState = vi.hoisted(
  (): {
    billingStatus: { billingLimited: boolean } | undefined;
    isAuthenticated: boolean;
    queryArgs: unknown[];
    routeChildRenders: number;
  } => ({
    billingStatus: undefined,
    isAuthenticated: true,
    queryArgs: [],
    routeChildRenders: 0,
  }),
);

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useConvexAuth: () => ({
      isAuthenticated: testState.isAuthenticated,
      isLoading: false,
    }),
    useQuery: (_reference: unknown, args: unknown) => {
      testState.queryArgs.push(args);
      return args === "skip" ? undefined : testState.billingStatus;
    },
  };
});

vi.mock("@/components/AppWorkspaceShell", () => ({
  AppWorkspaceRouteChrome: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // a stable value for query arguments.
  return value;
}

const organization = {
  canCreateRepository: true,
  githubOwnerId: "456",
  githubOwnerLogin: "Samebase",
  githubOwnerType: "organization" as const,
  organizationId: fakeOrganizationId("organization_samebase"),
  role: "owner" as const,
} satisfies ViewerOrganization;

function RouteChild() {
  testState.routeChildRenders += 1;
  return <div>Billing-gated route child</div>;
}

function renderGate(pathname: string, organizations: ViewerOrganization[] | undefined) {
  return renderToStaticMarkup(
    <TestRouterProvider initialEntries={[pathname]}>
      <OrganizationContext.Provider
        value={{ organizations, surface: readAppOrganizationSurface(pathname) }}
      >
        <OrganizationBillingGate>
          <RouteChild />
        </OrganizationBillingGate>
      </OrganizationContext.Provider>
    </TestRouterProvider>,
  );
}

describe("OrganizationBillingGate", () => {
  beforeEach(() => {
    testState.billingStatus = undefined;
    testState.isAuthenticated = true;
    testState.queryArgs = [];
    testState.routeChildRenders = 0;
  });

  it("waits for the organization list before it mounts a routed work surface", () => {
    const markup = renderGate("/org/Samebase/vaults", undefined);

    expect(markup).toBe("");
    expect(testState.routeChildRenders).toBe(0);
    expect(testState.queryArgs).toEqual(["skip"]);
  });

  it("waits for the safe billing read before it mounts a vault route", () => {
    const markup = renderGate("/vault/Samebase/repo/src/index.ts", [organization]);

    expect(markup).toBe("");
    expect(testState.routeChildRenders).toBe(0);
    expect(testState.queryArgs).toEqual([{ organizationId: organization.organizationId }]);
  });

  it("keeps a vault route unmounted when its organization is unavailable", () => {
    testState.billingStatus = { billingLimited: true };

    const markup = renderGate("/vault/Samebase/repo/src/index.ts", []);

    expect(markup).toContain("Vault unavailable");
    expect(markup).toContain('href="/vault"');
    expect(markup).not.toContain("Billing-gated route child");
    expect(testState.routeChildRenders).toBe(0);
    expect(testState.queryArgs).toEqual(["skip"]);
  });

  it("replaces billing-gated routes with one recovery state", () => {
    testState.billingStatus = { billingLimited: true };

    const markup = renderGate("/org/Samebase/providers", [organization]);

    expect(markup).toContain("Organization access is limited");
    expect(markup).toContain(
      "Add paid member capacity or remove members to restore organization access.",
    );
    expect(markup).toContain('href="/org/Samebase/settings#billing"');
    expect(markup).toContain('href="/org/Samebase/settings/members"');
    expect(markup).not.toContain("Billing-gated route child");
    expect(testState.routeChildRenders).toBe(0);
  });

  it("mounts normal organization routes after billing access is confirmed", () => {
    testState.billingStatus = { billingLimited: false };

    const markup = renderGate("/org/Samebase/vaults", [organization]);

    expect(markup).toContain("Billing-gated route child");
    expect(testState.routeChildRenders).toBe(1);
  });

  it.each(["/org/Samebase/settings", "/org/Samebase/settings/members"])(
    "keeps the recovery route %s available without a billing gate query",
    (pathname) => {
      testState.billingStatus = { billingLimited: true };

      const markup = renderGate(pathname, [organization]);

      expect(markup).toContain("Billing-gated route child");
      expect(testState.queryArgs).toEqual(["skip"]);
    },
  );
});
