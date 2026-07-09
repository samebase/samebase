import { signInWithAgentBrowserHandoffAction } from "@/authClient";
import { Button } from "@/components/ui/button";
import { consumeStoredAgentBrowserHandoff } from "@/lib/agentBrowserHandoffPrehydration";
import { resolvePageMetadata } from "@/lib/pageMetadata";
import { usePageMetadata } from "@/lib/usePageMetadata";
import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AGENT_BROWSER_HANDOFF_ROUTE } from "../../shared/agentBrowserHandoff";

type HandoffState = "connecting" | "missing" | "failed";

export function AgentsConnectRoutePage() {
  const { signIn } = useAuthActions();
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
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    const handoff = consumeStoredAgentBrowserHandoff();
    if (handoff === null) {
      setHandoffState("missing");
      return;
    }

    let active = true;
    void signInWithAgentBrowserHandoffAction({ signIn, token: handoff.token })
      .then(() => {
        window.location.replace(handoff.returnToPath);
      })
      .catch(() => {
        if (active) {
          setHandoffState("failed");
        }
      });

    return () => {
      active = false;
    };
  }, [signIn]);

  const message =
    handoffState === "connecting"
      ? "Connecting Samebase..."
      : handoffState === "missing"
        ? "Connection link unavailable."
        : "Connection link failed.";

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
              window.location.replace("/vault/");
            }}
          >
            Open Samebase
          </Button>
        )}
      </div>
    </main>
  );
}
