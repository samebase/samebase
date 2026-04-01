import { Layout } from "@/Layout";
import { clearAuthFlag, setAuthFlag, useAutoSignIn } from "@/authClient";
import { McpConsentSignInView } from "@/McpConsentSignInView";
import { SignInForm } from "@/SignInForm";
import {
  CODEX_APP_SERVER_RESEARCH_ROUTE,
  CODEX_APP_SERVER_THREAD_BROWSER_ROUTE,
} from "@/lib/codexAppServerResearch";
import { MACHINES_ROUTE, MACHINE_CONNECT_ROUTE } from "@/lib/noterSync";

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
import { Routes, Route, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
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
const TermsOfServicePage = lazy(async () => {
  const module = await import("@/components/TermsOfServicePage");
  return { default: module.TermsOfServicePage };
});
const PrivacyPolicyPage = lazy(async () => {
  const module = await import("@/components/PrivacyPolicyPage");
  return { default: module.PrivacyPolicyPage };
});
const LogoPreviewPage = lazy(async () => {
  const module = await import("@/components/LogoPreviewPage");
  return { default: module.LogoPreviewPage };
});

const LogoSingleCubeStudyPage = lazy(async () => {
  const module = await import("@/components/LogoSingleCubeStudyPage");
  return { default: module.LogoSingleCubeStudyPage };
});

const LogoStaticSvgPage = lazy(async () => {
  const module = await import("@/components/LogoStaticSvgPage");
  return { default: module.LogoStaticSvgPage };
});

const LogoTransitionLabPage = lazy(async () => {
  const module = await import("@/components/LogoTransitionLabPage");
  return { default: module.LogoTransitionLabPage };
});

const LogoTransitionTransformsLabPage = lazy(async () => {
  const module = await import("@/components/LogoTransitionTransformsLabPage");
  return { default: module.LogoTransitionTransformsLabPage };
});
const PitchDeckPage = lazy(async () => {
  const module = await import("@/components/PitchDeckPage");
  return { default: module.PitchDeckPage };
});
const CodexAppServerResearchPage = lazy(async () => {
  const module = await import("@/components/CodexAppServerResearchPage");
  return { default: module.CodexAppServerResearchPage };
});
const CodexAppServerThreadBrowserResearchPage = lazy(async () => {
  const module = await import(
    "@/components/CodexAppServerThreadBrowserResearchPage"
  );
  return { default: module.CodexAppServerThreadBrowserResearchPage };
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

function ApprovalGate({ children }: { children: React.ReactNode }) {
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

function resolvePitchDeckMode(pathname: string) {
  if (pathname === "/pitch") {
    return "interactive" as const;
  }

  if (pathname === "/pitch/print") {
    return "print" as const;
  }

  if (pathname === "/pitch/print/mobile") {
    return "printMobile" as const;
  }

  return null;
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

function ResearchRouteUnavailablePage(props: {
  title: string;
  description: string;
}) {
  return (
    <Layout>
      <div className="container my-auto">
        <div className="mx-auto flex max-w-[420px] flex-col items-center gap-3 py-16 text-center">
          <h2 className="text-xl font-semibold tracking-tight">
            {props.title}
          </h2>
          <p className="text-sm text-muted-foreground">{props.description}</p>
        </div>
      </div>
    </Layout>
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
  // Vault and dashboard routes own the shared docked chat inside their scroll containers.
  const showGlobalChatFab =
    !location.pathname.startsWith("/vault/") && location.pathname !== "/";
  const showMcpConsent = onMcpConsentRoute && mcpConsentRequestId !== null;
  const logoPreviewMode =
    location.pathname === "/logo"
      ? "three"
      : location.pathname === "/logo-iso"
        ? "iso"
        : null;
  const showLogoStaticSvg = location.pathname === "/logo-svg";
  const showLogoIsoStudy = location.pathname === "/logo-iso-study";
  const showLogoTransitionLab = location.pathname === "/logo-transition-lab";
  const showPrivacyPolicyPage = location.pathname === "/privacy";
  const showTermsOfServicePage = location.pathname === "/terms";
  const showLogoTransitionTransformsLab =
    location.pathname === "/logo-transition-lab-transforms";
  const pitchDeckMode = resolvePitchDeckMode(location.pathname);
  const showPitchDeckPage = pitchDeckMode !== null;
  const showCodexAppServerResearchPage =
    location.pathname === CODEX_APP_SERVER_RESEARCH_ROUTE;
  const showCodexAppServerThreadBrowserResearchPage =
    location.pathname === CODEX_APP_SERVER_THREAD_BROWSER_ROUTE;
  const isCodexAppServerResearchRuntimeAvailable = import.meta.env.DEV;
  const showPublicLandingWithoutAuthGate =
    !isAuthenticated && shouldRenderPublicLandingWithoutAuthGate(location);

  const pageMetadata: PageMetadata = useMemo(() => {
    return resolvePageMetadata({
      pathname: location.pathname,
      isAuthenticated,
    });
  }, [isAuthenticated, location.pathname]);
  usePageMetadata(pageMetadata);

  if (logoPreviewMode !== null) {
    return (
      <Suspense fallback={null}>
        <LogoPreviewPage renderMode={logoPreviewMode} />
      </Suspense>
    );
  }

  if (showLogoIsoStudy) {
    return (
      <Suspense fallback={null}>
        <LogoSingleCubeStudyPage />
      </Suspense>
    );
  }

  if (showLogoStaticSvg) {
    return (
      <Suspense fallback={null}>
        <LogoStaticSvgPage />
      </Suspense>
    );
  }

  if (showLogoTransitionLab) {
    return (
      <Suspense fallback={null}>
        <LogoTransitionLabPage />
      </Suspense>
    );
  }

  if (showPrivacyPolicyPage) {
    return (
      <Layout>
        <Suspense fallback={null}>
          <PrivacyPolicyPage />
        </Suspense>
      </Layout>
    );
  }
  if (showTermsOfServicePage) {
    return (
      <Layout>
        <Suspense fallback={null}>
          <TermsOfServicePage />
        </Suspense>
      </Layout>
    );
  }
  if (showLogoTransitionTransformsLab) {
    return (
      <Suspense fallback={null}>
        <LogoTransitionTransformsLabPage />
      </Suspense>
    );
  }
  if (showPitchDeckPage) {
    return (
      <Suspense fallback={null}>
        <PitchDeckPage mode={pitchDeckMode} />
      </Suspense>
    );
  }
  if (showCodexAppServerResearchPage) {
    if (!isCodexAppServerResearchRuntimeAvailable) {
      return (
        <ResearchRouteUnavailablePage
          title="Codex research unavailable"
          description="This research surface only runs in the local development server."
        />
      );
    }
    return (
      <Suspense fallback={null}>
        <CodexAppServerResearchPage />
      </Suspense>
    );
  }
  if (showCodexAppServerThreadBrowserResearchPage) {
    if (!isCodexAppServerResearchRuntimeAvailable) {
      return (
        <ResearchRouteUnavailablePage
          title="Codex thread browser unavailable"
          description="This research surface only runs in the local development server."
        />
      );
    }
    return (
      <Suspense fallback={null}>
        <CodexAppServerThreadBrowserResearchPage />
      </Suspense>
    );
  }
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
                <Routes>
                  <Route path="/" element={<VaultDashboard />} />
                  <Route
                    path={MACHINES_ROUTE}
                    element={<MachinesWorkspacePage />}
                  />
                  <Route
                    path={MACHINE_CONNECT_ROUTE}
                    element={<MachineConnectPage />}
                  />
                  <Route path="/pricing" element={<PricingPage />} />
                  <Route path="/add" element={<AddRepository />} />
                  <Route
                    path="/vault/:owner/:repoName/codespace/:branch/chat"
                    element={<CodespaceChatOnlyView />}
                  />
                  <Route
                    path="/vault/:owner/:repoName/:branch"
                    element={<FileView />}
                  />
                  <Route
                    path="/vault/:owner/:repoName/:branch/*"
                    element={<FileView />}
                  />
                  <Route
                    path="/vault/:owner/:repoName"
                    element={<FileView />}
                  />

                  {/* test route */}
                  <Route path="/test" element={<div>Test</div>} />
                </Routes>
                {showGlobalChatFab ? <ChatFab /> : null}
              </Suspense>
            </ApprovalGate>
          </Authenticated>
          <Unauthenticated>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<SignInForm />} />
                <Route path="*" element={<SignInForm />} />
              </Routes>
            </Suspense>
          </Unauthenticated>
        </>
      )}
    </Layout>
  );
}
