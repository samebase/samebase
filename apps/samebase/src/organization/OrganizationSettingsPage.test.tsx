// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { OrganizationGitHubIdentityObservation } from "@/organization/useOrganizationGitHubIdentity";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import type { ViewerOrganization } from "@/organization/context";
import { OrganizationSettingsPage } from "./OrganizationSettingsPage";

const useOrganizationGitHubIdentitiesMock = vi.hoisted(() => vi.fn());
vi.mock("@/organization/useOrganizationGitHubIdentity", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/organization/useOrganizationGitHubIdentity")>();
  return {
    ...actual,
    useOrganizationGitHubIdentities: useOrganizationGitHubIdentitiesMock,
  };
});

// This jsdom mount has no Start server request or client compilation.
vi.mock("@/lib/isomorphic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/isomorphic")>()),
  readIsomorphicOrigin: () => window.location.origin,
}));

function fakeOrganizationId(value: string): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // a stable value for component arguments.
  return value;
}

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: () => vi.fn(async () => undefined),
    useMutation: () => vi.fn(async () => undefined),
    useQuery: (reference: Parameters<typeof actual.useQuery>[0]) => {
      const functionName = getFunctionName(reference);
      if (functionName === getFunctionName(api.billing.getViewerBillingStatus)) {
        return {
          billingLimited: false,
          canManageBilling: true,
          hasSubscription: false,
          includedMembers: 2,
          memberCapacity: 2,
          memberCount: 2,
          payerState: "unassigned",
          plan: "free",
          purchasedSeatQuantity: 0,
          status: "inactive",
        };
      }
      if (
        functionName === getFunctionName(api.billingResourceQuotas.getViewerBillingResourceUsage)
      ) {
        return {
          connections: { limit: 6, used: { count: 3, state: "exact" } },
        };
      }
      throw new Error(`Unexpected query: ${functionName}`);
    },
  };
});

const organization = {
  canCreateRepository: true,
  githubOwnerId: "456",
  githubOwnerLogin: "samebase",
  githubOwnerType: "organization" as const,
  organizationId: fakeOrganizationId("organization_samebase"),
  role: "owner" as const,
} satisfies ViewerOrganization;

function renderOrganizationSettings(
  selectedOrganization: ViewerOrganization,
  githubIdentity: OrganizationGitHubIdentityObservation["owner"] = {
    status: "current",
  },
) {
  useOrganizationGitHubIdentitiesMock.mockReturnValue(
    new Map([
      [
        selectedOrganization.organizationId,
        {
          owner: githubIdentity,
          repositories: [],
        },
      ],
    ]),
  );
  const queryClient = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <TestRouterProvider initialEntries={["/org/samebase/settings"]}>
        <OrganizationSettingsPage organization={selectedOrganization} search={{}} />
      </TestRouterProvider>
    </QueryClientProvider>,
  );
}

describe("OrganizationSettingsPage", () => {
  it("shows organization billing in organization settings", () => {
    const markup = renderOrganizationSettings(organization);

    expect(markup).toContain("Organization settings");
    expect(markup).toContain("Billing");
    expect(markup).toContain("Current plan");
    expect(markup).toContain("Connections");
    expect(markup).toContain("3 of 6");
    expect(markup).not.toContain("Open billing");
    expect(markup).not.toContain("/settings/billing");
    expect(markup).toContain("Delete organization");
    expect(markup).not.toContain("Default production region");
  });

  it("shows a member no deletion controls", () => {
    const markup = renderOrganizationSettings({ ...organization, role: "member" });

    expect(markup).not.toContain("Delete organization");
  });

  it("offers an owner the verified GitHub owner name update", () => {
    const markup = renderOrganizationSettings(organization, {
      status: "renamed",
      githubOwnerLogin: "samebase-labs",
    });

    expect(markup).toContain("GitHub now uses");
    expect(markup).toContain("samebase-labs</span>.");
    expect(markup).toContain("Update name");
  });

  it("shows a member the owner requirement without an update action", () => {
    const markup = renderOrganizationSettings(
      { ...organization, role: "member" },
      {
        status: "renamed",
        githubOwnerLogin: "samebase-labs",
      },
    );

    expect(markup).toContain("An organization owner must update this name.");
    expect(markup).not.toContain("Update name");
  });
});
