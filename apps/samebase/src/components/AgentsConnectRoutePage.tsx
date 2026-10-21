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

/**
The server cannot see the handoff fragment, so the page starts in "unread" and shows no status
until the browser has read the stored handoff. A server-rendered "Connecting Samebase..." would be
false for a visit without a handoff and would change in place after hydration.
*/
type HandoffState = "unread" | "connecting" | "missing" | "failed";

const messageByHandoffState = {
  connecting: "Connecting Samebase...",
  missing: "Connection link unavailable.",
  failed:
    "Connection link failed. If this browser is signed in to a different Samebase account, sign out and ask for a fresh link.",
};

export function AgentsConnectRoutePage() {
  const { setSession } = useAuthActions();
  const sessionRouteClient = useSessionRouteClient();
  const { isLoading: isAuthLoading } = useConvexAuth();
  const [handoffState, setHandoffState] = useState<HandoffState>("unread");
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

    setHandoffState("connecting");

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

  return (
    <main
      className="flex min-h-[60vh] items-center justify-center px-4"
      data-posthog-block
      data-testid="agents-connect-page"
    >
      {handoffState === "unread" ? null : (
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            {messageByHandoffState[handoffState]}
          </h1>
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
      )}
    </main>
  );
}
