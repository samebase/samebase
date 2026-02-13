import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GitHubLogoIcon,
  FileTextIcon,
  ClockIcon,
  TrashIcon,
  UpdateIcon,
  ChevronDownIcon,
} from "@radix-ui/react-icons";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { linkStyle } from "./styles";
import { clsx } from "clsx";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import { useAction } from "convex/react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import { CodespaceStatus } from "@/components/CodespaceStatus";
import type { Id } from "../../convex/_generated/dataModel";

const formatTimeAgo = (timestamp: number) => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (hours < 24) {
    return `${hours}h ago`;
  } else {
    return `${days}d ago`;
  }
};

const formatInfraState = (
  infraState:
    | "not_started"
    | "provisioning"
    | "ready"
    | "failed"
    | "partial",
) => {
  if (infraState === "not_started") return "Not started";
  if (infraState === "provisioning") return "Provisioning";
  if (infraState === "ready") return "Ready";
  if (infraState === "failed") return "Failed";
  return "Partial";
};

const getInfraActionLabel = (
  infraState:
    | "not_started"
    | "provisioning"
    | "ready"
    | "failed"
    | "partial",
) => {
  if (infraState === "not_started") return "Provision infra";
  if (infraState === "failed" || infraState === "partial") return "Retry infra";
  return null;
};

export function VaultDashboard() {
  const vaults = useQuery(api.vault.getUserVaults);
  const deleteVault = useAction(api.vaultActions.deleteVault);
  const createRepository = useAction(api.vaultActions.createRepository);
  const retryInfrastructureProvisioning = useAction(
    api.vaultActions.retryInfrastructureProvisioning,
  );
  const commitStaging = useAction(api.fileStagingActions.commitStaging);
  const [vaultToDelete, setVaultToDelete] = useState<{
    id: Id<"vaults">;
    repositoryFullName: string;
    isNoterManaged: boolean;
  } | null>(null);
  const [removeGithubRepo, setRemoveGithubRepo] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [didAttemptCommit, setDidAttemptCommit] = useState(false);
  const [retryingVaultId, setRetryingVaultId] = useState<Id<"vaults"> | null>(
    null,
  );

  const selectedVault =
    vaultToDelete && vaults
      ? vaults.find((vault: (typeof vaults)[0]) => vault._id === vaultToDelete.id) ?? null
      : null;
  const stagedChangesCount = selectedVault?.fileCount ?? 0;
  const hasStagedChanges = stagedChangesCount > 0;

  const handleRemoveVault = async () => {
    if (!vaultToDelete || isDeleting || isCommitting) return;

    try {
      setIsDeleting(true);
      await deleteVault({
        vaultId: vaultToDelete.id,
        removeGithubRepo: vaultToDelete.isNoterManaged
          ? removeGithubRepo
          : false,
      });
      setVaultToDelete(null);
      setRemoveGithubRepo(false);
      setCommitError(null);
      setDidAttemptCommit(false);
    } catch (error) {
      console.error("Failed to remove vault:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCommitBeforeRemove = async () => {
    if (!vaultToDelete || isCommitting || isDeleting) return;

    setIsCommitting(true);
    setCommitError(null);

    try {
      await commitStaging({
        repositoryFullName: vaultToDelete.repositoryFullName,
      });
    } catch (error) {
      setCommitError(
        error instanceof Error ? error.message : "Failed to commit changes",
      );
    } finally {
      setDidAttemptCommit(true);
      setIsCommitting(false);
    }
  };

  const handleCreateRepository = async () => {
    const repoName = newAgentName.trim();
    if (!repoName || isCreating) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      await createRepository({
        name: repoName,
        private: true,
      });
      setNewAgentName("");
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Failed to create agent",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleRetryInfrastructure = async (vaultId: Id<"vaults">) => {
    if (retryingVaultId === vaultId) {
      return;
    }
    setRetryingVaultId(vaultId);
    try {
      await retryInfrastructureProvisioning({ vaultId });
    } catch (error) {
      console.error("Failed to retry infrastructure provisioning:", error);
    } finally {
      setRetryingVaultId(null);
    }
  };

  const createControl = (
    <div className="flex flex-col items-start gap-2">
      <ButtonGroup className="w-full sm:w-[360px]">
        <Input
          placeholder="New agent name"
          value={newAgentName}
          onChange={(e) => {
            setNewAgentName(e.target.value);
            if (createError) {
              setCreateError(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void handleCreateRepository();
            }
          }}
          className="flex-1"
        />
        <Button
          onClick={() => {
            void handleCreateRepository();
          }}
          disabled={isCreating || newAgentName.trim().length === 0}
        >
          {isCreating ? "Creating..." : "New agent"}
        </Button>
        <ButtonGroupSeparator className="bg-primary-foreground/30" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="px-2" aria-label="More actions">
              <ChevronDownIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to="/add">Connect existing repo</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      {createError && (
        <div className="text-sm text-red-600">{createError}</div>
      )}
    </div>
  );

  if (!vaults) {
    return null;
  }

  if (vaults.length === 0) {
    return (
      <div className="container py-6 max-w-2xl mx-auto">
        <div className="text-center space-y-6">
          <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center">
            <GitHubLogoIcon className="h-12 w-12 text-muted-foreground" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Create your first agent</h1>
            <p className="text-lg text-muted-foreground">
              Start with a new agent or connect an existing repository to edit
              files directly in your browser.
            </p>
          </div>

          <div className="flex justify-center">{createControl}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <GitHubLogoIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          <h1 className="text-xl sm:text-2xl font-semibold">Your Vaults</h1>
        </div>
        {createControl}
      </div>

      <div className="space-y-2">
        {vaults.map((vault: (typeof vaults)[0]) => {
          const isReady = vault.state === "ready";
          const infraActionLabel = vault.isNoterManaged
            ? getInfraActionLabel(vault.infraState)
            : null;
          return (
            <div
              key={vault._id}
              className={clsx(
                "flex items-center justify-between p-4 border rounded-lg transition-colors",
                isReady ? "hover:bg-muted/50" : "bg-muted/30 opacity-75",
              )}
            >
              <Link
                to={isReady ? `/vault/${vault.repositoryFullName}` : "#"}
                className={clsx(
                  "flex items-center gap-4 flex-1 min-w-0",
                  !isReady && "pointer-events-none",
                )}
              >
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-col items-start ">
                    <span
                      className={`text-sm text-muted-foreground ${linkStyle}`}
                    >
                      {vault.ghRepoOwner}/
                    </span>

                    <h3 className="font-semibold truncate">
                      <span className={`flex items-center gap-2 ${linkStyle}`}>
                        {!isReady && (
                          <UpdateIcon className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        {vault.ghRepoName}
                        {!isReady && (
                          <span className="text-xs text-muted-foreground font-normal">
                            (setting up...)
                          </span>
                        )}
                      </span>
                    </h3>
                  </div>

                  {isReady && (
                    <div className="space-y-1.5">
                      <CodespaceStatus vaultId={vault._id} />
                      {vault.isNoterManaged && (
                        <div className="text-xs text-muted-foreground">
                          Infra: {formatInfraState(vault.infraState)}
                          {vault.infraProductionUrl && (
                            <span className="ml-2 font-mono">
                              {vault.infraProductionUrl}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <FileTextIcon className="h-3 w-3" />
                    <span>
                      {vault.fileCount} edited file
                      {vault.fileCount !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div
                    className={clsx("flex items-center gap-1", {
                      invisible: !vault.lastEditTime,
                    })}
                  >
                    <ClockIcon className="h-3 w-3" />
                    <span>
                      {vault.lastEditTime
                        ? formatTimeAgo(vault.lastEditTime)
                        : "0m ago"}
                    </span>
                  </div>
                </div>
              </Link>

              <div className="ml-2 flex items-center gap-2">
                {infraActionLabel && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleRetryInfrastructure(vault._id);
                    }}
                    disabled={retryingVaultId === vault._id}
                  >
                    {retryingVaultId === vault._id ? (
                      <>
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        Retrying...
                      </>
                    ) : (
                      infraActionLabel
                    )}
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setVaultToDelete({
                      id: vault._id,
                      repositoryFullName: vault.repositoryFullName,
                      isNoterManaged: vault.isNoterManaged,
                    });
                    setRemoveGithubRepo(vault.isNoterManaged);
                    setCommitError(null);
                    setDidAttemptCommit(false);
                  }}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Dialog */}
      <Dialog
        open={!!vaultToDelete}
        onOpenChange={() => {
          if (isDeleting || isCommitting) return;
          setVaultToDelete(null);
          setRemoveGithubRepo(false);
          setCommitError(null);
          setDidAttemptCommit(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {vaultToDelete
                ? `Remove Vault ${vaultToDelete.repositoryFullName}`
                : "Remove Vault"}
            </DialogTitle>
            <DialogDescription>
              {hasStagedChanges
                ? `This vault has ${stagedChangesCount} uncommitted local change${stagedChangesCount === 1 ? "" : "s"}. You can commit ${stagedChangesCount === 1 ? "it" : "them"} now.`
                : "All local changes are already backed up on GitHub."}
            </DialogDescription>
          </DialogHeader>
          {vaultToDelete && (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <input
                  id="remove-github-repo"
                  type="checkbox"
                  checked={removeGithubRepo}
                  onChange={(e) => setRemoveGithubRepo(e.target.checked)}
                  disabled={
                    !vaultToDelete.isNoterManaged || isDeleting || isCommitting
                  }
                  className="mt-0.5 h-4 w-4 rounded border border-input"
                />
                <label
                  htmlFor="remove-github-repo"
                  className="text-sm text-muted-foreground"
                >
                  Also remove GitHub repository
                  {!vaultToDelete.isNoterManaged && (
                    <div className="text-xs text-muted-foreground">
                      Only available for repositories created in Noter.
                    </div>
                  )}
                </label>
              </div>
              {commitError && (
                <div className="text-sm text-red-600">{commitError}</div>
              )}
              {didAttemptCommit && hasStagedChanges && (
                <div className="text-sm text-muted-foreground">
                  Some local changes are still uncommitted. You can retry
                  commit or remove anyway.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (isDeleting || isCommitting) return;
                setVaultToDelete(null);
                setRemoveGithubRepo(false);
                setCommitError(null);
                setDidAttemptCommit(false);
              }}
              disabled={isDeleting || isCommitting}
            >
              Cancel
            </Button>
            {vaultToDelete && hasStagedChanges && (
              <Button
                variant="outline"
                onClick={() => {
                  void handleCommitBeforeRemove();
                }}
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
            )}
            <Button
              variant="destructive"
              onClick={() => {
                void handleRemoveVault();
              }}
              disabled={isDeleting || isCommitting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Vault"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
