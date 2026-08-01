import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  type VaultFolderCallbacks,
  type VaultFolderState,
  VaultOverviewSidebar,
} from "./VaultOverviewSidebar";

const FOLDER_CALLBACKS = {
  onDeleteVaultFolder: async () => {},
  onMoveVaultFolder: async () => {},
  onMoveVaultToFolder: async () => {},
  onRenameVaultFolder: async () => {},
  onSetVaultFolderCollapsed: async () => {},
} satisfies VaultFolderCallbacks;

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

function renderSidebar(
  args: Omit<
    Parameters<typeof VaultOverviewSidebar>[0],
    keyof VaultFolderCallbacks | "folderState"
  > & {
    folderState?: VaultFolderState;
  },
) {
  return renderToStaticMarkup(
    <TestRouterProvider initialEntries={["/vault/samebase/active"]}>
      <VaultOverviewSidebar
        {...FOLDER_CALLBACKS}
        {...args}
        folderState={args.folderState ?? { assignments: [], folders: [] }}
      />
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
    expect(markup).not.toContain('aria-label="Actions for samebase/active"');
    expect(markup).not.toContain("Ungrouped");
  });

  it("orders Ungrouped before folders and signals failures hidden by collapse", () => {
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

    expect(markup).toContain("Ungrouped");
    expect(markup).toContain("Fixtures");
    expect(markup).toContain("Active");
    const ungroupedPosition = markup.indexOf("Ungrouped");
    const fixturesPosition = markup.indexOf("Fixtures");
    const activePosition = markup.indexOf("Active");
    expect(ungroupedPosition).toBeLessThan(fixturesPosition);
    expect(fixturesPosition).toBeLessThan(activePosition);
    expect(ungroupedPosition).toBeLessThan(activePosition);
    expect(markup).toContain('aria-label="Fixtures has hidden failures"');
    expect(markup).not.toContain("samebase/fixture, Needs attention");
    expect(markup).toContain("samebase/active, Loading checks");
    expect(markup).toContain("samebase/other, Loading checks");
  });

  it("does not render Ungrouped when every vault is assigned", () => {
    const active = vault("active", fakeVaultId("vault-active"));
    const fixture = vault("fixture", fakeVaultId("vault-fixture"));
    const activeId = fakeFolderId("folder-active");
    const fixturesId = fakeFolderId("folder-fixtures");
    const markup = renderSidebar({
      folderState: {
        assignments: [
          { folderId: activeId, vaultId: active._id },
          { folderId: fixturesId, vaultId: fixture._id },
        ],
        folders: [
          { _id: activeId, collapsed: false, name: "Active", position: 0 },
          { _id: fixturesId, collapsed: false, name: "Fixtures", position: 1 },
        ],
      },
      page: "overview",
      selectedVaultId: active._id,
      sidebarSummaries: { state: "loading" },
      vaults: [active, fixture],
      workspace: null,
    });

    expect(markup).toContain('aria-label="Active"');
    expect(markup).toContain('aria-label="Fixtures"');
    expect(markup).not.toContain('aria-label="Ungrouped"');
  });

  it("uses the collapsed folder as the selected vault proxy and hides every vault row", () => {
    const active = vault("active", fakeVaultId("vault-active"));
    const fixture = vault("fixture", fakeVaultId("vault-fixture"), {
      status: "failed",
      message: "Failed",
      runId: fakeRunId("run-fixture"),
      step: "sync_tree",
      updatedAt: 1,
    });
    const markup = renderSidebar({
      folderState: {
        assignments: [
          { folderId: fakeFolderId("folder-active"), vaultId: active._id },
          { folderId: fakeFolderId("folder-active"), vaultId: fixture._id },
        ],
        folders: [
          { _id: fakeFolderId("folder-active"), collapsed: true, name: "Active", position: 0 },
        ],
      },
      page: "overview",
      selectedVaultId: active._id,
      sidebarSummaries: { state: "loading" },
      vaults: [active, fixture],
      workspace: null,
    });

    expect(markup).toContain('aria-label="Expand Active"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-label="Active, contains current vault"');
    expect(markup).toContain("flex min-w-0 items-center bg-muted px-1 py-1");
    expect(markup).toContain('aria-label="Active has hidden failures"');
    expect(markup).not.toContain("samebase/active, Loading checks");
    expect(markup).not.toContain("samebase/fixture, Needs attention");
    expect(markup).not.toContain('aria-current="page"');
  });
});
