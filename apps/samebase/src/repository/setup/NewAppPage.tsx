import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAction, useQuery as useConvexQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { CheckIcon, Loader2 } from "lucide-react";
import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clsx } from "clsx";
import { linkStyle } from "@/components/styles";
import {
  AppResourceNameFeedback,
  AppResourceNameNotice,
} from "@/repository/setup/AppResourceNameFeedback";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import { buildRepositoryDashboardRoute } from "@/lib/repositoryRoutes";
import { ORGANIZATION_PROVIDERS_ROUTE } from "@/organization/organizationRoutes";
import { buildDefaultAppResourceName } from "../../../shared/appResourceNames";
import { toSafeGitHubRepositoryName } from "../../../shared/githubRepositoryName";
import {
  ConvexProviderLogo,
  GitHubProviderLogo,
} from "@/components/repository-dashboard/RepositoryDashboardLogos";
import type { ViewerOrganization } from "@/organization/context";
import type { Id } from "../../../convex/_generated/dataModel";

type CreateResourceNameCheckResult =
  (typeof api.repository.actions.checkCreateRepositoryResourceNames)["_returnType"];
type CreateResourceNameAvailability = CreateResourceNameCheckResult["github"];
type AppConvexConnection = (typeof api.users.getConvexConnectionStatus)["_returnType"];

const CREATE_RESOURCE_NAME_CHECK_DELAY_MS = 350;

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
  checkCreateRepositoryResourceNames: (input: {
    organizationId: Id<"organizations">;
    githubRepositoryName: string;
    convexProjectName: string;
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
    checkCreateRepositoryResourceNames,
  } = args;
  const queryEnabled = enabled && organizationId !== null;
  const checkQuery = useQuery({
    queryKey: [
      "create-repository-resource-names",
      organizationId,
      githubRepositoryName,
      convexProjectName,
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
  placeholder,
  value,
}: {
  disabled: boolean;
  icon: ReactNode;
  onChange: (value: string) => void;
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
        className="w-full pl-9"
        disabled={disabled}
        aria-label={placeholder}
      />
    </div>
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

function readNewAppProviderBlocker(args: {
  canManageOrganization: boolean;
  convexConnection: AppConvexConnection | undefined;
}): string | null {
  const { canManageOrganization, convexConnection } = args;
  if (!convexConnection) {
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
  return null;
}

export function NewAppProviderReadiness({
  canManageOrganization,
  convexConnection,
}: {
  canManageOrganization: boolean;
  convexConnection: AppConvexConnection | undefined;
}) {
  if (!convexConnection) {
    return null;
  }
  const blocker = readNewAppProviderBlocker({ canManageOrganization, convexConnection });

  return (
    <div data-testid="new-app-provider-readiness" className="space-y-2 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="flex h-5 w-5 items-center justify-center">
          <ConvexProviderLogo />
        </span>
        <span>{formatNewAppConvexStatus(convexConnection)}</span>
      </div>
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
  const [newRepositoryName, setNewRepositoryNameState] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const convexConnected = convexConnection?.state === "connected";
  const providerBlocker = readNewAppProviderBlocker({ canManageOrganization, convexConnection });
  const canCreateRepositoryForOrganization = organization.canCreateRepository;
  // The server refuses a member: the repository receives the organization's Convex credential.
  const canCreateRepo =
    convexConnected && canCreateRepositoryForOrganization && canManageOrganization;
  const createRepositoryName = newRepositoryName.trim();
  const normalizedGitHubRepositoryName = toSafeGitHubRepositoryName(newRepositoryName);
  // The repository's GitHub Actions name the Convex project after the repository.
  const convexProjectName = buildDefaultAppResourceName({
    repositoryName: normalizedGitHubRepositoryName,
    provider: "convex",
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
    convexProjectName,
    checkCreateRepositoryResourceNames,
  });
  const githubRepositoryNameAvailability = currentResourceNameCheck?.github ?? null;
  const isGitHubRepositoryNameBlocking = isGitHubRepositoryNameAvailabilityBlocking(
    githubRepositoryNameAvailability,
  );
  const isCreateResourceNameCheckPending = Boolean(
    shouldCheckResourceNames && (isCheckingCreateResourceNames || !currentResourceNameCheck),
  );
  const createButtonDisabled =
    isCreating ||
    createRepositoryName.length === 0 ||
    !canCreateRepo ||
    isGitHubRepositoryNameBlocking ||
    Boolean(createResourceNameCheckError) ||
    isCreateResourceNameCheckPending;

  const setNewRepositoryName = useCallback((value: string) => {
    setCreateError(null);
    setNewRepositoryNameState(value);
  }, []);
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
  const ownerCreateBlocker = canManageOrganization && !canCreateRepositoryForOrganization;
  const createControlFooterMessages =
    createError || !canManageOrganization || ownerCreateBlocker ? (
      <div className="flex flex-col gap-2">
        {createError && <div className="text-sm text-red-600">{createError}</div>}
        {!canManageOrganization ? (
          <div className="text-xs text-muted-foreground">
            Only an organization owner can create an app.
          </div>
        ) : null}
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
      </div>
    ) : null;

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
    if (!convexConnected) {
      setCreateError(providerBlocker ?? "Provider connections are loading.");
      return;
    }
    if (isGitHubRepositoryNameBlocking) {
      setCreateError(
        githubRepositoryNameAvailability?.message ?? "GitHub repository name is not available.",
      );
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      await createRepository({
        organizationId,
        githubRepositoryName,
        private: true,
      });
      setNewRepositoryNameState("");
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
      setCreateError(
        error instanceof ConvexError && typeof error.data === "string"
          ? error.data
          : "Could not create app.",
      );
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
          convexConnection={convexConnection}
        />
        <div className="text-xs leading-5 text-muted-foreground">
          Samebase saves the organization&apos;s Convex token as the repository secret
          CONVEX_ACCESS_TOKEN. GitHub Actions run Alchemy and deploy the app to Convex.
        </div>
        <div className="flex w-full flex-col items-stretch gap-2">
          <CreateProviderNameInput
            placeholder="GitHub repository name"
            value={newRepositoryName}
            onChange={setNewRepositoryName}
            icon={<GitHubProviderLogo />}
            disabled={!convexConnected || !canManageOrganization || isCreating}
          />
          <CreateControlMessageSlot>{renderGitHubRepositoryNameSupport()}</CreateControlMessageSlot>
        </div>
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
