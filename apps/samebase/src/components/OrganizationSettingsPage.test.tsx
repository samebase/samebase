// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import type { ViewerOrganization } from "@/lib/organizationContext";
import { OrganizationSettingsPage } from "./OrganizationSettingsPage";

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
    useQuery: (reference: Parameters<typeof actual.useQuery>[0]) => {
      const functionName = getFunctionName(reference);
      if (functionName === getFunctionName(api.billing.getViewerBillingStatus)) {
        return { canStartCheckout: true, plan: "free", status: "inactive" };
      }
      if (
        functionName === getFunctionName(api.billingResourceQuotas.getViewerBillingResourceUsage)
      ) {
        return {
          cloudflareWorkers: { limit: 5, used: { count: 1, state: "exact" } },
          convexProjects: { limit: 5, used: { count: 2, state: "exact" } },
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

function renderOrganizationSettings(selectedOrganization: ViewerOrganization) {
  return renderToStaticMarkup(
    <TestRouterProvider initialEntries={["/org/samebase/settings"]}>
      <OrganizationSettingsPage organization={selectedOrganization} search={{}} />
    </TestRouterProvider>,
  );
}

describe("OrganizationSettingsPage", () => {
  it("shows organization billing in organization settings", () => {
    const markup = renderOrganizationSettings(organization);

    expect(markup).toContain("Organization settings");
    expect(markup).toContain("Billing");
    expect(markup).toContain("Current plan");
    expect(markup).toContain("Cloudflare Workers");
    expect(markup).toContain("Convex projects");
    expect(markup).not.toContain("Open billing");
    expect(markup).not.toContain("/settings/billing");
  });
});
