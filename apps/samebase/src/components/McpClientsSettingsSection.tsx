import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/useNow";
import { formatRelativeTimeAgo } from "@/lib/formatRelativeTime";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

const MCP_GRANTS_PAGE_SIZE = 20;

export function McpClientsSettingsSection() {
  const now = useNow();
  const viewerAccess = useQuery(api.users.currentViewerAccess);
  const hasMcpAccess = viewerAccess?.accessKeys.includes("access_mcp") === true;
  const grants = usePaginatedQuery(
    api.mcp.grants.listCurrentUserGrants,
    hasMcpAccess ? {} : "skip",
    { initialNumItems: MCP_GRANTS_PAGE_SIZE },
  );
  const revokeGrant = useMutation(api.mcp.grants.revokeCurrentUserGrant);
  const [error, setError] = useState<string | null>(null);
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);

  if (!hasMcpAccess) {
    return null;
  }

  const handleRevoke = async (grantId: string) => {
    if (revokingGrantId !== null) {
      return;
    }
    setError(null);
    setRevokingGrantId(grantId);
    try {
      await revokeGrant({ grantId });
    } catch (revokeError) {
      setError(
        revokeError instanceof Error ? revokeError.message : "Could not revoke the MCP client.",
      );
    } finally {
      setRevokingGrantId(null);
    }
  };

  return (
    <section
      aria-labelledby="settings-mcp-clients-heading"
      className="mt-8 border-t pt-6"
      data-testid="mcp-clients-settings-section"
      id="mcp-clients"
    >
      <h2 id="settings-mcp-clients-heading" className="text-base font-semibold">
        MCP clients
      </h2>
      <div data-testid="mcp-client-grants" className="mt-4 space-y-5">
        {grants.results.map((grant) => {
          const clientName = grant.clientName?.trim();
          const clientLabel = clientName || grant.clientId;
          const activity =
            grant.lastUsedAt !== undefined
              ? `Last used ${formatRelativeTimeAgo(grant.lastUsedAt, now)}`
              : `Authorized ${formatRelativeTimeAgo(grant.createdAt, now)}`;
          return (
            <div
              key={grant.grantId}
              data-grant-id={grant.grantId}
              data-testid="mcp-client-grant-row"
              className="flex flex-wrap items-start gap-3 border-b border-border/50 pb-5 last:border-b-0"
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                <KeyRound className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 basis-80">
                <div className="text-sm font-medium">{clientLabel}</div>
                <div className="min-w-0 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                  {clientName ? `${grant.clientId}, ${activity}` : activity}
                </div>
                <div className="mt-2 min-w-0 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                  <div>{grant.scopes.join(", ")}</div>
                  <div>{grant.resource}</div>
                </div>
              </div>
              <Button
                disabled={revokingGrantId !== null}
                onClick={() => void handleRevoke(grant.grantId)}
                size="sm"
                type="button"
                variant="outline"
              >
                {revokingGrantId === grant.grantId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {revokingGrantId === grant.grantId ? "Revoking..." : "Revoke"}
              </Button>
            </div>
          );
        })}
        {grants.status === "LoadingFirstPage" ? (
          <div
            className="flex min-h-10 items-center justify-center"
            aria-label="Loading MCP clients"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : grants.results.length === 0 ? (
          <div className="text-sm text-muted-foreground">No authorized MCP clients.</div>
        ) : null}
      </div>
      {error ? (
        <div role="alert" className="mt-3 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      {grants.status === "CanLoadMore" || grants.status === "LoadingMore" ? (
        <Button
          className="mt-3"
          disabled={grants.status === "LoadingMore"}
          onClick={() => grants.loadMore(MCP_GRANTS_PAGE_SIZE)}
          size="sm"
          type="button"
          variant="outline"
        >
          {grants.status === "LoadingMore" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          {grants.status === "LoadingMore" ? "Loading..." : "Load more"}
        </Button>
      ) : null}
    </section>
  );
}
