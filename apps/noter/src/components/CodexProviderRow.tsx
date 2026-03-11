import { useAction, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { clsx } from "clsx";
import codexAppLogo from "@/assets/codex-app.png";

const CodexProviderLogo = ({ className }: { className?: string }) => (
  <span className={clsx("inline-flex items-center justify-center", className)}>
    <img src={codexAppLogo} alt="" className="h-5 w-5 rounded-[6px]" />
  </span>
);

export function CodexProviderRow() {
  const codexConnection = useQuery(api.users.getCodexConnectionStatus);
  const prepareCodexAuthSandbox = useAction(
    api.daytonaActions.prepareCodexAuthSandbox,
  );
  const verifyCodexLoginInSandbox = useAction(
    api.daytonaActions.verifyCodexLoginInSandbox,
  );
  const disconnectCodexProvider = useAction(
    api.daytonaActions.disconnectCodexProvider,
  );
  const [isPreparing, setIsPreparing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [terminalUrl, setTerminalUrl] = useState<string | null>(null);
  const [terminalStatus, setTerminalStatus] = useState<
    "ready" | "needs_reauth" | "error" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  const isReady =
    codexConnection?.connected === true &&
    codexConnection.lastCheckStatus === "ready";
  const needsReauth =
    codexConnection?.connected === true &&
    codexConnection.lastCheckStatus !== "ready";
  const connectLabel = needsReauth
    ? "Reconnect in Daytona"
    : "Connect in Daytona";
  const status = !codexConnection?.connected
    ? "Not connected in Daytona"
    : isReady
      ? "Ready in Daytona"
      : codexConnection.lastCheckStatus === "error"
        ? codexConnection.lastError?.trim() || "Daytona auth sandbox error"
        : "Login missing or expired";

  const handlePrepare = async (forceOpenTerminal: boolean) => {
    if (isPreparing || isVerifying || isDisconnecting) {
      return;
    }
    setIsPreparing(true);
    setMessage(null);
    setHasError(false);

    try {
      const result = await prepareCodexAuthSandbox({
        openTerminal: forceOpenTerminal,
      });
      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Failed to prepare Codex in Daytona.");
        return;
      }
      setMessage(result.message ?? "Codex auth sandbox is ready.");
      const shouldShowTerminal =
        forceOpenTerminal || result.lastCheckStatus !== "ready";
      setTerminalStatus(
        shouldShowTerminal ? result.lastCheckStatus ?? null : null,
      );
      setTerminalUrl(shouldShowTerminal ? result.terminalUrl ?? null : null);
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to prepare Codex in Daytona.",
      );
    } finally {
      setIsPreparing(false);
    }
  };

  const handleVerify = async () => {
    if (isPreparing || isVerifying || isDisconnecting) {
      return;
    }
    setIsVerifying(true);
    setMessage(null);
    setHasError(false);

    try {
      const result = await verifyCodexLoginInSandbox({});
      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Failed to verify Codex login.");
        return;
      }
      setHasError(result.lastCheckStatus === "error");
      if (terminalUrl) {
        setTerminalStatus(result.lastCheckStatus ?? null);
      }
      setMessage(result.message ?? "Codex login checked.");
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to verify Codex login.",
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    if (isPreparing || isVerifying || isDisconnecting) {
      return;
    }
    setIsDisconnecting(true);
    setMessage(null);
    setHasError(false);

    try {
      const result = await disconnectCodexProvider({});
      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Failed to disconnect Codex.");
        return;
      }
      setTerminalStatus(null);
      setTerminalUrl(null);
      setMessage(result.message ?? "Codex disconnected from Daytona.");
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error ? error.message : "Failed to disconnect Codex.",
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-5 w-11 shrink-0 items-center justify-center">
            <CodexProviderLogo className="max-h-full max-w-full" />
          </div>
          <div className="min-w-0 text-left">
            <div className="text-sm font-medium">Codex</div>
            <div className="break-words text-xs leading-5 text-muted-foreground">
              {status}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 self-start">
          {isReady ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handlePrepare(true)}
                disabled={isPreparing || isVerifying || isDisconnecting}
              >
                {isPreparing ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    Opening...
                  </>
                ) : (
                  "Open terminal"
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleVerify()}
                disabled={isPreparing || isVerifying || isDisconnecting}
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    Checking...
                  </>
                ) : (
                  "Check login"
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDisconnect()}
                disabled={isPreparing || isVerifying || isDisconnecting}
              >
                {isDisconnecting ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  "Disconnect"
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handlePrepare(false)}
                disabled={isPreparing || isVerifying || isDisconnecting}
              >
                {isPreparing ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    Preparing...
                  </>
                ) : (
                  connectLabel
                )}
              </Button>
              {needsReauth ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleVerify()}
                    disabled={isPreparing || isVerifying || isDisconnecting}
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      "Check login"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDisconnect()}
                    disabled={isPreparing || isVerifying || isDisconnecting}
                  >
                    {isDisconnecting ? (
                      <>
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        Disconnecting...
                      </>
                    ) : (
                      "Disconnect"
                    )}
                  </Button>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
      {terminalUrl ? (
        <div className="overflow-hidden rounded-md border bg-muted/10">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-2 py-1 text-xs text-muted-foreground">
            <span>Daytona Terminal (iframe)</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTerminalUrl(null);
                setTerminalStatus(null);
              }}
              disabled={isPreparing || isVerifying || isDisconnecting}
            >
              Hide terminal
            </Button>
          </div>
          <iframe
            title="Codex Daytona Terminal"
            src={terminalUrl}
            className="h-[360px] w-full bg-white"
            allow="clipboard-read; clipboard-write"
            referrerPolicy="no-referrer"
          />
          <div className="px-2 py-1 text-xs text-muted-foreground">
            {terminalStatus === "ready"
              ? "Codex is already logged in. Use this terminal for manual Codex commands."
              : terminalStatus === "error"
                ? "Codex could not be verified automatically. Inspect the terminal, then try Check login again."
                : "Run codex login --device-auth here, finish the browser step, then click Check login."}
          </div>
        </div>
      ) : null}
      {message ? (
        <div
          className={clsx(
            "text-xs",
            hasError ? "text-red-600" : "text-muted-foreground",
          )}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}
