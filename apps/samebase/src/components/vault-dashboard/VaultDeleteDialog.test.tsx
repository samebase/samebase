// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { VaultDeleteDialog } from "./VaultDeleteDialog";

const { act } = React;

const actionState = vi.hoisted(() => ({
  actions: new Map<string, (args: unknown) => Promise<unknown>>(),
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();
  return {
    ...actual,
    useAction: (reference: Parameters<typeof actual.useAction>[0]) => {
      const action = actionState.actions.get(getFunctionName(reference));
      if (!action) {
        throw new Error(`Missing action handler for ${getFunctionName(reference)}.`);
      }
      return action;
    },
  };
});

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children?: React.ReactNode }) => <div role="dialog">{children}</div>,
  DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

function fakeId<TableName extends "organizations" | "vaults" | "workflow_vaultDeletion_runs">(
  value: string,
): Id<TableName> {
  // @ts-expect-error Convex ids are strings at runtime; this component test only needs stable ids.
  return value;
}

function failedVault(): UserVaultResult {
  return {
    _id: fakeId<"vaults">("vault:demo"),
    organizationId: fakeId<"organizations">("organization:samebase"),
    convexTeamId: "convex-team",
    cloudflareAccountId: "cloudflare-account",
    ghRepoOwner: "samebase",
    ghRepoName: "demo",
    repositoryFullName: "samebase/demo",
    defaultBranch: "main",
    fileCount: 1,
    sourceSetup: { status: "ready" },
    providerSetup: { status: "not_applicable" },
    providerPlan: null,
    providerWrite: { status: "idle", lastWriteAt: {} },
    deletion: {
      state: "delete_failed",
      runId: fakeId<"workflow_vaultDeletion_runs">("deletion-run:failed"),
      failedAt: 2,
      currentStep: "delete_github_repo",
      message: "Vault removal failed.",
      updatedAt: 2,
    },
    isSamebaseManaged: true,
    hasConnectedGitHubRepository: true,
    hasConvexProvision: true,
    hasCloudflareProvision: true,
    canRemoveConvexProvision: true,
    canRemoveCloudflareProvision: true,
    cloudflareWorkers: [],
    convexProjects: [],
  };
}

describe("VaultDeleteDialog failed deletion recovery", () => {
  let root: Root | null = null;
  let rootElement: HTMLDivElement | null = null;

  beforeEach(() => {
    actionState.actions.clear();
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

  it("calls the dedicated action only after the user confirms local removal", async () => {
    const deleteVault = vi.fn(async () => ({ deletionRunId: "unused" }));
    const removeFailedVaultFromSamebase = vi.fn(async () => ({ deletionRunId: "retry" }));
    const commitStaging = vi.fn(async () => null);
    const onDeleted = vi.fn();
    actionState.actions.set(getFunctionName(api.vault.actions.deleteVault), deleteVault);
    actionState.actions.set(
      getFunctionName(api.vault.actions.removeFailedVaultFromSamebase),
      removeFailedVaultFromSamebase,
    );
    actionState.actions.set(getFunctionName(api.fileStagingActions.commitStaging), commitStaging);
    rootElement = document.createElement("div");
    document.body.append(rootElement);
    root = createRoot(rootElement);

    await act(async () => {
      root?.render(
        <VaultDeleteDialog onClose={() => {}} onDeleted={onDeleted} vault={failedVault()} />,
      );
      await Promise.resolve();
    });
    const removeButton = [...rootElement.querySelectorAll("button")].find(
      (button) => button.textContent === "Remove from Samebase only",
    );
    if (!removeButton) {
      throw new Error("Samebase-only removal button was not rendered.");
    }

    await act(async () => {
      removeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(removeFailedVaultFromSamebase).toHaveBeenCalledWith({
      runId: fakeId<"workflow_vaultDeletion_runs">("deletion-run:failed"),
    });
    expect(deleteVault).not.toHaveBeenCalled();
    expect(commitStaging).not.toHaveBeenCalled();
    expect(onDeleted).toHaveBeenCalledOnce();
  });
});
