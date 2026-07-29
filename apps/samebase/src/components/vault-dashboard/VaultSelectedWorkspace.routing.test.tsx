// @vitest-environment jsdom

import * as React from "react";
import { useLocation } from "@tanstack/react-router";
import { getFunctionName } from "convex/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { VaultSelectedWorkspace } from "./VaultSelectedWorkspace";
import type { VaultWorkspaceSelected } from "./vaultWorkspaceModel";

const actionState = vi.hoisted(() => ({
  fallback: vi.fn(async () => undefined),
  handlersByFunctionName: new Map<string, (args: unknown) => Promise<unknown>>(),
}));
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useAction: (reference: Parameters<typeof actual.useAction>[0]) =>
      actionState.handlersByFunctionName.get(getFunctionName(reference)) ?? actionState.fallback,
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
      <button
        aria-label="Confirm Cloudflare action"
        disabled={Boolean(blockedReason)}
        type="button"
      >
        Add Cloudflare Worker
      </button>
    </div>
  ),
}));

const { act } = React;

function fakeVaultId(): Id<"vaults"> {
  // @ts-expect-error Convex ids are strings at runtime; this route test only needs a stable id.
  return "jt7f8f6d9v7x5w4m3n2p1q0r1s7c9b8a";
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

function makeRecoveryRequiredVault(): UserVaultResult {
  return makeVault({
    providerWrite: {
      status: "recovery_required",
      owner: {
        kind: "manual_provider_write",
        actionId: "provider-action-1",
        action: "create_convex_project",
        expiresAt: 30,
      },
      affectedProviders: ["convex"],
      updatedAt: 20,
      lastWriteAt: {},
    },
  });
}

describe("VaultSelectedWorkspace dialog route", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    actionState.fallback.mockClear();
    actionState.handlersByFunctionName.clear();
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

  it("keeps a blocked provider dialog open and disables its confirmation", async () => {
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
        owner: { kind: "managed_run", runId: fakeRunId() },
        affectedProviders: ["convex", "cloudflare"],
        updatedAt: 20,
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
    expect(
      element.querySelector<HTMLButtonElement>('button[aria-label="Confirm Cloudflare action"]')
        ?.disabled,
    ).toBe(true);
    const href =
      element.querySelector('[data-testid="router-location"]')?.getAttribute("data-href") ?? "";
    expect(href).toContain("add-cloudflare");
    expect(href).toContain("dev");
  });

  it("shows recovery Retry and keeps provider controls disabled", async () => {
    await renderWorkspace(makeWorkspace(makeRecoveryRequiredVault()), "/vault/ada/demo/settings");

    expect(rootElement?.textContent).toContain(
      "Samebase could not confirm Convex project creation.",
    );
    const buttons = [...(rootElement?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    expect(buttons.filter((button) => button.textContent === "Retry")).toHaveLength(1);
    expect(
      buttons.find((button) => button.textContent.includes("Add Cloudflare Worker"))?.disabled,
    ).toBe(true);
    expect(
      buttons.find((button) => button.textContent.includes("Add Convex project"))?.disabled,
    ).toBe(true);
    expect(buttons.find((button) => button.textContent.includes("Remove vault"))?.disabled).toBe(
      true,
    );
  });

  it("can close a provider dialog when recovery becomes required", async () => {
    await renderWorkspace(
      makeWorkspace(makeRecoveryRequiredVault()),
      "/vault/ada/demo/settings?add-cloudflare",
    );
    expect(rootElement?.querySelector('[role="dialog"]')).not.toBeNull();
    expect(rootElement?.textContent).toContain(
      "Samebase could not confirm Convex project creation.",
    );
    const closeButton = rootElement?.querySelector<HTMLButtonElement>(
      'button[aria-label="Close provider dialog"]',
    );
    if (!closeButton) {
      throw new Error("Expected the provider dialog close action.");
    }

    await act(async () => {
      closeButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(rootElement?.querySelector('[role="dialog"]')).toBeNull();
    expect(rootElement?.textContent).toContain("Retry");
  });

  it("disables recovery Retry while the action is pending", async () => {
    let resolveRecovery: (() => void) | undefined;
    const retryRecovery = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRecovery = resolve;
        }),
    );
    actionState.handlersByFunctionName.set(
      getFunctionName(api.vault.actions.retryProviderWriteRecovery),
      retryRecovery,
    );
    await renderWorkspace(makeWorkspace(makeRecoveryRequiredVault()), "/vault/ada/demo/settings");
    const retryButton = [
      ...(rootElement?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ].find((button) => button.textContent.includes("Retry"));
    if (!retryButton) {
      throw new Error("Expected provider recovery Retry.");
    }

    await act(async () => {
      retryButton.click();
      await Promise.resolve();
    });

    expect(retryButton.disabled).toBe(true);
    expect(rootElement?.textContent).toContain("Retrying...");

    await act(async () => {
      resolveRecovery?.();
      await Promise.resolve();
    });
  });

  it("starts provider recovery for the selected vault", async () => {
    const retryRecovery = vi.fn(async () => undefined);
    actionState.handlersByFunctionName.set(
      getFunctionName(api.vault.actions.retryProviderWriteRecovery),
      retryRecovery,
    );
    await renderWorkspace(makeWorkspace(makeRecoveryRequiredVault()), "/vault/ada/demo/settings");
    const retryButton = [
      ...(rootElement?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ].find((button) => button.textContent === "Retry");
    if (!retryButton) {
      throw new Error("Expected provider recovery Retry.");
    }

    await act(async () => {
      retryButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(retryRecovery).toHaveBeenCalledWith({ vaultId: fakeVaultId() });
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("shows the provider recovery error and enables Retry again", async () => {
    const retryRecovery = vi.fn(async () => {
      throw new Error("Recovery did not start.");
    });
    actionState.handlersByFunctionName.set(
      getFunctionName(api.vault.actions.retryProviderWriteRecovery),
      retryRecovery,
    );
    await renderWorkspace(makeWorkspace(makeRecoveryRequiredVault()), "/vault/ada/demo/settings");
    const retryButton = [
      ...(rootElement?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ].find((button) => button.textContent === "Retry");
    if (!retryButton) {
      throw new Error("Expected provider recovery Retry.");
    }

    await act(async () => {
      retryButton.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toastMock).toHaveBeenCalledWith({
      title: "Could not retry provider recovery",
      description: "Recovery did not start.",
      variant: "destructive",
    });
    expect(retryButton.disabled).toBe(false);
  });
});
