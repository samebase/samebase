import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultOverviewSidebar } from "./VaultOverviewSidebar";

function fakeVaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs stable ids.
  return value;
}

function fakeOrganizationId(): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs a stable id.
  return "organization-samebase";
}

function vault(name: string, id: Id<"vaults">): UserVaultResult {
  return {
    _id: id,
    organizationId: fakeOrganizationId(),
    ghRepoOwner: "samebase",
    ghRepoName: name,
    repositoryFullName: `samebase/${name}`,
    defaultBranch: "main",
    fileCount: 1,
    sourceSetup: { status: "ready" },
    providerSetup: { status: "ready" },
    providerPlan: null,
    providerWrite: { status: "idle", lastWriteAt: {} },
    deletion: { state: "not_deleting", deleteAction: { state: "available" } },
    isSamebaseManaged: true,
    hasConnectedGitHubRepository: true,
    hasConvexProvision: false,
    hasCloudflareProvision: false,
    canRemoveConvexProvision: false,
    canRemoveCloudflareProvision: false,
    cloudflareWorkers: [],
    convexProjects: [],
  };
}

describe("VaultOverviewSidebar", () => {
  it("keeps the supplied vault order and has no personal folder controls", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/samebase/active"]}>
        <VaultOverviewSidebar
          page="overview"
          selectedVaultId={null}
          sidebarSummaries={{ state: "loading" }}
          vaults={[
            vault("second", fakeVaultId("vault-second")),
            vault("first", fakeVaultId("vault-first")),
          ]}
          workspace={null}
        />
      </TestRouterProvider>,
    );

    expect(markup.indexOf("samebase/second")).toBeLessThan(markup.indexOf("samebase/first"));
    expect(markup).not.toContain("New folder");
    expect(markup).not.toContain("Move to folder");
    expect(markup).not.toContain("Ungrouped");
  });

  it("marks the selected vault without hiding it", () => {
    const selectedVault = vault("active", fakeVaultId("vault-active"));
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/vault/samebase/active"]}>
        <VaultOverviewSidebar
          page="overview"
          selectedVaultId={selectedVault._id}
          sidebarSummaries={{ state: "loading" }}
          vaults={[selectedVault]}
          workspace={null}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("samebase/active, Loading checks");
  });
});
