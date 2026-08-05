import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery as useConvexQuery } from "convex/react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clsx } from "clsx";
import { linkStyle } from "@/components/styles";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import { buildVaultDashboardRoute } from "@/lib/vaultRoutes";
import {
  buildDefaultAppResourceName,
  validateAppResourceName,
} from "../../shared/appResourceNames";
import { toSafeRepoName } from "../../shared/repoName";
import { VaultDashboardCloudflareAccountDialog } from "@/components/vault-dashboard/VaultDashboardCloudflareAccountDialog";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import { GitHubOwnerSelect, type GitHubOwner } from "@/components/GitHubOwnerSelect";
import { getCurrentRootRelativeUrl, openGitHubAppSetupPopup } from "@/lib/githubAppSetupFlow";
import type { Id } from "../../convex/_generated/dataModel";

type CreateResourceNameMode = "auto" | "manual";
type CreateResourceNameCheckResult =
  (typeof api.vault.actions.checkCreateRepositoryResourceNames)["_returnType"];
type CreateResourceNameCheckState = {
  key: string;
  result: CreateResourceNameCheckResult;
};
type CreateResourceNameAvailability = CreateResourceNameCheckResult["convex"];
type CloudflareAccountOption = (typeof api.vault.cloudflare.listAccounts)["_returnType"][number];

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
  organizationId: Id<"organizations"> | null;
  githubRepositoryName: string;
  convexProjectName: string;
  cloudflareWorkerName: string;
}): string {
  return `${args.organizationId ?? ""}\n${args.githubRepositoryName}\n${args.convexProjectName}\n${args.cloudflareWorkerName}`;
}

function useCreateResourceNameAvailability(args: {
  enabled: boolean;
  organizationId: Id<"organizations"> | null;
  githubRepositoryName: string;
  convexProjectName: string;
  cloudflareWorkerName: string;
  checkCreateRepositoryResourceNames: (input: {
    organizationId: Id<"organizations">;
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
    organizationId,
    githubRepositoryName,
    convexProjectName,
    cloudflareWorkerName,
    checkCreateRepositoryResourceNames,
  } = args;
  const [checkState, setCheckState] = useState<CreateResourceNameCheckState | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const checkKey = buildCreateResourceNameCheckKey({
    organizationId,
    githubRepositoryName,
    convexProjectName,
    cloudflareWorkerName,
  });

  useEffect(() => {
    if (!enabled || organizationId === null) {
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
        organizationId,
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
    organizationId,
    githubRepositoryName,
    convexProjectName,
    cloudflareWorkerName,
    checkCreateRepositoryResourceNames,
    checkKey,
  ]);

  return { checkState, checkError, isChecking };
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
  githubRepositoryNameSupport,
  hasRequiredCreateConnections,
  isCreating,
  newRepositoryName,
  onCloudflareWorkerNameBlur,
  onCloudflareWorkerNameChange,
  onConvexProjectNameBlur,
  onConvexProjectNameChange,
  onNewRepositoryNameChange,
}: {
  cloudflareWorkerName: string;
  cloudflareWorkerNameSupport: ReactNode;
  convexProjectName: string;
  convexProjectNameSupport: ReactNode;
  githubRepositoryNameSupport: ReactNode;
  hasRequiredCreateConnections: boolean;
  isCreating: boolean;
  newRepositoryName: string;
  onCloudflareWorkerNameBlur: () => void;
  onCloudflareWorkerNameChange: (value: string) => void;
  onConvexProjectNameBlur: () => void;
  onConvexProjectNameChange: (value: string) => void;
  onNewRepositoryNameChange: (value: string) => void;
}) {
  const canEditProviderResourceNames = newRepositoryName.trim().length > 0;
  const providerResourceNameInputDisabled =
    !hasRequiredCreateConnections || isCreating || !canEditProviderResourceNames;

  return (
    <>
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
  const listCloudflareAccounts = useAction(api.vault.cloudflare.listAccounts);
  const selectCloudflareDefaultAccount = useAction(api.vault.cloudflare.selectDefaultAccount);
  const getGitHubAppInstallationUrl = useMutation(
    api.githubAppInstallation.getGitHubAppInstallationUrl,
  );
  const githubOwners = useConvexQuery(api.organizations.listForViewer);
  const [requestedOrganizationId, setSelectedOrganizationId] = useState<Id<"organizations"> | null>(
    null,
  );
  const selectedOwner =
    githubOwners?.length === 1
      ? githubOwners[0]
      : (githubOwners?.find(
          (owner: GitHubOwner) => owner.organizationId === requestedOrganizationId,
        ) ?? null);
  const selectedOrganizationId = selectedOwner?.organizationId ?? null;
  const convexConnection = useConvexQuery(
    api.users.getConvexConnectionStatus,
    selectedOrganizationId === null ? "skip" : { organizationId: selectedOrganizationId },
  );
  const cloudflareConnection = useConvexQuery(
    api.users.getCloudflareConnectionStatus,
    selectedOrganizationId === null ? "skip" : { organizationId: selectedOrganizationId },
  );
  const [newRepositoryName, setNewRepositoryNameState] = useState("");
  const [convexProjectName, setConvexProjectNameState] = useState("");
  const [convexProjectNameMode, setConvexProjectNameMode] =
    useState<CreateResourceNameMode>("auto");
  const [cloudflareWorkerName, setCloudflareWorkerNameState] = useState("");
  const [cloudflareWorkerNameMode, setCloudflareWorkerNameMode] =
    useState<CreateResourceNameMode>("auto");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [installingGitHubApp, setInstallingGitHubApp] = useState(false);
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

  const convexConnected = convexConnection?.connected === true;
  const connectedCloudflareConnection =
    cloudflareConnection?.connected === true ? cloudflareConnection : null;
  const cloudflareConnected = connectedCloudflareConnection !== null;
  const cloudflareAccountSelectionRequired =
    connectedCloudflareConnection !== null && !connectedCloudflareConnection.accountId;
  const hasConnectedCreateProviders = Boolean(
    selectedOrganizationId !== null && convexConnected && cloudflareConnected,
  );
  const hasRequiredCreateConnections = Boolean(
    hasConnectedCreateProviders && !cloudflareAccountSelectionRequired,
  );
  const canCreateRepo = hasRequiredCreateConnections;
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
  const shouldCheckResourceNames = Boolean(
    hasRequiredCreateConnections && selectedOrganizationId !== null && createRepositoryName,
  );
  const resourceNameCheckKey = buildCreateResourceNameCheckKey({
    organizationId: selectedOrganizationId,
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
    organizationId: selectedOrganizationId,
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
    connectedCloudflareConnection !== null &&
    (connectedCloudflareConnection.mcpTokenStatus === "invalid" ||
      connectedCloudflareConnection.mcpTokenStatus === "expired");
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
  const loadCloudflareAccountDialogResources = useCallback(
    async (preferredAccountId: string | undefined) => {
      if (selectedOrganizationId === null) {
        setCloudflareAccountDialogError("Choose a GitHub owner.");
        return;
      }
      const requestId = cloudflareAccountDialogRequestIdRef.current + 1;
      cloudflareAccountDialogRequestIdRef.current = requestId;
      setIsLoadingCloudflareAccounts(true);
      setCloudflareAccountDialogError(null);
      try {
        const accounts = await listCloudflareAccounts({ organizationId: selectedOrganizationId });
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
          accounts.find(
            (account: CloudflareAccountOption) => account.accountId === preferredAccountId,
          ) ?? accounts[0];
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
    [listCloudflareAccounts, selectedOrganizationId],
  );

  const openCloudflareAccountDialog = () => {
    setCloudflareAccountDialogOpen(true);
    void loadCloudflareAccountDialogResources(connectedCloudflareConnection?.accountId);
  };
  const handleCloudflareAccountDialogOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      cloudflareAccountDialogRequestIdRef.current += 1;
    }
    setCloudflareAccountDialogOpen(isOpen);
  };
  const handleSubmitCloudflareAccount = async () => {
    if (
      isSubmittingCloudflareAccount ||
      !selectedCloudflareAccountId ||
      selectedOrganizationId === null
    ) {
      return;
    }
    setCloudflareAccountDialogError(null);
    setIsSubmittingCloudflareAccount(true);
    try {
      await selectCloudflareDefaultAccount({
        organizationId: selectedOrganizationId,
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
  const installGitHubApp = () => {
    if (installingGitHubApp) {
      return;
    }

    setCreateError(null);
    setInstallingGitHubApp(true);
    void openGitHubAppSetupPopup(async () => {
      return await getGitHubAppInstallationUrl({ returnToPath: getCurrentRootRelativeUrl() });
    })
      .catch((error: unknown) => {
        setCreateError(error instanceof Error ? error.message : "Could not install GitHub App.");
      })
      .finally(() => {
        setInstallingGitHubApp(false);
      });
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
    createError || !canCreateRepo || showCloudflareCreateWarning ? (
      <div className="flex flex-col gap-2">
        {createError && <div className="text-sm text-red-600">{createError}</div>}
        {!canCreateRepo && (
          <div className="text-xs text-muted-foreground">
            {selectedOrganizationId === null ? (
              "Choose a GitHub owner."
            ) : cloudflareAccountSelectionRequired ? (
              <>
                Choose a Cloudflare account to create an app.{" "}
                <CreateResourceNameInlineAction onClick={openCloudflareAccountDialog}>
                  Select account
                </CreateResourceNameInlineAction>
              </>
            ) : (
              "Connect Convex and Cloudflare to create an app."
            )}
          </div>
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
      githubRepositoryNameSupport={renderGitHubRepositoryNameSupport()}
      hasRequiredCreateConnections={hasRequiredCreateConnections}
      isCreating={isCreating}
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
      onNewRepositoryNameChange={setNewRepositoryName}
    />
  );

  const handleCreateRepository = async () => {
    const repoName = newRepositoryName.trim();
    if (!repoName || isCreating) return;
    const routeRepoName = toSafeRepoName(repoName);
    if (!routeRepoName) {
      setCreateError("Repository name is required.");
      return;
    }
    if (selectedOwner === null) {
      setCreateError("Choose a GitHub owner before creating an app.");
      return;
    }
    if (!hasConnectedCreateProviders) {
      setCreateError("Connect Convex and Cloudflare before creating an app.");
      return;
    }
    if (cloudflareAccountSelectionRequired) {
      setCreateError("Choose a Cloudflare account before creating an app.");
      openCloudflareAccountDialog();
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
        organizationId: selectedOwner.organizationId,
        name: repoName,
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
          pathname: buildVaultDashboardRoute({
            owner: selectedOwner.githubOwnerLogin,
            repoName: routeRepoName,
          }),
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
          <h1 className="text-xl @2xl:text-2xl font-semibold">New App</h1>
        </div>
        {githubOwners === undefined ? null : githubOwners.length === 0 ? (
          <>
            {createError ? <div className="text-sm text-red-600">{createError}</div> : null}
            <div>
              <Button type="button" onClick={installGitHubApp} disabled={installingGitHubApp}>
                {installingGitHubApp ? "Opening GitHub..." : "Install GitHub App"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <GitHubOwnerSelect
              disabled={isCreating}
              owners={githubOwners}
              selectedOrganizationId={selectedOrganizationId}
              onChange={(organizationId) => {
                setCreateError(null);
                setSelectedOrganizationId(organizationId);
              }}
            />
            <div className="flex w-full flex-col items-stretch gap-2">{createFormFields}</div>
            <div className="min-h-5">{createControlFooterMessages}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={createButtonDisabled}>
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isCreating ? "Creating app..." : "New App"}
              </Button>
            </div>
          </>
        )}
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
