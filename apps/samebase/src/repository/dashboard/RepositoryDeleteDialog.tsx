import { useState } from "react";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { Loader2 } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
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
import { readRepositoryStackCheck } from "./repositoryStackCheck";
import type { RepositoryAlchemyState } from "./useRepositoryAlchemyState";

type RepositoryDeleteTarget = {
  repositoryId: UserRepositoryResult["repositoryId"];
  githubRepositoryFullName: string;
  /** Why the dialog cannot delete the GitHub repository, null when it can. */
  removeGithubRepoBlockedReason: string | null;
  /**
  Its GitHub Actions set it up and its stack may still exist, so its Destroy app workflow is the way
  to destroy what the stack created.
  */
  hasSetupStack: boolean;
};

type RepositoryDeleteProgress = "idle" | "committing" | "deleting";
type RepositoryDeleteOperation =
  | {
      state: "idle";
      commitError: string | null;
      deleteError: string | null;
      didAttemptCommit: boolean;
    }
  | { state: "committing"; didAttemptCommit: boolean }
  | { state: "deleting"; didAttemptCommit: boolean };

/** What removal keeps for a repository that its GitHub Actions set up, and the destroy to run first. */
function SetupStackRemovalNote({ target }: { target: RepositoryDeleteTarget }) {
  return (
    <div className="text-sm text-muted-foreground">
      Your deployed app stays in your cloud accounts. To delete what your Alchemy stack created,
      first open the{" "}
      <a
        className="font-medium text-foreground underline underline-offset-4"
        href={`https://github.com/${target.githubRepositoryFullName}/actions/workflows/destroy.yml`}
        rel="noreferrer noopener"
        target="_blank"
      >
        Destroy app
      </a>{" "}
      workflow, click Run workflow, and type{" "}
      <span className="font-mono">{`delete stack and production data of ${target.githubRepositoryFullName}`}</span>
      . Deleting the GitHub repository also deletes that workflow.
    </div>
  );
}

export function RepositoryDeleteDialogContent({
  blockedReason,
  commitError,
  deleteError,
  didAttemptCommit,
  onCommitBeforeRemove,
  onOpenChange,
  onRemoveGithubRepoChange,
  onRemoveRepository,
  progress,
  removeGithubRepo,
  stagedChangesCount,
  target,
}: {
  blockedReason?: string | null;
  commitError: string | null;
  deleteError: string | null;
  didAttemptCommit: boolean;
  onCommitBeforeRemove: () => void;
  onOpenChange: (isOpen: boolean) => void;
  onRemoveGithubRepoChange: (value: boolean) => void;
  onRemoveRepository: () => void;
  progress: RepositoryDeleteProgress;
  removeGithubRepo: boolean;
  stagedChangesCount: number;
  target: RepositoryDeleteTarget;
}) {
  const hasStagedChanges = stagedChangesCount > 0;
  const removeGithubRepoBlocked = target.removeGithubRepoBlockedReason !== null;
  const isCommitting = progress === "committing";
  const isDeleting = progress === "deleting";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>Remove {target.githubRepositoryFullName} from Samebase?</DialogTitle>
          <DialogDescription>
            {hasStagedChanges
              ? `You have ${stagedChangesCount} uncommitted change${stagedChangesCount === 1 ? "" : "s"}. Removal deletes ${stagedChangesCount === 1 ? "it, so commit it" : "them, so commit them"} first.`
              : "All your changes are on GitHub."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Checkbox
              id="remove-github-repo"
              checked={removeGithubRepo}
              onCheckedChange={(checked) => onRemoveGithubRepoChange(checked === true)}
              disabled={removeGithubRepoBlocked || isDeleting || isCommitting}
              className="mt-0.5"
            />
            <label htmlFor="remove-github-repo" className="text-sm text-muted-foreground">
              Also delete the GitHub repository
              {removeGithubRepoBlocked ? (
                <div className="text-xs text-muted-foreground">
                  {target.removeGithubRepoBlockedReason}
                </div>
              ) : null}
            </label>
          </div>
          {target.hasSetupStack ? (
            <SetupStackRemovalNote target={target} />
          ) : (
            <div className="text-sm text-muted-foreground">
              Your deployed app stays in your cloud accounts. Delete it there if you no longer need
              it.
            </div>
          )}
          {deleteError ? <div className="text-sm text-red-600">{deleteError}</div> : null}
          {commitError ? <div className="text-sm text-red-600">{commitError}</div> : null}
          {blockedReason ? (
            <div className="text-sm text-muted-foreground">{blockedReason}</div>
          ) : null}
          {didAttemptCommit && hasStagedChanges ? (
            <div className="text-sm text-muted-foreground">
              Some changes are still uncommitted. Retry the commit or remove anyway.
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
            onClick={onRemoveRepository}
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

export function RepositoryDeleteDialog({
  alchemyState,
  onClose,
  onDeleted,
  repository,
}: {
  alchemyState: RepositoryAlchemyState;
  onClose: () => void;
  onDeleted: () => void;
  repository: UserRepositoryResult;
}) {
  const deleteRepository = useAction(api.repository.actions.deleteRepository);
  const commitStaging = useAction(api.fileStagingActions.commitStaging);
  const [operation, setOperation] = useState<RepositoryDeleteOperation>({
    state: "idle",
    commitError: null,
    deleteError: null,
    didAttemptCommit: false,
  });
  const [removeGithubRepo, setRemoveGithubRepo] = useState(false);

  const confirmBlockedReason =
    repository.deletion.state !== "not_deleting"
      ? repository.deletion.message
      : repository.deletion.deleteAction.state === "disabled"
        ? repository.deletion.deleteAction.reason
        : null;

  const stackCheck = readRepositoryStackCheck(repository, alchemyState);
  const target = {
    repositoryId: repository.repositoryId,
    githubRepositoryFullName: repository.githubRepositoryFullName,
    removeGithubRepoBlockedReason: !(
      repository.isSamebaseManaged && repository.hasConnectedGitHubRepository
    )
      ? "Available only for repositories that Samebase created."
      : stackCheck.state === "no_stack"
        ? null
        : stackCheck.reason,
    hasSetupStack: repository.providerPlan !== null && stackCheck.state !== "no_stack",
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
      await commitStaging({ githubRepositoryFullName: target.githubRepositoryFullName });
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

  const handleRemoveRepository = async () => {
    if (confirmBlockedReason || operation.state !== "idle") {
      return;
    }

    setOperation({
      state: "deleting",
      didAttemptCommit: operation.didAttemptCommit,
    });
    try {
      await deleteRepository({
        repositoryId: target.repositoryId,
        removeGithubRepo: target.removeGithubRepoBlockedReason === null && removeGithubRepo,
      });
      onDeleted();
    } catch (error) {
      console.error("Failed to remove repository:", error);
      setOperation({
        state: "idle",
        commitError: null,
        deleteError:
          error instanceof ConvexError && typeof error.data === "string"
            ? error.data
            : error instanceof Error
              ? error.message
              : "Failed to remove repository from Samebase.",
        didAttemptCommit: operation.didAttemptCommit,
      });
    }
  };

  return (
    <RepositoryDeleteDialogContent
      blockedReason={confirmBlockedReason}
      commitError={operation.state === "idle" ? operation.commitError : null}
      deleteError={operation.state === "idle" ? operation.deleteError : null}
      didAttemptCommit={operation.didAttemptCommit}
      onCommitBeforeRemove={() => {
        void handleCommitBeforeRemove();
      }}
      onOpenChange={(isOpen) => {
        if (!isOpen && operation.state === "idle") {
          onClose();
        }
      }}
      onRemoveGithubRepoChange={setRemoveGithubRepo}
      onRemoveRepository={() => {
        void handleRemoveRepository();
      }}
      progress={operation.state}
      removeGithubRepo={removeGithubRepo && target.removeGithubRepoBlockedReason === null}
      stagedChangesCount={repository.fileCount}
      target={target}
    />
  );
}
