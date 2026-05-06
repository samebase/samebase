import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { cn } from "../lib/utils";

interface CodespaceIframeProps {
  vaultId: Id<"vaults">;
  filePath?: string;
  className?: string;
  kioskMode?: boolean;
}

const IFRAME_LOAD_TIMEOUT_MS = 20_000;
const LOADING_INDICATOR_DELAY_MS = 500;
const IFRAME_SUSPICIOUS_QUICK_LOAD_MS = 600;

function buildCodespaceUrl(webUrl: string, filePath?: string): string {
  if (!filePath) {
    return webUrl;
  }

  const url = new URL(webUrl);
  const normalizedPath = filePath.startsWith("/")
    ? filePath
    : `/workspaces/${filePath}`;
  url.searchParams.set("file", normalizedPath);
  return url.toString();
}

export function CodespaceIframe({
  vaultId,
  filePath,
  className,
  kioskMode = false,
}: CodespaceIframeProps) {
  const codespace = useQuery(api.codespaces.mutations.getActiveCodespace, {
    vaultId,
  });
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeFailureReason, setIframeFailureReason] = useState<
    "error" | "timeout" | "csp_or_login" | null
  >(null);
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const loadAttemptStartedAtRef = useRef<number>(Date.now());

  const iframeUrl = useMemo(() => {
    if (!codespace?.webUrl) {
      return null;
    }
    return buildCodespaceUrl(codespace.webUrl, filePath);
  }, [codespace?.webUrl, filePath]);

  useEffect(() => {
    if (!iframeUrl) {
      return;
    }
    loadAttemptStartedAtRef.current = Date.now();
    setIframeLoaded(false);
    setIframeFailureReason(null);
  }, [iframeUrl, reloadNonce]);

  useEffect(() => {
    if (iframeLoaded || iframeFailureReason) {
      setShowLoadingIndicator(false);
      return;
    }

    const delayId = window.setTimeout(() => {
      setShowLoadingIndicator(true);
    }, LOADING_INDICATOR_DELAY_MS);

    return () => {
      window.clearTimeout(delayId);
    };
  }, [iframeLoaded, iframeFailureReason]);

  useEffect(() => {
    if (iframeLoaded || iframeFailureReason || !iframeUrl) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIframeFailureReason("timeout");
    }, IFRAME_LOAD_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [iframeLoaded, iframeFailureReason, iframeUrl, reloadNonce]);

  if (!codespace) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No Codespace available
          </p>
        </div>
      </div>
    );
  }

  if (codespace.state !== "running") {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center space-y-4">
          {codespace.state === "creating" ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
              <p className="text-sm text-muted-foreground">
                Creating Codespace...
              </p>
              <p className="text-xs text-muted-foreground">
                This may take 30-90 seconds
              </p>
            </>
          ) : codespace.state === "starting" ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
              <p className="text-sm text-muted-foreground">
                Starting Codespace...
              </p>
            </>
          ) : (
            <>
              <AlertCircle className="h-8 w-8 mx-auto text-amber-600" />
              <p className="text-sm text-muted-foreground">
                Codespace is {codespace.state}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!codespace.webUrl) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center space-y-4">
          <AlertCircle className="h-8 w-8 mx-auto text-amber-600" />
          <p className="text-sm text-muted-foreground">
            Codespace URL not available
          </p>
        </div>
      </div>
    );
  }

  if (!iframeUrl) {
    return null;
  }

  if (iframeFailureReason) {
    return (
      <div
        className={cn("flex items-center justify-center h-full p-4", className)}
      >
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="h-8 w-8 mx-auto text-red-600" />
          <p className="text-sm text-muted-foreground">
            {iframeFailureReason === "timeout" &&
              "Embedded Codespace timed out. Open it in a tab or retry the embed."}
            {iframeFailureReason === "csp_or_login" &&
              "GitHub sign-in cannot load inside an iframe. Open in a new tab to authenticate, then retry embed."}
            {iframeFailureReason === "error" &&
              "Unable to load embedded Codespace. You may need to re-authenticate with GitHub."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setReloadNonce((current) => current + 1);
              }}
            >
              Retry Embed
            </Button>
            <Button
              onClick={() => window.open(iframeUrl, "_blank")}
              variant="outline"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in New Tab
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden border bg-background",
        kioskMode ? "border-0 corner-notch-1" : "corner-notch-1",
        className,
      )}
    >
      {!iframeLoaded && showLoadingIndicator && (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
            <p className="text-sm text-muted-foreground">Loading VS Code...</p>
          </div>
        </div>
      )}
      <iframe
        key={`${iframeUrl}-${reloadNonce}`}
        src={iframeUrl}
        className="w-full h-full border-0"
        allow="clipboard-read; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
        title={kioskMode ? "GitHub Codespace Chat View" : "GitHub Codespace"}
        onLoad={() => {
          const elapsedMs = Date.now() - loadAttemptStartedAtRef.current;
          if (elapsedMs < IFRAME_SUSPICIOUS_QUICK_LOAD_MS) {
            setIframeFailureReason("csp_or_login");
            return;
          }
          setIframeLoaded(true);
        }}
        onError={() => setIframeFailureReason("error")}
      />
    </div>
  );
}
