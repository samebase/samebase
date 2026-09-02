import { useState } from "react";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { AppDialogContent } from "@/components/AppDialogContent";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type VaultDeleteTarget = {
  id: UserVaultResult["_id"];
  repositoryFullName: string;
  isSamebaseManaged: boolean;
  canRemoveGithubRepo: boolean;
  hasConvexProvision: boolean;
  hasCloudflareProvision: boolean;
  canRemoveConvexProvision: boolean;
  canRemoveCloudflareProvision: boolean;
};

type VaultDeleteOptionKey =
  | "removeConvexProvision"
  | "removeGithubRepo"
  | "removeCloudflareProvision";

type VaultDeleteProgress = "idle" | "committing" | "deleting";
type VaultDeleteOperation =
  | {
      state: "idle";
      commitError: string | null;
      deleteError: string | null;
      didAttemptCommit: boolean;
    }
  | { state: "committing"; didAttemptCommit: boolean }
  | { state: "deleting"; didAttemptCommit: boolean };

type VaultDeleteOptions = {
  removeConvexProvision: boolean;
  removeGithubRepo: boolean;
  removeCloudflareProvision: boolean;
};

export function VaultDeleteDialogContent({
  blockedReason,
  commitError,
  deleteError,
  didAttemptCommit,
  onCommitBeforeRemove,
  onDeleteOptionChange,
  onOpenChange,
  onRemoveVault,
  progress,
  removeConvexProvision,
  removeGithubRepo,
  removeCloudflareProvision,
  stagedChangesCount,
  target,
}: {
  blockedReason?: string | null;
  commitError: string | null;
  deleteError: string | null;
  didAttemptCommit: boolean;
  onCommitBeforeRemove: () => void;
  onDeleteOptionChange: (option: VaultDeleteOptionKey, value: boolean) => void;
  onOpenChange: (isOpen: boolean) => void;
  onRemoveVault: () => void;
  progress: VaultDeleteProgress;
  removeConvexProvision: boolean;
  removeGithubRepo: boolean;
  removeCloudflareProvision: boolean;
  stagedChangesCount: number;
  target: VaultDeleteTarget;
}) {
  const hasStagedChanges = stagedChangesCount > 0;
  const isCommitting = progress === "committing";
  const isDeleting = progress === "deleting";
  const removeCloudflareCheckboxId = "remove-cloudflare-provision";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>Remove {target.repositoryFullName} from Samebase?</DialogTitle>
          <DialogDescription>
            {hasStagedChanges
              ? `This repository has ${stagedChangesCount} uncommitted local change${stagedChangesCount === 1 ? "" : "s"}. You can commit ${stagedChangesCount === 1 ? "it" : "them"} now.`
              : "All local changes are already backed up on GitHub."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Checkbox
              id="remove-github-repo"
              checked={removeGithubRepo}
              onCheckedChange={(checked) =>
                onDeleteOptionChange("removeGithubRepo", checked === true)
              }
              disabled={!target.canRemoveGithubRepo || isDeleting || isCommitting}
              className="mt-0.5"
            />
            <label htmlFor="remove-github-repo" className="text-sm text-muted-foreground">
              Also delete the GitHub repository
              {!target.canRemoveGithubRepo ? (
                <div className="text-xs text-muted-foreground">
                  Only available for confirmed repositories created in Samebase.
                </div>
              ) : null}
            </label>
          </div>
          {target.hasConvexProvision || target.canRemoveConvexProvision ? (
            <div className="flex items-start gap-2">
              <Checkbox
                id="remove-convex-provision"
                checked={removeConvexProvision}
                onCheckedChange={(checked) =>
                  onDeleteOptionChange("removeConvexProvision", checked === true)
                }
                disabled={!target.canRemoveConvexProvision || isDeleting || isCommitting}
                className="mt-0.5"
              />
              <label htmlFor="remove-convex-provision" className="text-sm text-muted-foreground">
                Also delete the Convex project and deployment
                {!target.canRemoveConvexProvision ? (
                  <div className="text-xs text-muted-foreground">
                    Only available for infrastructure provisioned by Samebase.
                  </div>
                ) : null}
              </label>
            </div>
          ) : null}
          {target.hasCloudflareProvision ? (
            <div className="flex items-start gap-2">
              <Checkbox
                id={removeCloudflareCheckboxId}
                checked={removeCloudflareProvision}
                onCheckedChange={(checked) =>
                  onDeleteOptionChange("removeCloudflareProvision", checked === true)
                }
                disabled={!target.canRemoveCloudflareProvision || isDeleting || isCommitting}
                className="mt-0.5"
              />
              <label htmlFor={removeCloudflareCheckboxId} className="text-sm text-muted-foreground">
                Also delete the Cloudflare Worker
                {!target.canRemoveCloudflareProvision ? (
                  <div className="text-xs text-muted-foreground">
                    Only available for Workers created from this app.
                  </div>
                ) : null}
              </label>
            </div>
          ) : null}
          {deleteError ? <div className="text-sm text-red-600">{deleteError}</div> : null}
          {commitError ? <div className="text-sm text-red-600">{commitError}</div> : null}
          {blockedReason ? (
            <div className="text-sm text-muted-foreground">{blockedReason}</div>
          ) : null}
          {didAttemptCommit && hasStagedChanges ? (
            <div className="text-sm text-muted-foreground">
              Some local changes are still uncommitted. You can retry commit or remove anyway.
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={isDeleting || isCommitting}
          >
            Cancel
          </Button>
          {hasStagedChanges ? (
            <Button
              variant="outline"
              onClick={onCommitBeforeRemove}
              disabled={isDeleting || isCommitting}
            >
              {isCommitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Committing...
                </>
              ) : (
                "Commit changes"
              )}
            </Button>
          ) : null}
          <Button
            variant="destructive"
            onClick={onRemoveVault}
            disabled={Boolean(blockedReason) || isDeleting || isCommitting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Removing...
              </>
            ) : (
              "Remove from Samebase"
            )}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}

export function VaultDeleteDialog({
  onClose,
  onDeleted,
  vault,
}: {
  onClose: () => void;
  onDeleted: () => void;
  vault: UserVaultResult;
}) {
  const deleteVault = useAction(api.vault.actions.deleteVault);
  const commitStaging = useAction(api.fileStagingActions.commitStaging);
  const [operation, setOperation] = useState<VaultDeleteOperation>({
    state: "idle",
    commitError: null,
    deleteError: null,
    didAttemptCommit: false,
  });
  const [options, setOptions] = useState<VaultDeleteOptions>({
    removeConvexProvision: false,
    removeGithubRepo: false,
    removeCloudflareProvision: false,
  });

  const confirmBlockedReason =
    vault.deletion.state === "deleting"
      ? "Removal from Samebase is in progress."
      : vault.deletion.state === "delete_failed"
        ? "Retry removal before you remove this repository from Samebase."
        : vault.deletion.deleteAction.state === "disabled"
          ? vault.deletion.deleteAction.reason
          : null;

  const target = {
    id: vault._id,
    repositoryFullName: vault.repositoryFullName,
    isSamebaseManaged: vault.isSamebaseManaged,
    canRemoveGithubRepo: vault.isSamebaseManaged && vault.hasConnectedGitHubRepository,
    hasConvexProvision: vault.hasConvexProvision,
    hasCloudflareProvision: vault.hasCloudflareProvision,
    canRemoveConvexProvision: vault.canRemoveConvexProvision,
    canRemoveCloudflareProvision: vault.canRemoveCloudflareProvision,
  };

  const handleCommitBeforeRemove = async () => {
    if (operation.state !== "idle") {
      return;
    }

    setOperation({
      state: "committing",
      didAttemptCommit: operation.didAttemptCommit,
    });
    try {
      await commitStaging({ repositoryFullName: target.repositoryFullName });
      setOperation({
        state: "idle",
        commitError: null,
        deleteError: null,
        didAttemptCommit: true,
      });
    } catch (error) {
      setOperation({
        state: "idle",
        commitError: error instanceof Error ? error.message : "Failed to commit changes",
        deleteError: null,
        didAttemptCommit: true,
      });
    }
  };

  const handleRemoveVault = async () => {
    if (confirmBlockedReason || operation.state !== "idle") {
      return;
    }

    setOperation({
      state: "deleting",
      didAttemptCommit: operation.didAttemptCommit,
    });
    try {
      await deleteVault({
        vaultId: target.id,
        removeGithubRepo: target.isSamebaseManaged
          ? target.canRemoveGithubRepo && options.removeGithubRepo
          : false,
        removeConvexProvision: target.canRemoveConvexProvision
          ? options.removeConvexProvision
          : false,
        removeCloudflareProvision: target.canRemoveCloudflareProvision
          ? options.removeCloudflareProvision
          : false,
      });
      onDeleted();
    } catch (error) {
      console.error("Failed to remove vault:", error);
      setOperation({
        state: "idle",
        commitError: null,
        deleteError:
          error instanceof Error ? error.message : "Failed to remove repository from Samebase.",
        didAttemptCommit: operation.didAttemptCommit,
      });
    }
  };

  return (
    <VaultDeleteDialogContent
      blockedReason={confirmBlockedReason}
      commitError={operation.state === "idle" ? operation.commitError : null}
      deleteError={operation.state === "idle" ? operation.deleteError : null}
      didAttemptCommit={operation.didAttemptCommit}
      onCommitBeforeRemove={() => {
        void handleCommitBeforeRemove();
      }}
      onDeleteOptionChange={(option, value) => {
        setOptions((current) => ({ ...current, [option]: value }));
      }}
      onOpenChange={(isOpen) => {
        if (!isOpen && operation.state === "idle") {
          onClose();
        }
      }}
      onRemoveVault={() => {
        void handleRemoveVault();
      }}
      progress={operation.state}
      removeConvexProvision={options.removeConvexProvision}
      removeGithubRepo={options.removeGithubRepo}
      removeCloudflareProvision={options.removeCloudflareProvision}
      stagedChangesCount={vault.fileCount}
      target={target}
    />
  );
}
