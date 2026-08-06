// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
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
    useAction: () => vi.fn(async () => ({ status: "connected" })),
    useMutation: () => vi.fn(async () => "https://github.com/apps/samebase/installations/new"),
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
      <OrganizationSettingsPage organization={selectedOrganization} />
    </TestRouterProvider>,
  );
}

describe("OrganizationSettingsPage", () => {
  it("links organization settings to its scoped billing route", () => {
    const markup = renderOrganizationSettings(organization);

    expect(markup).toContain("Organization settings");
    expect(markup).toContain('href="/org/samebase/settings/billing"');
    expect(markup).toContain("Open billing");
  });

  it("keeps GitHub App reconnection owner-only", () => {
    const ownerMarkup = renderOrganizationSettings(organization);
    const memberMarkup = renderOrganizationSettings({ ...organization, role: "member" });

    expect(ownerMarkup).toContain("Reconnect GitHub App");
    expect(memberMarkup).not.toContain("Reconnect GitHub App");
    expect(memberMarkup).toContain("Open billing");
  });
});
