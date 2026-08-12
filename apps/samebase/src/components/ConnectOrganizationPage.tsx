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
import { AuthorizationErrorNotice } from "@/components/AuthorizationErrorNotice";
import { Button } from "@/components/ui/button";
import { GitHubProviderLogo } from "@/components/vault-dashboard/VaultDashboardLogos";
import { getCurrentRootRelativeUrl } from "@/lib/currentRootRelativeUrl";
import { openGitHubAppSetupPopup } from "@/lib/githubAppSetupFlow";
import { buildOrganizationRoutePath } from "@/lib/organizationRoutes";
import { SETTINGS_ROUTE } from "@/lib/settingsRoute";

type ListResult = (typeof api.githubAppConnection.listOptions)["_returnType"];
export type ConnectOrganizationOption = Extract<ListResult, { status: "ready" }>["options"][number];

export type ConnectOrganizationPageState =
  | { status: "loading" }
  | { status: "github_sign_in_required" }
  | { status: "authorization_required" }
  | { status: "load_failed" }
  | { status: "ready"; options: readonly ConnectOrganizationOption[] };

type ConnectOrganizationPageViewProps = {
  authorizationNotice?: ReactNode;
  error: string | null;
  isAuthorizing: boolean;
  isInstalling: boolean;
  onAuthorize: () => void;
  onConnect: (installationId: string) => void;
  onInstall: () => void;
  onRetry: () => void;
  pendingInstallationId: string | null;
  state: ConnectOrganizationPageState;
};

function readOptionMessage(option: ConnectOrganizationOption): {
  detail?: string;
  status: string;
} {
  switch (option.status) {
    case "connect":
      return { status: "Not connected to Samebase" };
    case "open":
      return { status: "Connected to Samebase" };
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

export function ConnectOrganizationPageView({
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
}: ConnectOrganizationPageViewProps) {
  return (
    <main
      className="container flex min-h-0 flex-1 flex-col py-6"
      data-testid="connect-organization-page"
    >
      <h1 className="mb-2 text-xl font-semibold @2xl:text-2xl">Connect organization</h1>
      {state.status === "authorization_required" ? (
        <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
          Authorize GitHub to find Samebase GitHub App installations you can connect.
        </p>
      ) : state.status === "github_sign_in_required" ? (
        <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
          Connect GitHub in Account settings before you connect an organization.
        </p>
      ) : state.status === "ready" && state.options.length > 0 ? (
        <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
          Choose a GitHub App installation.
        </p>
      ) : null}
      {authorizationNotice ? <div className="mb-4 max-w-3xl">{authorizationNotice}</div> : null}
      {error ? (
        <div className="mb-4 max-w-3xl">
          <AuthorizationErrorNotice>{error}</AuthorizationErrorNotice>
        </div>
      ) : null}
      {state.status === "authorization_required" ? (
        <Button className="w-fit" disabled={isAuthorizing} onClick={onAuthorize} type="button">
          {isAuthorizing ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          {isAuthorizing ? "Opening..." : "Authorize GitHub"}
        </Button>
      ) : state.status === "github_sign_in_required" ? (
        <Button asChild className="w-fit" variant="outline">
          <Link hash="sign-in-methods" to={SETTINGS_ROUTE}>
            Account settings
          </Link>
        </Button>
      ) : state.status === "load_failed" ? (
        <div className="max-w-3xl">
          <AuthorizationErrorNotice>
            Could not load GitHub App installations.
          </AuthorizationErrorNotice>
          <Button className="mt-4" onClick={onRetry} type="button" variant="outline">
            Try again
          </Button>
        </div>
      ) : state.status === "loading" ? (
        <div aria-label="Loading GitHub App installations" className="max-w-3xl py-4">
          <Loader2 aria-hidden="true" className="animate-spin" />
        </div>
      ) : state.options.length === 0 ? (
        <section className="max-w-3xl">
          <h2 className="text-base font-semibold">No GitHub App installations</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Install the Samebase GitHub App for your GitHub account or an organization you manage.
          </p>
          <Button className="mt-4" disabled={isInstalling} onClick={onInstall} type="button">
            {isInstalling ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {isInstalling ? "Opening..." : "Install GitHub App"}
          </Button>
        </section>
      ) : (
        <div className="max-w-3xl">
          <ul aria-label="GitHub App installations" className="space-y-5">
            {state.options.map((option) => {
              const message = readOptionMessage(option);
              const pending = pendingInstallationId === option.installationId;
              return (
                <li
                  className="flex flex-wrap items-start gap-3 border-b border-border/50 pb-5 last:border-b-0"
                  key={option.installationId}
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                    <GitHubProviderLogo />
                  </div>
                  <div className="min-w-0 flex-1 basis-80">
                    <div className="text-sm font-medium">{option.githubOwnerLogin}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {option.githubOwnerType === "organization"
                        ? "GitHub organization"
                        : "GitHub account"}
                    </div>
                    <div className="mt-2 text-sm">{message.status}</div>
                    {message.detail ? (
                      <div className="mt-1 text-sm text-muted-foreground">{message.detail}</div>
                    ) : null}
                  </div>
                  <div className="ml-auto flex items-start">
                    {option.status === "connect" ? (
                      <Button
                        aria-label={`Connect ${option.githubOwnerLogin}`}
                        disabled={pendingInstallationId !== null}
                        onClick={() => onConnect(option.installationId)}
                        size="sm"
                        type="button"
                      >
                        {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                        {pending ? "Connecting..." : "Connect"}
                      </Button>
                    ) : option.status === "open" ? (
                      <Button asChild size="sm" variant="outline">
                        <Link
                          aria-label={`Open ${option.githubOwnerLogin} in Samebase`}
                          to={buildOrganizationRoutePath({
                            owner: option.organizationOwnerLogin,
                            section: "vaults",
                          })}
                        >
                          Open
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <Button
            className="mt-2 h-auto whitespace-normal px-0 text-left"
            disabled={isInstalling}
            onClick={onInstall}
            type="button"
            variant="link"
          >
            {isInstalling ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {isInstalling ? "Opening..." : "Install GitHub App"}
          </Button>
        </div>
      )}
    </main>
  );
}

export function ConnectOrganizationPage({
  authorizationNotice,
}: {
  authorizationNotice?: ReactNode;
}) {
  const navigate = useNavigate();
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
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const optionsQuery = useQuery({
    queryFn: async () => await listOptions({}),
    queryKey: ["github-app-connection-options", viewer?._id],
    enabled: viewer !== undefined && viewer !== null,
    refetchOnMount: "always",
    retry: false,
  });
  const connectMutation = useMutation({
    mutationFn: async (args: (typeof api.githubAppConnection.connectInstallation)["_args"]) =>
      await connectInstallation(args),
    onError: () => setError("Could not connect this GitHub App installation."),
    onSuccess: async (result) => {
      switch (result.status) {
        case "connected":
        case "open":
          await navigate({
            href: buildOrganizationRoutePath({
              owner: result.organizationOwnerLogin,
              section: "vaults",
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
  const state: ConnectOrganizationPageState =
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
  const displayedError = isAuthorizing || isInstalling ? null : error;
  const pendingInstallationId = connectMutation.isPending
    ? connectMutation.variables.installationId
    : null;

  const authorize = () => {
    if (isAuthorizing) {
      return;
    }
    setIsAuthorizing(true);
    setError(null);
    void openGitHubAppSetupPopup(
      "github-user",
      async () =>
        await getGitHubUserAuthorizationUrl({ returnToPath: getCurrentRootRelativeUrl() }),
    )
      .catch(() => setError("Could not open GitHub authorization."))
      .finally(() => setIsAuthorizing(false));
  };

  const install = () => {
    if (isInstalling) {
      return;
    }
    setIsInstalling(true);
    setError(null);
    void openGitHubAppSetupPopup(
      "github-app",
      async () => await getInstallationUrl({ returnToPath: getCurrentRootRelativeUrl() }),
    )
      .catch(() => setError("Could not open GitHub App installation."))
      .finally(() => setIsInstalling(false));
  };

  const connect = (installationId: string) => {
    if (connectMutation.isPending) {
      return;
    }
    setError(null);
    connectMutation.mutate({ installationId });
  };

  return (
    <ConnectOrganizationPageView
      authorizationNotice={authorizationNotice}
      error={displayedError}
      isAuthorizing={isAuthorizing}
      isInstalling={isInstalling}
      onAuthorize={authorize}
      onConnect={connect}
      onInstall={install}
      onRetry={() => void optionsQuery.refetch()}
      pendingInstallationId={pendingInstallationId}
      state={state}
    />
  );
}
