// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { TestRouterProvider } from "@/test/TestRouterProvider";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { type VaultFolderCallbacks, VaultOverviewSidebar } from "./VaultOverviewSidebar";
import { VaultFolderCreateButton, type VaultFolderCreate } from "./VaultFolderCreateButton";

const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/ui/use-toast", () => ({ toast: toastMock }));
vi.mock("./VaultFolderDialog", () => ({
  VaultFolderDialog: ({ onCreate }: { onCreate?: (name: string) => Promise<unknown> }) =>
    onCreate ? (
      <button type="button" onClick={() => void onCreate("Projects")}>
        Submit new folder
      </button>
    ) : null,
}));

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

function fakeOrganizationId(): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; the test needs a stable id.
  return "organization-samebase";
}

function fakeFolderId(value: string): Id<"ui_vaultFolders"> {
  // @ts-expect-error Convex ids are strings at runtime; the test needs stable ids.
  return value;
}

function makeVault(): UserVaultResult {
  return {
    _id: fakeVaultId("vault-active"),
    organizationId: fakeOrganizationId(),
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
            folders: [
              {
                _id: folderId,
                collapsed: true,
                name: "Fixtures",
                organizationId: active.organizationId,
                position: 0,
              },
            ],
          }}
          organizationId={active.organizationId}
          page="overview"
          selectedVaultId={null}
          showOwner
          sidebarSummaries={{ state: "loading" }}
          vaults={[active]}
          workspace={null}
        />
      </TestRouterProvider>,
    );
  });

  return rootElement;
}

async function renderHeader(onCreateVaultFolder: VaultFolderCreate) {
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);

  await act(async () => {
    root?.render(
      <VaultFolderCreateButton
        organizationId={fakeOrganizationId()}
        organizationName="samebase"
        onCreateVaultFolder={onCreateVaultFolder}
      />,
    );
  });

  return rootElement;
}

describe("VaultOverviewSidebar direct folder actions", () => {
  it("toggles the folder when its name is clicked", async () => {
    const onSetVaultFolderCollapsed = vi.fn(async () => {});
    const container = await renderSidebar(folderCallbacks(onSetVaultFolderCollapsed));
    const collapseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand Fixtures, 1 vault"]',
    );
    const folderName = [...(collapseButton?.querySelectorAll("span") ?? [])].find(
      (span) => span.textContent === "Fixtures",
    );
    if (!folderName) {
      throw new Error("Folder name button content not found");
    }

    await act(async () => folderName.click());

    expect(onSetVaultFolderCollapsed).toHaveBeenCalledWith({
      collapsed: false,
      folderId: fakeFolderId("folder-active"),
    });
  });

  it("locks a collapse action until its request completes", async () => {
    const request = deferred();
    const onSetVaultFolderCollapsed = vi.fn(async () => request.promise);
    const container = await renderSidebar(folderCallbacks(onSetVaultFolderCollapsed));
    const collapseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand Fixtures, 1 vault"]',
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
      'button[aria-label="Expand Fixtures, 1 vault"]',
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

describe("VaultFolderCreateButton", () => {
  it("creates an empty folder from the header action", async () => {
    const onCreateVaultFolder = vi.fn(async () => {});
    const container = await renderHeader(onCreateVaultFolder);
    const newFolderButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="New folder for samebase"]',
    );
    if (!newFolderButton) {
      throw new Error("New folder button not found");
    }

    await act(async () => newFolderButton.click());
    const submitButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Submit new folder",
    );
    if (!submitButton) {
      throw new Error("New folder dialog not found");
    }

    await act(async () => submitButton.click());

    expect(onCreateVaultFolder).toHaveBeenCalledTimes(1);
    expect(onCreateVaultFolder).toHaveBeenCalledWith({
      name: "Projects",
      organizationId: fakeOrganizationId(),
    });
  });
});
