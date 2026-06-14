import { Link } from "@tanstack/react-router";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { GitHubLogoIcon } from "@/lib/radixIcons";
import { RepositoryWorkspacePaneHeader } from "@/components/RepositoryWorkspacePaneHeader";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";

export function RepositoryRouteConnectState({
  repositoryFullName,
  githubConnected,
  isConnectingGithub,
  isConnectingRepository,
  errorMessage,
  onConnectGithub,
  onConnectRepository,
  dataTestId,
}: {
  repositoryFullName: string;
  githubConnected: boolean;
  isConnectingGithub: boolean;
  isConnectingRepository: boolean;
  errorMessage: string | null;
  onConnectGithub: () => void;
  onConnectRepository: () => void;
  dataTestId?: string;
}) {
  const primaryLabel = githubConnected
    ? isConnectingRepository
      ? "Connecting..."
      : "Connect this repo"
    : isConnectingGithub
      ? "Opening GitHub..."
      : "Connect GitHub";

  const description = githubConnected
    ? "This repository is not connected to your vaults yet. Connect it to open this repo in Noter for your account."
    : "Connect GitHub before opening this repository in Noter.";

  return (
    <AppWorkspaceRouteChrome
      dataTestId={dataTestId}
      headerAccessory={
        <RepositoryWorkspacePaneHeader
          title={repositoryFullName}
          right={
            <a
              href={`https://github.com/${repositoryFullName}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              GitHub
            </a>
          }
        />
      }
    >
      <div className="flex h-full min-h-0 items-center justify-center p-6">
        <div className="w-full max-w-xl">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GitHubLogoIcon className="h-4 w-4" />
            <span>Repository route</span>
          </div>
          <h1 className="mt-2 text-xl font-semibold">{repositoryFullName}</h1>
          <p className="mt-3 max-w-lg text-sm text-muted-foreground">{description}</p>
          {errorMessage ? (
            <div
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              className="mt-4 corner-notch-1 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {errorMessage}
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              onClick={githubConnected ? onConnectRepository : onConnectGithub}
              disabled={isConnectingGithub || isConnectingRepository}
            >
              {primaryLabel}
            </Button>
            <Button variant="outline" asChild>
              <Link to={DASHBOARD_ROUTE}>Back to Vaults</Link>
            </Button>
          </div>
        </div>
      </div>
    </AppWorkspaceRouteChrome>
  );
}
