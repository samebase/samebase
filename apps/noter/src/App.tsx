import { Layout } from "@/Layout";
import { clearAuthFlag, setAuthFlag, useAutoSignIn } from "@/authClient";
import { McpConsentSignInView } from "@/McpConsentSignInView";
import { SignInForm } from "@/SignInForm";
import { resolveAuthenticatedAppRoute } from "@/lib/appRouteResolution";
import { shouldShowGlobalChatFab } from "@/lib/globalChatFabVisibility";

import { Button } from "@/components/ui/button";
import {
  Authenticated,
  Unauthenticated,
  useAction,
  useConvexAuth,
  useQuery,
} from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import { MCP_CONSENT_APP_PATH } from "../shared/mcpOAuth";
import { useLocation } from "@/lib/router";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { resolvePageMetadata, type PageMetadata } from "@/lib/pageMetadata";
import { shouldRenderPublicLandingWithoutAuthGate } from "@/lib/publicLandingAuthState";
import { usePageMetadata } from "@/lib/usePageMetadata";

const VaultDashboard = lazy(async () => {
  const module = await import("@/components/VaultDashboard");
  return { default: module.VaultDashboard };
});
const FileView = lazy(async () => {
  const module = await import("@/components/FileView");
  return { default: module.FileView };
});
const AddRepository = lazy(async () => {
  const module = await import("@/components/AddRepository");
  return { default: module.AddRepository };
});
const ChatFab = lazy(async () => {
  const module = await import("@/components/ChatFab");
  return { default: module.ChatFab };
});
const CodespaceChatOnlyView = lazy(async () => {
  const module = await import("@/components/CodespaceChatOnlyView");
  return { default: module.CodespaceChatOnlyView };
});
const PricingPage = lazy(async () => {
  const module = await import("@/components/PricingPage");
  return { default: module.PricingPage };
});
const MachineConnectPage = lazy(async () => {
  const module = await import("@/components/MachineConnectPage");
  return { default: module.MachineConnectPage };
});
const MachinesWorkspacePage = lazy(async () => {
  const module = await import("@/components/MachinesWorkspacePage");
  return { default: module.MachinesWorkspacePage };
});

function useCloseOAuthPopup(pathname: string, enabled: boolean) {
  const { isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (!enabled) return;
    if (!isAuthenticated) return;

    // Remember that this user has authenticated, so we can auto-login next time
    if (!window.opener) {
      setAuthFlag();
    }

    if (!window.opener) return;

    const authKeys = Object.keys(localStorage).filter((k) =>
      k.startsWith("__convexAuth"),
    );
    const authTokens: Record<string, string> = {};
    for (const key of authKeys) {
      authTokens[key] = localStorage.getItem(key) ?? "";
    }

    // Try writing directly to the parent's localStorage.
    try {
      const parentLS = window.opener.localStorage;
      for (const [key, value] of Object.entries(authTokens)) {
        parentLS.setItem(key, value);
      }
      window.opener.location.reload();
    } catch {
      // Cross-origin or security restriction — fall back to postMessage
      window.opener.postMessage(
        { type: "convex-auth-tokens", tokens: authTokens },
        "*",
      );
    }

    window.close();
  }, [enabled, isAuthenticated, pathname]);
}

function ApprovalGate({ children }: { children: ReactNode }) {
  const isApproved = useQuery(api.users.isCurrentUserApproved);
  const { signOut } = useAuthActions();

  // Still loading auth state — render nothing to avoid flicker
  if (isApproved === undefined) return null;

  if (!isApproved) {
    return (
      <div className="container my-auto">
        <div className="max-w-[384px] mx-auto flex flex-col items-center gap-4 py-16 text-center">
          <h2 className="font-semibold text-xl tracking-tight">
            You're on the waitlist
          </h2>
          <p className="text-muted-foreground text-sm">
            We'll let you know when your spot opens up.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              clearAuthFlag();
              void signOut();
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function readMcpConsentRequestId(search: string): string | null {
  // Codex may send the query key with an empty value. Treat empty/whitespace as absent.
  return new URLSearchParams(search).get("mcp_consent_request")?.trim() || null;
}

function isMcpConsentRoute(pathname: string): boolean {
  return pathname === MCP_CONSENT_APP_PATH;
}

function McpConsentView({ requestId }: { requestId: string }) {
  const authorizationRequest = useQuery(
    api.mcp.oauth.getAuthorizationRequestForCurrentUser,
    {
      requestId,
    },
  );
  const completeAuthorizationRequest = useAction(
    api.mcp.oauth.completeAuthorizationRequestForCurrentUser,
  );
  const denyAuthorizationRequest = useAction(
    api.mcp.oauth.denyAuthorizationRequestForCurrentUser,
  );
  const [pendingAction, setPendingAction] = useState<"approve" | "deny" | null>(
    null,
  );
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
        <div className="max-w-[420px] mx-auto flex flex-col items-center gap-3 py-16 text-center">
          <h2 className="font-semibold text-xl tracking-tight">
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
        <div className="max-w-[420px] mx-auto flex flex-col items-center gap-3 py-16 text-center">
          <h2 className="font-semibold text-xl tracking-tight">
            Authorization request closed
          </h2>
          <p className="text-sm text-muted-foreground">
            This request is {authorizationRequest.status}.
          </p>
        </div>
      </div>
    );
  }

  const clientName =
    authorizationRequest.clientName ?? authorizationRequest.clientId;

  return (
    <div className="container my-auto">
      <div className="max-w-[420px] mx-auto flex flex-col gap-4 py-16">
        <div className="text-center">
          <h2 className="font-semibold text-xl tracking-tight">
            Authorize MCP client
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {clientName} is requesting access to your Noter account.
          </p>
        </div>

        <div className="corner-notch-1 border p-4 space-y-3 text-sm">
          <div>
            <div className="font-medium">Client</div>
            <div className="text-muted-foreground">{clientName}</div>
          </div>
          <div>
            <div className="font-medium">Resource</div>
            <div className="text-muted-foreground">
              {authorizationRequest.resource}
            </div>
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
              {authorizationRequest.dynamicallyRegistered
                ? "Dynamic client"
                : "Known client"}
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

export default function App() {
  useAutoSignIn();
  const location = useLocation();
  const { isAuthenticated } = useConvexAuth();
  const onMcpConsentRoute = isMcpConsentRoute(location.pathname);
  const mcpConsentRequestId = readMcpConsentRequestId(location.search);
  useCloseOAuthPopup(
    location.pathname,
    !(onMcpConsentRoute && mcpConsentRequestId !== null),
  );
  const showGlobalChatFab = shouldShowGlobalChatFab(location.pathname);
  const showMcpConsent = onMcpConsentRoute && mcpConsentRequestId !== null;
  const authenticatedRoute = resolveAuthenticatedAppRoute(location.pathname);
  const showPublicLandingWithoutAuthGate =
    !isAuthenticated && shouldRenderPublicLandingWithoutAuthGate(location);

  const pageMetadata: PageMetadata = useMemo(() => {
    return resolvePageMetadata({
      pathname: location.pathname,
      isAuthenticated,
    });
  }, [isAuthenticated, location.pathname]);
  usePageMetadata(pageMetadata);
  if (showMcpConsent) {
    return (
      <Layout>
        <>
          <Authenticated>
            <ApprovalGate>
              <McpConsentView requestId={mcpConsentRequestId} />
            </ApprovalGate>
          </Authenticated>
          <Unauthenticated>
            <McpConsentSignInView />
          </Unauthenticated>
        </>
      </Layout>
    );
  }

  return (
    <Layout>
      {showPublicLandingWithoutAuthGate ? (
        <SignInForm />
      ) : (
        <>
          <Authenticated>
            <ApprovalGate>
              <Suspense fallback={null}>
                {authenticatedRoute === "dashboard" ? <VaultDashboard /> : null}
                {authenticatedRoute === "machines" ? (
                  <MachinesWorkspacePage />
                ) : null}
                {authenticatedRoute === "machineConnect" ? (
                  <MachineConnectPage />
                ) : null}
                {authenticatedRoute === "pricing" ? <PricingPage /> : null}
                {authenticatedRoute === "addRepository" ? (
                  <AddRepository />
                ) : null}
                {authenticatedRoute === "codespaceChat" ? (
                  <CodespaceChatOnlyView />
                ) : null}
                {authenticatedRoute === "fileView" ? <FileView /> : null}
                {authenticatedRoute === "test" ? <div>Test</div> : null}
                {showGlobalChatFab ? <ChatFab /> : null}
              </Suspense>
            </ApprovalGate>
          </Authenticated>
          <Unauthenticated>
            <Suspense fallback={null}>
              <SignInForm />
            </Suspense>
          </Unauthenticated>
        </>
      )}
    </Layout>
  );
}
