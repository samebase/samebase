// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { NewAppPage } from "./NewAppPage";

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
      const name = getFunctionName(reference);
      if (name === getFunctionName(api.users.getConvexConnectionStatus)) {
        return { connected: true };
      }
      if (name === getFunctionName(api.users.getCloudflareConnectionStatus)) {
        return { accountId: "cloudflare-account", connected: true };
      }
      return undefined;
    },
  };
});

vi.mock("@/components/vault-dashboard/VaultDashboardCloudflareAccountDialog", () => ({
  VaultDashboardCloudflareAccountDialog: () => null,
}));

describe("NewAppPage", () => {
  it("sends a blocked personal owner to Account settings for authorization", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/org/nicubunu/new-app"]}>
        <NewAppPage
          organization={{
            canCreateRepository: false,
            githubOwnerId: "123",
            githubOwnerLogin: "nicubunu",
            githubOwnerType: "user",
            organizationId: fakeOrganizationId("organization_nicubunu"),
            role: "owner",
          }}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain("Authorize nicubunu");
    expect(markup).toContain('href="/settings"');
    expect(markup).toContain("Account settings");
    expect(markup).not.toContain("Install GitHub App");
  });
});
