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

function fakeFolderId(value: string): Id<"ui_vaultFolders"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs stable ids.
  return value;
}

function fakeRunId(value: string): Id<"workflow_vaultProvisioning_runs"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs stable ids.
  return value;
}

function vault(
  name: string,
  id: Id<"vaults">,
  sourceSetup: UserVaultResult["sourceSetup"] = { status: "ready" },
) {
  return {
    _id: id,
    ghRepoOwner: "samebase",
    ghRepoName: name,
    repositoryFullName: `samebase/${name}`,
    defaultBranch: "main",
    fileCount: 1,
    sourceSetup,
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
  } satisfies UserVaultResult;
}

function renderSidebar(args: Parameters<typeof VaultOverviewSidebar>[0]) {
  return renderToStaticMarkup(
    <TestRouterProvider initialEntries={["/vault/samebase/active"]}>
      <VaultOverviewSidebar {...args} />
    </TestRouterProvider>,
  );
}

describe("VaultOverviewSidebar folders", () => {
  it("keeps the flat list when the user has no folders", () => {
    const markup = renderSidebar({
      page: "overview",
      selectedVaultId: null,
      sidebarSummaries: { state: "loading" },
      vaults: [vault("active", fakeVaultId("vault-active"))],
      workspace: null,
    });

    expect(markup).toContain("samebase/active");
    expect(markup).toContain('aria-label="Actions for samebase/active"');
    expect(markup).not.toContain("Ungrouped");
  });

  it("orders folders before Ungrouped and signals failures hidden by collapse", () => {
    const fixtureVaults = [
      vault("fixture", fakeVaultId("vault-fixture"), {
        status: "failed",
        message: "Failed",
        runId: fakeRunId("run-fixture"),
        step: "sync_tree",
        updatedAt: 1,
      }),
      vault("active", fakeVaultId("vault-active")),
      vault("other", fakeVaultId("vault-other")),
    ];
    const fixturesId = fakeFolderId("folder-fixtures");
    const activeId = fakeFolderId("folder-active");
    const markup = renderSidebar({
      folderState: {
        assignments: [
          { folderId: fixturesId, vaultId: fixtureVaults[0]._id },
          { folderId: activeId, vaultId: fixtureVaults[1]._id },
        ],
        folders: [
          { _id: fixturesId, collapsed: true, name: "Fixtures", position: 0 },
          { _id: activeId, collapsed: false, name: "Active", position: 1 },
        ],
      },
      page: "overview",
      selectedVaultId: fixtureVaults[1]._id,
      sidebarSummaries: { state: "loading" },
      vaults: fixtureVaults,
      workspace: null,
    });

    expect(markup.indexOf("Fixtures")).toBeLessThan(markup.indexOf("Active"));
    expect(markup.indexOf("Active")).toBeLessThan(markup.indexOf("Ungrouped"));
    expect(markup).toContain('aria-label="Fixtures has hidden failures"');
    expect(markup).not.toContain("samebase/fixture, Needs attention");
    expect(markup).toContain("samebase/active, Loading checks");
    expect(markup).toContain("samebase/other, Loading checks");
  });

  it("opens a selected collapsed folder without calling a mutation", () => {
    const active = vault("active", fakeVaultId("vault-active"));
    const markup = renderSidebar({
      folderState: {
        assignments: [{ folderId: fakeFolderId("folder-active"), vaultId: active._id }],
        folders: [
          { _id: fakeFolderId("folder-active"), collapsed: true, name: "Active", position: 0 },
        ],
      },
      page: "overview",
      selectedVaultId: active._id,
      sidebarSummaries: { state: "loading" },
      vaults: [active],
      workspace: null,
    });

    expect(markup).toContain('aria-label="Collapse Active"');
    expect(markup).toContain("samebase/active, Loading checks");
  });
});
