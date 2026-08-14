// @vitest-environment jsdom

import * as React from "react";
import { useLocation } from "@tanstack/react-router";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../../../convex/_generated/dataModel";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultSelectedWorkspace } from "./VaultSelectedWorkspace";
import type { VaultWorkspaceSelected } from "./vaultWorkspaceModel";

const actionState = vi.hoisted(() => ({
  fallback: vi.fn(async () => undefined),
}));
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useAction: () => actionState.fallback,
  };
});
vi.mock("@/components/ui/use-toast", () => ({
  toast: toastMock,
}));
vi.mock("./VaultConvexDialog", () => ({
  VaultConvexDialog: () => null,
}));
vi.mock("./VaultDeleteDialog", () => ({
  VaultDeleteDialog: () => null,
}));
vi.mock("./VaultRepositorySettings", () => ({
  RepositorySettings: () => null,
}));
vi.mock("./VaultCloudflareDialog", () => ({
  VaultCloudflareDialog: ({
    blockedReason,
    onClose,
  }: {
    blockedReason: string | null;
    onClose: () => void;
  }) => (
    <div role="dialog">
      {blockedReason ? <p>{blockedReason}</p> : null}
      <button aria-label="Close provider dialog" onClick={onClose} type="button">
        Close
      </button>
    </div>
  ),
}));

const { act } = React;

function fakeVaultId(): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this route test only needs a stable id.
  return "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function fakeOrganizationId(): Id<"organizations"> {
  // @ts-expect-error Convex ids are strings at runtime; this route test only needs a stable id.
  return "organization-samebase";
}

function fakeRunId(): Id<"workflow_vaultProvisioning_runs"> {
  // @ts-expect-error Convex ids are strings at runtime; this route test only needs a stable id.
  return "kx7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
}

function LocationProbe() {
  const location = useLocation();
  return <output data-href={location.href} data-testid="router-location" />;
}

function makeVault({
  providerSetup = { status: "ready" },
  providerWrite,
}: {
  providerSetup?: UserVaultResult["providerSetup"];
  providerWrite: UserVaultResult["providerWrite"];
}): UserVaultResult {
  return {
    _id: fakeVaultId(),
    organizationId: fakeOrganizationId(),
    convexTeamId: "team-1",
    cloudflareAccountId: "account-1",
    ghRepoOwner: "ada",
    ghRepoName: "demo",
    repositoryFullName: "ada/demo",
    defaultBranch: "main",
    fileCount: 0,
    sourceSetup: { status: "ready" },
    providerSetup,
    providerPlan: null,
    providerWrite,
    deletion: {
      state: "not_deleting",
      deleteAction: { state: "disabled", reason: "A provider operation is in progress." },
    },
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

function makeWorkspace(vault: UserVaultResult): VaultWorkspaceSelected {
  return {
    access: { state: "ready", accessKeys: [] },
    cloudflareConnection: { state: "loading" },
    cloudflareObservations: {
      workers: {
        state: "loaded",
        observations: [],
        refreshFailed: false,
        reload: () => {},
      },
      builds: {
        state: "loaded",
        observations: [],
        refreshFailed: false,
        reload: () => {},
      },
      convexBuildAccess: {
        state: "loaded",
        observations: [],
        refreshFailed: false,
        reload: () => {},
      },
    },
    convexObservations: {
      state: "loaded",
      observations: [],
      refreshFailed: false,
      reload: () => {},
    },
    environmentRoots: [],
    githubRepositoryUrl: "https://github.com/ada/demo",
    pullRequests: { state: "not_requested" },
    vault,
  };
}

describe("VaultSelectedWorkspace dialog route", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    actionState.fallback.mockClear();
    toastMock.mockReset();
  });

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
  });

  async function renderWorkspace(workspace: VaultWorkspaceSelected, initialEntry: string) {
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    const mountedRoot = createRoot(rootElement);
    root = mountedRoot;

    await act(async () => {
      mountedRoot.render(
        <TestRouterProvider initialEntries={[initialEntry]}>
          <VaultSelectedWorkspace developerToolsVisible page="settings" workspace={workspace} />
          <LocationProbe />
        </TestRouterProvider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("keeps a blocked provider dialog open with its route state", async () => {
    const vault = makeVault({
      providerSetup: {
        status: "running",
        provider: "cloudflare",
        runId: fakeRunId(),
        step: "attach_worker",
        updatedAt: 20,
      },
      providerWrite: {
        status: "active",
        owner: { kind: "managed_run" },
        lastWriteAt: {},
      },
    });
    const workspace = makeWorkspace(vault);

    await renderWorkspace(workspace, "/vault/ada/demo/settings?add-cloudflare&dev");
    const element = rootElement;
    if (!element) {
      throw new Error("Expected the selected workspace to render.");
    }

    expect(element.querySelector('[role="dialog"]')).not.toBeNull();
    expect(element.textContent).toContain("A provider operation is in progress.");
    const href =
      element.querySelector('[data-testid="router-location"]')?.getAttribute("data-href") ?? "";
    expect(href).toContain("add-cloudflare");
    expect(href).toContain("dev");
  });
});
