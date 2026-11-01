import { useState } from "react";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { isSamebaseManagedProviderPlan } from "../../../convex/repository/provisioningPlan";
import { getConvexCodeLocationPath } from "../../../shared/convexCodeLocation";
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

type RepositoryDeleteTarget = {
  repositoryId: UserRepositoryResult["repositoryId"];
  githubRepositoryFullName: string;
  isSamebaseManaged: boolean;
  canRemoveGithubRepo: boolean;
  hasConvexProvision: boolean;
  hasCloudflareProvision: boolean;
  canRemoveConvexProvision: boolean;
  canRemoveCloudflareProvision: boolean;
  /**
  For a repository that its GitHub Actions set up: the attached resources, which removal keeps. Only
  the repository's Destroy app workflow destroys what its setup stack created.
  */
  setupStack: { workerNames: string[]; convexCodeLocations: string[] } | null;
};

type RepositoryDeleteOptionKey =
  | "removeConvexProvision"
  | "removeGithubRepo"
  | "removeCloudflareProvision";

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

type RepositoryDeleteOptions = {
  removeConvexProvision: boolean;
  removeGithubRepo: boolean;
  removeCloudflareProvision: boolean;
};

/** What removal keeps for a repository that its GitHub Actions set up, and the destroy to run first. */
function SetupStackRemovalNote({ target }: { target: RepositoryDeleteTarget }) {
  if (!target.setupStack) {
    return null;
  }
  const retained = [
    ...target.setupStack.workerNames.map((workerName) => `the Worker ${workerName}`),
    ...target.setupStack.convexCodeLocations.map(
      (codeLocation) => `the Convex project at ${codeLocation}`,
    ),
  ];
  return (
    <div className="text-sm text-muted-foreground">
      Samebase keeps {retained.join(", ") || "the Convex project of this app"}. To delete what the
      setup stack in alchemy.run.ts created, first open the{" "}
      <a
        className="font-medium text-foreground underline underline-offset-4"
        href={`https://github.com/${target.githubRepositoryFullName}/actions/workflows/destroy.yml`}
        rel="noreferrer noopener"
        target="_blank"
      >
        Destroy app
      </a>{" "}
      workflow, click Run workflow, and type{" "}
      <span className="font-mono">{`delete stack and production data of ${target.githubRepositoryFullName}`}</span>{" "}
      in its field. Deleting the GitHub repository also deletes that workflow.
    </div>
  );
}

export function RepositoryDeleteDialogContent({
  blockedReason,
  commitError,
  deleteError,
  didAttemptCommit,
  onCommitBeforeRemove,
  onDeleteOptionChange,
  onOpenChange,
  onRemoveRepository,
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
  onDeleteOptionChange: (option: RepositoryDeleteOptionKey, value: boolean) => void;
  onOpenChange: (isOpen: boolean) => void;
  onRemoveRepository: () => void;
  progress: RepositoryDeleteProgress;
  removeConvexProvision: boolean;
  removeGithubRepo: boolean;
  removeCloudflareProvision: boolean;
  stagedChangesCount: number;
  target: RepositoryDeleteTarget;
}) {
  const hasStagedChanges = stagedChangesCount > 0;
  const isCommitting = progress === "committing";
  const isDeleting = progress === "deleting";
  const removeCloudflareCheckboxId = "remove-cloudflare-provision";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>Remove {target.githubRepositoryFullName} from Samebase?</DialogTitle>
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
          <SetupStackRemovalNote target={target} />
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
  onClose,
  onDeleted,
  repository,
}: {
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
  const [options, setOptions] = useState<RepositoryDeleteOptions>({
    removeConvexProvision: false,
    removeGithubRepo: false,
    removeCloudflareProvision: false,
  });

  const confirmBlockedReason =
    repository.deletion.state === "deleting"
      ? "Removal from Samebase is in progress."
      : repository.deletion.state === "delete_failed"
        ? "Retry removal before you remove this repository from Samebase."
        : repository.deletion.deleteAction.state === "disabled"
          ? repository.deletion.deleteAction.reason
          : null;

  const target = {
    repositoryId: repository.repositoryId,
    githubRepositoryFullName: repository.githubRepositoryFullName,
    isSamebaseManaged: repository.isSamebaseManaged,
    canRemoveGithubRepo: repository.isSamebaseManaged && repository.hasConnectedGitHubRepository,
    hasConvexProvision: repository.hasConvexProvision,
    hasCloudflareProvision: repository.hasCloudflareProvision,
    canRemoveConvexProvision: repository.canRemoveConvexProvision,
    canRemoveCloudflareProvision: repository.canRemoveCloudflareProvision,
    setupStack:
      repository.providerPlan && !isSamebaseManagedProviderPlan(repository.providerPlan)
        ? {
            workerNames: repository.cloudflareWorkers
              .map((worker) => worker.workerName)
              .sort((left, right) => left.localeCompare(right)),
            convexCodeLocations: repository.convexProjects
              .map((project) => getConvexCodeLocationPath(project.codeLocation))
              .sort((left, right) => left.localeCompare(right)),
          }
        : null,
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
      console.error("Failed to remove repository:", error);
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
    <RepositoryDeleteDialogContent
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
      onRemoveRepository={() => {
        void handleRemoveRepository();
      }}
      progress={operation.state}
      removeConvexProvision={options.removeConvexProvision}
      removeGithubRepo={options.removeGithubRepo}
      removeCloudflareProvision={options.removeCloudflareProvision}
      stagedChangesCount={repository.fileCount}
      target={target}
    />
  );
}
