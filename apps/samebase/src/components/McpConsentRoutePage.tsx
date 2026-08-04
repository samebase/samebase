import { McpConsentSignInView } from "@/McpConsentSignInView";
import { ApprovalGate } from "@/components/ApprovalGate";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { useCloseOAuthPopup } from "@/lib/useCloseOAuthPopup";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { getRouteApi } from "@tanstack/react-router";
import { Authenticated, Unauthenticated, useAction, useConvexAuth, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { ACCESS_BROWSER_LOGIN_HANDOFF } from "../../shared/accessModel";
import { MCP_CONSENT_APP_PATH } from "../../shared/mcpOAuth";

const mcpConsentRouteApi = getRouteApi(MCP_CONSENT_APP_PATH);

function readMcpConsentScopeLabel(scope: string): string {
  if (scope === ACCESS_BROWSER_LOGIN_HANDOFF) {
    return "Open Samebase in a browser as your account";
  }

  return scope;
}

function McpConsentView({ requestId }: { requestId: string }) {
  const authorizationRequest = useQuery(api.mcp.oauth.getAuthorizationRequestForCurrentUser, {
    requestId,
  });
  const organizations = useQuery(api.organizations.listForViewer);
  const completeAuthorizationRequest = useAction(
    api.mcp.oauth.completeAuthorizationRequestForCurrentUser,
  );
  const denyAuthorizationRequest = useAction(api.mcp.oauth.denyAuthorizationRequestForCurrentUser);
  const [pendingAction, setPendingAction] = useState<"approve" | "deny" | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedOrganization = organizations?.find(
    ({ organizationId }) => organizationId === selectedOrganizationId,
  );
  const organization =
    selectedOrganization ?? (organizations?.length === 1 ? organizations[0] : undefined);

  const runAction = (action: "approve" | "deny") => {
    if (pendingAction !== null) {
      return;
    }

    setError(null);
    setPendingAction(action);

    let actionPromise;
    if (action === "approve") {
      if (organization === undefined) {
        setPendingAction(null);
        setError("Choose an organization.");
        return;
      }
      actionPromise = completeAuthorizationRequest({
        requestId,
        organizationId: organization.organizationId,
      });
    } else {
      actionPromise = denyAuthorizationRequest({ requestId });
    }

    void actionPromise
      .then(({ redirectUrl }) => {
        window.location.assign(redirectUrl);
      })
      .catch((actionError: unknown) => {
        setPendingAction(null);
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Failed to process MCP authorization request.",
        );
      });
  };

  if (authorizationRequest === undefined || organizations === undefined) {
    return null;
  }

  if (authorizationRequest === null) {
    return (
      <div className="container my-auto">
        <div className="mx-auto flex max-w-[420px] flex-col items-center gap-3 py-16 text-center">
          <h2 className="text-xl font-semibold tracking-tight">
            Authorization request unavailable
          </h2>
          <p className="text-sm text-muted-foreground">
            The MCP authorization request could not be found for your account.
          </p>
        </div>
      </div>
    );
  }

  if (authorizationRequest.status !== "pending") {
    return (
      <div className="container my-auto">
        <div className="mx-auto flex max-w-[420px] flex-col items-center gap-3 py-16 text-center">
          <h2 className="text-xl font-semibold tracking-tight">Authorization request closed</h2>
          <p className="text-sm text-muted-foreground">
            This request is {authorizationRequest.status}.
          </p>
        </div>
      </div>
    );
  }

  const clientName = authorizationRequest.clientName ?? authorizationRequest.clientId;

  return (
    <div className="container my-auto">
      <div className="mx-auto flex max-w-[420px] flex-col gap-4 py-16">
        <div className="text-center">
          <h2 className="text-xl font-semibold tracking-tight">Authorize MCP client</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {clientName} is requesting access to your Samebase account.
          </p>
        </div>

        <div className="corner-notch-1 space-y-3 border p-4 text-sm">
          <div>
            <div className="font-medium">Client</div>
            <div className="text-muted-foreground">{clientName}</div>
          </div>
          <div>
            <div className="font-medium">Organization</div>
            {organizations.length === 1 ? (
              <div className="text-muted-foreground">{organizations[0].label}</div>
            ) : (
              <Select
                value={organization?.organizationId ?? null}
                onValueChange={setSelectedOrganizationId}
              >
                <SelectTrigger aria-label="Organization" className="mt-1 w-full">
                  <SelectValue placeholder="Choose an organization">
                    {organization?.label}
                  </SelectValue>
                </SelectTrigger>
                <AppSelectContent>
                  {organizations.map((organization) => (
                    <AppSelectItem
                      key={organization.organizationId}
                      value={organization.organizationId}
                    >
                      {organization.label}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </Select>
            )}
          </div>
          <div>
            <div className="font-medium">Resource</div>
            <div className="text-muted-foreground">{authorizationRequest.resource}</div>
          </div>
          <div>
            <div className="font-medium">Requested scopes</div>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {authorizationRequest.scopes.map((scope) => (
                <li key={scope}>{readMcpConsentScopeLabel(scope)}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-medium">Registration</div>
            <div className="text-muted-foreground">
              {authorizationRequest.dynamicallyRegistered ? "Dynamic client" : "Known client"}
            </div>
          </div>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              runAction("deny");
            }}
            disabled={pendingAction !== null}
          >
            {pendingAction === "deny" ? "Denying..." : "Deny"}
          </Button>
          <Button
            onClick={() => {
              runAction("approve");
            }}
            disabled={pendingAction !== null || organization === undefined}
          >
            {pendingAction === "approve" ? "Approving..." : "Approve"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function McpConsentRoutePage() {
  const routeSearch = mcpConsentRouteApi.useSearch();
  const { isAuthenticated } = useConvexAuth();
  const requestId = routeSearch.mcp_consent_request ?? null;
  const pageMetadata = useMemo(
    () =>
      resolvePageMetadata({
        pathname: MCP_CONSENT_APP_PATH,
        isAuthenticated,
      }),
    [isAuthenticated],
  );

  useCloseOAuthPopup(MCP_CONSENT_APP_PATH, requestId === null);
  usePageMetadata(pageMetadata);

  return (
    <>
      <Authenticated>
        <ApprovalGate>
          {requestId === null ? null : <McpConsentView requestId={requestId} />}
        </ApprovalGate>
      </Authenticated>
      <Unauthenticated>
        <McpConsentSignInView />
      </Unauthenticated>
    </>
  );
}
