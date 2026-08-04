import { isRecord } from "@samebase/dependent";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { useOrganizationVaults } from "@/hooks/useOrganizationVaults";
import { findVaultConvexProjectAttachment } from "@/lib/vaultConvexProjectAttachment";
import { useOrganizationSelection } from "@/hooks/useOrganizationSelection";

const EMBEDDED_DASHBOARD_ORIGIN = "https://dashboard-embedded.convex.dev";
const EMBEDDED_DASHBOARD_URL = `${EMBEDDED_DASHBOARD_ORIGIN}/data`;

type EmbeddedDashboardCredentialsResult =
  (typeof api.vault.database.createEmbeddedDashboardCredentials)["_returnType"];
type ReadyEmbeddedDashboardCredentials = Extract<
  EmbeddedDashboardCredentialsResult,
  { kind: "ready" }
>;

function isDashboardCredentialsRequest(data: unknown): boolean {
  return isRecord(data) && data.type === "dashboard-credentials-request";
}

function formatVaultDatabaseNotice(
  result: Exclude<EmbeddedDashboardCredentialsResult, { kind: "ready" }>,
): string {
  switch (result.kind) {
    case "missing_vault":
      return "Vault not found.";
    case "unsupported_branch":
      return `Production data is only available on ${result.defaultBranch} for now.`;
    case "missing_deployment":
      return "This Convex project has no production deployment.";
    case "missing_connection":
      return "Connect Convex to open deployment data.";
  }
  result satisfies never;
  return "Data is unavailable.";
}

function VaultDatabaseStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-10 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

type VaultDatabaseViewProps = {
  owner: string;
  repoName: string;
  branch: string;
  convexProjectId: string;
};

export function VaultDatabaseView({
  owner,
  repoName,
  branch,
  convexProjectId: routeConvexProjectId,
}: VaultDatabaseViewProps) {
  const selection = useOrganizationSelection();
  if (selection.state !== "selected") {
    return null;
  }

  return (
    <VaultDatabaseViewForOrganization
      key={selection.organizationId}
      organizationId={selection.organizationId}
      owner={owner}
      repoName={repoName}
      branch={branch}
      convexProjectId={routeConvexProjectId}
    />
  );
}

function VaultDatabaseViewForOrganization({
  organizationId,
  owner,
  repoName,
  branch,
  convexProjectId: routeConvexProjectId,
}: VaultDatabaseViewProps & { organizationId: Id<"organizations"> }) {
  const vaults = useOrganizationVaults(organizationId);
  const createEmbeddedDashboardCredentials = useAction(
    api.vault.database.createEmbeddedDashboardCredentials,
  );
  const revokeEmbeddedDashboardCredentials = useAction(
    api.vault.database.revokeEmbeddedDashboardCredentials,
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const credentialsRef = useRef<ReadyEmbeddedDashboardCredentials | null>(null);
  const [credentialsResult, setCredentialsResult] =
    useState<EmbeddedDashboardCredentialsResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const readyCredentials = credentialsResult?.kind === "ready" ? credentialsResult : null;
  credentialsRef.current = readyCredentials;
  const attachment = vaults
    ? findVaultConvexProjectAttachment(vaults, `${owner}/${repoName}`, routeConvexProjectId)
    : null;
  const vault = attachment?.vault;
  const convexProject = attachment?.project;
  const convexProjectId = convexProject?.convexProjectId;
  const projectNotice =
    vaults === undefined
      ? null
      : !vault
        ? "Vault not found."
        : !convexProject
          ? "Convex project is not attached to this vault."
          : null;

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
      organizationId,
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
    organizationId,
    repoName,
    revokeEmbeddedDashboardCredentials,
  ]);

  const titleParts = [`${owner}/${repoName}`, branch, convexProject?.projectId];

  return (
    <AppWorkspaceRouteChrome rightToggleVisibility="all">
      <div data-testid="vault-database-page" className="flex h-full min-h-0 flex-col bg-background">
        {loadError ? (
          <VaultDatabaseStatus>{loadError}</VaultDatabaseStatus>
        ) : projectNotice ? (
          <VaultDatabaseStatus>{projectNotice}</VaultDatabaseStatus>
        ) : readyCredentials ? (
          <iframe
            ref={iframeRef}
            allow="clipboard-write"
            className="min-h-0 flex-1 border-0"
            src={EMBEDDED_DASHBOARD_URL}
            title={`Convex data for ${titleParts.join(" / ")}`}
          />
        ) : credentialsResult && credentialsResult.kind !== "ready" ? (
          <VaultDatabaseStatus>{formatVaultDatabaseNotice(credentialsResult)}</VaultDatabaseStatus>
        ) : (
          <VaultDatabaseStatus>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading data
          </VaultDatabaseStatus>
        )}
      </div>
    </AppWorkspaceRouteChrome>
  );
}
