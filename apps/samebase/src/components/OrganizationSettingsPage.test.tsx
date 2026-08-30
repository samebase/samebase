// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { OrganizationGitHubIdentityObservation } from "@/hooks/useOrganizationGitHubIdentity";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import type { ViewerOrganization } from "@/lib/organizationContext";
import { CONVEX_EU_WEST_REGION, CONVEX_US_EAST_REGION } from "../../shared/convexDeploymentRegions";
import { OrganizationSettingsPage } from "./OrganizationSettingsPage";

const useOrganizationGitHubIdentitiesMock = vi.hoisted(() => vi.fn());
const regionTestState = vi.hoisted(() => {
  let defaultRegion: "aws-us-east-1" | "aws-eu-west-1" | null = "aws-us-east-1";
  let connectionState: "connected" | "disconnected" = "connected";
  return {
    get convexConnection() {
      return connectionState === "connected"
        ? {
            state: "connected" as const,
            teamId: "convex-team",
            teamSlug: "samebase",
            authMethod: "oauth" as const,
          }
        : {
            state: "disconnected" as const,
            teamId: "convex-team",
            teamSlug: "samebase",
          };
    },
    set connectionState(value: "connected" | "disconnected") {
      connectionState = value;
    },
    get defaultRegion() {
      return defaultRegion;
    },
    set defaultRegion(value: "aws-us-east-1" | "aws-eu-west-1" | null) {
      defaultRegion = value;
    },
    setDefault: vi.fn(async () => undefined),
  };
});

vi.mock("@/hooks/useOrganizationGitHubIdentity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useOrganizationGitHubIdentity")>();
  return {
    ...actual,
    useOrganizationGitHubIdentities: useOrganizationGitHubIdentitiesMock,
  };
});

vi.mock("@/components/useConvexDeploymentRegions", () => ({
  useConvexDeploymentRegions: () => ({
    data: {
      defaultRegion: regionTestState.defaultRegion,
      regions: [
        {
          available: true,
          displayName: "US East (N. Virginia)",
          name: "aws-us-east-1" as const,
        },
        {
          available: true,
          displayName: "EU West (Ireland)",
          name: "aws-eu-west-1" as const,
        },
      ],
    },
    error: null,
    isFetching: false,
    isPending: false,
    refetch: vi.fn(async () => undefined),
  }),
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
    useAction: (reference: Parameters<typeof actual.useAction>[0]) =>
      getFunctionName(reference) === getFunctionName(api.convexDeploymentRegions.setDefault)
        ? regionTestState.setDefault
        : vi.fn(async () => undefined),
    useQuery: (reference: Parameters<typeof actual.useQuery>[0]) => {
      const functionName = getFunctionName(reference);
      if (functionName === getFunctionName(api.convexDeploymentRegions.getDefault)) {
        return regionTestState.defaultRegion;
      }
      if (functionName === getFunctionName(api.users.getConvexConnectionStatus)) {
        return regionTestState.convexConnection;
      }
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
          vaults: [],
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
  let mountedElement: HTMLDivElement | null;
  let mountedRoot: Root | null;
  let mountedQueryClient: QueryClient | null;

  beforeEach(() => {
    regionTestState.connectionState = "connected";
    regionTestState.defaultRegion = CONVEX_US_EAST_REGION;
    regionTestState.setDefault.mockReset();
    regionTestState.setDefault.mockResolvedValue(undefined);
    mountedElement = null;
    mountedRoot = null;
    mountedQueryClient = null;
  });

  afterEach(async () => {
    if (mountedRoot) {
      await act(async () => mountedRoot?.unmount());
    }
    mountedQueryClient?.clear();
    mountedElement?.remove();
  });

  async function mountOrganizationSettings(
    selectedOrganization: ViewerOrganization,
  ): Promise<HTMLDivElement> {
    useOrganizationGitHubIdentitiesMock.mockReturnValue(
      new Map([
        [
          selectedOrganization.organizationId,
          { owner: { status: "current" as const }, vaults: [] },
        ],
      ]),
    );
    mountedElement = document.createElement("div");
    document.body.append(mountedElement);
    mountedRoot = createRoot(mountedElement);
    const queryClient = new QueryClient();
    mountedQueryClient = queryClient;
    await act(async () => {
      mountedRoot?.render(
        <QueryClientProvider client={queryClient}>
          <TestRouterProvider initialEntries={["/org/samebase/settings"]}>
            <OrganizationSettingsPage organization={selectedOrganization} search={{}} />
          </TestRouterProvider>
        </QueryClientProvider>,
      );
    });
    return mountedElement;
  }

  async function chooseRegion(container: HTMLElement, optionLabel: string): Promise<void> {
    const label = [...container.querySelectorAll("label")].find(
      (candidate) => candidate.textContent === "Default production region for new Convex projects",
    );
    const selector = label ? document.getElementById(label.htmlFor) : null;
    if (!(selector instanceof HTMLButtonElement)) {
      throw new Error("Convex production region selector was not rendered.");
    }
    await act(async () => selector.click());
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (candidate) => candidate.textContent === optionLabel,
    );
    if (!option) {
      throw new Error(`Region option ${optionLabel} was not rendered.`);
    }
    await act(async () => {
      option.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    });
    await act(async () => option.click());
  }

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
  });

  it("does not offer organization deletion to a member", () => {
    const markup = renderOrganizationSettings({ ...organization, role: "member" });

    expect(markup).not.toContain("Delete organization");
  });

  it("lets an owner save a different default production region", async () => {
    const container = await mountOrganizationSettings(organization);

    expect(container.textContent).toContain("US East (N. Virginia)");
    await chooseRegion(container, "EU West (Ireland)");
    const saveButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Save default",
    );
    expect(saveButton?.disabled).toBe(false);
    await act(async () => saveButton?.click());

    await vi.waitFor(() =>
      expect(regionTestState.setDefault).toHaveBeenCalledWith({
        deploymentRegion: CONVEX_EU_WEST_REGION,
        organizationId: organization.organizationId,
      }),
    );
  });

  it("lets an owner clear the saved default production region", async () => {
    regionTestState.defaultRegion = CONVEX_EU_WEST_REGION;
    const container = await mountOrganizationSettings(organization);

    await chooseRegion(container, "No saved default");
    const saveButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Save default",
    );
    await act(async () => saveButton?.click());

    await vi.waitFor(() =>
      expect(regionTestState.setDefault).toHaveBeenCalledWith({
        deploymentRegion: null,
        organizationId: organization.organizationId,
      }),
    );
  });

  it("lets a disconnected owner clear the saved default without a provider read", async () => {
    regionTestState.connectionState = "disconnected";
    regionTestState.defaultRegion = CONVEX_EU_WEST_REGION;
    const container = await mountOrganizationSettings(organization);

    expect(container.textContent).toContain("EU West (Ireland)");
    expect(container.textContent).toContain("Connect Convex in Providers to choose a default.");
    const clearButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Clear default",
    );
    await act(async () => clearButton?.click());

    await vi.waitFor(() =>
      expect(regionTestState.setDefault).toHaveBeenCalledWith({
        deploymentRegion: null,
        organizationId: organization.organizationId,
      }),
    );
  });

  it("shows a member the saved default without an edit control", () => {
    regionTestState.defaultRegion = CONVEX_EU_WEST_REGION;
    const markup = renderOrganizationSettings({ ...organization, role: "member" });

    expect(markup).toContain("EU West (Ireland)");
    expect(markup).not.toContain("Save default");
    expect(markup).not.toContain('role="combobox"');
    expect(regionTestState.setDefault).not.toHaveBeenCalled();
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
