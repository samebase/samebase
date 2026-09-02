// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import type {
  VaultFolderState,
  VaultOrganization,
  VaultOrganizationTreeSettings,
} from "./vaultWorkspaceModel";
import {
  type VaultFolderCallbacks,
  VaultOverviewOrganizationSidebar,
  VaultOverviewSidebar,
} from "./VaultOverviewSidebar";

vi.mock("@/hooks/useOrganizationGitHubIdentity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useOrganizationGitHubIdentity")>();
  return {
    ...actual,
    useOrganizationGitHubIdentities: () => new Map(),
  };
});

const FOLDER_CALLBACKS = {
  onDeleteVaultFolder: async () => {},
  onMoveVaultFolder: async () => {},
  onMoveVaultToFolder: async () => {},
  onRenameVaultFolder: async () => {},
  onSetVaultFolderCollapsed: async () => {},
} satisfies VaultFolderCallbacks;

const EMPTY_FOLDER_STATE = {
  assignments: [],
  folders: [],
} satisfies VaultFolderState;

function fakeVaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs stable ids.
  return value;
}

function fakeOrganizationId(value = "organization-samebase"): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs a stable id.
  return value;
}

function fakeFolderId(value: string): Id<"ui_vaultFolders"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs stable ids.
  return value;
}

function vault(
  name: string,
  id: Id<"vaults">,
  organizationId = fakeOrganizationId(),
  owner = "samebase",
): UserVaultResult {
  return {
    _id: id,
    cloudflareAccountId: "account-acme-production",
    convexTeamId: "team-acme-platform",
    organizationId,
    ghRepoOwner: owner,
    ghRepoName: name,
    repositoryFullName: `${owner}/${name}`,
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

function organization(
  githubOwnerLogin: string,
  organizationId: Id<"organizations">,
  githubOwnerType: VaultOrganization["githubOwnerType"] = "organization",
): VaultOrganization {
  return {
    canCreateRepository: true,
    githubOwnerId: `github-owner-${githubOwnerLogin}`,
    githubOwnerLogin,
    githubOwnerType,
    organizationId,
    role: "owner",
  };
}

describe("VaultOverviewSidebar", () => {
  it("links a repository rename warning to Vault Settings", () => {
    const organizationId = fakeOrganizationId();
    const renamedVault = vault("agent-plugins", fakeVaultId("vault-plugin"), organizationId);
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/samebase/agent-plugins"]}>
        <VaultOverviewSidebar
          {...FOLDER_CALLBACKS}
          folderState={EMPTY_FOLDER_STATE}
          githubIdentity={{
            owner: { status: "current" },
            vaults: [
              {
                status: "renamed",
                vaultId: renamedVault._id,
                repositoryName: "plugin",
                update: "available",
              },
            ],
          }}
          organizationId={organizationId}
          page="overview"
          selectedVaultId={renamedVault._id}
          sidebarSummaries={{ state: "loading" }}
          vaults={[renamedVault]}
          workspace={null}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('href="/repo/samebase/agent-plugins"');
    expect(markup).toContain('aria-label="samebase/agent-plugins, Loading checks"');
    expect(markup).toContain('data-vault-status="Loading checks"');
    expect(markup).not.toContain('data-vault-status="Repository name changed"');
    expect(markup).toContain(
      'aria-label="Repository name changed for samebase/agent-plugins. Open settings"',
    );
    expect(markup).toContain('href="/repo/samebase/agent-plugins/settings"');
  });

  it("keeps the supplied vault order when the organization has no folders", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/samebase/active"]}>
        <VaultOverviewSidebar
          {...FOLDER_CALLBACKS}
          folderState={EMPTY_FOLDER_STATE}
          organizationId={fakeOrganizationId()}
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
    expect(markup).not.toContain("Unfiled");
  });

  it("shows empty folders only in their organization", () => {
    const samebaseOrganizationId = fakeOrganizationId();
    const otherOrganizationId = fakeOrganizationId("organization-other");
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo"]}>
        <VaultOverviewSidebar
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
          selectedVaultId={null}
          sidebarSummaries={{ state: "loading" }}
          vaults={[]}
          workspace={null}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('aria-label="Collapse Fixtures"');
    expect(markup).toContain("Fixtures");
    expect(markup).not.toContain("Private");
  });

  it("shows folders before unfiled vaults", () => {
    const organizationId = fakeOrganizationId();
    const folderId = fakeFolderId("folder-projects");
    const filedVault = vault("filed", fakeVaultId("vault-filed"));
    const unfiledVault = vault("unfiled", fakeVaultId("vault-unfiled"));
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo"]}>
        <VaultOverviewSidebar
          {...FOLDER_CALLBACKS}
          folderState={{
            assignments: [{ folderId, vaultId: filedVault._id }],
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
          selectedVaultId={null}
          sidebarSummaries={{ state: "loading" }}
          vaults={[unfiledVault, filedVault]}
          workspace={null}
        />
      </TestRouterProvider>,
    );

    expect(markup.indexOf("Projects")).toBeLessThan(markup.indexOf("samebase/filed"));
    expect(markup.indexOf("samebase/filed")).toBeLessThan(markup.indexOf("samebase/unfiled"));
  });

  it("marks the selected vault without hiding it", () => {
    const selectedVault = vault("active", fakeVaultId("vault-active"));
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/repo/samebase/active"]}>
        <VaultOverviewSidebar
          {...FOLDER_CALLBACKS}
          folderState={EMPTY_FOLDER_STATE}
          organizationId={selectedVault.organizationId}
          page="overview"
          selectedVaultId={selectedVault._id}
          sidebarSummaries={{ state: "loading" }}
          vaults={[selectedVault]}
          workspace={null}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="samebase/active, Loading checks"');
    expect(markup).not.toContain("Cloudflare Worker");
    expect(markup).not.toContain("Convex project");
  });

  it("puts personal organizations first and expands the selected vault organization", async () => {
    const emptyOrganizationId = fakeOrganizationId("organization-empty");
    const noterOrganizationId = fakeOrganizationId("organization-noter");
    const samebaseOrganizationId = fakeOrganizationId("organization-samebase");
    const selectedVault = vault("active", fakeVaultId("vault-active"), samebaseOrganizationId);
    const guestbookVault = vault(
      "guestbook",
      fakeVaultId("vault-guestbook"),
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

    function Sidebar({ selectedVaultId }: { selectedVaultId: Id<"vaults"> }) {
      const [organizationTreeSettings, setOrganizationTreeSettings] =
        useState<VaultOrganizationTreeSettings>([]);

      return (
        <TestRouterProvider initialEntries={["/repo/samebase/active"]}>
          <VaultOverviewOrganizationSidebar
            {...FOLDER_CALLBACKS}
            folderState={EMPTY_FOLDER_STATE}
            organizations={organizations}
            organizationsCollapsible
            organizationTreeSettings={organizationTreeSettings}
            onCreateVaultFolder={async () => {}}
            onSetVaultOrganizationCollapsed={async (setting) => {
              setOrganizationTreeSettings((currentSettings) =>
                currentSettings
                  .filter(
                    (currentSetting) => currentSetting.organizationId !== setting.organizationId,
                  )
                  .concat(setting),
              );
            }}
            page="overview"
            selectedVaultId={selectedVaultId}
            sidebarSummaries={{ state: "loading" }}
            vaults={[guestbookVault, selectedVault]}
            workspace={null}
          />
        </TestRouterProvider>
      );
    }

    try {
      await act(async () => root.render(<Sidebar selectedVaultId={selectedVault._id} />));

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

      await act(async () => root.render(<Sidebar selectedVaultId={guestbookVault._id} />));

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
