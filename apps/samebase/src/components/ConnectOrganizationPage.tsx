import { skipToken, useMutation, useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation as useConvexMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { api } from "../../convex/_generated/api";
import { AuthorizationErrorNotice } from "@/components/AuthorizationErrorNotice";
import { Button } from "@/components/ui/button";
import { GitHubProviderLogo } from "@/components/vault-dashboard/VaultDashboardLogos";
import { getCurrentRootRelativeUrl } from "@/lib/currentRootRelativeUrl";
import { openGitHubAppSetupPopup } from "@/lib/githubAppSetupFlow";
import { buildOrganizationRoutePath, ORGANIZATION_VAULTS_ROUTE } from "@/lib/organizationRoutes";

type ListResult = (typeof api.githubAppConnection.listOptions)["_returnType"];
export type ConnectOrganizationOption = Extract<ListResult, { status: "ready" }>["options"][number];

type ConnectOrganizationPageViewProps = {
  authorizationNotice?: ReactNode;
  error: string | null;
  isAuthorizing: boolean;
  isInstalling: boolean;
  loading: boolean;
  onAuthorize: () => void;
  onConnect: (installationId: string) => void;
  onInstall: () => void;
  options: readonly ConnectOrganizationOption[] | null;
  pendingInstallationId: string | null;
  session: string | undefined;
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
    case "github_sign_in_required":
      return {
        status: "GitHub sign-in required",
        detail: "Add this GitHub account as a Samebase sign-in method before you connect it.",
      };
    case "github_sign_in_mismatch":
      return {
        status: "Different GitHub sign-in",
        detail: "This GitHub account does not match your Samebase GitHub sign-in method.",
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
  loading,
  onAuthorize,
  onConnect,
  onInstall,
  options,
  pendingInstallationId,
  session,
}: ConnectOrganizationPageViewProps) {
  const hasSession = session !== undefined;
  const showAuthorize = !hasSession || (!loading && options === null);

  return (
    <main
      className="container flex min-h-0 flex-1 flex-col py-6"
      data-testid="connect-organization-page"
    >
      <h1 className="mb-2 text-xl font-semibold @2xl:text-2xl">Connect organization</h1>
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        {showAuthorize
          ? "Authorize GitHub to find Samebase GitHub App installations you can connect."
          : "Choose a GitHub App installation."}
      </p>
      {authorizationNotice ? <div className="mb-4 max-w-3xl">{authorizationNotice}</div> : null}
      {error ? (
        <div className="mb-4 max-w-3xl">
          <AuthorizationErrorNotice>{error}</AuthorizationErrorNotice>
        </div>
      ) : null}
      {showAuthorize ? (
        <Button className="w-fit" disabled={isAuthorizing} onClick={onAuthorize} type="button">
          {isAuthorizing ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          {isAuthorizing ? "Opening..." : "Authorize GitHub"}
        </Button>
      ) : loading || options === null ? (
        <div aria-label="Loading GitHub App installations" className="max-w-3xl py-4">
          <Loader2 aria-hidden="true" className="animate-spin" />
        </div>
      ) : options.length === 0 ? (
        <section className="max-w-3xl">
          <h2 className="text-base font-semibold">No GitHub App installations</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Install the Samebase GitHub App for a GitHub account or organization.
          </p>
          <Button className="mt-4" disabled={isInstalling} onClick={onInstall} type="button">
            {isInstalling ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {isInstalling ? "Opening..." : "Install GitHub App"}
          </Button>
        </section>
      ) : (
        <div className="max-w-3xl">
          <ul aria-label="GitHub App installations" className="space-y-5">
            {options.map((option) => {
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
            {isInstalling ? "Opening..." : "Install for another account or organization"}
          </Button>
        </div>
      )}
    </main>
  );
}

export function ConnectOrganizationPage({
  authorizationNotice,
  session,
}: {
  authorizationNotice?: ReactNode;
  session: string | undefined;
}) {
  const navigate = useNavigate();
  const getConnectionUrl = useConvexMutation(
    api.githubAppInstallation.getGitHubOrganizationConnectionUrl,
  );
  const getInstallationUrl = useConvexMutation(
    api.githubAppInstallation.getGitHubAppInstallationUrl,
  );
  const listOptions = useAction(api.githubAppConnection.listOptions);
  const connectInstallation = useAction(api.githubAppConnection.connectInstallation);
  const [error, setError] = useState<string | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const optionsQuery = useQuery({
    queryFn: session ? async () => await listOptions({ session }) : skipToken,
    queryKey: ["github-app-connection-options", session],
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
        case "session_expired":
          setError("GitHub authorization expired. Authorize GitHub again.");
          return;
        case "github_sign_in_required":
          setError("Add this GitHub account as a Samebase sign-in method before you connect it.");
          return;
        case "github_sign_in_mismatch":
          setError("This GitHub account does not match your Samebase GitHub sign-in method.");
          return;
        default:
          result satisfies never;
      }
    },
  });

  const optionsResult = optionsQuery.data;
  if (optionsResult?.status === "completed") {
    return (
      <Navigate
        params={{ owner: optionsResult.organizationOwnerLogin }}
        replace
        to={ORGANIZATION_VAULTS_ROUTE}
      />
    );
  }
  const connectionUnavailable =
    connectMutation.data?.status === "access_lost" ||
    connectMutation.data?.status === "session_expired";
  const options =
    !connectionUnavailable && !optionsQuery.isError && optionsResult?.status === "ready"
      ? optionsResult.options
      : null;
  const queryError = optionsQuery.isError
    ? "Could not load GitHub App installations. Authorize GitHub again."
    : optionsResult?.status === "session_expired"
      ? "GitHub authorization expired. Authorize GitHub again."
      : null;
  const displayedError = error ?? (isAuthorizing || isInstalling ? null : queryError);
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
      async () => await getConnectionUrl({ returnToPath: getCurrentRootRelativeUrl() }),
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
    if (!session || connectMutation.isPending) {
      return;
    }
    setError(null);
    connectMutation.mutate({ session, installationId });
  };

  return (
    <ConnectOrganizationPageView
      authorizationNotice={authorizationNotice}
      error={displayedError}
      isAuthorizing={isAuthorizing}
      isInstalling={isInstalling}
      loading={optionsQuery.isFetching}
      onAuthorize={authorize}
      onConnect={connect}
      onInstall={install}
      options={options}
      pendingInstallationId={pendingInstallationId}
      session={session}
    />
  );
}
