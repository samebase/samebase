import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

function parseQueryParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

export function RailwayOAuthCallback() {
  const finishRailwayOAuth = useAction(api.railwayOAuth.finishRailwayOAuth);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = parseQueryParams();
    const error = params.get("error");
    const errorDescription = params.get("error_description");
    const code = params.get("code");
    const state = params.get("state");

    window.history.replaceState({}, document.title, window.location.pathname);

    if (error) {
      setError(`Railway OAuth error: ${errorDescription ?? error}`);
      return;
    }

    if (!code || !state) {
      setError("Missing Railway OAuth response parameters.");
      return;
    }

    void finishRailwayOAuth({
      code,
      state,
    })
      .then(() => {
        if (window.opener) {
          try {
            window.opener.location.reload();
          } catch {
            window.opener.postMessage({ type: "railway-oauth-complete" }, "*");
          }
          window.close();
          return;
        }
        void navigate("/");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Railway OAuth failed.");
      });
  }, [finishRailwayOAuth, navigate]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      {error ? (
        <div className="text-center text-red-600">{error}</div>
      ) : (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <div>Connecting Railway...</div>
        </>
      )}
    </div>
  );
}
