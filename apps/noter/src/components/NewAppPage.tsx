import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAction, useQuery as useConvexQuery } from "convex/react";
import { CheckIcon, Loader2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { api } from "../../convex/_generated/api";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { clsx } from "clsx";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { linkStyle } from "@/components/styles";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import {
  buildDefaultAppResourceName,
  validateAppResourceName,
} from "../../shared/appResourceNames";
import { toSafeRepoName } from "../../shared/repoName";
import { VaultDashboardCloudflareAccountDialog } from "@/components/vault-dashboard/VaultDashboard";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";

type CreateResourceNameMode = "auto" | "manual";
type CreateResourceNameCheckResult =
  (typeof api.vault.actions.checkCreateRepositoryResourceNames)["_returnType"];
type CreateResourceNameCheckState = {
  key: string;
  result: CreateResourceNameCheckResult;
};
type CreateResourceNameAvailability = CreateResourceNameCheckResult["convex"];
type GitHubRepositoryOwnerOption =
  (typeof api.vault.actions.listRepositoryOwners)["_returnType"][number];
type CloudflareAccountOption = (typeof api.vault.cloudflare.listAccounts)["_returnType"][number];

function compareGitHubRepositoryOwnerOptions(
  left: GitHubRepositoryOwnerOption,
  right: GitHubRepositoryOwnerOption,
) {
  if (left.kind !== right.kind) {
    return left.kind === "user" ? -1 : 1;
  }
  if (left.canCreateRepository !== right.canCreateRepository) {
    return left.canCreateRepository ? -1 : 1;
  }
  return left.login.localeCompare(right.login) || left.kind.localeCompare(right.kind);
}

function resolveCreateResourceNameCheckValue(args: {
  mode: CreateResourceNameMode;
  autoName: string;
  manualName: string;
}): string {
  if (args.mode === "manual") {
    return args.manualName;
  }
  return args.autoName;
}

function resolveCreateResourceName(args: {
  mode: CreateResourceNameMode;
  autoName: string;
  manualName: string;
  availability: CreateResourceNameAvailability | null;
}): string {
  if (args.mode === "manual") {
    return args.manualName;
  }
  if (args.availability?.status === "taken" && args.availability.suggestion) {
    return args.availability.suggestion;
  }
  return args.autoName;
}

function isCreateResourceNameAvailabilityBlocking(
  mode: CreateResourceNameMode,
  availability: CreateResourceNameAvailability | null,
): boolean {
  if (!availability || availability.status === "available") {
    return false;
  }
  return !(mode === "auto" && availability.status === "taken" && availability.suggestion);
}

function isGitHubRepositoryNameAvailabilityBlocking(
  availability: CreateResourceNameAvailability | null,
): boolean {
  return Boolean(availability && availability.status !== "available");
}

function buildCreateResourceNameCheckKey(args: {
  githubRepositoryOwner: string;
  githubRepositoryName: string;
  convexProjectName: string;
  cloudflareWorkerName: string;
}): string {
  return `${args.githubRepositoryOwner}\n${args.githubRepositoryName}\n${args.convexProjectName}\n${args.cloudflareWorkerName}`;
}

function useCreateResourceNameAvailability(args: {
  enabled: boolean;
  githubRepositoryOwner: string;
  githubRepositoryName: string;
  convexProjectName: string;
  cloudflareWorkerName: string;
  checkCreateRepositoryResourceNames: (input: {
    githubRepositoryOwner: string;
    githubRepositoryName: string;
    convexProjectName: string;
    cloudflareWorkerName: string;
  }) => Promise<CreateResourceNameCheckResult>;
}): {
  checkState: CreateResourceNameCheckState | null;
  checkError: string | null;
  isChecking: boolean;
} {
  const {
    enabled,
    githubRepositoryOwner,
    githubRepositoryName,
    convexProjectName,
    cloudflareWorkerName,
    checkCreateRepositoryResourceNames,
  } = args;
  const [checkState, setCheckState] = useState<CreateResourceNameCheckState | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const checkKey = buildCreateResourceNameCheckKey({
    githubRepositoryOwner,
    githubRepositoryName,
    convexProjectName,
    cloudflareWorkerName,
  });

  useEffect(() => {
    if (!enabled) {
      setCheckError(null);
      setCheckState(null);
      setIsChecking(false);
      return;
    }

    let canceled = false;
    setCheckError(null);
    setIsChecking(true);

    const timeoutId = window.setTimeout(() => {
      void checkCreateRepositoryResourceNames({
        githubRepositoryOwner,
        githubRepositoryName,
        convexProjectName,
        cloudflareWorkerName,
      })
        .then((result) => {
          if (canceled) {
            return;
          }
          setCheckState({ key: checkKey, result });
          setIsChecking(false);
        })
        .catch((error: unknown) => {
          if (canceled) {
            return;
          }
          setCheckError(error instanceof Error ? error.message : "Could not check provider names.");
          setCheckState(null);
          setIsChecking(false);
        });
    }, 350);

    return () => {
      canceled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    enabled,
    githubRepositoryOwner,
    githubRepositoryName,
    convexProjectName,
    cloudflareWorkerName,
    checkCreateRepositoryResourceNames,
    checkKey,
  ]);

  return { checkState, checkError, isChecking };
}

function useGithubRepositoryOwnerOptions({
  githubConnected,
  listGithubRepositoryOwners,
  onLoadError,
  onOwnersLoaded,
  setIsLoading,
}: {
  githubConnected: boolean;
  listGithubRepositoryOwners: (
    args: Record<string, never>,
  ) => Promise<GitHubRepositoryOwnerOption[]>;
  onLoadError: (error: string | null) => void;
  onOwnersLoaded: (owners: GitHubRepositoryOwnerOption[]) => void;
  setIsLoading: (isLoading: boolean) => void;
}) {
  useEffect(() => {
    let shouldIgnoreResult = false;
    if (!githubConnected) {
      onOwnersLoaded([]);
      onLoadError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    onLoadError(null);
    void listGithubRepositoryOwners({})
      .then((owners) => {
        if (!shouldIgnoreResult) {
          onOwnersLoaded(owners);
        }
      })
      .catch((error: unknown) => {
        if (!shouldIgnoreResult) {
          onOwnersLoaded([]);
          onLoadError(error instanceof Error ? error.message : "Failed to load GitHub owners.");
        }
      })
      .finally(() => {
        if (!shouldIgnoreResult) {
          setIsLoading(false);
        }
      });

    return () => {
      shouldIgnoreResult = true;
    };
  }, [githubConnected, listGithubRepositoryOwners, onLoadError, onOwnersLoaded, setIsLoading]);
}

function CreateResourceNameFeedback({
  children,
  message,
  suggestion,
  onUseSuggestion,
}: {
  children?: ReactNode;
  message: string;
  suggestion: string | null;
  onUseSuggestion: (suggestion: string) => void;
}) {
  return (
    <div className="text-xs text-red-600">
      <span>{message}</span>
      {suggestion && (
        <button
          type="button"
          className={clsx("ml-1 text-left text-blue-600 underline underline-offset-2", linkStyle)}
          onClick={() => {
            onUseSuggestion(suggestion);
          }}
        >
          Use {suggestion}
        </button>
      )}
      {children}
    </div>
  );
}

function CreateResourceNameStatus({
  children,
  kind,
}: {
  children: ReactNode;
  kind: "available" | "checking" | "info";
}) {
  return (
    <div
      className={clsx(
        "flex min-w-0 items-start text-xs",
        kind === "available" && "gap-1.5 text-green-600",
        kind === "checking" && "gap-1.5 text-muted-foreground",
        kind === "info" && "text-muted-foreground",
      )}
      role="status"
    >
      {kind === "available" ? (
        <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : kind === "checking" ? (
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : null}
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

// Use toSafeRepoName here so the slash preview matches repository provisioning.
function buildGitHubRepositoryNameSlashReplacement(rawName: string): string | null {
  const repositoryName = toSafeRepoName(rawName);
  if (!rawName.includes("/") || !repositoryName) {
    return null;
  }
  return repositoryName;
}

export function GitHubRepositoryNameSlashPreview({ rawName }: { rawName: string }) {
  const repositoryName = buildGitHubRepositoryNameSlashReplacement(rawName);
  if (!repositoryName) {
    return null;
  }
  return (
    <CreateResourceNameStatus kind="info">
      GitHub repo name:{" "}
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
        {repositoryName}
      </code>
    </CreateResourceNameStatus>
  );
}

function CreateResourceNameHelp({ children }: { children: ReactNode }) {
  return <div className="text-xs text-muted-foreground">{children}</div>;
}

function CreateResourceNameInlineAction({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={clsx("text-left", linkStyle)} onClick={onClick}>
      {children}
    </button>
  );
}

function CreateControlMessageSlot({
  children,
  size = "compact",
}: {
  children: ReactNode;
  size?: "compact" | "comfortable";
}) {
  const isEmpty =
    children === null || children === undefined || typeof children === "boolean" || children === "";
  const sizeClassName = size === "comfortable" ? "min-h-5" : "min-h-4";

  return (
    <div
      className={clsx("min-w-0", sizeClassName, isEmpty && "invisible pointer-events-none")}
      aria-hidden={isEmpty ? true : undefined}
    >
      {children}
    </div>
  );
}

function CreateProviderNameInput({
  disabled,
  icon,
  onChange,
  onBlur,
  onKeyDown,
  placeholder,
  value,
}: {
  disabled: boolean;
  icon: ReactNode;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="relative w-full">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-2.5 flex w-5 items-center justify-center text-muted-foreground"
      >
        {icon}
      </span>
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className="w-full pl-9"
        disabled={disabled}
        aria-label={placeholder}
      />
    </div>
  );
}

export function NewAppCreateFormFields({
  cloudflareWorkerName,
  cloudflareWorkerNameSupport,
  convexProjectName,
  convexProjectNameSupport,
  githubConnected,
  githubRepositoryNameSupport,
  githubRepositoryOwnerOptions,
  hasRequiredCreateConnections,
  isCreating,
  isLoadingGithubRepositoryOwners,
  newRepositoryName,
  onCloudflareWorkerNameBlur,
  onCloudflareWorkerNameChange,
  onConvexProjectNameBlur,
  onConvexProjectNameChange,
  onGithubRepositoryOwnerChange,
  onNewRepositoryNameChange,
  selectedGithubRepositoryOwner,
}: {
  cloudflareWorkerName: string;
  cloudflareWorkerNameSupport: ReactNode;
  convexProjectName: string;
  convexProjectNameSupport: ReactNode;
  githubConnected: boolean;
  githubRepositoryNameSupport: ReactNode;
  githubRepositoryOwnerOptions: GitHubRepositoryOwnerOption[];
  hasRequiredCreateConnections: boolean;
  isCreating: boolean;
  isLoadingGithubRepositoryOwners: boolean;
  newRepositoryName: string;
  onCloudflareWorkerNameBlur: () => void;
  onCloudflareWorkerNameChange: (value: string) => void;
  onConvexProjectNameBlur: () => void;
  onConvexProjectNameChange: (value: string) => void;
  onGithubRepositoryOwnerChange: (value: string) => void;
  onNewRepositoryNameChange: (value: string) => void;
  selectedGithubRepositoryOwner: string;
}) {
  const canEditProviderResourceNames = newRepositoryName.trim().length > 0;
  const providerResourceNameInputDisabled =
    !hasRequiredCreateConnections || isCreating || !canEditProviderResourceNames;
  const ownerSelectPlaceholder = isLoadingGithubRepositoryOwners
    ? "Loading GitHub owners..."
    : "GitHub owner";
  const sortedGithubRepositoryOwnerOptions = [...githubRepositoryOwnerOptions].sort(
    compareGitHubRepositoryOwnerOptions,
  );

  return (
    <>
      {githubConnected && (
        <Select
          value={selectedGithubRepositoryOwner}
          onValueChange={onGithubRepositoryOwnerChange}
          disabled={
            isCreating ||
            !hasRequiredCreateConnections ||
            isLoadingGithubRepositoryOwners ||
            githubRepositoryOwnerOptions.length === 0
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={ownerSelectPlaceholder} />
          </SelectTrigger>
          <AppSelectContent>
            {sortedGithubRepositoryOwnerOptions.map((owner) => (
              <AppSelectItem
                key={owner.login}
                value={owner.login}
                disabled={!owner.canCreateRepository}
              >
                {owner.canCreateRepository ? owner.login : `${owner.login} (cannot create repos)`}
              </AppSelectItem>
            ))}
          </AppSelectContent>
        </Select>
      )}
      <CreateProviderNameInput
        placeholder="GitHub repo name"
        value={newRepositoryName}
        onChange={onNewRepositoryNameChange}
        icon={<GitHubProviderLogo />}
        disabled={!hasRequiredCreateConnections || isCreating}
      />
      <CreateControlMessageSlot>{githubRepositoryNameSupport}</CreateControlMessageSlot>
      <div
        className={clsx(
          "flex w-full flex-col items-stretch gap-2",
          !canEditProviderResourceNames && "invisible pointer-events-none",
        )}
        aria-hidden={canEditProviderResourceNames ? undefined : true}
      >
        <CreateProviderNameInput
          placeholder="Convex project name"
          value={convexProjectName}
          onChange={onConvexProjectNameChange}
          onBlur={onConvexProjectNameBlur}
          icon={<ConvexProviderLogo />}
          disabled={providerResourceNameInputDisabled}
        />
        <CreateControlMessageSlot>{convexProjectNameSupport}</CreateControlMessageSlot>
        <CreateProviderNameInput
          placeholder="Cloudflare Worker name"
          value={cloudflareWorkerName}
          onChange={onCloudflareWorkerNameChange}
          onBlur={onCloudflareWorkerNameBlur}
          icon={<CloudflareProviderLogo />}
          disabled={providerResourceNameInputDisabled}
        />
        <CreateControlMessageSlot>{cloudflareWorkerNameSupport}</CreateControlMessageSlot>
      </div>
    </>
  );
}

export function NewAppPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const createRepository = useAction(api.vault.actions.createRepository);
  const checkCreateRepositoryResourceNames = useAction(
    api.vault.actions.checkCreateRepositoryResourceNames,
  );
  const listGithubRepositoryOwners = useAction(api.vault.actions.listRepositoryOwners);
  const listCloudflareAccounts = useAction(api.vault.cloudflare.listAccounts);
  const selectCloudflareDefaultAccount = useAction(api.vault.cloudflare.selectDefaultAccount);
  const githubConnection = useConvexQuery(api.users.getGithubConnectionStatus);
  const convexConnection = useConvexQuery(api.users.getConvexConnectionStatus);
  const cloudflareConnection = useConvexQuery(api.users.getCloudflareConnectionStatus);
  const [newRepositoryName, setNewRepositoryNameState] = useState("");
  const [convexProjectName, setConvexProjectNameState] = useState("");
  const [convexProjectNameMode, setConvexProjectNameMode] =
    useState<CreateResourceNameMode>("auto");
  const [cloudflareWorkerName, setCloudflareWorkerNameState] = useState("");
  const [cloudflareWorkerNameMode, setCloudflareWorkerNameMode] =
    useState<CreateResourceNameMode>("auto");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingGithubRepositoryOwners, setIsLoadingGithubRepositoryOwners] = useState(false);
  const [githubRepositoryOwnerOptions, setGithubRepositoryOwnerOptionsState] = useState<
    GitHubRepositoryOwnerOption[]
  >([]);
  const [githubRepositoryOwnerLoadError, setGithubRepositoryOwnerLoadError] = useState<
    string | null
  >(null);
  const [selectedGithubRepositoryOwner, setSelectedGithubRepositoryOwnerState] = useState("");
  const [cloudflareAccountDialogOpen, setCloudflareAccountDialogOpen] = useState(false);
  const [cloudflareAccountDialogError, setCloudflareAccountDialogError] = useState<string | null>(
    null,
  );
  const [isLoadingCloudflareAccounts, setIsLoadingCloudflareAccounts] = useState(false);
  const [isSubmittingCloudflareAccount, setIsSubmittingCloudflareAccount] = useState(false);
  const [cloudflareAccountOptions, setCloudflareAccountOptions] = useState<
    CloudflareAccountOption[]
  >([]);
  const [selectedCloudflareAccountId, setSelectedCloudflareAccountId] = useState("");
  const cloudflareAccountDialogRequestIdRef = useRef(0);

  const githubConnected = githubConnection?.connected === true;
  const convexConnected = convexConnection?.connected === true;
  const cloudflareConnected = cloudflareConnection?.connected === true;
  const cloudflareAccountSelectionRequired =
    cloudflareConnection?.connected === true && !cloudflareConnection.accountId;
  const hasConnectedCreateProviders = Boolean(
    githubConnected && convexConnected && cloudflareConnected,
  );
  const hasRequiredCreateConnections = Boolean(
    hasConnectedCreateProviders && !cloudflareAccountSelectionRequired,
  );
  const selectedGithubRepositoryOwnerOption = githubRepositoryOwnerOptions.find(
    (owner) => owner.login === selectedGithubRepositoryOwner,
  );
  const canCreateRepo = Boolean(
    hasRequiredCreateConnections &&
    selectedGithubRepositoryOwner.trim() &&
    selectedGithubRepositoryOwnerOption?.canCreateRepository,
  );
  const createRepositoryName = newRepositoryName.trim();
  const defaultConvexProjectName = buildDefaultAppResourceName({
    repositoryName: newRepositoryName,
    provider: "convex",
  });
  const defaultCloudflareWorkerName = buildDefaultAppResourceName({
    repositoryName: newRepositoryName,
    provider: "cloudflare",
  });
  const checkedConvexProjectName = resolveCreateResourceNameCheckValue({
    mode: convexProjectNameMode,
    autoName: defaultConvexProjectName,
    manualName: convexProjectName,
  });
  const checkedCloudflareWorkerName = resolveCreateResourceNameCheckValue({
    mode: cloudflareWorkerNameMode,
    autoName: defaultCloudflareWorkerName,
    manualName: cloudflareWorkerName,
  });
  const selectedGithubRepositoryOwnerName = selectedGithubRepositoryOwner.trim();
  const shouldCheckResourceNames = Boolean(
    hasRequiredCreateConnections && selectedGithubRepositoryOwnerName && createRepositoryName,
  );
  const resourceNameCheckKey = buildCreateResourceNameCheckKey({
    githubRepositoryOwner: selectedGithubRepositoryOwnerName,
    githubRepositoryName: createRepositoryName,
    convexProjectName: checkedConvexProjectName,
    cloudflareWorkerName: checkedCloudflareWorkerName,
  });
  const {
    checkState: createResourceNameCheck,
    checkError: createResourceNameCheckError,
    isChecking: isCheckingCreateResourceNames,
  } = useCreateResourceNameAvailability({
    enabled: shouldCheckResourceNames,
    githubRepositoryOwner: selectedGithubRepositoryOwnerName,
    githubRepositoryName: createRepositoryName,
    convexProjectName: checkedConvexProjectName,
    cloudflareWorkerName: checkedCloudflareWorkerName,
    checkCreateRepositoryResourceNames,
  });
  const currentResourceNameCheck =
    createResourceNameCheck?.key === resourceNameCheckKey ? createResourceNameCheck.result : null;
  const githubRepositoryNameAvailability = currentResourceNameCheck?.github ?? null;
  const convexProjectNameAvailability = currentResourceNameCheck?.convex ?? null;
  const cloudflareWorkerNameAvailability = currentResourceNameCheck?.cloudflare ?? null;
  const resolvedConvexProjectName = resolveCreateResourceName({
    mode: convexProjectNameMode,
    autoName: defaultConvexProjectName,
    manualName: convexProjectName,
    availability: convexProjectNameAvailability,
  });
  const resolvedCloudflareWorkerName = resolveCreateResourceName({
    mode: cloudflareWorkerNameMode,
    autoName: defaultCloudflareWorkerName,
    manualName: cloudflareWorkerName,
    availability: cloudflareWorkerNameAvailability,
  });
  const convexProjectNameValidation = validateAppResourceName(resolvedConvexProjectName, "convex");
  const cloudflareWorkerNameValidation = validateAppResourceName(
    resolvedCloudflareWorkerName,
    "cloudflare",
  );
  const isConvexProjectNameAvailabilityBlocking = isCreateResourceNameAvailabilityBlocking(
    convexProjectNameMode,
    convexProjectNameAvailability,
  );
  const isCloudflareWorkerNameAvailabilityBlocking = isCreateResourceNameAvailabilityBlocking(
    cloudflareWorkerNameMode,
    cloudflareWorkerNameAvailability,
  );
  const isGitHubRepositoryNameBlocking = isGitHubRepositoryNameAvailabilityBlocking(
    githubRepositoryNameAvailability,
  );
  const isCreateResourceNameCheckPending = Boolean(
    shouldCheckResourceNames && (isCheckingCreateResourceNames || !currentResourceNameCheck),
  );
  const hasBlockingCreateResourceName = Boolean(
    createRepositoryName &&
    (isGitHubRepositoryNameBlocking ||
      !convexProjectNameValidation.valid ||
      !cloudflareWorkerNameValidation.valid ||
      createResourceNameCheckError ||
      isCreateResourceNameCheckPending ||
      isConvexProjectNameAvailabilityBlocking ||
      isCloudflareWorkerNameAvailabilityBlocking),
  );
  const showCloudflareCreateWarning =
    cloudflareConnected &&
    (cloudflareConnection.mcpTokenStatus === "invalid" ||
      cloudflareConnection.mcpTokenStatus === "expired");
  const createButtonDisabled =
    isCreating ||
    createRepositoryName.length === 0 ||
    !canCreateRepo ||
    hasBlockingCreateResourceName;

  const setNewRepositoryName = useCallback((value: string) => {
    setCreateError(null);
    setNewRepositoryNameState(value);
  }, []);
  const setConvexProjectName = useCallback((value: string, mode: CreateResourceNameMode) => {
    setCreateError(null);
    setConvexProjectNameState(value);
    setConvexProjectNameMode(mode);
  }, []);
  const setCloudflareWorkerName = useCallback((value: string, mode: CreateResourceNameMode) => {
    setCreateError(null);
    setCloudflareWorkerNameState(value);
    setCloudflareWorkerNameMode(mode);
  }, []);
  const setSelectedGithubRepositoryOwner = useCallback((value: string) => {
    setCreateError(null);
    setSelectedGithubRepositoryOwnerState(value);
  }, []);
  const setGithubRepositoryOwnerOptions = useCallback((owners: GitHubRepositoryOwnerOption[]) => {
    const sortedOwners = [...owners].sort(compareGitHubRepositoryOwnerOptions);
    setGithubRepositoryOwnerLoadError(null);
    setGithubRepositoryOwnerOptionsState(sortedOwners);
    setSelectedGithubRepositoryOwnerState((currentOwner) => {
      const currentOwnerStillExists = sortedOwners.some(
        (owner) => owner.login === currentOwner && owner.canCreateRepository,
      );
      if (currentOwnerStillExists) {
        return currentOwner;
      }
      return sortedOwners.find((owner) => owner.canCreateRepository)?.login ?? "";
    });
  }, []);
  const loadCloudflareAccountDialogResources = useCallback(
    async (preferredAccountId: string | undefined) => {
      const requestId = cloudflareAccountDialogRequestIdRef.current + 1;
      cloudflareAccountDialogRequestIdRef.current = requestId;
      setIsLoadingCloudflareAccounts(true);
      setCloudflareAccountDialogError(null);
      try {
        const accounts = await listCloudflareAccounts({});
        if (cloudflareAccountDialogRequestIdRef.current !== requestId) {
          return;
        }
        setCloudflareAccountOptions(accounts);
        if (accounts.length === 0) {
          setSelectedCloudflareAccountId("");
          setCloudflareAccountDialogError("No Cloudflare accounts are available.");
          return;
        }

        const selectedAccount =
          accounts.find((account) => account.accountId === preferredAccountId) ?? accounts[0];
        setSelectedCloudflareAccountId(selectedAccount.accountId);
      } catch (error) {
        if (cloudflareAccountDialogRequestIdRef.current !== requestId) {
          return;
        }
        setCloudflareAccountDialogError(
          error instanceof Error ? error.message : "Could not load Cloudflare accounts.",
        );
      } finally {
        if (cloudflareAccountDialogRequestIdRef.current === requestId) {
          setIsLoadingCloudflareAccounts(false);
        }
      }
    },
    [listCloudflareAccounts],
  );

  useGithubRepositoryOwnerOptions({
    githubConnected,
    listGithubRepositoryOwners,
    onLoadError: setGithubRepositoryOwnerLoadError,
    onOwnersLoaded: setGithubRepositoryOwnerOptions,
    setIsLoading: setIsLoadingGithubRepositoryOwners,
  });

  const openCloudflareAccountDialog = () => {
    setCloudflareAccountDialogOpen(true);
    void loadCloudflareAccountDialogResources(cloudflareConnection?.accountId);
  };
  const handleCloudflareAccountDialogOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      cloudflareAccountDialogRequestIdRef.current += 1;
    }
    setCloudflareAccountDialogOpen(isOpen);
  };
  const handleSubmitCloudflareAccount = async () => {
    if (isSubmittingCloudflareAccount || !selectedCloudflareAccountId) {
      return;
    }
    setCloudflareAccountDialogError(null);
    setIsSubmittingCloudflareAccount(true);
    try {
      await selectCloudflareDefaultAccount({
        accountId: selectedCloudflareAccountId,
      });
      setCreateError(null);
      handleCloudflareAccountDialogOpenChange(false);
    } catch (error) {
      setCloudflareAccountDialogError(
        error instanceof Error ? error.message : "Could not save Cloudflare account.",
      );
    } finally {
      setIsSubmittingCloudflareAccount(false);
    }
  };
  const renderCreateResourceNameSupport = ({
    availability,
    checkedName,
    label,
    mode,
    onUseGeneratedName,
    validation,
    onUseSuggestion,
  }: {
    availability: CreateResourceNameAvailability | null;
    checkedName: string;
    label: string;
    mode: CreateResourceNameMode;
    onUseGeneratedName: () => void;
    validation: ReturnType<typeof validateAppResourceName>;
    onUseSuggestion: (suggestion: string) => void;
  }) => {
    const manualResetContent = mode === "manual" && (
      <>
        Custom name.{" "}
        <CreateResourceNameInlineAction onClick={onUseGeneratedName}>
          Use generated name
        </CreateResourceNameInlineAction>
      </>
    );
    const manualReset = manualResetContent && (
      <CreateResourceNameHelp>{manualResetContent}</CreateResourceNameHelp>
    );

    if (createRepositoryName && !validation.valid) {
      return (
        <CreateResourceNameFeedback
          message={validation.message}
          suggestion={validation.suggestion}
          onUseSuggestion={onUseSuggestion}
        >
          {manualResetContent && (
            <span className="ml-1 text-muted-foreground">{manualResetContent}</span>
          )}
        </CreateResourceNameFeedback>
      );
    }

    if (createResourceNameCheckError) {
      return (
        <CreateResourceNameFeedback
          message={createResourceNameCheckError}
          suggestion={null}
          onUseSuggestion={onUseSuggestion}
        >
          {manualResetContent && (
            <span className="ml-1 text-muted-foreground">{manualResetContent}</span>
          )}
        </CreateResourceNameFeedback>
      );
    }

    if (isCreateResourceNameCheckPending) {
      return (
        <CreateResourceNameStatus kind="checking">Checking {label}...</CreateResourceNameStatus>
      );
    }

    if (!availability) {
      return manualReset;
    }

    if (availability.status === "available") {
      return (
        <CreateResourceNameStatus kind="available">
          {label} is available.
          {manualResetContent && (
            <span className="ml-1 text-muted-foreground">{manualResetContent}</span>
          )}
        </CreateResourceNameStatus>
      );
    }

    if (mode === "auto" && availability.status === "taken" && availability.suggestion) {
      return (
        <CreateResourceNameStatus kind="available">
          {checkedName} already exists; using {availability.suggestion}.
        </CreateResourceNameStatus>
      );
    }

    return (
      <CreateResourceNameFeedback
        message={availability.message ?? "Name is not available."}
        suggestion={availability.suggestion}
        onUseSuggestion={onUseSuggestion}
      >
        {manualResetContent && (
          <span className="ml-1 text-muted-foreground">{manualResetContent}</span>
        )}
      </CreateResourceNameFeedback>
    );
  };
  const renderGitHubRepositoryNameSupport = () => {
    if (!createRepositoryName) {
      return null;
    }

    if (createResourceNameCheckError) {
      return (
        <CreateResourceNameFeedback
          message={createResourceNameCheckError}
          suggestion={null}
          onUseSuggestion={setNewRepositoryName}
        />
      );
    }

    if (
      githubRepositoryNameAvailability &&
      githubRepositoryNameAvailability.status !== "available"
    ) {
      return (
        <CreateResourceNameFeedback
          message={
            githubRepositoryNameAvailability.message ?? "GitHub repository name is not available."
          }
          suggestion={githubRepositoryNameAvailability.suggestion}
          onUseSuggestion={setNewRepositoryName}
        />
      );
    }

    if (createRepositoryName.includes("/")) {
      return <GitHubRepositoryNameSlashPreview rawName={createRepositoryName} />;
    }

    if (isCreateResourceNameCheckPending) {
      return (
        <CreateResourceNameStatus kind="checking">
          Checking GitHub repository...
        </CreateResourceNameStatus>
      );
    }

    if (githubRepositoryNameAvailability?.status === "available") {
      return (
        <CreateResourceNameStatus kind="available">
          GitHub repository name is available.
        </CreateResourceNameStatus>
      );
    }

    return null;
  };
  const createControlFooterMessages =
    createError ||
    !canCreateRepo ||
    githubRepositoryOwnerLoadError ||
    showCloudflareCreateWarning ? (
      <div className="flex flex-col gap-2">
        {createError && <div className="text-sm text-red-600">{createError}</div>}
        {!canCreateRepo && (
          <div className="text-xs text-muted-foreground">
            {cloudflareAccountSelectionRequired ? (
              <>
                Choose a Cloudflare account to create an app.{" "}
                <CreateResourceNameInlineAction onClick={openCloudflareAccountDialog}>
                  Select account
                </CreateResourceNameInlineAction>
              </>
            ) : hasRequiredCreateConnections ? (
              "Choose a GitHub owner to create an app."
            ) : (
              "Connect GitHub, Convex, and Cloudflare to create an app."
            )}
          </div>
        )}
        {githubRepositoryOwnerLoadError && (
          <div className="text-xs text-red-600">{githubRepositoryOwnerLoadError}</div>
        )}
        {showCloudflareCreateWarning && (
          <div className="text-xs text-amber-700">
            Cloudflare token is invalid or expired. Reconnect Cloudflare.
          </div>
        )}
      </div>
    ) : null;

  const createFormFields = (
    <NewAppCreateFormFields
      cloudflareWorkerName={resolvedCloudflareWorkerName}
      cloudflareWorkerNameSupport={renderCreateResourceNameSupport({
        availability: cloudflareWorkerNameAvailability,
        checkedName: checkedCloudflareWorkerName,
        label: "Cloudflare Worker name",
        mode: cloudflareWorkerNameMode,
        validation: cloudflareWorkerNameValidation,
        onUseGeneratedName: () => {
          setCloudflareWorkerName("", "auto");
        },
        onUseSuggestion: (suggestion) => {
          setCloudflareWorkerName(suggestion, "manual");
        },
      })}
      convexProjectName={resolvedConvexProjectName}
      convexProjectNameSupport={renderCreateResourceNameSupport({
        availability: convexProjectNameAvailability,
        checkedName: checkedConvexProjectName,
        label: "Convex project name",
        mode: convexProjectNameMode,
        validation: convexProjectNameValidation,
        onUseGeneratedName: () => {
          setConvexProjectName("", "auto");
        },
        onUseSuggestion: (suggestion) => {
          setConvexProjectName(suggestion, "manual");
        },
      })}
      githubConnected={githubConnected}
      githubRepositoryNameSupport={renderGitHubRepositoryNameSupport()}
      githubRepositoryOwnerOptions={githubRepositoryOwnerOptions}
      hasRequiredCreateConnections={hasRequiredCreateConnections}
      isCreating={isCreating}
      isLoadingGithubRepositoryOwners={isLoadingGithubRepositoryOwners}
      newRepositoryName={newRepositoryName}
      onCloudflareWorkerNameBlur={() => {
        if (cloudflareWorkerNameMode === "manual" && !cloudflareWorkerName.trim()) {
          setCloudflareWorkerName("", "auto");
        }
      }}
      onCloudflareWorkerNameChange={(value) => {
        setCloudflareWorkerName(value, "manual");
      }}
      onConvexProjectNameBlur={() => {
        if (convexProjectNameMode === "manual" && !convexProjectName.trim()) {
          setConvexProjectName("", "auto");
        }
      }}
      onConvexProjectNameChange={(value) => {
        setConvexProjectName(value, "manual");
      }}
      onGithubRepositoryOwnerChange={setSelectedGithubRepositoryOwner}
      onNewRepositoryNameChange={setNewRepositoryName}
      selectedGithubRepositoryOwner={selectedGithubRepositoryOwner}
    />
  );

  const handleCreateRepository = async () => {
    const repoName = newRepositoryName.trim();
    if (!repoName || isCreating) return;
    if (!hasConnectedCreateProviders) {
      setCreateError("Connect GitHub, Convex, and Cloudflare before creating an app.");
      return;
    }
    if (cloudflareAccountSelectionRequired) {
      setCreateError("Choose a Cloudflare account before creating an app.");
      openCloudflareAccountDialog();
      return;
    }
    const owner = selectedGithubRepositoryOwner.trim();
    if (!owner) {
      setCreateError("Choose a GitHub owner before creating an app.");
      return;
    }
    if (!convexProjectNameValidation.valid) {
      setCreateError(convexProjectNameValidation.message);
      return;
    }
    if (!cloudflareWorkerNameValidation.valid) {
      setCreateError(cloudflareWorkerNameValidation.message);
      return;
    }
    if (createResourceNameCheckError) {
      setCreateError(createResourceNameCheckError);
      return;
    }
    if (isCreateResourceNameCheckPending) {
      setCreateError("Checking provider names.");
      return;
    }
    if (isGitHubRepositoryNameBlocking) {
      setCreateError(
        githubRepositoryNameAvailability?.message ?? "GitHub repository name is not available.",
      );
      return;
    }
    if (isConvexProjectNameAvailabilityBlocking) {
      setCreateError(
        convexProjectNameAvailability?.message ?? "Convex project name is not available.",
      );
      return;
    }
    if (isCloudflareWorkerNameAvailabilityBlocking) {
      setCreateError(
        cloudflareWorkerNameAvailability?.message ?? "Cloudflare Worker name is not available.",
      );
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      await createRepository({
        name: repoName,
        owner,
        convexProjectName: convexProjectNameValidation.value,
        cloudflareWorkerName: cloudflareWorkerNameValidation.value,
        private: true,
      });
      setNewRepositoryNameState("");
      setConvexProjectNameState("");
      setConvexProjectNameMode("auto");
      setCloudflareWorkerNameState("");
      setCloudflareWorkerNameMode("auto");
      await navigate({
        href: buildPathWithTanStackSearch({
          pathname: DASHBOARD_ROUTE,
          search: location.search,
        }),
      });
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create app");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createButtonDisabled) {
      return;
    }
    void handleCreateRepository();
  };

  return (
    <div className="container flex min-h-0 flex-1 flex-col py-6" data-testid="new-app-page">
      <form className="flex w-full max-w-md flex-col gap-4" onSubmit={handleSubmit}>
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">New App</h1>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2">{createFormFields}</div>
        <div className="min-h-5">{createControlFooterMessages}</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={createButtonDisabled}>
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isCreating ? "Creating app..." : "New App"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to={DASHBOARD_ROUTE}>Cancel</Link>
          </Button>
        </div>
      </form>
      <VaultDashboardCloudflareAccountDialog
        accounts={cloudflareAccountOptions}
        error={cloudflareAccountDialogError}
        isLoading={isLoadingCloudflareAccounts}
        isSubmitting={isSubmittingCloudflareAccount}
        onAccountChange={(accountId) => {
          setSelectedCloudflareAccountId(accountId);
          setCloudflareAccountDialogError(null);
        }}
        onOpenChange={handleCloudflareAccountDialogOpenChange}
        onSubmit={() => {
          void handleSubmitCloudflareAccount();
        }}
        open={cloudflareAccountDialogOpen}
        selectedAccountId={selectedCloudflareAccountId}
      />
    </div>
  );
}
