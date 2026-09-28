import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  useAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { api } from "../../convex/_generated/api";
import { AuthorizationErrorNotice } from "@/auth/AuthorizationErrorNotice";
import { Button } from "@/components/ui/button";
import { GitHubProviderLogo } from "@/components/ProviderLogos";
import { getCurrentRootRelativeUrl } from "@/lib/currentRootRelativeUrl";
import { openGitHubAppSetupPopup } from "@/organization/providers/githubAppSetupFlow";
import { useOrganizationContext, type ViewerOrganization } from "@/organization/context";
import { buildOrganizationRoutePath } from "@/organization/organizationRoutes";
import { SETTINGS_ROUTE } from "@/account/settingsRoute";

type ListResult = (typeof api.githubAppConnection.listOptions)["_returnType"];
export type OrganizationConnectionOption = Extract<
  ListResult,
  { status: "ready" }
>["options"][number];
export type OrganizationsPageOrganization = Pick<
  ViewerOrganization,
  "githubOwnerId" | "githubOwnerLogin" | "githubOwnerType"
>;

export type OrganizationDiscoveryState =
  | { status: "loading" }
  | { status: "github_sign_in_required" }
  | { status: "authorization_required" }
  | { status: "load_failed" }
  | { status: "ready"; options: readonly OrganizationConnectionOption[] };

export type OrganizationsPageState =
  | { status: "loading" }
  | {
      status: "ready";
      organizations: readonly OrganizationsPageOrganization[];
      discovery: OrganizationDiscoveryState;
    };

type OrganizationsPageViewProps = {
  authorizationNotice?: ReactNode;
  error: string | null;
  isAuthorizing: boolean;
  isInstalling: boolean;
  onAuthorize: () => void;
  onConnect: (installationId: string) => void;
  onInstall: () => void;
  onRetry: () => void;
  pendingInstallationId: string | null;
  state: OrganizationsPageState;
};

type OrganizationsPageEntry =
  | { kind: "organization"; organization: OrganizationsPageOrganization }
  | { kind: "connection"; option: OrganizationConnectionOption };

function readConnectionMessage(option: OrganizationConnectionOption): {
  detail?: string;
  status: string;
} {
  switch (option.status) {
    case "connect":
      return { status: "Not connected to Samebase" };
    case "invite_required":
      return {
        status: "Invite required",
        detail: `Someone already connected this GitHub ${option.githubOwnerType === "organization" ? "organization" : "account"} to Samebase. Ask a Samebase organization owner to invite you.`,
      };
    case "owner_required":
      return {
        status: "Owner required",
        detail:
          option.githubOwnerType === "organization"
            ? "A GitHub organization owner must connect this installation."
            : "The GitHub account owner must connect this installation.",
      };
    default:
      option satisfies never;
      return { status: "Unavailable" };
  }
}

function OrganizationsDiscoveryView({
  discovery,
  hasEntries,
  isAuthorizing,
  isInstalling,
  onAuthorize,
  onInstall,
  onRetry,
}: {
  discovery: OrganizationDiscoveryState;
  hasEntries: boolean;
  isAuthorizing: boolean;
  isInstalling: boolean;
  onAuthorize: () => void;
  onInstall: () => void;
  onRetry: () => void;
}) {
  switch (discovery.status) {
    case "authorization_required":
      return (
        <section className={hasEntries ? "mt-4 max-w-3xl" : "max-w-3xl"}>
          <p className="text-sm text-muted-foreground">
            Authorize GitHub to find Samebase GitHub App installations you can add.
          </p>
          <Button
            className="mt-4 w-fit"
            disabled={isAuthorizing}
            onClick={onAuthorize}
            type="button"
          >
            {isAuthorizing ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {isAuthorizing ? "Opening..." : "Authorize GitHub"}
          </Button>
        </section>
      );
    case "github_sign_in_required":
      return (
        <section className={hasEntries ? "mt-4 max-w-3xl" : "max-w-3xl"}>
          <p className="text-sm text-muted-foreground">
            Connect GitHub in Account settings before you add an organization.
          </p>
          <Button asChild className="mt-4 w-fit" variant="outline">
            <Link hash="sign-in-methods" to={SETTINGS_ROUTE}>
              Account settings
            </Link>
          </Button>
        </section>
      );
    case "load_failed":
      return (
        <div className={hasEntries ? "mt-4 max-w-3xl" : "max-w-3xl"}>
          <AuthorizationErrorNotice>
            Could not load GitHub App installations.
          </AuthorizationErrorNotice>
          <Button className="mt-4" onClick={onRetry} type="button" variant="outline">
            Try again
          </Button>
        </div>
      );
    case "loading":
      return (
        <div
          aria-label="Loading GitHub App installations"
          className={hasEntries ? "mt-4 max-w-3xl py-4" : "max-w-3xl py-4"}
        >
          <Loader2 aria-hidden="true" className="animate-spin" />
        </div>
      );
    case "ready":
      return hasEntries ? (
        <Button
          className="mt-2 h-auto self-start whitespace-normal px-0 text-left"
          disabled={isInstalling}
          onClick={onInstall}
          type="button"
          variant="link"
        >
          {isInstalling ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          {isInstalling ? "Opening..." : "Install GitHub App"}
        </Button>
      ) : (
        <section className="max-w-3xl">
          <h2 className="text-base font-semibold">No organizations</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Install the Samebase GitHub App for your GitHub account or an organization you manage.
          </p>
          <Button className="mt-4" disabled={isInstalling} onClick={onInstall} type="button">
            {isInstalling ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {isInstalling ? "Opening..." : "Install GitHub App"}
          </Button>
        </section>
      );
    default:
      discovery satisfies never;
      return null;
  }
}

export function OrganizationsPageView({
  authorizationNotice = null,
  error,
  isAuthorizing,
  isInstalling,
  onAuthorize,
  onConnect,
  onInstall,
  onRetry,
  pendingInstallationId,
  state,
}: OrganizationsPageViewProps) {
  const entries: OrganizationsPageEntry[] =
    state.status === "ready"
      ? [
          ...state.organizations.map((organization): OrganizationsPageEntry => ({
            kind: "organization",
            organization,
          })),
          ...(state.discovery.status === "ready"
            ? state.discovery.options.map((option): OrganizationsPageEntry => ({
                kind: "connection",
                option,
              }))
            : []),
        ]
      : [];
  const hasEntries = entries.length > 0;

  return (
    <main className="container flex min-h-0 flex-1 flex-col py-6" data-testid="organizations-page">
      <h1 className="mb-6 text-xl font-semibold @2xl:text-2xl">Organizations</h1>
      {authorizationNotice ? <div className="mb-4 max-w-3xl">{authorizationNotice}</div> : null}
      {error ? (
        <div className="mb-4 max-w-3xl">
          <AuthorizationErrorNotice>{error}</AuthorizationErrorNotice>
        </div>
      ) : null}
      {state.status === "loading" ? (
        <div aria-label="Loading organizations" className="max-w-3xl py-4">
          <Loader2 aria-hidden="true" className="animate-spin" />
        </div>
      ) : (
        <>
          {hasEntries ? (
            <ul aria-label="Organizations" className="max-w-3xl space-y-5">
              {entries.map((entry) => {
                const organization =
                  entry.kind === "organization" ? entry.organization : entry.option;
                const message =
                  entry.kind === "organization"
                    ? { status: "Connected to Samebase" }
                    : readConnectionMessage(entry.option);
                const pending =
                  entry.kind === "connection" &&
                  pendingInstallationId === entry.option.installationId;
                return (
                  <li
                    className="flex flex-wrap items-start gap-3 border-b border-border/50 pb-5 last:border-b-0"
                    key={
                      entry.kind === "organization"
                        ? `organization:${entry.organization.githubOwnerId}`
                        : `installation:${entry.option.installationId}`
                    }
                  >
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                      <GitHubProviderLogo />
                    </div>
                    <div className="min-w-0 flex-1 basis-80">
                      <div className="text-sm font-medium">{organization.githubOwnerLogin}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {organization.githubOwnerType === "organization"
                          ? "GitHub organization"
                          : "GitHub account"}
                      </div>
                      <div className="mt-2 text-sm">{message.status}</div>
                      {message.detail ? (
                        <div className="mt-1 text-sm text-muted-foreground">{message.detail}</div>
                      ) : null}
                    </div>
                    <div className="ml-auto flex items-start">
                      {entry.kind === "organization" ? (
                        <Button asChild size="sm" variant="outline">
                          <Link
                            aria-label={`Open ${entry.organization.githubOwnerLogin} in Samebase`}
                            to={buildOrganizationRoutePath({
                              owner: entry.organization.githubOwnerLogin,
                              section: "repositories",
                            })}
                          >
                            Open
                          </Link>
                        </Button>
                      ) : entry.option.status === "connect" ? (
                        <Button
                          aria-label={`Connect ${entry.option.githubOwnerLogin}`}
                          disabled={pendingInstallationId !== null}
                          onClick={() => onConnect(entry.option.installationId)}
                          size="sm"
                          type="button"
                        >
                          {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                          {pending ? "Connecting..." : "Connect"}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <OrganizationsDiscoveryView
            discovery={state.discovery}
            hasEntries={hasEntries}
            isAuthorizing={isAuthorizing}
            isInstalling={isInstalling}
            onAuthorize={onAuthorize}
            onInstall={onInstall}
            onRetry={onRetry}
          />
        </>
      )}
    </main>
  );
}

export function OrganizationsPage({ authorizationNotice }: { authorizationNotice?: ReactNode }) {
  const navigate = useNavigate();
  const { organizations } = useOrganizationContext();
  const getGitHubUserAuthorizationUrl = useConvexMutation(
    api.githubAppInstallation.getGitHubUserAuthorizationUrl,
  );
  const getInstallationUrl = useConvexMutation(
    api.githubAppInstallation.getGitHubAppInstallationUrl,
  );
  const listOptions = useAction(api.githubAppConnection.listOptions);
  const connectInstallation = useAction(api.githubAppConnection.connectInstallation);
  const viewer = useConvexQuery(api.users.viewer);
  const [error, setError] = useState<string | null>(null);
  const [pendingSetup, setPendingSetup] = useState<"github-app" | "github-user" | null>(null);
  const optionsQuery = useQuery({
    queryFn: () => listOptions({}),
    queryKey: ["github-app-connection-options", viewer?._id],
    enabled: viewer !== undefined && viewer !== null,
    refetchOnMount: "always",
    retry: false,
  });
  const connectMutation = useMutation({
    mutationFn: (args: (typeof api.githubAppConnection.connectInstallation)["_args"]) =>
      connectInstallation(args),
    onError: () => setError("Could not connect this GitHub App installation."),
    onSuccess: async (result) => {
      switch (result.status) {
        case "connected":
        case "open":
          await navigate({
            href: buildOrganizationRoutePath({
              owner: result.organizationOwnerLogin,
              section: "repositories",
            }),
            replace: true,
          });
          return;
        case "access_lost":
          setError("You no longer have permission to connect an organization.");
          return;
        case "invite_required":
        case "owner_required":
          await optionsQuery.refetch();
          return;
        case "authorization_required":
        case "github_sign_in_required":
          setError(null);
          return;
        default:
          result satisfies never;
      }
    },
  });

  const optionsResult = optionsQuery.data;
  const discovery: OrganizationDiscoveryState =
    connectMutation.data?.status === "authorization_required" ||
    optionsResult?.status === "authorization_required"
      ? { status: "authorization_required" }
      : connectMutation.data?.status === "github_sign_in_required" ||
          optionsResult?.status === "github_sign_in_required"
        ? { status: "github_sign_in_required" }
        : optionsQuery.isError
          ? { status: "load_failed" }
          : optionsResult?.status === "ready"
            ? { status: "ready", options: optionsResult.options }
            : { status: "loading" };
  const state: OrganizationsPageState =
    organizations === undefined
      ? { status: "loading" }
      : { status: "ready", organizations, discovery };
  const isAuthorizing = pendingSetup === "github-user";
  const isInstalling = pendingSetup === "github-app";
  const displayedError = pendingSetup === null ? error : null;
  const pendingInstallationId = connectMutation.isPending
    ? connectMutation.variables.installationId
    : null;

  const openSetup = (provider: "github-app" | "github-user") => {
    if (pendingSetup !== null) {
      return;
    }
    setPendingSetup(provider);
    setError(null);
    void openGitHubAppSetupPopup(provider, () =>
      provider === "github-user"
        ? getGitHubUserAuthorizationUrl({ returnToPath: getCurrentRootRelativeUrl() })
        : getInstallationUrl({ returnToPath: getCurrentRootRelativeUrl() }),
    )
      .catch(() =>
        setError(
          provider === "github-user"
            ? "Could not open GitHub authorization."
            : "Could not open GitHub App installation.",
        ),
      )
      .finally(() => setPendingSetup(null));
  };

  const connect = (installationId: string) => {
    if (connectMutation.isPending) {
      return;
    }
    setError(null);
    connectMutation.mutate({ installationId });
  };

  return (
    <OrganizationsPageView
      authorizationNotice={authorizationNotice}
      error={displayedError}
      isAuthorizing={isAuthorizing}
      isInstalling={isInstalling}
      onAuthorize={() => openSetup("github-user")}
      onConnect={connect}
      onInstall={() => openSetup("github-app")}
      onRetry={() => void optionsQuery.refetch()}
      pendingInstallationId={pendingInstallationId}
      state={state}
    />
  );
}
