import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAction, useQuery as useConvexQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { CheckIcon, Loader2 } from "lucide-react";
import { useCallback, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clsx } from "clsx";
import { linkStyle } from "@/components/styles";
import { CloudflareBuildTokenField } from "@/repository/setup/CloudflareBuildTokenField";
import {
  AppResourceNameFeedback,
  AppResourceNameNotice,
} from "@/repository/setup/AppResourceNameFeedback";
import {
  useCloudflareBuildTokenSelection,
  useCloudflareBuildTokens,
} from "@/repository/setup/useCloudflareBuildTokens";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import { buildRepositoryDashboardRoute } from "@/lib/repositoryRoutes";
import { ORGANIZATION_PROVIDERS_ROUTE } from "@/organization/organizationRoutes";
import {
  buildAvailableAppResourceNameSuggestion,
  buildDefaultAppResourceName,
  formatAppResourceNameConflictMessage,
  validateAppResourceName,
  type AppResourceNameProvider,
} from "../../../shared/appResourceNames";
import { toSafeGitHubRepositoryName } from "../../../shared/githubRepositoryName";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  GitHubProviderLogo,
} from "@/components/repository-dashboard/RepositoryDashboardLogos";
import type { ViewerOrganization } from "@/organization/context";
import type { Id } from "../../../convex/_generated/dataModel";
import { ConvexDeploymentRegionField } from "@/repository/setup/ConvexDeploymentRegionField";
import { useConvexDeploymentRegion } from "@/repository/setup/useConvexDeploymentRegions";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RepositoryProvisioningMode } from "../../../convex/repository/provisioningModel";

type CreateResourceNameMode = "auto" | "manual";

const NEW_APP_SETUP_LABELS = {
  samebase: "Set up by Samebase",
  repository_actions: "Set up by GitHub Actions in the repository (experimental)",
} as const satisfies Record<RepositoryProvisioningMode, string>;

/**
Who sets up the new app. GitHub Actions needs only the GitHub and Convex connections, so this field
works without Cloudflare: the repository receives the organization's Convex token and deploys the
app to Convex with it.
*/
function NewAppSetupField({
  disabled,
  onValueChange,
  value,
}: {
  disabled: boolean;
  onValueChange: (value: RepositoryProvisioningMode) => void;
  value: RepositoryProvisioningMode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="new-app-setup">Setup</Label>
      <Select
        disabled={disabled}
        onValueChange={(nextValue) => onValueChange(nextValue)}
        value={value}
      >
        <SelectTrigger className="w-full text-base" id="new-app-setup">
          <SelectValue>{NEW_APP_SETUP_LABELS[value]}</SelectValue>
        </SelectTrigger>
        <AppSelectContent>
          <AppSelectItem value="samebase">{NEW_APP_SETUP_LABELS.samebase}</AppSelectItem>
          <AppSelectItem value="repository_actions">
            {NEW_APP_SETUP_LABELS.repository_actions}
          </AppSelectItem>
        </AppSelectContent>
      </Select>
      {value === "repository_actions" ? (
        <div className="text-xs leading-5 text-muted-foreground">
          Samebase saves the organization&apos;s Convex token as the repository secret
          CONVEX_ACCESS_TOKEN. GitHub Actions run Alchemy and deploy the app to Convex.
        </div>
      ) : null}
    </div>
  );
}
type CreateProviderNameConflict = { provider: AppResourceNameProvider; name: string };
type CreateResourceNameCheckResult =
  (typeof api.repository.actions.checkCreateRepositoryResourceNames)["_returnType"];
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
  if (
    !availability ||
    availability.status === "available" ||
    availability.status === "not_required"
  ) {
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
  cloudflareBuildTokenUuid: string | null;
  checkCreateRepositoryResourceNames: (input: {
    organizationId: Id<"organizations">;
    githubRepositoryName: string;
    convexProjectName: string;
    cloudflareWorkerName: string;
    cloudflareBuildTokenUuid: string | null;
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
    cloudflareBuildTokenUuid,
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
      cloudflareBuildTokenUuid,
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
        cloudflareBuildTokenUuid,
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

function CreateResourceNameStatus({
  children,
  kind,
}: {
  children: ReactNode;
  kind: "available" | "checking";
}) {
  return (
    <div
      className={clsx(
        "flex min-w-0 items-start text-xs",
        kind === "available" && "gap-1.5 text-green-600",
        kind === "checking" && "gap-1.5 text-muted-foreground",
      )}
      role="status"
    >
      {kind === "available" ? (
        <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
      )}
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </div>
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
  convexDeploymentRegionField,
  githubRepositoryNameSupport,
  hasRequiredCreateConnections,
  isCreating,
  newRepositoryName,
  onCloudflareWorkerNameBlur,
  onCloudflareWorkerNameChange,
  onConvexProjectNameBlur,
  onConvexProjectNameChange,
  onNewRepositoryNameChange,
  showCloudflareWorkerName,
  showConvexProjectName,
}: {
  cloudflareBuildTokenField: ReactNode;
  cloudflareWorkerName: string;
  cloudflareWorkerNameSupport: ReactNode;
  convexProjectName: string;
  convexProjectNameSupport: ReactNode;
  convexDeploymentRegionField: ReactNode;
  githubRepositoryNameSupport: ReactNode;
  hasRequiredCreateConnections: boolean;
  isCreating: boolean;
  newRepositoryName: string;
  onCloudflareWorkerNameBlur: () => void;
  onCloudflareWorkerNameChange: (value: string) => void;
  onConvexProjectNameBlur: () => void;
  onConvexProjectNameChange: (value: string) => void;
  onNewRepositoryNameChange: (value: string) => void;
  showCloudflareWorkerName: boolean;
  showConvexProjectName: boolean;
}) {
  const canEditProviderResourceNames = newRepositoryName.trim().length > 0;
  const providerResourceNameInputDisabled =
    !hasRequiredCreateConnections || isCreating || !canEditProviderResourceNames;

  return (
    <>
      <CreateProviderNameInput
        placeholder="GitHub repository name"
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
        {showConvexProjectName ? (
          <>
            <CreateProviderNameInput
              placeholder="Convex project name"
              value={convexProjectName}
              onChange={onConvexProjectNameChange}
              onBlur={onConvexProjectNameBlur}
              icon={<ConvexProviderLogo />}
              disabled={providerResourceNameInputDisabled}
            />
            <CreateControlMessageSlot>{convexProjectNameSupport}</CreateControlMessageSlot>
          </>
        ) : null}
        {convexDeploymentRegionField}
        {showCloudflareWorkerName ? (
          <>
            <CreateProviderNameInput
              placeholder="Cloudflare Worker name"
              value={cloudflareWorkerName}
              onChange={onCloudflareWorkerNameChange}
              onBlur={onCloudflareWorkerNameBlur}
              icon={<CloudflareProviderLogo />}
              disabled={providerResourceNameInputDisabled}
            />
            <CreateControlMessageSlot>{cloudflareWorkerNameSupport}</CreateControlMessageSlot>
          </>
        ) : null}
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
  provisioning: RepositoryProvisioningMode;
}): string | null {
  const { canManageOrganization, cloudflareConnection, convexConnection, provisioning } = args;
  if (!convexConnection || (provisioning === "samebase" && !cloudflareConnection)) {
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
  if (provisioning !== "samebase" || !cloudflareConnection) {
    return null;
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
  provisioning,
}: {
  canManageOrganization: boolean;
  cloudflareConnection: AppCloudflareConnection | undefined;
  convexConnection: AppConvexConnection | undefined;
  provisioning: RepositoryProvisioningMode;
}) {
  if (!convexConnection || (provisioning === "samebase" && !cloudflareConnection)) {
    return null;
  }
  const blocker = readNewAppProviderBlocker({
    canManageOrganization,
    cloudflareConnection,
    convexConnection,
    provisioning,
  });

  return (
    <div data-testid="new-app-provider-readiness" className="space-y-2 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex h-5 w-5 items-center justify-center">
          <ConvexProviderLogo />
        </span>
        <span>{formatNewAppConvexStatus(convexConnection)}</span>
      </div>
      {provisioning === "samebase" && cloudflareConnection ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center">
            <CloudflareProviderLogo />
          </span>
          <span>{formatNewAppCloudflareStatus(cloudflareConnection)}</span>
        </div>
      ) : null}
      {blocker ? <div className="text-muted-foreground">{blocker}</div> : null}
    </div>
  );
}

export function NewAppPage({ organization }: { organization: ViewerOrganization }) {
  const location = useLocation();
  const navigate = useNavigate();
  const createRepository = useAction(api.repository.create);
  const checkCreateRepositoryResourceNames = useAction(
    api.repository.actions.checkCreateRepositoryResourceNames,
  );
  const organizationId = organization.organizationId;
  const canManageOrganization = organization.role === "owner";
  const convexConnection = useConvexQuery(api.users.getConvexConnectionStatus, {
    organizationId,
  });
  const cloudflareConnection = useConvexQuery(api.users.getCloudflareConnectionStatus, {
    organizationId,
  });
  const [provisioning, setProvisioning] = useState<RepositoryProvisioningMode>("samebase");
  const repositoryActions = provisioning === "repository_actions";
  const convexDeploymentRegionSelection = useConvexDeploymentRegion({
    enabled: convexConnection?.state === "connected",
    organizationId,
    selectionKey: organizationId,
  });
  const [newRepositoryName, setNewRepositoryNameState] = useState("");
  const [convexProjectName, setConvexProjectNameState] = useState("");
  const [convexProjectNameMode, setConvexProjectNameMode] =
    useState<CreateResourceNameMode>("auto");
  const [cloudflareWorkerName, setCloudflareWorkerNameState] = useState("");
  const [cloudflareWorkerNameMode, setCloudflareWorkerNameMode] =
    useState<CreateResourceNameMode>("auto");
  const [createProviderNameConflict, setCreateProviderNameConflict] =
    useState<CreateProviderNameConflict | null>(null);
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
  const cloudflareBuildTokensLoading =
    cloudflareBuildTokensQuery.isPending || cloudflareBuildTokensQuery.isFetching;
  const cloudflareBuildTokens = cloudflareBuildTokensQuery.data?.tokens ?? [];
  const cloudflareBuildTokenSelection = useCloudflareBuildTokenSelection({
    error: Boolean(cloudflareBuildTokensQuery.error),
    initialUuid: null,
    isFetching: cloudflareBuildTokensQuery.isFetching,
    lastUsedUuid: cloudflareBuildTokensQuery.data?.lastUsedBuildTokenUuid ?? null,
    tokens: cloudflareBuildTokensQuery.data?.tokens ?? null,
  });
  const cloudflareBuildTokenUuid = cloudflareBuildTokenSelection.selectedUuid;
  const convexDeploymentRegion = convexDeploymentRegionSelection.selectedRegion;
  const cloudflareBuildTokensConfirmedEmpty = Boolean(
    cloudflareBuildTokensQuery.data &&
    !cloudflareBuildTokensQuery.isFetching &&
    !cloudflareBuildTokensQuery.error &&
    cloudflareBuildTokens.length === 0,
  );
  const hasRequiredCreateConnections = Boolean(
    convexConnected && (cloudflareConnected || repositoryActions),
  );
  const providerBlocker = readNewAppProviderBlocker({
    canManageOrganization,
    cloudflareConnection,
    convexConnection,
    provisioning,
  });
  const canCreateRepositoryForOrganization = organization.canCreateRepository;
  const canCreateRepo = hasRequiredCreateConnections && canCreateRepositoryForOrganization;
  const createRepositoryName = newRepositoryName.trim();
  const normalizedGitHubRepositoryName = toSafeGitHubRepositoryName(newRepositoryName);
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
  // The repository's GitHub Actions name the Convex project and the Worker after the repository.
  const repositoryActionsConvexProjectName = buildDefaultAppResourceName({
    repositoryName: normalizedGitHubRepositoryName,
    provider: "convex",
  });
  const repositoryActionsWorkerName = buildDefaultAppResourceName({
    repositoryName: normalizedGitHubRepositoryName,
    provider: "cloudflare",
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
    convexProjectName: repositoryActions
      ? repositoryActionsConvexProjectName
      : checkedConvexProjectName,
    cloudflareWorkerName: repositoryActions
      ? repositoryActionsWorkerName
      : checkedCloudflareWorkerName,
    cloudflareBuildTokenUuid: repositoryActions ? null : cloudflareBuildTokenUuid || null,
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
  const convexCreateConflict =
    createProviderNameConflict?.provider === "convex" &&
    convexProjectNameValidation.valid &&
    createProviderNameConflict.name === convexProjectNameValidation.value
      ? createProviderNameConflict
      : null;
  const cloudflareCreateConflict =
    createProviderNameConflict?.provider === "cloudflare" &&
    cloudflareWorkerNameValidation.valid &&
    createProviderNameConflict.name === cloudflareWorkerNameValidation.value
      ? createProviderNameConflict
      : null;
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
      (!cloudflareBuildTokensConfirmedEmpty && !cloudflareWorkerNameValidation.valid) ||
      createResourceNameCheckError ||
      isCreateResourceNameCheckPending ||
      convexCreateConflict ||
      (!cloudflareBuildTokensConfirmedEmpty && cloudflareCreateConflict) ||
      isConvexProjectNameAvailabilityBlocking ||
      (!cloudflareBuildTokensConfirmedEmpty && isCloudflareWorkerNameAvailabilityBlocking)),
  );
  const showCloudflareCreateWarning =
    !repositoryActions &&
    connectedCloudflareConnection !== null &&
    (connectedCloudflareConnection.mcpTokenStatus === "invalid" ||
      connectedCloudflareConnection.mcpTokenStatus === "expired");
  const createButtonDisabled =
    isCreating ||
    createRepositoryName.length === 0 ||
    !canCreateRepo ||
    (repositoryActions
      ? Boolean(
          isGitHubRepositoryNameBlocking ||
          createResourceNameCheckError ||
          isCreateResourceNameCheckPending,
        )
      : !convexDeploymentRegion ||
        (!cloudflareBuildTokenSelection.canWrite && !cloudflareBuildTokensConfirmedEmpty) ||
        hasBlockingCreateResourceName);

  const setNewRepositoryName = useCallback((value: string) => {
    setCreateError(null);
    setCreateProviderNameConflict(null);
    setNewRepositoryNameState(value);
  }, []);
  const setConvexProjectName = useCallback((value: string, mode: CreateResourceNameMode) => {
    setCreateError(null);
    setCreateProviderNameConflict(null);
    setConvexProjectNameState(value);
    setConvexProjectNameMode(mode);
  }, []);
  const setCloudflareWorkerName = useCallback((value: string, mode: CreateResourceNameMode) => {
    setCreateError(null);
    setCreateProviderNameConflict(null);
    setCloudflareWorkerNameState(value);
    setCloudflareWorkerNameMode(mode);
  }, []);
  const renderCreateResourceNameSupport = ({
    availability,
    checkedName,
    label,
    mode,
    onUseGeneratedName,
    provider,
    submitConflictMessage,
    validation,
    onUseSuggestion,
  }: {
    availability: CreateResourceNameAvailability | null;
    checkedName: string;
    label: string;
    mode: CreateResourceNameMode;
    onUseGeneratedName: () => void;
    provider: AppResourceNameProvider;
    submitConflictMessage: string | null;
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
        <AppResourceNameFeedback
          message={validation.message}
          suggestion={validation.suggestion}
          onUseSuggestion={onUseSuggestion}
        >
          {manualResetContent && (
            <span className="ml-1 text-muted-foreground">{manualResetContent}</span>
          )}
        </AppResourceNameFeedback>
      );
    }

    if (submitConflictMessage && validation.valid) {
      const unavailableNames = new Set([validation.value]);
      if (availability?.suggestion) {
        unavailableNames.add(availability.suggestion);
      }
      return (
        <AppResourceNameFeedback
          message={`${submitConflictMessage} Choose another name.`}
          suggestion={buildAvailableAppResourceNameSuggestion({
            provider,
            baseName: mode === "auto" ? checkedName : validation.value,
            unavailableNames,
          })}
          onUseSuggestion={onUseSuggestion}
        >
          {manualResetContent && (
            <span className="ml-1 text-muted-foreground">{manualResetContent}</span>
          )}
        </AppResourceNameFeedback>
      );
    }

    if (createResourceNameCheckError) {
      return (
        <AppResourceNameFeedback
          message={createResourceNameCheckError}
          suggestion={null}
          onUseSuggestion={onUseSuggestion}
        >
          {manualResetContent && (
            <span className="ml-1 text-muted-foreground">{manualResetContent}</span>
          )}
        </AppResourceNameFeedback>
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

    if (availability.status === "not_required") {
      return manualReset;
    }

    if (availability.status === "available") {
      if (validation.valid && validation.changed) {
        return (
          <AppResourceNameNotice name={validation.value} onUseName={onUseSuggestion}>
            {manualResetContent && <span className="ml-1">{manualResetContent}</span>}
          </AppResourceNameNotice>
        );
      }
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
      <AppResourceNameFeedback
        message={availability.message ?? "Name is not available."}
        suggestion={availability.suggestion}
        onUseSuggestion={onUseSuggestion}
      >
        {manualResetContent && (
          <span className="ml-1 text-muted-foreground">{manualResetContent}</span>
        )}
      </AppResourceNameFeedback>
    );
  };
  const renderGitHubRepositoryNameSupport = () => {
    if (!createRepositoryName) {
      return null;
    }

    if (createResourceNameCheckError) {
      return (
        <AppResourceNameFeedback
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
        <AppResourceNameFeedback
          message={
            githubRepositoryNameAvailability.message ?? "GitHub repository name is not available."
          }
          suggestion={githubRepositoryNameAvailability.suggestion}
          onUseSuggestion={setNewRepositoryName}
        />
      );
    }

    if (isCreateResourceNameCheckPending) {
      return (
        <CreateResourceNameStatus kind="checking">
          Checking GitHub repository...
        </CreateResourceNameStatus>
      );
    }

    if (normalizedGitHubRepositoryName && normalizedGitHubRepositoryName !== newRepositoryName) {
      return (
        <AppResourceNameNotice
          name={normalizedGitHubRepositoryName}
          onUseName={setNewRepositoryName}
        />
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
  const createFormFields = (
    <NewAppCreateFormFields
      cloudflareBuildTokenField={
        cloudflareConnected && !repositoryActions ? (
          <CloudflareBuildTokenField
            disabled={isCreating}
            emptyState="deferred"
            error={Boolean(cloudflareBuildTokensQuery.error)}
            id="new-app-cloudflare-build-token"
            isLoading={cloudflareBuildTokensLoading}
            lastUsedUuid={cloudflareBuildTokensQuery.data?.lastUsedBuildTokenUuid ?? null}
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
        provider: "cloudflare",
        submitConflictMessage: cloudflareCreateConflict
          ? formatAppResourceNameConflictMessage(cloudflareCreateConflict)
          : null,
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
        provider: "convex",
        submitConflictMessage: convexCreateConflict
          ? formatAppResourceNameConflictMessage(convexCreateConflict)
          : null,
        onUseSuggestion: (suggestion) => {
          setConvexProjectName(suggestion, "manual");
        },
      })}
      convexDeploymentRegionField={
        convexConnected && !repositoryActions ? (
          <ConvexDeploymentRegionField
            disabled={isCreating}
            id="new-app-convex-production-region"
            onValueChange={(region) => {
              setCreateError(null);
              convexDeploymentRegionSelection.setRequestedRegion(region);
            }}
            showEuPricing
            value={convexDeploymentRegion}
          />
        ) : null
      }
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
      showCloudflareWorkerName={!repositoryActions && !cloudflareBuildTokensConfirmedEmpty}
      showConvexProjectName={!repositoryActions}
    />
  );

  const handleCreateRepositoryActionsRepository = async (githubRepositoryName: string) => {
    if (isGitHubRepositoryNameBlocking) {
      setCreateError(
        githubRepositoryNameAvailability?.message ?? "GitHub repository name is not available.",
      );
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    setCreateProviderNameConflict(null);
    try {
      await createRepository({
        organizationId,
        githubRepositoryName,
        convexProjectName: repositoryActionsConvexProjectName,
        cloudflareWorkerName: repositoryActionsWorkerName,
        cloudflareBuildTokenUuid: null,
        private: true,
        provisioning: "repository_actions",
      });
      setNewRepositoryNameState("");
      await navigate({
        href: buildPathWithTanStackSearch({
          pathname: buildRepositoryDashboardRoute({
            owner: organization.githubOwnerLogin,
            repoName: normalizedGitHubRepositoryName,
          }),
          search: location.search,
        }),
      });
    } catch (error) {
      setCreateError(
        error instanceof ConvexError && typeof error.data === "string"
          ? error.data
          : "Could not create app.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateRepository = async () => {
    const githubRepositoryName = newRepositoryName.trim();
    if (!githubRepositoryName || isCreating) return;
    const routeRepositoryName = normalizedGitHubRepositoryName;
    if (!routeRepositoryName) {
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
    if (repositoryActions) {
      await handleCreateRepositoryActionsRepository(githubRepositoryName);
      return;
    }
    if (!convexProjectNameValidation.valid) {
      setCreateError(convexProjectNameValidation.message);
      return;
    }
    if (!convexDeploymentRegion) {
      setCreateError("Choose a Convex production region.");
      return;
    }
    let submittedCloudflareWorkerName = defaultCloudflareWorkerName;
    if (!cloudflareBuildTokensConfirmedEmpty) {
      if (!cloudflareWorkerNameValidation.valid) {
        setCreateError(cloudflareWorkerNameValidation.message);
        return;
      }
      submittedCloudflareWorkerName = cloudflareWorkerNameValidation.value;
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
    if (!cloudflareBuildTokensConfirmedEmpty && isCloudflareWorkerNameAvailabilityBlocking) {
      setCreateError(
        cloudflareWorkerNameAvailability?.message ?? "Cloudflare Worker name is not available.",
      );
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    setCreateProviderNameConflict(null);

    try {
      await createRepository({
        organizationId,
        githubRepositoryName,
        convexProjectName: convexProjectNameValidation.value,
        convexDeploymentRegion,
        cloudflareWorkerName: submittedCloudflareWorkerName,
        cloudflareBuildTokenUuid: cloudflareBuildTokenUuid || null,
        private: true,
      });
      setNewRepositoryNameState("");
      setConvexProjectNameState("");
      setConvexProjectNameMode("auto");
      convexDeploymentRegionSelection.setRequestedRegion(null);
      setCloudflareWorkerNameState("");
      setCloudflareWorkerNameMode("auto");
      cloudflareBuildTokenSelection.setRequestedUuid(null);
      await navigate({
        href: buildPathWithTanStackSearch({
          pathname: buildRepositoryDashboardRoute({
            owner: organization.githubOwnerLogin,
            repoName: routeRepositoryName,
          }),
          search: location.search,
        }),
      });
    } catch (error) {
      const publicMessage =
        error instanceof ConvexError && typeof error.data === "string" ? error.data : null;
      const convexConflictMessage = formatAppResourceNameConflictMessage({
        provider: "convex",
        name: convexProjectNameValidation.value,
      });
      const cloudflareConflictMessage = formatAppResourceNameConflictMessage({
        provider: "cloudflare",
        name: submittedCloudflareWorkerName,
      });
      if (publicMessage === convexConflictMessage) {
        setCreateProviderNameConflict({
          provider: "convex",
          name: convexProjectNameValidation.value,
        });
      } else if (publicMessage === cloudflareConflictMessage) {
        setCreateProviderNameConflict({
          provider: "cloudflare",
          name: submittedCloudflareWorkerName,
        });
      } else {
        setCreateError(publicMessage ?? "Could not create app.");
      }
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
          provisioning={provisioning}
        />
        <NewAppSetupField
          disabled={!convexConnected || isCreating}
          onValueChange={(value) => {
            setCreateError(null);
            setProvisioning(value);
          }}
          value={provisioning}
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
