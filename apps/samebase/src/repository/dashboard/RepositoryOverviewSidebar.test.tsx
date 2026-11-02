// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import type {
  RepositoryFolderState,
  RepositoryOrganization,
  RepositoryOrganizationTreeSettings,
} from "./repositoryWorkspaceModel";
import {
  type RepositoryFolderCallbacks,
  RepositoryOverviewOrganizationSidebar,
  RepositoryOverviewSidebar,
} from "./RepositoryOverviewSidebar";

vi.mock("@/organization/useOrganizationGitHubIdentity", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/organization/useOrganizationGitHubIdentity")>();
  return {
    ...actual,
    useOrganizationGitHubIdentities: () => new Map(),
  };
});

const FOLDER_CALLBACKS = {
  onDeleteRepositoryFolder: async () => {},
  onMoveRepositoryFolder: async () => {},
  onMoveRepositoryToFolder: async () => {},
  onRenameRepositoryFolder: async () => {},
  onSetRepositoryFolderCollapsed: async () => {},
} satisfies RepositoryFolderCallbacks;

const EMPTY_FOLDER_STATE = {
  assignments: [],
  folders: [],
} satisfies RepositoryFolderState;

function fakeRepositoryId(value: string): Id<"repositories"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs stable ids.
  return value;
}

function fakeOrganizationId(value = "organization-samebase"): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs a stable id.
  return value;
}

function fakeFolderId(value: string): Id<"ui_repositoryTree_folders"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs stable ids.
  return value;
}

function repository(
  name: string,
  id: Id<"repositories">,
  organizationId = fakeOrganizationId(),
  owner = "samebase",
): UserRepositoryResult {
  return {
    repositoryId: id,
    cloudflareAccountId: "account-acme-production",
    convexTeamId: "team-acme-platform",
    organizationId,
    githubOwnerLogin: owner,
    githubRepositoryName: name,
    githubRepositoryFullName: `${owner}/${name}`,
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
    cloudflareWorkers: [],
    convexProjects: [],
  };
}

function organization(
  githubOwnerLogin: string,
  organizationId: Id<"organizations">,
  githubOwnerType: RepositoryOrganization["githubOwnerType"] = "organization",
): RepositoryOrganization {
  return {
    canCreateRepository: true,
    githubOwnerId: `github-owner-${githubOwnerLogin}`,
    githubOwnerLogin,
    githubOwnerType,
    organizationId,
    role: "owner",
  };
}

describe("RepositoryOverviewSidebar", () => {
  it("links a repository rename warning to Repository Settings", () => {
    const organizationId = fakeOrganizationId();
    const renamedRepository = repository(
      "agent-plugins",
      fakeRepositoryId("repository-plugin"),
      organizationId,
    );
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/samebase/agent-plugins"]}>
        <RepositoryOverviewSidebar
          {...FOLDER_CALLBACKS}
          folderState={EMPTY_FOLDER_STATE}
          githubIdentity={{
            owner: { status: "current" },
            repositories: [
              {
                status: "renamed",
                repositoryId: renamedRepository.repositoryId,
                repositoryName: "plugin",
                update: "available",
              },
            ],
          }}
          organizationId={organizationId}
          page="overview"
          selectedRepositoryId={renamedRepository.repositoryId}
          sidebarSummaries={{ state: "loading" }}
          repositories={[renamedRepository]}
          workspace={null}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('href="/repo/samebase/agent-plugins"');
    expect(markup).toContain('aria-label="samebase/agent-plugins, Loading checks"');
    expect(markup).toContain('data-repository-status="Loading checks"');
    expect(markup).not.toContain('data-repository-status="Repository name changed"');
    expect(markup).toContain(
      'aria-label="Repository name changed for samebase/agent-plugins. Open settings"',
    );
    expect(markup).toContain('href="/repo/samebase/agent-plugins/settings"');
  });

  it("keeps the supplied repository order when the organization has no folders", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/samebase/active"]}>
        <RepositoryOverviewSidebar
          {...FOLDER_CALLBACKS}
          folderState={EMPTY_FOLDER_STATE}
          organizationId={fakeOrganizationId()}
          page="overview"
          selectedRepositoryId={null}
          sidebarSummaries={{ state: "loading" }}
          repositories={[
            repository("second", fakeRepositoryId("repository-second")),
            repository("first", fakeRepositoryId("repository-first")),
          ]}
          workspace={null}
        />
      </TestRouterProvider>,
    );

    expect(markup.indexOf("samebase/second")).toBeLessThan(markup.indexOf("samebase/first"));
    expect(markup).not.toContain("New folder");
    expect(markup).not.toContain("Move to folder");
    expect(markup).not.toContain("Unfiled");
  });

  it("shows empty folders only in their organization", () => {
    const samebaseOrganizationId = fakeOrganizationId();
    const otherOrganizationId = fakeOrganizationId("organization-other");
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo"]}>
        <RepositoryOverviewSidebar
          {...FOLDER_CALLBACKS}
          folderState={{
            assignments: [],
            folders: [
              {
                _id: fakeFolderId("folder-fixtures"),
                collapsed: false,
                name: "Fixtures",
                organizationId: samebaseOrganizationId,
                position: 0,
              },
              {
                _id: fakeFolderId("folder-private"),
                collapsed: false,
                name: "Private",
                organizationId: otherOrganizationId,
                position: 0,
              },
            ],
          }}
          organizationId={samebaseOrganizationId}
          page="overview"
          selectedRepositoryId={null}
          sidebarSummaries={{ state: "loading" }}
          repositories={[]}
          workspace={null}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('aria-label="Collapse Fixtures"');
    expect(markup).toContain("Fixtures");
    expect(markup).not.toContain("Private");
  });

  it("shows folders before unfiled repositories", () => {
    const organizationId = fakeOrganizationId();
    const folderId = fakeFolderId("folder-projects");
    const filedRepository = repository("filed", fakeRepositoryId("repository-filed"));
    const unfiledRepository = repository("unfiled", fakeRepositoryId("repository-unfiled"));
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo"]}>
        <RepositoryOverviewSidebar
          {...FOLDER_CALLBACKS}
          folderState={{
            assignments: [{ folderId, repositoryId: filedRepository.repositoryId }],
            folders: [
              {
                _id: folderId,
                collapsed: false,
                name: "Projects",
                organizationId,
                position: 0,
              },
            ],
          }}
          organizationId={organizationId}
          page="overview"
          selectedRepositoryId={null}
          sidebarSummaries={{ state: "loading" }}
          repositories={[unfiledRepository, filedRepository]}
          workspace={null}
        />
      </TestRouterProvider>,
    );

    expect(markup.indexOf("Projects")).toBeLessThan(markup.indexOf("samebase/filed"));
    expect(markup.indexOf("samebase/filed")).toBeLessThan(markup.indexOf("samebase/unfiled"));
  });

  it("marks the selected repository without hiding it", () => {
    const selectedRepository = repository("active", fakeRepositoryId("repository-active"));
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/samebase/active"]}>
        <RepositoryOverviewSidebar
          {...FOLDER_CALLBACKS}
          folderState={EMPTY_FOLDER_STATE}
          organizationId={selectedRepository.organizationId}
          page="overview"
          selectedRepositoryId={selectedRepository.repositoryId}
          sidebarSummaries={{ state: "loading" }}
          repositories={[selectedRepository]}
          workspace={null}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="samebase/active, Loading checks"');
    expect(markup).toContain("app-sidebar-current-label");
    expect(markup).not.toContain("Cloudflare Worker");
    expect(markup).not.toContain("Convex project");
  });

  it("puts personal organizations first and expands the selected repository organization", async () => {
    const emptyOrganizationId = fakeOrganizationId("organization-empty");
    const noterOrganizationId = fakeOrganizationId("organization-noter");
    const samebaseOrganizationId = fakeOrganizationId("organization-samebase");
    const selectedRepository = repository(
      "active",
      fakeRepositoryId("repository-active"),
      samebaseOrganizationId,
    );
    const guestbookRepository = repository(
      "guestbook",
      fakeRepositoryId("repository-guestbook"),
      noterOrganizationId,
      "noter",
    );
    const organizations = [
      organization("empty-owner", emptyOrganizationId),
      organization("noter", noterOrganizationId, "user"),
      organization("samebase", samebaseOrganizationId),
    ];
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    function Sidebar({ selectedRepositoryId }: { selectedRepositoryId: Id<"repositories"> }) {
      const [organizationTreeSettings, setOrganizationTreeSettings] =
        useState<RepositoryOrganizationTreeSettings>([]);

      return (
        <TestRouterProvider initialEntries={["/repo/samebase/active"]}>
          <RepositoryOverviewOrganizationSidebar
            {...FOLDER_CALLBACKS}
            folderState={EMPTY_FOLDER_STATE}
            organizations={organizations}
            organizationsCollapsible
            organizationTreeSettings={organizationTreeSettings}
            onCreateRepositoryFolder={async () => {}}
            onSetRepositoryOrganizationCollapsed={async (setting) => {
              setOrganizationTreeSettings((currentSettings) =>
                currentSettings
                  .filter(
                    (currentSetting) => currentSetting.organizationId !== setting.organizationId,
                  )
                  .concat(setting),
              );
            }}
            page="overview"
            selectedRepositoryId={selectedRepositoryId}
            sidebarSummaries={{ state: "loading" }}
            repositories={[guestbookRepository, selectedRepository]}
            workspace={null}
          />
        </TestRouterProvider>
      );
    }

    try {
      await act(async () =>
        root.render(<Sidebar selectedRepositoryId={selectedRepository.repositoryId} />),
      );

      const initialOrganizationButtons = Array.from(
        rootElement.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"),
      );
      expect(initialOrganizationButtons.map((button) => button.textContent)).toEqual([
        "noter",
        "empty-owner",
        "samebase",
      ]);
      expect(
        initialOrganizationButtons.map((button) => button.getAttribute("aria-expanded")),
      ).toEqual(["false", "false", "true"]);
      expect(rootElement.querySelector('a[title="samebase/active"]')).not.toBeNull();
      expect(rootElement.querySelector('a[title="noter/guestbook"]')).toBeNull();
      expect(rootElement.innerHTML).not.toContain("organization-empty");
      expect(rootElement.innerHTML).not.toContain("organization-noter");
      expect(rootElement.innerHTML).not.toContain("organization-samebase");

      await act(async () =>
        root.render(<Sidebar selectedRepositoryId={guestbookRepository.repositoryId} />),
      );

      const changedOrganizationButtons = Array.from(
        rootElement.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"),
      );
      expect(
        changedOrganizationButtons.map((button) => button.getAttribute("aria-expanded")),
      ).toEqual(["true", "false", "false"]);
      expect(rootElement.querySelector('a[title="noter/guestbook"]')).not.toBeNull();
      expect(rootElement.querySelector('a[title="samebase/active"]')).toBeNull();

      const samebaseButton = changedOrganizationButtons[2];
      await act(async () => samebaseButton.click());
      expect(rootElement.querySelector('a[title="samebase/active"]')).not.toBeNull();

      const emptyOwnerButton = changedOrganizationButtons[1];
      await act(async () => emptyOwnerButton.click());

      expect(rootElement.textContent).toContain("No repositories");
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });
});
