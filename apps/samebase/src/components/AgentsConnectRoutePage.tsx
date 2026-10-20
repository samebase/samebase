import { useSessionRouteClient } from "@/authClient";
import { Button } from "@/components/ui/button";
import { consumeStoredAgentBrowserHandoff } from "@/lib/agentBrowserHandoffPrehydration";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { AGENT_BROWSER_HANDOFF_ROUTE } from "../../shared/agentBrowserHandoff";

type HandoffState = "connecting" | "missing" | "failed";

export function AgentsConnectRoutePage() {
  const { setSession } = useAuthActions();
  const sessionRouteClient = useSessionRouteClient();
  const { isLoading: isAuthLoading } = useConvexAuth();
  const [handoffState, setHandoffState] = useState<HandoffState>("connecting");
  const startedRef = useRef(false);
  const pageMetadata = useMemo(
    () =>
      resolvePageMetadata({
        pathname: AGENT_BROWSER_HANDOFF_ROUTE,
        isAuthenticated: false,
      }),
    [],
  );

  usePageMetadata(pageMetadata);

  useEffect(() => {
    if (isAuthLoading || startedRef.current) {
      return;
    }

    startedRef.current = true;
    const handoff = consumeStoredAgentBrowserHandoff();
    if (handoff === null) {
      setHandoffState("missing");
      return;
    }

    void sessionRouteClient()
      .mutation(api.agentBrowserHandoff.signInWithAgentBrowserHandoff, { token: handoff.token })
      .then(async (result) => {
        if (result.status === "error") {
          setHandoffState("failed");
          return;
        }
        await setSession(result.tokens);
        window.location.replace(handoff.returnToPath);
      })
      .catch(() => {
        setHandoffState("failed");
      });
  }, [isAuthLoading, sessionRouteClient, setSession]);

  const message =
    handoffState === "connecting"
      ? "Connecting Samebase..."
      : handoffState === "missing"
        ? "Connection link unavailable."
        : "Connection link failed. If this browser is signed in to a different Samebase account, sign out and ask for a fresh link.";

  return (
    <main
      className="flex min-h-[60vh] items-center justify-center px-4"
      data-posthog-block
      data-testid="agents-connect-page"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{message}</h1>
        {handoffState === "connecting" ? null : (
          <Button
            variant="outline"
            onClick={() => {
              window.location.replace(DASHBOARD_ROUTE);
            }}
          >
            Open Samebase
          </Button>
        )}
      </div>
    </main>
  );
}
