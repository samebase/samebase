import { useRef, useState, type ReactNode } from "react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useAction, useQuery as useConvexQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Loader2 } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ActionConfirmationRequest } from "../../../convex/repository/contracts/actionConfirmation";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import {
  buildAvailableAppResourceNameSuggestion,
  buildDefaultAppResourceName,
  formatAppResourceNameConflictMessage,
  validateAppResourceName,
} from "../../../shared/appResourceNames";
import { getConvexCodeLocationPath } from "../../../shared/convexCodeLocation";
import { AppDialogContent } from "@/components/AppDialogContent";
import {
  AppResourceNameFeedback,
  AppResourceNameNotice,
} from "@/repository/setup/AppResourceNameFeedback";
import { CloudflareBuildTokenField } from "@/repository/setup/CloudflareBuildTokenField";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import {
  useCloudflareBuildTokenSelection,
  useCloudflareBuildTokens,
} from "@/repository/setup/useCloudflareBuildTokens";
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
import { RepositoryActionConfirmationDialog } from "./RepositoryActionConfirmationDialog";
import { RepositoryProviderDiscoveryLoadingState } from "./RepositoryProviderDiscoveryLoadingState";
import { RepositoryRootInput } from "./RepositoryRootInput";
import type {
  RepositoryConvexProjectObservation,
  RepositoryProviderObservationState,
} from "./useRepositoryProviderObservations";

const EMPTY_REPOSITORY_FOLDER_SUGGESTIONS: readonly string[] = [];

type CloudflareWorkerConnectMode = "existing" | "create" | "connect";
type CloudflareWorkerConnectTarget = {
  workerName: string;
  workerTag: string;
};
type CloudflareWorkerOption =
  (typeof api.repository.cloudflare.findWorkers)["_returnType"]["workers"][number];
type CloudflareInventoryState =
  (typeof api.repository.cloudflare.findWorkers)["_returnType"]["inventoryState"];
type CloudflareConnectWorkerArgs = (typeof api.repository.cloudflare.connectWorker)["_args"];
type CloudflareConnectWorkerResult =
  (typeof api.repository.cloudflare.connectWorker)["_returnType"];
export function RepositoryCloudflareDialogContent({
  blockedReason,
  cloudflareBuildTokenField,
  convexProjectField,
  createRootDirectory,
  createWorkerNameConflict,
  createWorkerName,
  didAddWorker,
  error,
  folderSuggestions,
  hasSelectedBuildToken,
  hasSelectedConvexProject,
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
  repository,
  workerToConnect,
  workers,
}: {
  blockedReason?: string | null;
  cloudflareBuildTokenField: ReactNode;
  convexProjectField: ReactNode;
  createRootDirectory: string;
  createWorkerNameConflict: { message: string; suggestion: string | null } | null;
  createWorkerName: string;
  didAddWorker: boolean;
  error: string | null;
  folderSuggestions: readonly string[];
  hasSelectedBuildToken: boolean;
  /** False while several Convex projects are attached and none is chosen for the deploy key. */
  hasSelectedConvexProject: boolean;
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
  repository: Pick<UserRepositoryResult, "githubRepositoryFullName">;
  workerToConnect: CloudflareWorkerConnectTarget | null;
  workers: readonly CloudflareWorkerOption[];
}) {
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const workersByRoot = new Map<string, CloudflareWorkerOption[]>();
  for (const worker of workers) {
    if (worker.attachment !== "attachable") {
      continue;
    }
    const workersAtRoot = workersByRoot.get(worker.rootDirectory);
    if (workersAtRoot) {
      workersAtRoot.push(worker);
    } else {
      workersByRoot.set(worker.rootDirectory, [worker]);
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
    .filter((worker) => worker.attachment === "connectable")
    .sort(
      (left, right) =>
        left.workerName.localeCompare(right.workerName) ||
        left.workerTag.localeCompare(right.workerTag),
    );
  const createWorkerNameValidation = validateAppResourceName(createWorkerName, "cloudflare");
  const createWorkerNameError = createWorkerNameValidation.valid
    ? createWorkerNameConflict
    : createWorkerNameValidation;
  const createWorkerNameNotice =
    createWorkerNameValidation.valid &&
    createWorkerNameValidation.changed &&
    !createWorkerNameConflict
      ? createWorkerNameValidation.value
      : null;
  const submitDisabled =
    Boolean(blockedReason) ||
    isSubmitting ||
    (repairWorker
      ? !createRootDirectory.trim() || !hasSelectedBuildToken
      : isLoading ||
        (mode === "existing"
          ? selectedWorkerTags.length === 0
          : mode === "connect"
            ? !workerToConnect ||
              !createRootDirectory.trim() ||
              !hasSelectedBuildToken ||
              !hasSelectedConvexProject
            : !createWorkerNameValidation.valid ||
              Boolean(createWorkerNameConflict) ||
              !createRootDirectory.trim() ||
              !hasSelectedBuildToken ||
              !hasSelectedConvexProject));

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
                ? `Connect a Worker to ${repository.githubRepositoryFullName}`
                : `Add Cloudflare to ${repository.githubRepositoryFullName}`}
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
              <RepositoryRootInput
                disabled
                folderSuggestions={folderSuggestions}
                onValueChange={onCreateRootDirectoryChange}
                value={createRootDirectory}
              />
              {cloudflareBuildTokenField}
            </div>
          ) : isLoading ? (
            <RepositoryProviderDiscoveryLoadingState label="Searching for Cloudflare Workers" />
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
              <RepositoryRootInput
                disabled={isSubmitting}
                folderSuggestions={folderSuggestions}
                onValueChange={onCreateRootDirectoryChange}
                value={createRootDirectory}
              />
              {cloudflareBuildTokenField}
              {convexProjectField}
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
                      aria-invalid={Boolean(createWorkerNameError) || undefined}
                      aria-describedby={
                        createWorkerNameError
                          ? "cloudflare-worker-name-error"
                          : createWorkerNameNotice
                            ? "cloudflare-worker-name-notice"
                            : undefined
                      }
                    />
                    {createWorkerNameError ? (
                      <AppResourceNameFeedback
                        id="cloudflare-worker-name-error"
                        message={createWorkerNameError.message}
                        suggestion={createWorkerNameError.suggestion}
                        onUseSuggestion={onCreateWorkerNameChange}
                      />
                    ) : createWorkerNameNotice ? (
                      <AppResourceNameNotice
                        id="cloudflare-worker-name-notice"
                        name={createWorkerNameNotice}
                        onUseName={onCreateWorkerNameChange}
                      />
                    ) : null}
                  </div>
                  <RepositoryRootInput
                    disabled={isSubmitting}
                    folderSuggestions={folderSuggestions}
                    onValueChange={onCreateRootDirectoryChange}
                    value={createRootDirectory}
                  />
                  {cloudflareBuildTokenField}
                  {convexProjectField}
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

export function RepositoryCloudflareDialog({
  blockedReason,
  convexObservations,
  onClose,
  repairBuildTokenUuid,
  repairWorkerId,
  repository,
}: {
  blockedReason: string | null;
  /** The live Convex reads of the overview; their slugs tell apart projects at one code location. */
  convexObservations: RepositoryProviderObservationState<RepositoryConvexProjectObservation>;
  onClose: () => void;
  repairBuildTokenUuid: string | null;
  repairWorkerId: Id<"repositoryCloudflareWorkers"> | null;
  repository: UserRepositoryResult;
}) {
  const findWorkers = useAction(api.repository.cloudflare.findWorkers);
  const attachWorkers = useAction(api.repository.cloudflare.attachWorkers);
  const connectWorker = useAction(api.repository.cloudflare.connectWorker);
  const createWorker = useAction(api.repository.cloudflare.createWorker);
  const configureBuilds = useAction(api.repository.cloudflare.configureBuilds);
  const folderSuggestions = useConvexQuery(
    api.repository.dashboard.listRepositoryFolderSuggestions,
    {
      repositoryId: repository.repositoryId,
    },
  );
  const repairWorker = repairWorkerId
    ? (repository.cloudflareWorkers.find((worker) => worker.workerId === repairWorkerId) ?? null)
    : null;
  const [workerSelection, setWorkerSelection] = useState<readonly string[] | null>(null);
  const [mode, setMode] = useState<CloudflareWorkerConnectMode>("existing");
  const [createRootDirectory, setCreateRootDirectory] = useState(
    repairWorker?.rootDirectory ?? "/",
  );
  const [createWorkerName, setCreateWorkerName] = useState(() =>
    buildDefaultAppResourceName({
      repositoryName: repository.githubRepositoryName,
      provider: "cloudflare",
    }),
  );
  const [workerToConnect, setWorkerToConnect] = useState<CloudflareWorkerConnectTarget | null>(
    null,
  );
  const [didAddWorker, setDidAddWorker] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createWorkerConflictName, setCreateWorkerConflictName] = useState<string | null>(null);
  const [deployKeyConvexProjectId, setDeployKeyConvexProjectId] =
    useState<Id<"repositoryConvexProjects"> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The server's challenge for the connect request in `args`; the confirm step resends `args`.
  const [connectConfirmation, setConnectConfirmation] = useState<{
    args: Omit<CloudflareConnectWorkerArgs, "confirmation">;
    request: ActionConfirmationRequest;
    worker: CloudflareWorkerConnectTarget;
  } | null>(null);
  const cloudflareAccountId = repository.cloudflareAccountId;
  // With one attached Convex project the server installs its deploy key without a choice.
  const needsDeployKeyConvexProject = repository.convexProjects.length > 1;
  const cloudflareBlockedReason =
    cloudflareAccountId === undefined
      ? "Connect Cloudflare in Providers before adding a Worker."
      : blockedReason;
  const buildTokensQuery = useCloudflareBuildTokens({
    enabled: Boolean(
      cloudflareAccountId !== undefined &&
      (repairWorker || mode === "connect" || mode === "create"),
    ),
    organizationId: repository.organizationId,
  });
  const buildTokens = buildTokensQuery.data?.tokens ?? [];
  const buildTokenSelection = useCloudflareBuildTokenSelection({
    error: Boolean(buildTokensQuery.error),
    initialUuid: repairBuildTokenUuid,
    isFetching: buildTokensQuery.isFetching,
    lastUsedUuid: buildTokensQuery.data?.lastUsedBuildTokenUuid ?? null,
    tokens: buildTokensQuery.data?.tokens ?? null,
  });
  const buildTokenUuid = buildTokenSelection.selectedUuid;
  const writesWorkersBuilds = Boolean(repairWorker || workerToConnect || mode === "create");
  const hasSelectedBuildToken = buildTokenSelection.canWrite;
  const workersQuery = useTanStackQuery({
    // Discovery marks the Workers attached to this repository, so a cached result is valid only
    // for the attachment list that it was read with.
    queryKey: [
      "repository-provider-discovery",
      repository.repositoryId,
      "cloudflare-workers",
      cloudflareAccountId,
      repository.cloudflareWorkers.map((worker) => worker.workerTag),
      repository.providerWrite.lastWriteAt.cloudflare,
    ],
    queryFn: async () => await findWorkers({ repositoryId: repository.repositoryId }),
    enabled: !repairWorker && cloudflareAccountId !== undefined,
    retry: false,
  });
  const workers = workersQuery.data?.workers ?? [];
  const unavailableWorkerNames = new Set(workers.map((worker) => worker.workerName));
  if (createWorkerConflictName) {
    unavailableWorkerNames.add(createWorkerConflictName);
  }
  const createWorkerNameValidation = validateAppResourceName(createWorkerName, "cloudflare");
  const createWorkerNameConflict =
    createWorkerNameValidation.valid && unavailableWorkerNames.has(createWorkerNameValidation.value)
      ? {
          message: `${formatAppResourceNameConflictMessage({ provider: "cloudflare", name: createWorkerNameValidation.value })} Choose another name.`,
          suggestion: buildAvailableAppResourceNameSuggestion({
            provider: "cloudflare",
            baseName: createWorkerNameValidation.value,
            unavailableNames: unavailableWorkerNames,
          }),
        }
      : null;
  const defaultSelectedWorkerTags = workers
    .filter((worker) => worker.attachment === "attachable")
    .map((worker) => worker.workerTag);
  const selectedWorkerTags = workerSelection ?? defaultSelectedWorkerTags;
  const inventoryState = workersQuery.data?.inventoryState ?? null;
  const resourceError = workersQuery.error ? "Could not load Cloudflare resources." : null;
  const isLoading = !repairWorker && cloudflareAccountId !== undefined && workersQuery.isPending;

  const finishWorkerConnection = (
    worker: CloudflareWorkerConnectTarget,
    result: Exclude<CloudflareConnectWorkerResult, { state: "needs_confirmation" }>,
  ) => {
    setDidAddWorker(true);
    setMode("existing");
    setWorkerSelection(selectedWorkerTags.filter((candidate) => candidate !== worker.workerTag));
    setWorkerToConnect(null);
    if (result.state === "added_with_notice") {
      setSubmitError(result.message);
    } else if (result.convexDeployKey.state === "failed") {
      setSubmitError(result.convexDeployKey.message);
    }
  };

  const handleSubmit = async () => {
    if (cloudflareBlockedReason || isSubmitting || cloudflareAccountId === undefined) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      if (repairWorker) {
        if (!buildTokenUuid) {
          throw new Error("Choose an API token.");
        }
        await configureBuilds({
          buildTokenUuid,
          rootDirectory: repairWorker.rootDirectory,
          repositoryId: repository.repositoryId,
          workerId: repairWorker.workerId,
        });
      } else if (workerToConnect) {
        if (!buildTokenUuid) {
          throw new Error("Choose an API token.");
        }
        const args = {
          repositoryId: repository.repositoryId,
          workerName: workerToConnect.workerName,
          workerTag: workerToConnect.workerTag,
          rootDirectory: createRootDirectory,
          buildTokenUuid,
          convexProjectId: deployKeyConvexProjectId ?? undefined,
        };
        const result = await connectWorker(args);
        if (result.state === "needs_confirmation") {
          setConnectConfirmation({ args, request: result, worker: workerToConnect });
        } else {
          finishWorkerConnection(workerToConnect, result);
        }
        setIsSubmitting(false);
        return;
      } else if (mode === "existing") {
        const selectedWorkers = selectedWorkerTags.map((workerTag) => {
          const worker = workers.find((candidate) => candidate.workerTag === workerTag);
          if (!worker || worker.attachment !== "attachable") {
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
          repositoryId: repository.repositoryId,
          workers: selectedWorkers,
        });
      } else {
        if (!buildTokenUuid) {
          throw new Error("Choose an API token.");
        }
        const result = await createWorker({
          repositoryId: repository.repositoryId,
          workerName: createWorkerName,
          rootDirectory: createRootDirectory,
          buildTokenUuid,
          convexProjectId: deployKeyConvexProjectId ?? undefined,
        });
        if (result.convexDeployKey.state === "failed") {
          setDidAddWorker(true);
          setMode("existing");
          setSubmitError(result.convexDeployKey.message);
          setIsSubmitting(false);
          return;
        }
      }
      onClose();
    } catch (error) {
      const publicMessage =
        error instanceof ConvexError && typeof error.data === "string" ? error.data : null;
      const submittedName = validateAppResourceName(createWorkerName, "cloudflare");
      const isNameConflict =
        mode === "create" &&
        submittedName.valid &&
        publicMessage ===
          formatAppResourceNameConflictMessage({
            provider: "cloudflare",
            name: submittedName.value,
          });
      const message = publicMessage ?? "Could not add Cloudflare Workers.";
      if (
        message.startsWith(
          "The selected Cloudflare Workers Builds token is not in Cloudflare's current list",
        )
      ) {
        await buildTokensQuery.refetch();
      }
      if (isNameConflict) {
        setCreateWorkerConflictName(submittedName.value);
        setSubmitError(null);
      } else {
        setSubmitError(message);
      }
      setIsSubmitting(false);
    }
  };

  const deployKeyConvexProject = repository.convexProjects.find(
    (project) => project.convexProjectId === deployKeyConvexProjectId,
  );
  // Several attached projects can share a code location, so a choice also shows the Convex slug.
  const formatConvexProjectChoice = (project: UserRepositoryResult["convexProjects"][number]) => {
    const codeLocation = getConvexCodeLocationPath(project.codeLocation);
    const provider =
      convexObservations.state === "loaded"
        ? convexObservations.observations.find(
            (observation) => observation.convexProjectId === project.convexProjectId,
          )?.provider
        : undefined;
    return provider?.state === "current"
      ? `${provider.projectSlug} (${codeLocation})`
      : codeLocation;
  };
  // The chosen project's deploy key is installed without a later confirmation, so a choice opens
  // only when every project reads differently: projects at one code location need their slugs.
  const convexProjectChoiceLabels = repository.convexProjects.map(formatConvexProjectChoice);
  const canTellConvexProjectsApart =
    new Set(convexProjectChoiceLabels).size === convexProjectChoiceLabels.length;

  // The confirmation step replaces the form, so the confirmed call resends the shown request.
  if (connectConfirmation) {
    const { args, request, worker } = connectConfirmation;
    return (
      <RepositoryActionConfirmationDialog
        key={request.token}
        confirmLabel="Connect and add"
        onCancel={() => {
          setConnectConfirmation(null);
        }}
        onConfirm={async (confirmation) => {
          const result = await connectWorker({ ...args, confirmation });
          setConnectConfirmation(null);
          if (result.state !== "needs_confirmation") {
            finishWorkerConnection(worker, result);
          }
        }}
        request={request}
        title={`Connect ${worker.workerName} to ${repository.githubRepositoryFullName}?`}
      />
    );
  }

  return (
    <RepositoryCloudflareDialogContent
      blockedReason={cloudflareBlockedReason}
      convexProjectField={
        needsDeployKeyConvexProject && (workerToConnect || mode === "create") ? (
          <div className="grid gap-1.5">
            <Label htmlFor="cloudflare-worker-convex-project">Convex project for deploy keys</Label>
            <Select
              value={deployKeyConvexProjectId ?? ""}
              onValueChange={(convexProjectId) => {
                setSubmitError(null);
                setDeployKeyConvexProjectId(
                  repository.convexProjects.find(
                    (project) => project.convexProjectId === convexProjectId,
                  )?.convexProjectId ?? null,
                );
              }}
              disabled={isSubmitting || !canTellConvexProjectsApart}
            >
              <SelectTrigger id="cloudflare-worker-convex-project" className="w-full">
                <SelectValue placeholder="Choose a Convex project">
                  {deployKeyConvexProject
                    ? formatConvexProjectChoice(deployKeyConvexProject)
                    : null}
                </SelectValue>
              </SelectTrigger>
              <AppSelectContent>
                {repository.convexProjects.map((project) => (
                  <AppSelectItem key={project.convexProjectId} value={project.convexProjectId}>
                    {formatConvexProjectChoice(project)}
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </Select>
            {canTellConvexProjectsApart ||
            convexObservations.state === "loading" ||
            convexObservations.state === "checking" ? null : (
              <div className="text-sm text-muted-foreground">
                Samebase could not load the Convex project slugs, so it cannot tell apart the
                projects that share a code location.
              </div>
            )}
          </div>
        ) : null
      }
      cloudflareBuildTokenField={
        writesWorkersBuilds ? (
          <CloudflareBuildTokenField
            disabled={isSubmitting || Boolean(cloudflareBlockedReason)}
            emptyState="required"
            error={Boolean(buildTokensQuery.error)}
            id="repository-cloudflare-build-token"
            isLoading={buildTokensQuery.isFetching}
            lastUsedUuid={buildTokensQuery.data?.lastUsedBuildTokenUuid ?? null}
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
      createWorkerNameConflict={createWorkerNameConflict}
      createWorkerName={createWorkerName}
      didAddWorker={didAddWorker}
      error={submitError ?? resourceError}
      folderSuggestions={folderSuggestions ?? EMPTY_REPOSITORY_FOLDER_SUGGESTIONS}
      hasSelectedBuildToken={hasSelectedBuildToken}
      hasSelectedConvexProject={
        !needsDeployKeyConvexProject ||
        (canTellConvexProjectsApart && deployKeyConvexProjectId !== null)
      }
      isLoading={isLoading}
      isSubmitting={isSubmitting}
      inventoryState={inventoryState}
      mode={mode}
      onCreateRootDirectoryChange={setCreateRootDirectory}
      onCreateWorkerNameChange={(workerName) => {
        setCreateWorkerName(workerName);
        setCreateWorkerConflictName(null);
        setSubmitError(null);
      }}
      onConnectWorker={(worker) => {
        setWorkerToConnect(worker);
        setCreateRootDirectory("/");
        setSubmitError(null);
      }}
      onConnectWorkerBack={() => {
        setWorkerToConnect(null);
        setMode("existing");
      }}
      onModeChange={(nextMode) => {
        setMode(nextMode);
        setWorkerToConnect(null);
        setCreateWorkerConflictName(null);
        setSubmitError(null);
        if (nextMode === "connect") {
          setCreateRootDirectory("/");
        }
      }}
      onOpenChange={(isOpen) => {
        if (!isOpen && (!isSubmitting || cloudflareBlockedReason)) {
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
      repository={repository}
      workerToConnect={workerToConnect}
      workers={workers}
    />
  );
}
