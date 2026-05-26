import { McpConsentSignInView } from "@/McpConsentSignInView";
import { SignInForm } from "@/SignInForm";
import { ApprovalGate } from "@/components/ApprovalGate";
import { Button } from "@/components/ui/button";
import { landingPageMarkdown } from "@/lib/landingCopy";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { useCloseOAuthPopup } from "@/lib/useCloseOAuthPopup";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { getRouteApi } from "@tanstack/react-router";
import { Authenticated, Unauthenticated, useAction, useConvexAuth, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import { MCP_CONSENT_APP_PATH } from "../../shared/mcpOAuth";

const mcpConsentRouteApi = getRouteApi(MCP_CONSENT_APP_PATH);

function McpConsentView({ requestId }: { requestId: string }) {
  const authorizationRequest = useQuery(api.mcp.oauth.getAuthorizationRequestForCurrentUser, {
    requestId,
  });
  const completeAuthorizationRequest = useAction(
    api.mcp.oauth.completeAuthorizationRequestForCurrentUser,
  );
  const denyAuthorizationRequest = useAction(api.mcp.oauth.denyAuthorizationRequestForCurrentUser);
  const [pendingAction, setPendingAction] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAction = (action: "approve" | "deny") => {
    if (pendingAction !== null) {
      return;
    }

    setError(null);
    setPendingAction(action);

    const actionPromise =
      action === "approve"
        ? completeAuthorizationRequest({ requestId })
        : denyAuthorizationRequest({ requestId });

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

  if (authorizationRequest === undefined) {
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
            {clientName} is requesting access to your Noter account.
          </p>
        </div>

        <div className="corner-notch-1 space-y-3 border p-4 text-sm">
          <div>
            <div className="font-medium">Client</div>
            <div className="text-muted-foreground">{clientName}</div>
          </div>
          <div>
            <div className="font-medium">Resource</div>
            <div className="text-muted-foreground">{authorizationRequest.resource}</div>
          </div>
          <div>
            <div className="font-medium">Requested scopes</div>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {authorizationRequest.scopes.map((scope) => (
                <li key={scope}>{scope}</li>
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
            disabled={pendingAction !== null}
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
        {requestId === null ? (
          <SignInForm
            authPlacement="inline"
            landingPageMarkdown={landingPageMarkdown}
            topNotice={null}
          />
        ) : (
          <McpConsentSignInView />
        )}
      </Unauthenticated>
    </>
  );
}
