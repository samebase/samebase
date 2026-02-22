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
  LightningBoltIcon,
  GlobeIcon,
} from "@radix-ui/react-icons";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { linkStyle } from "./styles";
import { clsx } from "clsx";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import {
  useAction,
  useMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { isInIframe, openAuthPopup } from "@/SignInForm";
import { UserMenu } from "@/components/UserMenu";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import { CodespaceStatus } from "@/components/CodespaceStatus";
import { DaytonaWorkspaceButton } from "@/components/DaytonaWorkspaceButton";
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
  infraState: "not_started" | "provisioning" | "ready" | "failed" | "partial",
) => {
  if (infraState === "not_started") return "Not started";
  if (infraState === "provisioning") return "Provisioning";
  if (infraState === "ready") return "Ready";
  if (infraState === "failed") return "Failed";
  return "Partial";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getRedirectOrigin = (oauthUrl: string): string | null => {
  try {
    const url = new URL(oauthUrl);
    const redirect = url.searchParams.get("redirect_uri");
    if (!redirect) return null;
    return new URL(redirect).origin;
  } catch {
    return null;
  }
};

const getInfraActionLabel = (
  infraState: "not_started" | "provisioning" | "ready" | "failed" | "partial",
) => {
  if (infraState === "not_started") return "Provision infra";
  if (infraState === "failed" || infraState === "partial") return "Retry infra";
  return null;
};

type CreateTemplate = "app" | "agent";

const isCreateTemplate = (value: string): value is CreateTemplate =>
  value === "app" || value === "agent";

export function VaultDashboard() {
  const vaults = useQuery(api.vault.getUserVaults);
  const { signIn } = useAuthActions();
  const deleteVault = useAction(api.vaultActions.deleteVault);
  const createRepository = useAction(api.vaultActions.createRepository);
  const retryInfrastructureProvisioning = useAction(
    api.vaultActions.retryInfrastructureProvisioning,
  );
  const commitStaging = useAction(api.fileStagingActions.commitStaging);
  const getConvexOAuthUrl = useMutation(api.convexOAuth.getConvexOAuthUrl);
  const getNetlifyOAuthUrl = useMutation(api.netlifyOAuth.getNetlifyOAuthUrl);
  const disconnectGithub = useMutation(api.users.disconnectGithub);
  const disconnectConvex = useMutation(api.users.disconnectConvex);
  const disconnectNetlify = useMutation(api.users.disconnectNetlify);
  const githubConnection = useConvexQuery(api.users.getGithubConnectionStatus);
  const convexConnection = useConvexQuery(api.users.getConvexConnectionStatus);
  const netlifyConnection = useConvexQuery(
    api.users.getNetlifyConnectionStatus,
  );
  const user = useConvexQuery(api.users.viewer);
  const canCreateRepo = Boolean(
    githubConnection?.connected &&
      convexConnection?.connected &&
      netlifyConnection?.connected,
  );
  const convexPopupRef = useRef<Window | null>(null);
  const netlifyPopupRef = useRef<Window | null>(null);
  const convexPopupOriginRef = useRef<string | null>(null);
  const netlifyPopupOriginRef = useRef<string | null>(null);
  const [vaultToDelete, setVaultToDelete] = useState<{
    id: Id<"vaults">;
    repositoryFullName: string;
    isNoterManaged: boolean;
    hasConvexProvision: boolean;
    hasNetlifyProvision: boolean;
  } | null>(null);
  const [removeGithubRepo, setRemoveGithubRepo] = useState(false);
  const [removeCodespaces, setRemoveCodespaces] = useState(false);
  const [removeConvexProvision, setRemoveConvexProvision] = useState(false);
  const [removeNetlifyProvision, setRemoveNetlifyProvision] = useState(false);
  const [removeDaytonaResources, setRemoveDaytonaResources] = useState(false);
  const [newRepositoryName, setNewRepositoryName] = useState("");
  const [createTemplate, setCreateTemplate] = useState<CreateTemplate>("app");
  const [disconnectingProvider, setDisconnectingProvider] = useState<
    "github" | "convex" | "netlify" | null
  >(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [didAttemptCommit, setDidAttemptCommit] = useState(false);
  const [retryingVaultId, setRetryingVaultId] = useState<Id<"vaults"> | null>(
    null,
  );

  useEffect(() => {
    const expectedOrigin = window.location.origin;
    const handler = (event: MessageEvent) => {
      if (!isRecord(event.data)) return;
      if (
        event.data.type === "convex-oauth-complete" &&
        event.source === convexPopupRef.current
      ) {
        if (event.origin !== (convexPopupOriginRef.current ?? expectedOrigin)) {
          return;
        }
        window.location.reload();
      }
      if (
        event.data.type === "netlify-oauth-complete" &&
        event.source === netlifyPopupRef.current
      ) {
        if (
          event.origin !== (netlifyPopupOriginRef.current ?? expectedOrigin)
        ) {
          return;
        }
        window.location.reload();
      }
    };

    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
    };
  }, []);

  const selectedVault =
    vaultToDelete && vaults
      ? vaults.find(
          (vault: (typeof vaults)[0]) => vault._id === vaultToDelete.id,
        ) ?? null
      : null;
  const stagedChangesCount = selectedVault?.fileCount ?? 0;
  const hasStagedChanges = stagedChangesCount > 0;
  const hasDaytonaResources = Boolean(
    selectedVault?.daytonaSandboxId ||
      selectedVault?.daytonaSnapshotName ||
      selectedVault?.daytonaPrebuildLogsSnapshot,
  );
  const resetDeleteDialogState = () => {
    setVaultToDelete(null);
    setRemoveGithubRepo(false);
    setRemoveCodespaces(false);
    setRemoveConvexProvision(false);
    setRemoveNetlifyProvision(false);
    setRemoveDaytonaResources(false);
    setCommitError(null);
    setDidAttemptCommit(false);
  };

  const connectedCodespacesCount = useConvexQuery(
    api.codespacesMutations.getConnectedCodespacesCount,
    vaultToDelete ? { vaultId: vaultToDelete.id } : "skip",
  );

  const handleConnectGithub = () => {
    if (isInIframe()) {
      openAuthPopup("github");
      return;
    }
    void signIn("github");
  };

  const handleConnectConvex = async () => {
    if (createError) {
      setCreateError(null);
    }
    try {
      const oauthUrl = await getConvexOAuthUrl();
      if (isInIframe()) {
        convexPopupOriginRef.current =
          getRedirectOrigin(oauthUrl) ?? window.location.origin;
        convexPopupRef.current = window.open(
          oauthUrl,
          "convex-oauth",
          "width=600,height=700,popup=true",
        );
        return;
      }
      window.location.assign(oauthUrl);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Failed to start Convex OAuth",
      );
    }
  };

  const handleDisconnect = async (
    provider: "github" | "convex" | "netlify",
  ) => {
    if (disconnectingProvider) return;
    setDisconnectingProvider(provider);
    if (createError) {
      setCreateError(null);
    }
    try {
      if (provider === "github") {
        await disconnectGithub();
      } else if (provider === "convex") {
        await disconnectConvex();
      } else {
        await disconnectNetlify();
      }
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : `Failed to disconnect ${provider}`,
      );
    } finally {
      setDisconnectingProvider(null);
    }
  };

  const handleConnectNetlify = async () => {
    if (createError) {
      setCreateError(null);
    }
    try {
      const oauthUrl = await getNetlifyOAuthUrl();
      if (isInIframe()) {
        netlifyPopupOriginRef.current =
          getRedirectOrigin(oauthUrl) ?? window.location.origin;
        netlifyPopupRef.current = window.open(
          oauthUrl,
          "netlify-oauth",
          "width=600,height=700,popup=true",
        );
        return;
      }
      window.location.assign(oauthUrl);
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : "Failed to start Netlify OAuth",
      );
    }
  };

  const handleRemoveVault = async () => {
    if (!vaultToDelete || isDeleting || isCommitting) return;

    try {
      setIsDeleting(true);
      await deleteVault({
        vaultId: vaultToDelete.id,
        removeCodespaces:
          connectedCodespacesCount === 0 ? true : removeCodespaces,
        removeGithubRepo: vaultToDelete.isNoterManaged
          ? removeGithubRepo
          : false,
        removeConvexProvision:
          vaultToDelete.isNoterManaged && vaultToDelete.hasConvexProvision
            ? removeConvexProvision
            : false,
        removeNetlifyProvision:
          vaultToDelete.isNoterManaged && vaultToDelete.hasNetlifyProvision
            ? removeNetlifyProvision
            : false,
        removeDaytonaResources,
      });
      resetDeleteDialogState();
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
    const repoName = newRepositoryName.trim();
    if (!repoName || isCreating) return;
    if (!canCreateRepo) {
      setCreateError(
        `Connect GitHub, Convex, and Netlify before creating ${createTemplateArticle}.`,
      );
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      await createRepository({
        name: repoName,
        private: true,
        templateType: createTemplate,
      });
      setNewRepositoryName("");
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : `Failed to create ${createTemplate}`,
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

  const githubConnected = githubConnection?.connected === true;
  const convexConnected = convexConnection?.connected === true;
  const netlifyConnected = netlifyConnection?.connected === true;
  const githubStatus = githubConnected
    ? `Connected as ${githubConnection?.username ?? "GitHub user"}`
    : "Not connected";
  const convexStatus = convexConnected
    ? `Connected to ${convexConnection?.teamSlug ?? convexConnection?.teamId ?? "Convex team"}`
    : "Not connected";
  const netlifyStatus = netlifyConnected
    ? `Connected to ${netlifyConnection?.teamSlug ?? netlifyConnection?.teamId ?? "Netlify team"}`
    : "Not connected";
  const userDisplayName =
    user?.name ?? user?.email ?? user?.githubUsername ?? "...";
  const userMenu = user ? <UserMenu>{userDisplayName}</UserMenu> : null;
  const createTemplateLabel = createTemplate === "app" ? "App" : "Agent";
  const createTemplateArticle =
    createTemplate === "app" ? "an app" : "an agent";
  const createPlaceholder = `New ${createTemplate} name`;
  const createButtonLabel = isCreating
    ? `Creating ${createTemplate}...`
    : `New ${createTemplate}`;
  const createControl = (
    <div className="flex flex-col items-start gap-2">
      <ButtonGroup className="w-full sm:w-[480px]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2" variant="outline">
              {createTemplateLabel}
              <ChevronDownIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={createTemplate}
              onValueChange={(value) => {
                if (!isCreateTemplate(value)) return;
                setCreateTemplate(value);
                if (createError) {
                  setCreateError(null);
                }
              }}
            >
              <DropdownMenuRadioItem value="app">App</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="agent">Agent</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Input
          placeholder={createPlaceholder}
          value={newRepositoryName}
          onChange={(e) => {
            setNewRepositoryName(e.target.value);
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
          disabled={!canCreateRepo}
        />
        <Button
          onClick={() => {
            void handleCreateRepository();
          }}
          disabled={
            isCreating ||
            newRepositoryName.trim().length === 0 ||
            !canCreateRepo
          }
        >
          {createButtonLabel}
        </Button>
        <ButtonGroupSeparator className="bg-primary-foreground/30" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="px-2" aria-label="More actions">
              <ChevronDownIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {githubConnected ? (
              <DropdownMenuItem asChild>
                <Link to="/add">Connect existing repo</Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled>
                Connect existing repo
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      {createError && <div className="text-sm text-red-600">{createError}</div>}
      {!canCreateRepo && (
        <div className="text-xs text-muted-foreground">
          Connect GitHub, Convex, and Netlify to create apps or agents.
        </div>
      )}
    </div>
  );

  const connectionPanel = (
    <div className="rounded-lg border border-border bg-background p-4 space-y-3">
      <div className="text-sm font-medium">Connections</div>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GitHubLogoIcon className="h-4 w-4" />
            <div>
              <div className="text-sm font-medium">GitHub</div>
              <div className="text-xs text-muted-foreground">
                {githubStatus}
              </div>
            </div>
          </div>
          {githubConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDisconnect("github")}
              disabled={disconnectingProvider !== null}
            >
              {disconnectingProvider === "github" ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                "Disconnect"
              )}
            </Button>
          ) : (
            <Button size="sm" onClick={handleConnectGithub}>
              Connect GitHub
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LightningBoltIcon className="h-4 w-4" />
            <div>
              <div className="text-sm font-medium">Convex</div>
              <div className="text-xs text-muted-foreground">
                {convexStatus}
              </div>
            </div>
          </div>
          {convexConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDisconnect("convex")}
              disabled={disconnectingProvider !== null}
            >
              {disconnectingProvider === "convex" ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                "Disconnect"
              )}
            </Button>
          ) : (
            <Button size="sm" onClick={() => void handleConnectConvex()}>
              Connect Convex
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GlobeIcon className="h-4 w-4" />
            <div>
              <div className="text-sm font-medium">Netlify</div>
              <div className="text-xs text-muted-foreground">
                {netlifyStatus}
              </div>
            </div>
          </div>
          {netlifyConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDisconnect("netlify")}
              disabled={disconnectingProvider !== null}
            >
              {disconnectingProvider === "netlify" ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                "Disconnect"
              )}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleConnectNetlify()}
            >
              Connect Netlify
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  if (!vaults) {
    return null;
  }

  if (vaults.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="container py-6 max-w-2xl mx-auto">
          {userMenu && <div className="mb-4 flex justify-end">{userMenu}</div>}
          <div className="text-center space-y-6">
            <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center">
              <GitHubLogoIcon className="h-12 w-12 text-muted-foreground" />
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-bold">Create your first project</h1>
              <p className="text-lg text-muted-foreground">
                Start with a new project or connect an existing repository to
                edit files directly in your browser.
              </p>
            </div>

            <div className="space-y-4">
              {connectionPanel}
              <div className="flex justify-center">{createControl}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="container py-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-2">
            <GitHubLogoIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            <h1 className="text-xl sm:text-2xl font-semibold">Your Vaults</h1>
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            {createControl}
            {userMenu}
          </div>
        </div>
        <div className="mb-6">{connectionPanel}</div>

        <div className="space-y-2">
          {vaults.map((vault: (typeof vaults)[0]) => {
            const isReady = vault.state === "ready";
            const defaultBranch = "main";
            const chatRoute = `/vault/${vault.repositoryFullName}/${defaultBranch}/chat`;
            const infraActionLabel = vault.isNoterManaged
              ? getInfraActionLabel(vault.infraState)
              : null;
            return (
              <div
                key={vault._id}
                className={clsx(
                  "flex flex-col gap-3 p-4 border rounded-lg sm:flex-row sm:items-center sm:justify-between sm:gap-0",
                  !isReady && "bg-muted/30 opacity-75",
                )}
              >
                <div className="flex flex-col gap-3 flex-1 min-w-0 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-col items-start ">
                      <span className="text-sm text-muted-foreground">
                        {vault.ghRepoOwner}/
                      </span>

                      <h3 className="font-semibold">
                        <span className="flex items-center gap-2 min-w-0">
                          {!isReady && (
                            <UpdateIcon className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                          )}
                          <span className="min-w-0 truncate">
                            {vault.ghRepoName}
                          </span>
                          {!isReady && (
                            <span className="text-xs text-muted-foreground font-normal shrink-0">
                              (setting up...)
                            </span>
                          )}
                        </span>
                      </h3>
                    </div>

                    {isReady && (
                      <div className="space-y-1.5">
                        <CodespaceStatus vaultId={vault._id} />
                        <DaytonaWorkspaceButton
                          vaultId={vault._id}
                          branch={defaultBranch}
                          sandboxId={vault.daytonaSandboxId}
                          sandboxName={vault.daytonaSandboxName}
                        />
                        {vault.isNoterManaged && (
                          <div className="text-xs text-muted-foreground">
                            Infra: {formatInfraState(vault.infraState)}
                            {vault.infraProductionUrl && (
                              <a
                                href={vault.infraProductionUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className={`ml-2 font-mono break-all ${linkStyle}`}
                              >
                                {vault.infraProductionUrl}
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-row items-center gap-4 text-xs text-muted-foreground sm:flex-col sm:items-end sm:gap-1 sm:text-sm">
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
                </div>

                <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:ml-2 sm:w-auto sm:flex-nowrap">
                  {isReady ? (
                    <>
                      <Button asChild variant="secondary" size="sm">
                        <Link
                          to={`/vault/${vault.repositoryFullName}/${defaultBranch}`}
                        >
                          {defaultBranch}
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link to={chatRoute}>Chat</Link>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="secondary" size="sm" disabled>
                        {defaultBranch}
                      </Button>
                      <Button variant="outline" size="sm" disabled>
                        Chat
                      </Button>
                    </>
                  )}
                  {infraActionLabel && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
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
                    onClick={() => {
                      setVaultToDelete({
                        id: vault._id,
                        repositoryFullName: vault.repositoryFullName,
                        isNoterManaged: vault.isNoterManaged,
                        hasConvexProvision: vault.hasConvexProvision,
                        hasNetlifyProvision: vault.hasNetlifyProvision,
                      });
                      setRemoveGithubRepo(vault.isNoterManaged);
                      setRemoveCodespaces(true);
                      setRemoveConvexProvision(
                        vault.isNoterManaged && vault.hasConvexProvision,
                      );
                      setRemoveNetlifyProvision(
                        vault.isNoterManaged && vault.hasNetlifyProvision,
                      );
                      setRemoveDaytonaResources(
                        Boolean(
                          vault.daytonaSandboxId ||
                            vault.daytonaSnapshotName ||
                            vault.daytonaPrebuildLogsSnapshot,
                        ),
                      );
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
            resetDeleteDialogState();
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
                      !vaultToDelete.isNoterManaged ||
                      isDeleting ||
                      isCommitting
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
                <div className="flex items-start gap-2">
                  <input
                    id="remove-codespaces"
                    type="checkbox"
                    checked={
                      connectedCodespacesCount === 0 ? true : removeCodespaces
                    }
                    onChange={(e) => setRemoveCodespaces(e.target.checked)}
                    disabled={
                      connectedCodespacesCount === 0 ||
                      isDeleting ||
                      isCommitting
                    }
                    className="mt-0.5 h-4 w-4 rounded border border-input"
                  />
                  <label
                    htmlFor="remove-codespaces"
                    className="text-sm text-muted-foreground"
                  >
                    Also remove all Codespaces
                    {connectedCodespacesCount === undefined
                      ? null
                      : ` (${connectedCodespacesCount} connected)`}
                  </label>
                </div>
                <div className="flex items-start gap-2">
                  <input
                    id="remove-daytona-resources"
                    type="checkbox"
                    checked={removeDaytonaResources}
                    onChange={(e) =>
                      setRemoveDaytonaResources(e.target.checked)
                    }
                    disabled={isDeleting || isCommitting}
                    className="mt-0.5 h-4 w-4 rounded border border-input"
                  />
                  <label
                    htmlFor="remove-daytona-resources"
                    className="text-sm text-muted-foreground"
                  >
                    Also remove Daytona sandboxes and snapshots
                    {!hasDaytonaResources && (
                      <div className="text-xs text-muted-foreground">
                        We will try to remove any Daytona resources tied to this
                        vault.
                      </div>
                    )}
                  </label>
                </div>
                {vaultToDelete.hasConvexProvision && (
                  <div className="flex items-start gap-2">
                    <input
                      id="remove-convex-provision"
                      type="checkbox"
                      checked={removeConvexProvision}
                      onChange={(e) =>
                        setRemoveConvexProvision(e.target.checked)
                      }
                      disabled={
                        !vaultToDelete.isNoterManaged ||
                        isDeleting ||
                        isCommitting
                      }
                      className="mt-0.5 h-4 w-4 rounded border border-input"
                    />
                    <label
                      htmlFor="remove-convex-provision"
                      className="text-sm text-muted-foreground"
                    >
                      Also remove Convex project/deployment
                      {!vaultToDelete.isNoterManaged && (
                        <div className="text-xs text-muted-foreground">
                          Only available for infrastructure provisioned by
                          Noter.
                        </div>
                      )}
                    </label>
                  </div>
                )}
                {vaultToDelete.hasNetlifyProvision && (
                  <div className="flex items-start gap-2">
                    <input
                      id="remove-netlify-provision"
                      type="checkbox"
                      checked={removeNetlifyProvision}
                      onChange={(e) =>
                        setRemoveNetlifyProvision(e.target.checked)
                      }
                      disabled={
                        !vaultToDelete.isNoterManaged ||
                        isDeleting ||
                        isCommitting
                      }
                      className="mt-0.5 h-4 w-4 rounded border border-input"
                    />
                    <label
                      htmlFor="remove-netlify-provision"
                      className="text-sm text-muted-foreground"
                    >
                      Also remove Netlify site
                      {!vaultToDelete.isNoterManaged && (
                        <div className="text-xs text-muted-foreground">
                          Only available for infrastructure provisioned by
                          Noter.
                        </div>
                      )}
                    </label>
                  </div>
                )}
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
                  resetDeleteDialogState();
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
    </div>
  );
}
