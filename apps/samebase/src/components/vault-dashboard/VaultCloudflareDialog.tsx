import { useState } from "react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useAction, useQuery as useConvexQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import { buildDefaultAppResourceName } from "../../../shared/appResourceNames";
import { AppDialogContent } from "@/components/AppDialogContent";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
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
import {
  compareCloudflareAccountOptions,
  type CloudflareAccountOption,
} from "./vaultDashboardCloudflareAccountOptions";
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
type CloudflareWorkerSelection = {
  accountId: string;
  workerTags: readonly string[];
};

export function VaultCloudflareDialogContent({
  accounts,
  createRootDirectory,
  createWorkerName,
  didAddWorker,
  error,
  folderSuggestions,
  isLoading,
  isSubmitting,
  inventoryState,
  mode,
  onAccountChange,
  onCreateRootDirectoryChange,
  onCreateWorkerNameChange,
  onConnectWorker,
  onConnectWorkerBack,
  onModeChange,
  onOpenChange,
  onSubmit,
  onWorkerToggle,
  selectedAccountId,
  selectedWorkerTags,
  repairWorker,
  vault,
  workerToConnect,
  workers,
}: {
  accounts: readonly CloudflareAccountOption[];
  createRootDirectory: string;
  createWorkerName: string;
  didAddWorker: boolean;
  error: string | null;
  folderSuggestions: readonly string[];
  isLoading: boolean;
  isSubmitting: boolean;
  inventoryState: CloudflareInventoryState | null;
  mode: CloudflareWorkerConnectMode;
  onAccountChange: (accountId: string) => void;
  onCreateRootDirectoryChange: (rootDirectory: string) => void;
  onCreateWorkerNameChange: (workerName: string) => void;
  onConnectWorker: (worker: CloudflareWorkerConnectTarget) => void;
  onConnectWorkerBack: () => void;
  onModeChange: (mode: CloudflareWorkerConnectMode) => void;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: () => void;
  onWorkerToggle: (workerTag: string) => void;
  selectedAccountId: string;
  selectedWorkerTags: readonly string[];
  repairWorker: { workerName: string } | null;
  vault: Pick<UserVaultResult, "repositoryFullName">;
  workerToConnect: CloudflareWorkerConnectTarget | null;
  workers: readonly CloudflareWorkerOption[];
}) {
  const sortedAccounts = [...accounts].sort(compareCloudflareAccountOptions);
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
  const selectedAccount = sortedAccounts.find((account) => account.accountId === selectedAccountId);
  const submitDisabled =
    isSubmitting ||
    (repairWorker
      ? !createRootDirectory.trim()
      : isLoading ||
        !selectedAccountId ||
        (mode === "existing"
          ? selectedWorkerTags.length === 0
          : mode === "connect"
            ? !workerToConnect || !createRootDirectory.trim()
            : !createWorkerName.trim() || !createRootDirectory.trim()));

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <AppDialogContent>
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
              ? "Choose the repository root Cloudflare should build."
              : mode === "connect"
                ? "Choose the Worker and its repository root."
                : mode === "existing"
                  ? "Choose Workers connected to this repository, or connect another Worker."
                  : "Create a Worker and choose the repository root Cloudflare should build."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {repairWorker ? (
            <VaultRepositoryRootInput
              disabled={isSubmitting}
              folderSuggestions={folderSuggestions}
              onValueChange={onCreateRootDirectoryChange}
              value={createRootDirectory}
            />
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
            </div>
          ) : (
            <>
              <Select
                disabled={isSubmitting}
                value={selectedAccountId}
                onValueChange={onAccountChange}
              >
                <SelectTrigger aria-label="Cloudflare account" className="w-full">
                  <SelectValue placeholder="Cloudflare account">
                    {selectedAccount?.accountName}
                  </SelectValue>
                </SelectTrigger>
                <AppSelectContent>
                  {sortedAccounts.map((account) => (
                    <AppSelectItem key={account.accountId} value={account.accountId}>
                      {account.accountName}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </Select>
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
                  ) : selectedAccountId &&
                    inventoryState !== "partial" &&
                    unconnectedWorkers.length === 0 ? (
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
                  <Input
                    value={createWorkerName}
                    onChange={(event) => onCreateWorkerNameChange(event.target.value)}
                    disabled={isSubmitting}
                    placeholder="Worker name"
                  />
                  <VaultRepositoryRootInput
                    disabled={isSubmitting}
                    folderSuggestions={folderSuggestions}
                    onValueChange={onCreateRootDirectoryChange}
                    value={createRootDirectory}
                  />
                </div>
              )}
            </>
          )}
          {error ? <div className="text-sm text-red-600">{error}</div> : null}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (mode === "connect") {
                onConnectWorkerBack();
              } else {
                onOpenChange(false);
              }
            }}
            disabled={isSubmitting}
          >
            {mode === "connect"
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
  connectedAccountId,
  onClose,
  onSaved,
  repairWorkerId,
  vault,
}: {
  connectedAccountId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
  repairWorkerId: Id<"vaultCloudflareWorkers"> | null;
  vault: UserVaultResult;
}) {
  const listAccounts = useAction(api.vault.cloudflare.listAccounts);
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
  const [selectedAccountOverride, setSelectedAccountOverride] = useState("");
  const [workerSelection, setWorkerSelection] = useState<CloudflareWorkerSelection | null>(null);
  const [mode, setMode] = useState<CloudflareWorkerConnectMode>("existing");
  const [createRootDirectory, setCreateRootDirectory] = useState("/");
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
  const repairWorker = repairWorkerId
    ? (vault.cloudflareWorkers.find((worker) => worker.workerId === repairWorkerId) ?? null)
    : null;
  const accountsQuery = useTanStackQuery({
    queryKey: ["vault-provider-discovery", vault._id, "cloudflare-accounts"],
    queryFn: () => listAccounts({}),
    enabled: !repairWorker,
    retry: false,
  });
  const accounts = accountsQuery.data ?? [];
  const defaultAccountId =
    connectedAccountId && accounts.some((account) => account.accountId === connectedAccountId)
      ? connectedAccountId
      : (accounts.at(0)?.accountId ?? "");
  const selectedAccountId = accounts.some(
    (account) => account.accountId === selectedAccountOverride,
  )
    ? selectedAccountOverride
    : defaultAccountId;
  const attachedWorkerTags = vault.cloudflareWorkers
    .filter((worker) => worker.accountId === selectedAccountId)
    .map((worker) => worker.workerTag)
    .sort((left, right) => left.localeCompare(right));
  const workersQuery = useTanStackQuery({
    queryKey: [
      "vault-provider-discovery",
      vault._id,
      "cloudflare-workers",
      selectedAccountId,
      attachedWorkerTags,
    ],
    queryFn: async () =>
      await discoverWorkers({ accountId: selectedAccountId, vaultId: vault._id }),
    enabled: !repairWorker && selectedAccountId !== "",
    retry: false,
  });
  const unavailableWorkerTags = new Set([...attachedWorkerTags, ...connectedWorkerTags]);
  const workers = (workersQuery.data?.workers ?? []).filter(
    (worker) => !unavailableWorkerTags.has(worker.workerTag),
  );
  const defaultSelectedWorkerTags = workers
    .filter((worker) => worker.repository.state === "ready")
    .map((worker) => worker.workerTag);
  const selectedWorkerTags =
    workerSelection?.accountId === selectedAccountId
      ? workerSelection.workerTags
      : defaultSelectedWorkerTags;
  const inventoryState = workersQuery.data?.inventoryState ?? null;
  const resourceQueryError = accountsQuery.error ?? workersQuery.error;
  const resourceError = resourceQueryError
    ? resourceQueryError instanceof Error
      ? resourceQueryError.message
      : "Could not load Cloudflare resources."
    : null;
  const isLoading =
    !repairWorker &&
    (accountsQuery.isPending || (selectedAccountId !== "" && workersQuery.isPending));

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      if (repairWorker) {
        await configureWorkersBuildsForGitHub({
          vaultId: vault._id,
          workerId: repairWorker.workerId,
          rootDirectory: createRootDirectory,
        });
      } else if (workerToConnect) {
        const result = await connectWorker({
          vaultId: vault._id,
          accountId: selectedAccountId,
          workerName: workerToConnect.workerName,
          workerTag: workerToConnect.workerTag,
          rootDirectory: createRootDirectory,
        });
        setConnectedWorkerTags((current) => [...current, workerToConnect.workerTag]);
        setMode("existing");
        setWorkerSelection({
          accountId: selectedAccountId,
          workerTags: selectedWorkerTags.filter(
            (candidate) => candidate !== workerToConnect.workerTag,
          ),
        });
        setWorkerToConnect(null);
        if (result.state === "added_with_notice") {
          setSubmitError(result.message);
        }
        onSaved();
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
          accountId: selectedAccountId,
          workers: selectedWorkers,
        });
      } else {
        await createWorker({
          vaultId: vault._id,
          accountId: selectedAccountId,
          workerName: createWorkerName,
          rootDirectory: createRootDirectory,
        });
      }
      onSaved();
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not add Cloudflare Workers.");
      setIsSubmitting(false);
    }
  };

  return (
    <VaultCloudflareDialogContent
      accounts={accounts}
      createRootDirectory={createRootDirectory}
      createWorkerName={createWorkerName}
      didAddWorker={connectedWorkerTags.length > 0}
      error={submitError ?? resourceError}
      folderSuggestions={folderSuggestions ?? EMPTY_REPOSITORY_FOLDER_SUGGESTIONS}
      isLoading={isLoading}
      isSubmitting={isSubmitting}
      inventoryState={inventoryState}
      mode={mode}
      onAccountChange={(accountId) => {
        setSelectedAccountOverride(accountId);
        setWorkerSelection(null);
        setSubmitError(null);
        setWorkerToConnect(null);
      }}
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
        if (!isOpen && !isSubmitting) {
          onClose();
        }
      }}
      onSubmit={() => {
        void handleSubmit();
      }}
      onWorkerToggle={(workerTag) => {
        setWorkerSelection({
          accountId: selectedAccountId,
          workerTags: selectedWorkerTags.includes(workerTag)
            ? selectedWorkerTags.filter((candidate) => candidate !== workerTag)
            : [...selectedWorkerTags, workerTag],
        });
      }}
      selectedAccountId={selectedAccountId}
      selectedWorkerTags={selectedWorkerTags}
      repairWorker={repairWorker ? { workerName: repairWorker.workerName } : null}
      vault={vault}
      workerToConnect={workerToConnect}
      workers={workers}
    />
  );
}
