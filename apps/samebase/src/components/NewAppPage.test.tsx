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
        return {
          authMethod: "oauth",
          state: "connected",
          teamId: "team-acme-platform",
          teamSlug: "acme-platform",
        };
      }
      if (name === getFunctionName(api.users.getCloudflareConnectionStatus)) {
        return {
          accountId: "account-acme-production",
          accountName: "acme-production",
          authMethod: "oauth",
          state: "connected",
        };
      }
      return undefined;
    },
  };
});

describe("NewAppPage", () => {
  it("sends a blocked personal owner to the selected Providers page for authorization", () => {
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

    expect(markup).toContain("Authorize repository creation for nicubunu");
    expect(markup).toContain('href="/org/nicubunu/providers"');
    expect(markup).toContain("Providers");
    expect(markup).not.toContain("Install GitHub App");
  });
});
