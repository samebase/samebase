import { useRef, useState, type ReactNode } from "react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useAction, useQuery as useConvexQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Loader2 } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import {
  buildDefaultAppResourceName,
  validateAppResourceName,
} from "../../../shared/appResourceNames";
import { AppDialogContent } from "@/components/AppDialogContent";
import { CloudflareBuildTokenField } from "@/components/CloudflareBuildTokenField";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import {
  useCloudflareBuildTokenSelection,
  useCloudflareBuildTokens,
} from "@/components/useCloudflareBuildTokens";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VaultProviderDiscoveryLoadingState } from "./VaultProviderDiscoveryLoadingState";
import { VaultRepositoryRootInput } from "./VaultRepositoryRootInput";

const EMPTY_REPOSITORY_FOLDER_SUGGESTIONS: readonly string[] = [];

type CloudflareWorkerConnectMode = "existing" | "create" | "connect";
type CloudflareWorkerConnectTarget = {
  workerName: string;
  workerTag: string;
};
type CloudflareWorkerOption =
  (typeof api.vault.cloudflare.discoverWorkers)["_returnType"]["workers"][number];
type CloudflareInventoryState =
  (typeof api.vault.cloudflare.discoverWorkers)["_returnType"]["inventoryState"];
export function VaultCloudflareDialogContent({
  blockedReason,
  cloudflareBuildTokenField,
  createRootDirectory,
  createWorkerName,
  didAddWorker,
  error,
  folderSuggestions,
  hasSelectedBuildToken,
  isLoading,
  isSubmitting,
  inventoryState,
  mode,
  onCreateRootDirectoryChange,
  onCreateWorkerNameChange,
  onConnectWorker,
  onConnectWorkerBack,
  onModeChange,
  onOpenChange,
  onSubmit,
  onWorkerToggle,
  selectedWorkerTags,
  repairWorker,
  vault,
  workerToConnect,
  workers,
}: {
  blockedReason?: string | null;
  cloudflareBuildTokenField: ReactNode;
  createRootDirectory: string;
  createWorkerName: string;
  didAddWorker: boolean;
  error: string | null;
  folderSuggestions: readonly string[];
  hasSelectedBuildToken: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  inventoryState: CloudflareInventoryState | null;
  mode: CloudflareWorkerConnectMode;
  onCreateRootDirectoryChange: (rootDirectory: string) => void;
  onCreateWorkerNameChange: (workerName: string) => void;
  onConnectWorker: (worker: CloudflareWorkerConnectTarget) => void;
  onConnectWorkerBack: () => void;
  onModeChange: (mode: CloudflareWorkerConnectMode) => void;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: () => void;
  onWorkerToggle: (workerTag: string) => void;
  selectedWorkerTags: readonly string[];
  repairWorker: { workerName: string; rootDirectory: string } | null;
  vault: Pick<UserVaultResult, "repositoryFullName">;
  workerToConnect: CloudflareWorkerConnectTarget | null;
  workers: readonly CloudflareWorkerOption[];
}) {
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const workersByRoot = new Map<string, CloudflareWorkerOption[]>();
  for (const worker of workers) {
    if (worker.repository.state !== "ready") {
      continue;
    }
    const workersAtRoot = workersByRoot.get(worker.repository.rootDirectory);
    if (workersAtRoot) {
      workersAtRoot.push(worker);
    } else {
      workersByRoot.set(worker.repository.rootDirectory, [worker]);
    }
  }
  const workerGroups = [...workersByRoot.entries()]
    .sort(([leftRoot], [rightRoot]) => {
      if (leftRoot === rightRoot) {
        return 0;
      }
      if (leftRoot === "/") {
        return -1;
      }
      if (rightRoot === "/") {
        return 1;
      }
      return leftRoot.localeCompare(rightRoot);
    })
    .map(([rootDirectory, workersAtRoot]) => ({
      rootDirectory,
      workers: workersAtRoot.sort(
        (left, right) =>
          left.workerName.localeCompare(right.workerName) ||
          left.workerTag.localeCompare(right.workerTag),
      ),
    }));
  const unconnectedWorkers = workers
    .filter((worker) => worker.repository.state === "not_connected")
    .sort(
      (left, right) =>
        left.workerName.localeCompare(right.workerName) ||
        left.workerTag.localeCompare(right.workerTag),
    );
  const createWorkerNameValidation = validateAppResourceName(createWorkerName, "cloudflare");
  const submitDisabled =
    Boolean(blockedReason) ||
    isSubmitting ||
    (repairWorker
      ? !createRootDirectory.trim() || !hasSelectedBuildToken
      : isLoading ||
        (mode === "existing"
          ? selectedWorkerTags.length === 0
          : mode === "connect"
            ? !workerToConnect || !createRootDirectory.trim() || !hasSelectedBuildToken
            : !createWorkerNameValidation.valid ||
              !createRootDirectory.trim() ||
              !hasSelectedBuildToken));

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <AppDialogContent
        ref={dialogContentRef}
        initialFocus={repairWorker ? dialogContentRef : undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {repairWorker
              ? `Configure ${repairWorker.workerName} Builds`
              : mode === "connect"
                ? `Connect a Worker to ${vault.repositoryFullName}`
                : `Add Cloudflare to ${vault.repositoryFullName}`}
          </DialogTitle>
          <DialogDescription>
            {repairWorker
              ? "Samebase will use the saved repository root."
              : mode === "connect"
                ? "Choose the Worker and its repository root."
                : mode === "existing"
                  ? "Choose Workers connected to this repository, or connect another Worker."
                  : "Create a Worker and choose the repository root Cloudflare should build."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {repairWorker ? (
            <div className="grid gap-3">
              <VaultRepositoryRootInput
                disabled
                folderSuggestions={folderSuggestions}
                onValueChange={onCreateRootDirectoryChange}
                value={createRootDirectory}
              />
              {cloudflareBuildTokenField}
            </div>
          ) : isLoading ? (
            <VaultProviderDiscoveryLoadingState label="Searching for Cloudflare Workers" />
          ) : mode === "connect" ? (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cloudflare-worker-to-connect">Worker</Label>
                <Select
                  value={workerToConnect?.workerTag ?? ""}
                  onValueChange={(workerTag) => {
                    const worker = unconnectedWorkers.find(
                      (candidate) => candidate.workerTag === workerTag,
                    );
                    if (worker) {
                      onConnectWorker({
                        workerName: worker.workerName,
                        workerTag: worker.workerTag,
                      });
                    }
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="cloudflare-worker-to-connect" className="w-full">
                    <SelectValue placeholder="Choose a Worker">
                      {workerToConnect?.workerName}
                    </SelectValue>
                  </SelectTrigger>
                  <AppSelectContent>
                    {unconnectedWorkers.map((worker) => (
                      <AppSelectItem key={worker.workerTag} value={worker.workerTag}>
                        {worker.workerName}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </Select>
              </div>
              <VaultRepositoryRootInput
                disabled={isSubmitting}
                folderSuggestions={folderSuggestions}
                onValueChange={onCreateRootDirectoryChange}
                value={createRootDirectory}
              />
              {cloudflareBuildTokenField}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={mode === "existing" ? "default" : "outline"}
                  onClick={() => onModeChange("existing")}
                  disabled={isSubmitting}
                >
                  Existing
                </Button>
                <Button
                  type="button"
                  variant={mode === "create" ? "default" : "outline"}
                  onClick={() => onModeChange("create")}
                  disabled={isSubmitting}
                >
                  Create
                </Button>
              </div>
              {inventoryState === "partial" ? (
                <div className="text-sm text-muted-foreground">
                  The Worker list may be incomplete. Verified Workers found so far are shown.
                </div>
              ) : null}
              {mode === "existing" ? (
                <div className="grid gap-3">
                  {workerGroups.length > 0 ? (
                    <div className="grid max-h-80 gap-3 overflow-y-auto">
                      {workerGroups.map((group) => (
                        <div key={group.rootDirectory} className="grid gap-1.5">
                          <div className="font-mono text-xs text-muted-foreground">
                            {group.rootDirectory}
                          </div>
                          {group.workers.map((worker) => (
                            <label
                              key={worker.workerTag}
                              className="flex min-w-0 items-center gap-2"
                            >
                              <Checkbox
                                checked={selectedWorkerTags.includes(worker.workerTag)}
                                disabled={isSubmitting}
                                onCheckedChange={() => onWorkerToggle(worker.workerTag)}
                              />
                              <span className="truncate text-sm">{worker.workerName}</span>
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : inventoryState !== "partial" && unconnectedWorkers.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No available Workers were found.
                    </div>
                  ) : null}
                  {unconnectedWorkers.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => onModeChange("connect")}
                    >
                      Connect another Worker
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Input
                      value={createWorkerName}
                      onChange={(event) => onCreateWorkerNameChange(event.target.value)}
                      disabled={isSubmitting}
                      placeholder="Worker name"
                      aria-invalid={!createWorkerNameValidation.valid || undefined}
                      aria-describedby={
                        createWorkerNameValidation.valid
                          ? undefined
                          : "cloudflare-worker-name-error"
                      }
                    />
                    {!createWorkerNameValidation.valid ? (
                      <p
                        id="cloudflare-worker-name-error"
                        role="alert"
                        className="text-xs text-red-600"
                      >
                        {createWorkerNameValidation.message}
                      </p>
                    ) : null}
                  </div>
                  <VaultRepositoryRootInput
                    disabled={isSubmitting}
                    folderSuggestions={folderSuggestions}
                    onValueChange={onCreateRootDirectoryChange}
                    value={createRootDirectory}
                  />
                  {cloudflareBuildTokenField}
                </div>
              )}
            </>
          )}
          {blockedReason ? (
            <div className="text-sm text-muted-foreground">{blockedReason}</div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (blockedReason) {
                onOpenChange(false);
              } else if (mode === "connect") {
                onConnectWorkerBack();
              } else {
                onOpenChange(false);
              }
            }}
            disabled={isSubmitting && !blockedReason}
          >
            {blockedReason
              ? "Close"
              : mode === "connect"
                ? "Back"
                : didAddWorker
                  ? selectedWorkerTags.length > 0
                    ? "Close"
                    : "Done"
                  : "Cancel"}
          </Button>
          {!isLoading ? (
            <Button onClick={onSubmit} disabled={submitDisabled}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSubmitting
                ? repairWorker
                  ? "Configuring..."
                  : mode === "connect"
                    ? "Connecting..."
                    : mode === "existing"
                      ? "Adding..."
                      : "Creating..."
                : repairWorker
                  ? "Configure Workers Builds"
                  : mode === "connect"
                    ? "Connect and add"
                    : mode === "existing"
                      ? selectedWorkerTags.length === 0
                        ? "Add Workers"
                        : `Add ${selectedWorkerTags.length} Worker${selectedWorkerTags.length === 1 ? "" : "s"}`
                      : "Create Worker"}
            </Button>
          ) : null}
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}

export function VaultCloudflareDialog({
  blockedReason,
  onClose,
  repairBuildTokenUuid,
  repairWorkerId,
  vault,
}: {
  blockedReason: string | null;
  onClose: () => void;
  repairBuildTokenUuid: string | null;
  repairWorkerId: Id<"vaultCloudflareWorkers"> | null;
  vault: UserVaultResult;
}) {
  const discoverWorkers = useAction(api.vault.cloudflare.discoverWorkers);
  const attachWorkers = useAction(api.vault.cloudflare.attachWorkers);
  const connectWorker = useAction(api.vault.cloudflare.connectWorker);
  const createWorker = useAction(api.vault.cloudflare.createWorker);
  const configureWorkersBuildsForGitHub = useAction(
    api.vault.cloudflare.configureWorkersBuildsForGitHub,
  );
  const folderSuggestions = useConvexQuery(
    api.vault.dashboard.listVaultRepositoryFolderSuggestions,
    {
      vaultId: vault._id,
    },
  );
  const repairWorker = repairWorkerId
    ? (vault.cloudflareWorkers.find((worker) => worker.workerId === repairWorkerId) ?? null)
    : null;
  const [workerSelection, setWorkerSelection] = useState<readonly string[] | null>(null);
  const [mode, setMode] = useState<CloudflareWorkerConnectMode>("existing");
  const [createRootDirectory, setCreateRootDirectory] = useState(
    repairWorker?.rootDirectory ?? "/",
  );
  const [createWorkerName, setCreateWorkerName] = useState(() =>
    buildDefaultAppResourceName({
      repositoryName: vault.ghRepoName,
      provider: "cloudflare",
    }),
  );
  const [workerToConnect, setWorkerToConnect] = useState<CloudflareWorkerConnectTarget | null>(
    null,
  );
  const [connectedWorkerTags, setConnectedWorkerTags] = useState<readonly string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const buildTokensQuery = useCloudflareBuildTokens({
    enabled: Boolean(repairWorker || mode === "connect" || mode === "create"),
    organizationId: vault.organizationId,
  });
  const buildTokens = buildTokensQuery.data?.tokens ?? [];
  const buildTokenSelection = useCloudflareBuildTokenSelection({
    error: Boolean(buildTokensQuery.error),
    initialUuid: repairBuildTokenUuid,
    isFetching: buildTokensQuery.isFetching,
    tokens: buildTokensQuery.data?.tokens ?? null,
  });
  const buildTokenUuid = buildTokenSelection.selectedUuid;
  const writesWorkersBuilds = Boolean(repairWorker || workerToConnect || mode === "create");
  const hasSelectedBuildToken = buildTokenSelection.canWrite;
  const attachedWorkerTags = vault.cloudflareWorkers
    .filter((worker) => worker.accountId === vault.cloudflareAccountId)
    .map((worker) => worker.workerTag)
    .sort((left, right) => left.localeCompare(right));
  const workersQuery = useTanStackQuery({
    queryKey: [
      "vault-provider-discovery",
      vault._id,
      "cloudflare-workers",
      vault.cloudflareAccountId,
      attachedWorkerTags,
      vault.providerWrite.lastWriteAt.cloudflare,
    ],
    queryFn: async () =>
      await discoverWorkers({ accountId: vault.cloudflareAccountId, vaultId: vault._id }),
    enabled: !repairWorker,
    retry: false,
  });
  const unavailableWorkerTags = new Set([...attachedWorkerTags, ...connectedWorkerTags]);
  const workers = (workersQuery.data?.workers ?? []).filter(
    (worker) => !unavailableWorkerTags.has(worker.workerTag),
  );
  const defaultSelectedWorkerTags = workers
    .filter((worker) => worker.repository.state === "ready")
    .map((worker) => worker.workerTag);
  const selectedWorkerTags = workerSelection ?? defaultSelectedWorkerTags;
  const inventoryState = workersQuery.data?.inventoryState ?? null;
  const resourceError = workersQuery.error ? "Could not load Cloudflare resources." : null;
  const isLoading = !repairWorker && workersQuery.isPending;

  const handleSubmit = async () => {
    if (blockedReason || isSubmitting) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      if (repairWorker) {
        if (!buildTokenUuid) {
          throw new Error("Choose an API token.");
        }
        await configureWorkersBuildsForGitHub({
          buildTokenUuid,
          rootDirectory: repairWorker.rootDirectory,
          vaultId: vault._id,
          workerId: repairWorker.workerId,
        });
      } else if (workerToConnect) {
        if (!buildTokenUuid) {
          throw new Error("Choose an API token.");
        }
        const result = await connectWorker({
          vaultId: vault._id,
          accountId: vault.cloudflareAccountId,
          workerName: workerToConnect.workerName,
          workerTag: workerToConnect.workerTag,
          rootDirectory: createRootDirectory,
          buildTokenUuid,
        });
        setConnectedWorkerTags((current) => [...current, workerToConnect.workerTag]);
        setMode("existing");
        setWorkerSelection(
          selectedWorkerTags.filter((candidate) => candidate !== workerToConnect.workerTag),
        );
        setWorkerToConnect(null);
        if (result.state === "added_with_notice") {
          setSubmitError(result.message);
        }
        setIsSubmitting(false);
        return;
      } else if (mode === "existing") {
        const selectedWorkers = selectedWorkerTags.map((workerTag) => {
          const worker = workers.find((candidate) => candidate.workerTag === workerTag);
          if (!worker || worker.repository.state !== "ready") {
            throw new Error("Choose Workers connected to this repository.");
          }
          return {
            workerName: worker.workerName,
            workerTag: worker.workerTag,
          };
        });
        if (selectedWorkers.length === 0) {
          throw new Error("Choose at least one Cloudflare Worker.");
        }
        await attachWorkers({
          vaultId: vault._id,
          accountId: vault.cloudflareAccountId,
          workers: selectedWorkers,
        });
      } else {
        if (!buildTokenUuid) {
          throw new Error("Choose an API token.");
        }
        await createWorker({
          vaultId: vault._id,
          accountId: vault.cloudflareAccountId,
          workerName: createWorkerName,
          rootDirectory: createRootDirectory,
          buildTokenUuid,
        });
      }
      onClose();
    } catch (error) {
      const message =
        error instanceof ConvexError && typeof error.data === "string"
          ? error.data
          : "Could not add Cloudflare Workers.";
      if (
        message.startsWith(
          "The selected Cloudflare Workers Builds token is not in Cloudflare's current list",
        )
      ) {
        await buildTokensQuery.refetch();
      }
      setSubmitError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <VaultCloudflareDialogContent
      blockedReason={blockedReason}
      cloudflareBuildTokenField={
        writesWorkersBuilds ? (
          <CloudflareBuildTokenField
            accountId={buildTokensQuery.data?.accountId ?? vault.cloudflareAccountId}
            disabled={isSubmitting || Boolean(blockedReason)}
            error={Boolean(buildTokensQuery.error)}
            id="vault-cloudflare-build-token"
            isLoading={buildTokensQuery.isFetching}
            onReload={() => {
              void buildTokensQuery.refetch();
            }}
            onValueChange={(uuid) => {
              setSubmitError(null);
              buildTokenSelection.setRequestedUuid(uuid);
            }}
            selectionUnavailable={buildTokenSelection.selectionUnavailable}
            tokens={buildTokens}
            value={buildTokenUuid}
          />
        ) : null
      }
      createRootDirectory={createRootDirectory}
      createWorkerName={createWorkerName}
      didAddWorker={connectedWorkerTags.length > 0}
      error={submitError ?? resourceError}
      folderSuggestions={folderSuggestions ?? EMPTY_REPOSITORY_FOLDER_SUGGESTIONS}
      hasSelectedBuildToken={hasSelectedBuildToken}
      isLoading={isLoading}
      isSubmitting={isSubmitting}
      inventoryState={inventoryState}
      mode={mode}
      onCreateRootDirectoryChange={setCreateRootDirectory}
      onCreateWorkerNameChange={setCreateWorkerName}
      onConnectWorker={(worker) => {
        setWorkerToConnect(worker);
        setCreateRootDirectory("");
        setSubmitError(null);
      }}
      onConnectWorkerBack={() => {
        setWorkerToConnect(null);
        setMode("existing");
      }}
      onModeChange={(nextMode) => {
        setMode(nextMode);
        setWorkerToConnect(null);
        setSubmitError(null);
        if (nextMode === "connect") {
          setCreateRootDirectory("");
        }
      }}
      onOpenChange={(isOpen) => {
        if (!isOpen && (!isSubmitting || blockedReason)) {
          onClose();
        }
      }}
      onSubmit={() => {
        void handleSubmit();
      }}
      onWorkerToggle={(workerTag) => {
        setWorkerSelection(
          selectedWorkerTags.includes(workerTag)
            ? selectedWorkerTags.filter((candidate) => candidate !== workerTag)
            : [...selectedWorkerTags, workerTag],
        );
      }}
      selectedWorkerTags={selectedWorkerTags}
      repairWorker={
        repairWorker
          ? {
              workerName: repairWorker.workerName,
              rootDirectory: repairWorker.rootDirectory,
            }
          : null
      }
      vault={vault}
      workerToConnect={workerToConnect}
      workers={workers}
    />
  );
}
