// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";

import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultOverviewVaultPickerPane } from "./VaultOverviewVaultPickerPane";
import type { GitHubAuthorizationSetup } from "@/lib/githubAppSetupFlow";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import type { VaultOrganization, VaultOrganizationTreeSettings } from "./vaultWorkspaceModel";

const getInstallationUrl = vi.hoisted(() =>
  vi.fn(async () => ({
    callbackOrigin: "https://api.samebase.com",
    setupUrl: "https://github.com/apps/samebase/installations/new",
  })),
);
const openSetupPopup = vi.hoisted(() =>
  vi.fn(
    async (
      _provider: "github-app" | "github-user",
      getSetup: () => Promise<GitHubAuthorizationSetup>,
    ) => await getSetup(),
  ),
);

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useMutation: () => getInstallationUrl,
  };
});

vi.mock("@/lib/githubAppSetupFlow", () => ({
  openGitHubAppSetupPopup: openSetupPopup,
}));

function fakeId<TableName extends "organizations" | "ui_vaultFolders" | "vaults">(
  value: string,
): Id<TableName> {
  // @ts-expect-error Convex ids are strings at runtime; this component test only needs stable ids.
  return value;
}

const organization = {
  canCreateRepository: true,
  githubOwnerId: "github-owner-samebase",
  githubOwnerLogin: "samebase",
  githubOwnerType: "organization",
  organizationId: fakeId<"organizations">("organization-samebase"),
  role: "owner",
} satisfies VaultOrganization;

const vault = {
  _id: fakeId<"vaults">("vault-demo"),
  canRemoveCloudflareProvision: false,
  canRemoveConvexProvision: false,
  cloudflareAccountId: "cloudflare-account",
  cloudflareWorkers: [],
  convexProjects: [],
  convexTeamId: "convex-team",
  defaultBranch: "main",
  deletion: { deleteAction: { state: "available" }, state: "not_deleting" },
  fileCount: 1,
  ghRepoName: "demo",
  ghRepoOwner: "samebase",
  hasCloudflareProvision: false,
  hasConnectedGitHubRepository: true,
  hasConvexProvision: false,
  isSamebaseManaged: true,
  organizationId: organization.organizationId,
  providerPlan: null,
  providerSetup: { status: "ready" },
  providerWrite: { lastWriteAt: {}, status: "idle" },
  repositoryFullName: "samebase/demo",
  sourceSetup: { status: "ready" },
} satisfies UserVaultResult;

describe("VaultOverviewVaultPickerPane organization setup", () => {
  it("returns GitHub App installation to the global vault inventory", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    try {
      await act(async () => {
        root.render(
          <TestRouterProvider initialEntries={["/vault"]}>
            <VaultOverviewVaultPickerPane
              folderState={{ assignments: [], folders: [] }}
              globalInventory
              organizations={[]}
              organizationTreeSettings={[]}
              onCreateVaultFolder={async () => {}}
              onDeleteVaultFolder={async () => {}}
              onMoveVaultFolder={async () => {}}
              onMoveVaultToFolder={async () => {}}
              onRenameVaultFolder={async () => {}}
              onSetVaultFolderCollapsed={async () => {}}
              onSetVaultOrganizationCollapsed={async () => {}}
              sidebarSummaries={{ state: "loaded", summaries: [] }}
              vaults={[]}
            />
          </TestRouterProvider>,
        );
      });
      const installButton = [...rootElement.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "Install GitHub App",
      );
      if (!installButton) {
        throw new Error("Install GitHub App button not found");
      }

      await act(async () => installButton.click());

      expect(openSetupPopup).toHaveBeenCalledOnce();
      expect(getInstallationUrl).toHaveBeenCalledWith({ returnToPath: "/vault" });
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });

  it("uses the shared organization and folder disclosures", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);
    const folderId = fakeId<"ui_vaultFolders">("folder-projects");
    const onSetVaultFolderCollapsed = vi.fn(async () => {});

    function Inventory() {
      const [organizationTreeSettings, setOrganizationTreeSettings] =
        useState<VaultOrganizationTreeSettings>([]);

      return (
        <TestRouterProvider initialEntries={["/vault"]}>
          <VaultOverviewVaultPickerPane
            folderState={{
              assignments: [{ folderId, vaultId: vault._id }],
              folders: [
                {
                  _id: folderId,
                  collapsed: false,
                  name: "Projects",
                  organizationId: organization.organizationId,
                  position: 0,
                },
              ],
            }}
            globalInventory
            organizations={[organization]}
            organizationTreeSettings={organizationTreeSettings}
            onCreateVaultFolder={async () => {}}
            onDeleteVaultFolder={async () => {}}
            onMoveVaultFolder={async () => {}}
            onMoveVaultToFolder={async () => {}}
            onRenameVaultFolder={async () => {}}
            onSetVaultFolderCollapsed={onSetVaultFolderCollapsed}
            onSetVaultOrganizationCollapsed={async (setting) => {
              setOrganizationTreeSettings([setting]);
            }}
            sidebarSummaries={{ state: "loaded", summaries: [] }}
            vaults={[vault]}
          />
        </TestRouterProvider>
      );
    }

    try {
      await act(async () => root.render(<Inventory />));
      const organizationButton = [...rootElement.querySelectorAll("button")].find(
        (button) => button.textContent.trim() === "samebase",
      );
      if (!organizationButton) {
        throw new Error("Organization disclosure not found");
      }
      expect(organizationButton.getAttribute("aria-expanded")).toBe("true");
      expect(rootElement.querySelector('a[title="samebase/demo"]')).not.toBeNull();

      await act(async () => organizationButton.click());
      expect(organizationButton.getAttribute("aria-expanded")).toBe("false");
      expect(rootElement.querySelector('a[title="samebase/demo"]')).toBeNull();

      await act(async () => organizationButton.click());
      const folderButton = rootElement.querySelector<HTMLButtonElement>(
        'button[aria-label="Collapse Projects"]',
      );
      if (!folderButton) {
        throw new Error("Folder disclosure not found");
      }
      await act(async () => folderButton.click());
      expect(onSetVaultFolderCollapsed).toHaveBeenCalledWith({ collapsed: true, folderId });
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });
});
