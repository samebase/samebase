import { isRecord } from "@samebase/dependent";
import { useAction, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { findRepositoryConvexProjectAttachment } from "@/lib/repositoryConvexProjectAttachment";

const EMBEDDED_DASHBOARD_ORIGIN = "https://dashboard-embedded.convex.dev";
const EMBEDDED_DASHBOARD_URL = `${EMBEDDED_DASHBOARD_ORIGIN}/data`;

type EmbeddedDashboardCredentialsResult =
  (typeof api.repository.database.createEmbeddedDashboardCredentials)["_returnType"];
type ReadyEmbeddedDashboardCredentials = Extract<
  EmbeddedDashboardCredentialsResult,
  { kind: "ready" }
>;

function isDashboardCredentialsRequest(data: unknown): boolean {
  return isRecord(data) && data["type"] === "dashboard-credentials-request";
}

function formatRepositoryDatabaseNotice(
  result: Exclude<EmbeddedDashboardCredentialsResult, { kind: "ready" }>,
): string {
  switch (result.kind) {
    case "missing_repository":
      return "Repository not found.";
    case "unsupported_branch":
      return `Production data is only available on ${result.defaultBranch} for now.`;
    case "missing_deployment":
      return "This Convex project has no production deployment.";
    case "missing_connection":
      return "Connect Convex to open deployment data.";
    case "oauth_connection":
      return "Convex is connected with OAuth, which cannot grant a limited key for this view. Open this data in the Convex dashboard.";
  }
}

function RepositoryDatabaseStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-10 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

type RepositoryDatabaseViewProps = {
  owner: string;
  repoName: string;
  branch: string;
  convexProjectId: string;
};

export function RepositoryDatabaseView({
  owner,
  repoName,
  branch,
  convexProjectId: routeConvexProjectId,
}: RepositoryDatabaseViewProps) {
  const repositories = useQuery(api.repository.list);
  const createEmbeddedDashboardCredentials = useAction(
    api.repository.database.createEmbeddedDashboardCredentials,
  );
  const revokeEmbeddedDashboardCredentials = useAction(
    api.repository.database.revokeEmbeddedDashboardCredentials,
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const credentialsRef = useRef<ReadyEmbeddedDashboardCredentials | null>(null);
  const [credentialsResult, setCredentialsResult] =
    useState<EmbeddedDashboardCredentialsResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const readyCredentials = credentialsResult?.kind === "ready" ? credentialsResult : null;
  credentialsRef.current = readyCredentials;
  const attachment = repositories
    ? findRepositoryConvexProjectAttachment(
        repositories,
        `${owner}/${repoName}`,
        routeConvexProjectId,
      )
    : null;
  const repository = attachment?.repository;
  const convexProject = attachment?.project;
  // A route value that names no attachment row is the Convex project id of a deployment of the
  // repository stack in the Alchemy state store; the server accepts it only for such a deployment.
  const convexProjectId = repository
    ? (convexProject?.convexProjectId ?? routeConvexProjectId)
    : undefined;
  const projectNotice =
    repositories === undefined ? null : !repository ? "Repository not found." : null;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.origin !== EMBEDDED_DASHBOARD_ORIGIN ||
        !isDashboardCredentialsRequest(event.data)
      ) {
        return;
      }
      const contentWindow = iframeRef.current?.contentWindow;
      if (!contentWindow || event.source !== contentWindow) {
        return;
      }
      const credentials = credentialsRef.current;
      if (!credentials) {
        return;
      }

      contentWindow.postMessage(
        {
          type: "dashboard-credentials",
          deploymentUrl: credentials.deploymentUrl,
          deploymentName: credentials.deploymentName,
          adminKey: credentials.adminKey,
          visiblePages: ["data"],
        },
        EMBEDDED_DASHBOARD_ORIGIN,
      );
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let mintedCredentials: ReadyEmbeddedDashboardCredentials | null = null;
    setCredentialsResult(null);
    setLoadError(null);
    if (!convexProjectId) {
      return;
    }
    const requestArgs = {
      owner,
      repoName,
      branch,
      convexProjectId,
    };
    const revokeCredentials = (credentials: ReadyEmbeddedDashboardCredentials) => {
      void revokeEmbeddedDashboardCredentials({
        ...requestArgs,
        deployKeyName: credentials.deployKeyName,
      }).catch((error: unknown) => {
        console.warn("Failed to revoke embedded dashboard credentials", error);
      });
    };

    void createEmbeddedDashboardCredentials(requestArgs)
      .then((result) => {
        if (result.kind === "ready") {
          if (cancelled) {
            revokeCredentials(result);
            return;
          }
          mintedCredentials = result;
        }

        if (!cancelled) {
          setCredentialsResult(result);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : "Unable to load database.");
      });

    return () => {
      cancelled = true;
      if (mintedCredentials) {
        revokeCredentials(mintedCredentials);
      }
    };
  }, [
    branch,
    convexProjectId,
    createEmbeddedDashboardCredentials,
    owner,
    repoName,
    revokeEmbeddedDashboardCredentials,
  ]);

  const titleParts = [
    `${owner}/${repoName}`,
    branch,
    convexProject?.projectId ?? routeConvexProjectId,
  ];

  return (
    <AppWorkspaceRouteChrome rightToggleVisibility="all">
      <div
        data-testid="repository-database-page"
        className="flex h-full min-h-0 flex-col bg-background"
      >
        {loadError ? (
          <RepositoryDatabaseStatus>{loadError}</RepositoryDatabaseStatus>
        ) : projectNotice ? (
          <RepositoryDatabaseStatus>{projectNotice}</RepositoryDatabaseStatus>
        ) : readyCredentials ? (
          <iframe
            ref={iframeRef}
            allow="clipboard-write"
            className="min-h-0 flex-1 border-0"
            src={EMBEDDED_DASHBOARD_URL}
            title={`Convex data for ${titleParts.join(" / ")}`}
          />
        ) : credentialsResult && credentialsResult.kind !== "ready" ? (
          <RepositoryDatabaseStatus>
            {formatRepositoryDatabaseNotice(credentialsResult)}
          </RepositoryDatabaseStatus>
        ) : (
          <RepositoryDatabaseStatus>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading data
          </RepositoryDatabaseStatus>
        )}
      </div>
    </AppWorkspaceRouteChrome>
  );
}
