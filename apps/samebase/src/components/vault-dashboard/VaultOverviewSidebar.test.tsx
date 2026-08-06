// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import type { VaultOrganization } from "./vaultWorkspaceModel";
import { VaultOverviewOrganizationSidebar, VaultOverviewSidebar } from "./VaultOverviewSidebar";

function fakeVaultId(value: string): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs stable ids.
  return value;
}

function fakeOrganizationId(value = "organization-samebase"): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; static rendering only needs a stable id.
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
): VaultOrganization {
  return {
    canCreateRepository: true,
    githubOwnerId: `github-owner-${githubOwnerLogin}`,
    githubOwnerLogin,
    githubOwnerType: "organization",
    organizationId,
    role: "owner",
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

  it("groups every organization and expands the selected vault organization", async () => {
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
      organization("noter", noterOrganizationId),
      organization("samebase", samebaseOrganizationId),
    ];
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    function Sidebar({ selectedVaultId }: { selectedVaultId: Id<"vaults"> }) {
      return (
        <TestRouterProvider initialEntries={["/vault/samebase/active"]}>
          <VaultOverviewOrganizationSidebar
            organizations={organizations}
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

      const initialOrganizationButtons = Array.from(rootElement.querySelectorAll("button"));
      expect(initialOrganizationButtons.map((button) => button.textContent)).toEqual([
        "empty-owner",
        "noter",
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

      const changedOrganizationButtons = Array.from(rootElement.querySelectorAll("button"));
      expect(
        changedOrganizationButtons.map((button) => button.getAttribute("aria-expanded")),
      ).toEqual(["false", "true", "false"]);
      expect(rootElement.querySelector('a[title="noter/guestbook"]')).not.toBeNull();
      expect(rootElement.querySelector('a[title="samebase/active"]')).toBeNull();

      const samebaseButton = changedOrganizationButtons[2];
      await act(async () => samebaseButton.click());
      expect(rootElement.querySelector('a[title="samebase/active"]')).not.toBeNull();

      const emptyOwnerButton = changedOrganizationButtons[0];
      await act(async () => emptyOwnerButton.click());

      expect(rootElement.textContent).toContain("No vaults");
    } finally {
      await act(async () => root.unmount());
      rootElement.remove();
    }
  });
});
