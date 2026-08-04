// @vitest-environment jsdom

import * as React from "react";
import { useLocation } from "@tanstack/react-router";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultDashboard } from "./VaultDashboard";

const workspaceModelMock = vi.hoisted(() => vi.fn());
const vaultPickerMock = vi.hoisted(() => vi.fn(() => null));
const folderMutationMock = vi.hoisted(() => vi.fn(async () => {}));
const organizationSelectionMock = vi.hoisted(() =>
  vi.fn(() => ({
    state: "selected",
    organizationId: "organization_test",
    organizations: [{ organizationId: "organization_test", label: "Test organization" }],
  })),
);

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useMutation: () => folderMutationMock,
  };
});

vi.mock("@/components/AppWorkspaceShell", () => ({
  AppWorkspaceRouteChrome: ({ children }: { children?: ReactNode }) => children ?? null,
}));
vi.mock("@/hooks/useOrganizationSelection", () => ({
  useOrganizationSelection: organizationSelectionMock,
}));
vi.mock("./VaultOverviewPage", () => ({
  VaultOverviewLoadingPage: () => null,
}));
vi.mock("./VaultOverviewSidebar", () => ({
  VaultOverviewSidebar: () => null,
  VaultOverviewSidebarLoading: () => null,
}));
vi.mock("./VaultOverviewVaultPickerPane", () => ({
  VaultOverviewVaultListHeader: () => null,
  VaultOverviewVaultPickerPane: vaultPickerMock,
}));
vi.mock("./VaultSelectedWorkspace", () => ({
  VaultSelectedWorkspace: () => null,
}));
vi.mock("./useVaultWorkspaceModel", () => ({
  useVaultWorkspaceModel: workspaceModelMock,
}));

const { act } = React;

describe("VaultDashboard dialog route cleanup", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      const mountedRoot = root;
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    rootElement?.remove();
    rootElement = null;
    workspaceModelMock.mockReset();
    vaultPickerMock.mockReset();
    folderMutationMock.mockClear();
    organizationSelectionMock.mockClear();
  });

  function LocationProbe() {
    const location = useLocation();
    return <output data-href={location.href} data-testid="router-location" />;
  }

  async function settleRouteUpdate() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  async function renderDashboard(initialEntry: string, selectedRepositoryFullName?: string) {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    await act(async () => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={[initialEntry]}>
          <VaultDashboard selectedRepositoryFullName={selectedRepositoryFullName} />
          <LocationProbe />
        </TestRouterProvider>,
      );
      await settleRouteUpdate();
    });
  }

  function readLocationHref() {
    return (
      rootElement?.querySelector('[data-testid="router-location"]')?.getAttribute("data-href") ?? ""
    );
  }

  function setLoadingWorkspace() {
    workspaceModelMock.mockReturnValue({ state: "loading" });
  }

  function setSettledWorkspace(
    selection:
      | { state: "root" }
      | { state: "missing"; repositoryFullName: string }
      | {
          state: "selected";
          workspace: {
            vault: {
              _id: string;
              deletion: {
                state: "not_deleting";
                deleteAction: { state: "available" | "unavailable" };
              };
              hasConnectedGitHubRepository: boolean;
            };
          };
        },
  ) {
    workspaceModelMock.mockReturnValue({
      folderState: { assignments: [], folders: [] },
      state: "ready",
      selection,
      sidebarSummaries: { state: "loaded", summaries: [] },
      vaults: [],
    });
  }

  it("keeps a dialog deep link while the vault model is loading", async () => {
    setLoadingWorkspace();

    await renderDashboard("/vault?delete&dev");

    expect(readLocationHref()).toContain("delete");
    expect(readLocationHref()).toContain("dev");
  });

  it("clears an unavailable dialog from the vault root route", async () => {
    setSettledWorkspace({ state: "root" });

    await renderDashboard("/vault?delete&dev#vaults");

    expect(readLocationHref()).toContain("/vault?");
    expect(readLocationHref()).not.toContain("delete");
    expect(readLocationHref()).toContain("dev");
    expect(readLocationHref()).toContain("#vaults");
  });

  it("passes folder state and every folder mutation to the root vault picker", async () => {
    const folderState = { assignments: [], folders: [] };
    workspaceModelMock.mockReturnValue({
      folderState,
      selection: { state: "root" },
      sidebarSummaries: { state: "loaded", summaries: [] },
      state: "ready",
      vaults: [],
    });

    await renderDashboard("/vault");

    expect(vaultPickerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        folderState,
        onCreateVaultFolder: expect.any(Function),
        onDeleteVaultFolder: expect.any(Function),
        onMoveVaultFolder: expect.any(Function),
        onMoveVaultToFolder: expect.any(Function),
        onRenameVaultFolder: expect.any(Function),
        onSetVaultFolderCollapsed: expect.any(Function),
      }),
      undefined,
    );
    expect(workspaceModelMock).toHaveBeenCalledWith("organization_test", undefined);
  });

  it("clears an unavailable dialog from a missing vault route", async () => {
    setSettledWorkspace({
      state: "missing",
      repositoryFullName: "samebase/missing",
    });

    await renderDashboard("/vault/samebase/missing?add-convex&dev", "samebase/missing");

    expect(readLocationHref()).toContain("/vault/samebase/missing?");
    expect(readLocationHref()).not.toContain("add-convex");
    expect(readLocationHref()).toContain("dev");
  });

  it("keeps a permitted dialog for the selected vault", async () => {
    setSettledWorkspace({
      state: "selected",
      workspace: {
        vault: {
          _id: "vault:test",
          deletion: {
            state: "not_deleting",
            deleteAction: { state: "available" },
          },
          hasConnectedGitHubRepository: true,
        },
      },
    });

    await renderDashboard("/vault/samebase/samebase?delete&dev", "samebase/samebase");

    expect(workspaceModelMock).toHaveBeenCalledWith("organization_test", "samebase/samebase");
    expect(readLocationHref()).toContain("delete");
    expect(readLocationHref()).toContain("dev");
  });
});
