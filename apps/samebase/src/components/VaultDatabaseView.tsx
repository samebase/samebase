import { isRecord } from "@samebase/dependent";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { parseVaultDatabasePathContext } from "@/lib/vaultRoutes";
import { useLocation } from "@tanstack/react-router";

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
      return "No Convex deployment is connected for this app root.";
    case "missing_connection":
      return "Connect Convex to view deployment data.";
  }
  result satisfies never;
  return "Data is unavailable.";
}

function formatAppRoot(appRoot: string): string {
  return appRoot === "." ? "root" : appRoot;
}

function VaultDatabaseStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-10 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function VaultDatabaseView() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
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
  const context = parseVaultDatabasePathContext(pathname);
  const readyCredentials = credentialsResult?.kind === "ready" ? credentialsResult : null;
  credentialsRef.current = readyCredentials;

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
    if (
      !context.owner ||
      !context.repoName ||
      !context.branch ||
      !context.appRoot ||
      context.isInvalidVaultRoute
    ) {
      setCredentialsResult(null);
      setLoadError("Database route not found.");
      return;
    }

    let cancelled = false;
    let mintedCredentials: ReadyEmbeddedDashboardCredentials | null = null;
    setCredentialsResult(null);
    setLoadError(null);
    const requestArgs = {
      owner: context.owner,
      repoName: context.repoName,
      branch: context.branch,
      appRoot: context.appRoot,
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
    context.appRoot,
    context.branch,
    context.isInvalidVaultRoute,
    context.owner,
    context.repoName,
    createEmbeddedDashboardCredentials,
    revokeEmbeddedDashboardCredentials,
  ]);

  const titleParts = [
    context.repositoryFullName,
    context.branch,
    context.appRoot ? formatAppRoot(context.appRoot) : undefined,
  ].filter((part) => typeof part === "string" && part.length > 0);

  return (
    <div data-testid="vault-database-page" className="flex h-full min-h-0 flex-col bg-background">
      {loadError ? (
        <VaultDatabaseStatus>{loadError}</VaultDatabaseStatus>
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
  );
}
