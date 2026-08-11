// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
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

function fakeOrganizationDeletionRunId(value: string): Id<"workflow_organizationDeletion_runs"> {
  // @ts-expect-error Convex ids are strings at runtime; this test only needs
  // a stable value for component arguments.
  return value;
}

let deletionState: "eligible" | "running" | "missing" = "eligible";

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: () => vi.fn(async () => undefined),
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
      if (functionName === getFunctionName(api.organizationDeletion.index.settings)) {
        if (deletionState === "missing") {
          return null;
        }
        return {
          organizationId: fakeOrganizationId("organization_samebase"),
          githubOwnerLogin: "samebase",
          confirmationPhrase: "delete samebase",
          deletion:
            deletionState === "eligible"
              ? { state: "eligible" }
              : {
                  state: "running",
                  runId: fakeOrganizationDeletionRunId("organization_deletion_run"),
                  currentStep: "delete_samebase_data",
                  requestedAt: 1,
                  latestProgressAt: 2,
                },
        };
      }
      throw new Error(`Unexpected query: ${functionName}`);
    },
  };
});

const organization = {
  canCreateRepository: true,
  deletionState: "not_deleting" as const,
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
  beforeEach(() => {
    deletionState = "eligible";
  });

  it("shows organization billing in organization settings", () => {
    const markup = renderOrganizationSettings(organization);

    expect(markup).toContain("Organization settings");
    expect(markup).toContain("Billing");
    expect(markup).toContain("Current plan");
    expect(markup).toContain("Connections");
    expect(markup).toContain("3 of 6");
    expect(markup).not.toContain("Open billing");
    expect(markup).not.toContain("/settings/billing");
  });

  it("stops billing reads after organization deletion starts", () => {
    deletionState = "running";

    const markup = renderOrganizationSettings(organization);

    expect(markup).toContain("Samebase is deleting this organization.");
    expect(markup).not.toContain(">Billing<");
    expect(markup).not.toContain("Current plan");
  });

  it("does not restart billing reads after organization deletion finishes", () => {
    deletionState = "missing";

    const markup = renderOrganizationSettings(organization);

    expect(markup).not.toContain(">Billing<");
    expect(markup).not.toContain("Current plan");
  });
});
