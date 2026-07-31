// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { TestRouterProvider } from "@/test/TestRouterProvider";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { type VaultFolderCallbacks, VaultOverviewSidebar } from "./VaultOverviewSidebar";

const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/ui/use-toast", () => ({ toast: toastMock }));

let root: Root | null = null;
let rootElement: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  rootElement?.remove();
  rootElement = null;
  toastMock.mockReset();
});

function fakeVaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; the test needs stable ids.
  return value;
}

function fakeFolderId(value: string): Id<"ui_vaultFolders"> {
  // @ts-expect-error Convex ids are strings at runtime; the test needs stable ids.
  return value;
}

function makeVault(): UserVaultResult {
  return {
    _id: fakeVaultId("vault-active"),
    canRemoveCloudflareProvision: false,
    canRemoveConvexProvision: false,
    cloudflareWorkers: [],
    convexProjects: [],
    defaultBranch: "main",
    deletion: { state: "not_deleting", deleteAction: { state: "available" } },
    fileCount: 1,
    ghRepoName: "active",
    ghRepoOwner: "samebase",
    hasCloudflareProvision: false,
    hasConnectedGitHubRepository: true,
    hasConvexProvision: false,
    isSamebaseManaged: true,
    providerPlan: null,
    providerSetup: { status: "ready" },
    providerWrite: { status: "idle", lastWriteAt: {} },
    repositoryFullName: "samebase/active",
    sourceSetup: { status: "ready" },
  };
}

function deferred() {
  let resolve: (() => void) | null = null;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: () => resolve?.() };
}

function folderCallbacks(
  onSetVaultFolderCollapsed: VaultFolderCallbacks["onSetVaultFolderCollapsed"],
): VaultFolderCallbacks {
  return {
    onCreateVaultFolder: async () => {},
    onDeleteVaultFolder: async () => {},
    onMoveVaultFolder: async () => {},
    onMoveVaultToFolder: async () => {},
    onRenameVaultFolder: async () => {},
    onSetVaultFolderCollapsed,
  };
}

async function renderSidebar(callbacks: VaultFolderCallbacks) {
  const active = makeVault();
  const folderId = fakeFolderId("folder-active");
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);

  await act(async () => {
    root?.render(
      <TestRouterProvider initialEntries={["/vault/samebase/active"]}>
        <VaultOverviewSidebar
          {...callbacks}
          folderState={{
            assignments: [{ folderId, vaultId: active._id }],
            folders: [{ _id: folderId, collapsed: true, name: "Fixtures", position: 0 }],
          }}
          page="overview"
          selectedVaultId={null}
          sidebarSummaries={{ state: "loading" }}
          vaults={[active]}
          workspace={null}
        />
      </TestRouterProvider>,
    );
  });

  return rootElement;
}

describe("VaultOverviewSidebar direct folder actions", () => {
  it("locks a collapse action until its request completes", async () => {
    const request = deferred();
    const onSetVaultFolderCollapsed = vi.fn(async () => request.promise);
    const container = await renderSidebar(folderCallbacks(onSetVaultFolderCollapsed));
    const collapseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand Fixtures"]',
    );
    if (!collapseButton) {
      throw new Error("Expand folder button not found");
    }

    await act(async () => {
      collapseButton.click();
      collapseButton.click();
      await Promise.resolve();
    });

    expect(onSetVaultFolderCollapsed).toHaveBeenCalledTimes(1);
    expect(collapseButton.hasAttribute("disabled")).toBe(true);

    await act(async () => request.resolve());
  });

  it("reports a direct action failure", async () => {
    const onSetVaultFolderCollapsed = vi.fn(async () =>
      Promise.reject(new Error("Folder could not be updated.")),
    );
    const container = await renderSidebar(folderCallbacks(onSetVaultFolderCollapsed));
    const collapseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand Fixtures"]',
    );
    if (!collapseButton) {
      throw new Error("Expand folder button not found");
    }

    await act(async () => {
      collapseButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toastMock).toHaveBeenCalledWith({
      description: "Folder could not be updated.",
      title: "Could not update vault folders",
      variant: "destructive",
    });
  });
});
