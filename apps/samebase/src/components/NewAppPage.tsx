import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAction, useQuery as useConvexQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { CheckIcon, Loader2 } from "lucide-react";
import { useCallback, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clsx } from "clsx";
import { linkStyle } from "@/components/styles";
import { CloudflareBuildTokenField } from "@/components/CloudflareBuildTokenField";
import {
  useCloudflareBuildTokenSelection,
  useCloudflareBuildTokens,
} from "@/components/useCloudflareBuildTokens";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import { buildVaultDashboardRoute } from "@/lib/vaultRoutes";
import { ORGANIZATION_PROVIDERS_ROUTE } from "@/lib/organizationRoutes";
import {
  buildDefaultAppResourceName,
  validateAppResourceName,
} from "../../shared/appResourceNames";
import { toSafeRepoName } from "../../shared/repoName";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import type { ViewerOrganization } from "@/lib/organizationContext";
import type { Id } from "../../convex/_generated/dataModel";

type CreateResourceNameMode = "auto" | "manual";
type CreateResourceNameCheckResult =
  (typeof api.vault.actions.checkCreateRepositoryResourceNames)["_returnType"];
type CreateResourceNameAvailability = CreateResourceNameCheckResult["convex"];
type AppConvexConnection = (typeof api.users.getConvexConnectionStatus)["_returnType"];
type AppCloudflareConnection = (typeof api.users.getCloudflareConnectionStatus)["_returnType"];

const CREATE_RESOURCE_NAME_CHECK_DELAY_MS = 350;

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

function waitForCreateResourceNameCheck(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, CREATE_RESOURCE_NAME_CHECK_DELAY_MS);
    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      reject(signal.reason);
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
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
  checkResult: CreateResourceNameCheckResult | null;
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
  const queryEnabled = enabled && organizationId !== null;
  const checkQuery = useQuery({
    queryKey: [
      "create-repository-resource-names",
      organizationId,
      githubRepositoryName,
      convexProjectName,
      cloudflareWorkerName,
    ],
    queryFn: async ({ signal }) => {
      if (organizationId === null) {
        throw new Error("An organization is required to check provider names.");
      }
      await waitForCreateResourceNameCheck(signal);
      return await checkCreateRepositoryResourceNames({
        organizationId,
        githubRepositoryName,
        convexProjectName,
        cloudflareWorkerName,
      });
    },
    enabled: queryEnabled,
    gcTime: 0,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 0,
  });
  const checkError = checkQuery.isError
    ? checkQuery.error instanceof Error
      ? checkQuery.error.message
      : "Could not check provider names."
    : null;

  return {
    checkResult: checkQuery.data ?? null,
    checkError,
    isChecking: queryEnabled && checkQuery.isFetching,
  };
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
  cloudflareBuildTokenField,
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
  cloudflareBuildTokenField: ReactNode;
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
        {cloudflareBuildTokenField}
      </div>
    </>
  );
}

function formatNewAppConvexStatus(connection: AppConvexConnection): string {
  switch (connection.state) {
    case "not_configured":
      return "No team configured.";
    case "disconnected":
      return `Disconnected from team ${connection.teamSlug ?? connection.teamId}.`;
    case "connected":
      return `Connected to team ${connection.teamSlug ?? connection.teamId}.`;
  }
}

function formatNewAppCloudflareStatus(connection: AppCloudflareConnection): string {
  switch (connection.state) {
    case "not_configured":
      return "No account configured.";
    case "disconnected":
      return `Disconnected from account ${connection.accountName}.`;
    case "connected":
      return `Connected to account ${connection.accountName}.`;
  }
}

function readNewAppProviderBlocker(args: {
  canManageOrganization: boolean;
  cloudflareConnection: AppCloudflareConnection | undefined;
  convexConnection: AppConvexConnection | undefined;
}): string | null {
  const { canManageOrganization, cloudflareConnection, convexConnection } = args;
  if (!convexConnection || !cloudflareConnection) {
    return null;
  }
  if (convexConnection.state === "not_configured") {
    return canManageOrganization
      ? "Configure Convex in Providers before creating an app."
      : "An organization owner must configure Convex before an app can be created.";
  }
  if (convexConnection.state === "disconnected") {
    return canManageOrganization
      ? "Reconnect Convex in Providers before creating an app."
      : "An organization owner must reconnect Convex before an app can be created.";
  }
  if (cloudflareConnection.state === "not_configured") {
    return canManageOrganization
      ? "Configure Cloudflare in Providers before creating an app."
      : "An organization owner must configure Cloudflare before an app can be created.";
  }
  if (cloudflareConnection.state === "disconnected") {
    return canManageOrganization
      ? "Reconnect Cloudflare in Providers before creating an app."
      : "An organization owner must reconnect Cloudflare before an app can be created.";
  }
  return null;
}

export function NewAppProviderReadiness({
  canManageOrganization,
  cloudflareConnection,
  convexConnection,
}: {
  canManageOrganization: boolean;
  cloudflareConnection: AppCloudflareConnection | undefined;
  convexConnection: AppConvexConnection | undefined;
}) {
  if (!convexConnection || !cloudflareConnection) {
    return null;
  }
  const blocker = readNewAppProviderBlocker({
    canManageOrganization,
    cloudflareConnection,
    convexConnection,
  });

  return (
    <div data-testid="new-app-provider-readiness" className="space-y-2 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex h-5 w-5 items-center justify-center">
          <ConvexProviderLogo />
        </span>
        <span>{formatNewAppConvexStatus(convexConnection)}</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex h-5 w-5 items-center justify-center">
          <CloudflareProviderLogo />
        </span>
        <span>{formatNewAppCloudflareStatus(cloudflareConnection)}</span>
      </div>
      {blocker ? <div className="text-muted-foreground">{blocker}</div> : null}
    </div>
  );
}

export function NewAppPage({ organization }: { organization: ViewerOrganization }) {
  const location = useLocation();
  const navigate = useNavigate();
  const createRepository = useAction(api.vault.actions.createRepository);
  const checkCreateRepositoryResourceNames = useAction(
    api.vault.actions.checkCreateRepositoryResourceNames,
  );
  const organizationId = organization.organizationId;
  const canManageOrganization = organization.role === "owner";
  const convexConnection = useConvexQuery(api.users.getConvexConnectionStatus, {
    organizationId,
  });
  const cloudflareConnection = useConvexQuery(api.users.getCloudflareConnectionStatus, {
    organizationId,
  });
  const [newRepositoryName, setNewRepositoryNameState] = useState("");
  const [convexProjectName, setConvexProjectNameState] = useState("");
  const [convexProjectNameMode, setConvexProjectNameMode] =
    useState<CreateResourceNameMode>("auto");
  const [cloudflareWorkerName, setCloudflareWorkerNameState] = useState("");
  const [cloudflareWorkerNameMode, setCloudflareWorkerNameMode] =
    useState<CreateResourceNameMode>("auto");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const convexConnected = convexConnection?.state === "connected";
  const connectedCloudflareConnection =
    cloudflareConnection?.state === "connected" ? cloudflareConnection : null;
  const cloudflareConnected = connectedCloudflareConnection !== null;
  const cloudflareBuildTokensQuery = useCloudflareBuildTokens({
    enabled: cloudflareConnected,
    organizationId,
  });
  const cloudflareBuildTokens = cloudflareBuildTokensQuery.data?.tokens ?? [];
  const cloudflareBuildTokenSelection = useCloudflareBuildTokenSelection({
    error: Boolean(cloudflareBuildTokensQuery.error),
    initialUuid: null,
    isFetching: cloudflareBuildTokensQuery.isFetching,
    tokens: cloudflareBuildTokensQuery.data?.tokens ?? null,
  });
  const cloudflareBuildTokenUuid = cloudflareBuildTokenSelection.selectedUuid;
  const hasRequiredCreateConnections = Boolean(convexConnected && cloudflareConnected);
  const providerBlocker = readNewAppProviderBlocker({
    canManageOrganization,
    cloudflareConnection,
    convexConnection,
  });
  const canCreateRepositoryForOrganization = organization.canCreateRepository;
  const canCreateRepo = hasRequiredCreateConnections && canCreateRepositoryForOrganization;
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
  const shouldCheckResourceNames = Boolean(canCreateRepo && createRepositoryName);
  const {
    checkResult: currentResourceNameCheck,
    checkError: createResourceNameCheckError,
    isChecking: isCheckingCreateResourceNames,
  } = useCreateResourceNameAvailability({
    enabled: shouldCheckResourceNames,
    organizationId,
    githubRepositoryName: createRepositoryName,
    convexProjectName: checkedConvexProjectName,
    cloudflareWorkerName: checkedCloudflareWorkerName,
    checkCreateRepositoryResourceNames,
  });
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
    !cloudflareBuildTokenSelection.canWrite ||
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
  const ownerCreateBlocker = !canCreateRepositoryForOrganization;
  const createControlFooterMessages =
    createError || ownerCreateBlocker || showCloudflareCreateWarning ? (
      <div className="flex flex-col gap-2">
        {createError && <div className="text-sm text-red-600">{createError}</div>}
        {ownerCreateBlocker ? (
          <div className="text-xs text-muted-foreground">
            Authorize repository creation for {organization.githubOwnerLogin} in{" "}
            <Link
              className={linkStyle}
              params={{ owner: organization.githubOwnerLogin }}
              to={ORGANIZATION_PROVIDERS_ROUTE}
            >
              Providers
            </Link>
            .
          </div>
        ) : null}
        {showCloudflareCreateWarning && (
          <div className="text-xs text-amber-700">
            Cloudflare token is invalid or expired. Reconnect Cloudflare.
          </div>
        )}
      </div>
    ) : null;
  const cloudflareBuildTokenAccountId = cloudflareBuildTokensQuery.data
    ? cloudflareBuildTokensQuery.data.accountId
    : connectedCloudflareConnection
      ? connectedCloudflareConnection.accountId
      : null;

  const createFormFields = (
    <NewAppCreateFormFields
      cloudflareBuildTokenField={
        cloudflareConnected ? (
          <CloudflareBuildTokenField
            accountId={cloudflareBuildTokenAccountId}
            disabled={isCreating}
            error={Boolean(cloudflareBuildTokensQuery.error)}
            id="new-app-cloudflare-build-token"
            isLoading={cloudflareBuildTokensQuery.isFetching}
            onReload={() => {
              void cloudflareBuildTokensQuery.refetch();
            }}
            onValueChange={(uuid) => {
              setCreateError(null);
              cloudflareBuildTokenSelection.setRequestedUuid(uuid);
            }}
            selectionUnavailable={cloudflareBuildTokenSelection.selectionUnavailable}
            tokens={cloudflareBuildTokens}
            value={cloudflareBuildTokenUuid}
          />
        ) : null
      }
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
    if (!organization.canCreateRepository) {
      setCreateError(
        `Only a Samebase user authorized as ${organization.githubOwnerLogin} can create repositories for this personal GitHub owner.`,
      );
      return;
    }
    if (!hasRequiredCreateConnections) {
      setCreateError(providerBlocker ?? "Provider connections are loading.");
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
    if (!cloudflareBuildTokenUuid) {
      setCreateError("Choose a Workers Builds token.");
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
        organizationId,
        name: repoName,
        convexProjectName: convexProjectNameValidation.value,
        cloudflareWorkerName: cloudflareWorkerNameValidation.value,
        cloudflareBuildTokenUuid,
        private: true,
      });
      setNewRepositoryNameState("");
      setConvexProjectNameState("");
      setConvexProjectNameMode("auto");
      setCloudflareWorkerNameState("");
      setCloudflareWorkerNameMode("auto");
      cloudflareBuildTokenSelection.setRequestedUuid(null);
      await navigate({
        href: buildPathWithTanStackSearch({
          pathname: buildVaultDashboardRoute({
            owner: organization.githubOwnerLogin,
            repoName: routeRepoName,
          }),
          search: location.search,
        }),
      });
    } catch (error) {
      const message =
        error instanceof ConvexError && typeof error.data === "string"
          ? error.data
          : error instanceof Error
            ? error.message
            : "Failed to create app";
      if (
        message.startsWith(
          "The selected Cloudflare Workers Builds token is not in Cloudflare's current list",
        )
      ) {
        await cloudflareBuildTokensQuery.refetch();
      }
      setCreateError(message);
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
        <NewAppProviderReadiness
          canManageOrganization={canManageOrganization}
          cloudflareConnection={cloudflareConnection}
          convexConnection={convexConnection}
        />
        <div className="flex w-full flex-col items-stretch gap-2">{createFormFields}</div>
        <div className="min-h-5">{createControlFooterMessages}</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={createButtonDisabled}>
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isCreating ? "Creating app..." : "New App"}
          </Button>
        </div>
      </form>
    </div>
  );
}
