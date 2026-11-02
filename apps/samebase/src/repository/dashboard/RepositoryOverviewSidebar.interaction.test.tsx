// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { TestRouterProvider } from "@/test/TestRouterProvider";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import {
  type RepositoryFolderCallbacks,
  RepositoryOverviewSidebar,
} from "./RepositoryOverviewSidebar";
import {
  RepositoryFolderCreateButton,
  type RepositoryFolderCreate,
} from "./RepositoryFolderCreateButton";

const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/ui/use-toast", () => ({ toast: toastMock }));
vi.mock("./RepositoryFolderDialog", () => ({
  RepositoryFolderDialog: ({
    onCreate,
    onDelete,
    onRename,
  }: {
    onCreate?: (name: string) => Promise<unknown>;
    onDelete?: () => Promise<unknown>;
    onRename?: (name: string) => Promise<unknown>;
  }) => (
    <>
      {onCreate ? (
        <button type="button" onClick={() => void onCreate("Projects")}>
          Submit new folder
        </button>
      ) : null}
      {onRename ? (
        <button type="button" onClick={() => void onRename("Renamed fixtures")}>
          Submit renamed folder
        </button>
      ) : null}
      {onDelete ? (
        <button type="button" onClick={() => void onDelete()}>
          Confirm folder deletion
        </button>
      ) : null}
    </>
  ),
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

function fakeRepositoryId(value: string): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; the test needs stable ids.
  return value;
}

function fakeOrganizationId(): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; the test needs a stable id.
  return "organization-samebase";
}

function fakeFolderId(value: string): Id<"ui_repositoryTree_folders"> {
  // @ts-expect-error Convex ids are strings at runtime; the test needs stable ids.
  return value;
}

function makeRepository(name = "active"): UserRepositoryResult {
  return {
    repositoryId: fakeRepositoryId(`repository-${name}`),
    organizationId: fakeOrganizationId(),
    convexTeamId: "team-acme-platform",
    cloudflareAccountId: "account-acme-production",
    cloudflareWorkers: [],
    convexProjects: [],
    defaultBranch: "main",
    deletion: { state: "not_deleting", deleteAction: { state: "available" } },
    fileCount: 1,
    githubRepositoryName: name,
    githubOwnerLogin: "samebase",
    hasCloudflareProvision: false,
    hasConnectedGitHubRepository: true,
    hasConvexProvision: false,
    isSamebaseManaged: true,
    providerPlan: null,
    providerSetup: { status: "ready" },
    providerWrite: { status: "idle", lastWriteAt: {} },
    githubRepositoryFullName: `samebase/${name}`,
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
  overrides: Partial<RepositoryFolderCallbacks> = {},
): RepositoryFolderCallbacks {
  return {
    onDeleteRepositoryFolder: async () => {},
    onMoveRepositoryFolder: async () => {},
    onMoveRepositoryToFolder: async () => {},
    onRenameRepositoryFolder: async () => {},
    onSetRepositoryFolderCollapsed: async () => {},
    ...overrides,
  };
}

async function renderSidebar(callbacks: RepositoryFolderCallbacks) {
  const active = makeRepository();
  const unfiled = makeRepository("unfiled");
  const folderId = fakeFolderId("folder-active");
  const secondFolderId = fakeFolderId("folder-later");
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);

  await act(async () => {
    root?.render(
      <TestRouterProvider initialEntries={["/repo/samebase/active"]}>
        <RepositoryOverviewSidebar
          {...callbacks}
          folderState={{
            assignments: [{ folderId, repositoryId: active.repositoryId }],
            folders: [
              {
                _id: folderId,
                collapsed: true,
                name: "Fixtures",
                organizationId: active.organizationId,
                position: 0,
              },
              {
                _id: secondFolderId,
                collapsed: true,
                name: "Later",
                organizationId: active.organizationId,
                position: 1,
              },
            ],
          }}
          organizationId={active.organizationId}
          page="overview"
          selectedRepositoryId={null}
          sidebarSummaries={{ state: "loading" }}
          repositories={[active, unfiled]}
          workspace={null}
        />
      </TestRouterProvider>,
    );
  });

  return rootElement;
}

async function clickButtonWithLabel(container: ParentNode, label: string) {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  await act(async () => button.click());
}

async function clickMenuItem(label: string) {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (candidate) => candidate.textContent.trim() === label,
  );
  if (!item) {
    throw new Error(`Menu item not found: ${label}`);
  }

  await act(async () => item.click());
}

async function clickButtonWithText(container: ParentNode, label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent.trim() === label,
  );
  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  await act(async () => button.click());
}

async function renderHeader(onCreateRepositoryFolder: RepositoryFolderCreate) {
  rootElement = document.createElement("div");
  document.body.append(rootElement);
  root = createRoot(rootElement);

  await act(async () => {
    root?.render(
      <RepositoryFolderCreateButton
        organizationId={fakeOrganizationId()}
        organizationName="samebase"
        onCreateRepositoryFolder={onCreateRepositoryFolder}
      />,
    );
  });

  return rootElement;
}

describe("RepositoryOverviewSidebar direct folder actions", () => {
  it("toggles the folder when its name is clicked", async () => {
    const onSetRepositoryFolderCollapsed = vi.fn(async () => {});
    const container = await renderSidebar(folderCallbacks({ onSetRepositoryFolderCollapsed }));
    const collapseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand Fixtures, 1 repository"]',
    );
    const folderName = [...(collapseButton?.querySelectorAll("span") ?? [])].find(
      (span) => span.textContent === "Fixtures",
    );
    if (!folderName) {
      throw new Error("Folder name button content not found");
    }

    await act(async () => folderName.click());

    expect(onSetRepositoryFolderCollapsed).toHaveBeenCalledWith({
      collapsed: false,
      folderId: fakeFolderId("folder-active"),
    });
  });

  it("locks a collapse action until its request completes", async () => {
    const request = deferred();
    const onSetRepositoryFolderCollapsed = vi.fn(async () => request.promise);
    const container = await renderSidebar(folderCallbacks({ onSetRepositoryFolderCollapsed }));
    const collapseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand Fixtures, 1 repository"]',
    );
    if (!collapseButton) {
      throw new Error("Expand folder button not found");
    }

    await act(async () => {
      collapseButton.click();
      collapseButton.click();
      await Promise.resolve();
    });

    expect(onSetRepositoryFolderCollapsed).toHaveBeenCalledTimes(1);
    expect(collapseButton.hasAttribute("disabled")).toBe(true);

    await act(async () => request.resolve());
  });

  it("reports a direct action failure", async () => {
    const onSetRepositoryFolderCollapsed = vi.fn(async () =>
      Promise.reject(new Error("Folder could not be updated.")),
    );
    const container = await renderSidebar(folderCallbacks({ onSetRepositoryFolderCollapsed }));
    const collapseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand Fixtures, 1 repository"]',
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
      title: "Could not update repository folders",
      variant: "destructive",
    });
  });

  it("renames a folder from its action menu", async () => {
    const onRenameRepositoryFolder = vi.fn(async () => {});
    const container = await renderSidebar(folderCallbacks({ onRenameRepositoryFolder }));

    await clickButtonWithLabel(container, "Actions for folder Fixtures");
    await clickMenuItem("Rename");
    await clickButtonWithText(container, "Submit renamed folder");

    expect(onRenameRepositoryFolder).toHaveBeenCalledWith({
      folderId: fakeFolderId("folder-active"),
      name: "Renamed fixtures",
    });
  });

  it("moves folders in both available directions from their action menus", async () => {
    const onMoveRepositoryFolder = vi.fn(async () => {});
    const container = await renderSidebar(folderCallbacks({ onMoveRepositoryFolder }));

    await clickButtonWithLabel(container, "Actions for folder Fixtures");
    await clickMenuItem("Move down");
    await clickButtonWithLabel(container, "Actions for folder Later");
    await clickMenuItem("Move up");

    expect(onMoveRepositoryFolder).toHaveBeenNthCalledWith(1, {
      direction: "down",
      folderId: fakeFolderId("folder-active"),
    });
    expect(onMoveRepositoryFolder).toHaveBeenNthCalledWith(2, {
      direction: "up",
      folderId: fakeFolderId("folder-later"),
    });
  });

  it("deletes a folder from its action menu", async () => {
    const onDeleteRepositoryFolder = vi.fn(async () => {});
    const container = await renderSidebar(folderCallbacks({ onDeleteRepositoryFolder }));

    await clickButtonWithLabel(container, "Actions for folder Fixtures");
    await clickMenuItem("Delete");
    await clickButtonWithText(container, "Confirm folder deletion");

    expect(onDeleteRepositoryFolder).toHaveBeenCalledWith({
      folderId: fakeFolderId("folder-active"),
    });
  });

  it("moves an unfiled repository into a folder from its action menu", async () => {
    const onMoveRepositoryToFolder = vi.fn(async () => {});
    const container = await renderSidebar(folderCallbacks({ onMoveRepositoryToFolder }));

    await clickButtonWithLabel(container, "Actions for samebase/unfiled");
    await clickMenuItem("Move to folder");
    await clickMenuItem("Later");

    expect(onMoveRepositoryToFolder).toHaveBeenCalledWith({
      folderId: fakeFolderId("folder-later"),
      repositoryId: fakeRepositoryId("repository-unfiled"),
    });
  });
});

describe("RepositoryFolderCreateButton", () => {
  it("creates an empty folder from the header action", async () => {
    const onCreateRepositoryFolder = vi.fn(async () => {});
    const container = await renderHeader(onCreateRepositoryFolder);
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

    expect(onCreateRepositoryFolder).toHaveBeenCalledTimes(1);
    expect(onCreateRepositoryFolder).toHaveBeenCalledWith({
      name: "Projects",
      organizationId: fakeOrganizationId(),
    });
  });
});
