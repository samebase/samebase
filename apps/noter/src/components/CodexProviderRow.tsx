import { useAction, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  DaytonaPtyTerminal,
  type DaytonaPtySession,
} from "@/components/DaytonaPtyTerminal";
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
  const openCodexAuthPtySession = useAction(
    api.daytonaTerminal.openCodexAuthPtySession,
  );
  const resizeCodexAuthPtySession = useAction(
    api.daytonaTerminal.resizeCodexAuthPtySession,
  );
  const closeCodexAuthPtySession = useAction(
    api.daytonaTerminal.closeCodexAuthPtySession,
  );
  const [isPreparing, setIsPreparing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [terminalTabUrl, setTerminalTabUrl] = useState<string | null>(null);
  const [terminalSession, setTerminalSession] =
    useState<DaytonaPtySession | null>(null);
  const [terminalStatus, setTerminalStatus] = useState<
    "ready" | "needs_reauth" | "error" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const terminalSessionRef = useRef<DaytonaPtySession | null>(null);

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

  useEffect(() => {
    terminalSessionRef.current = terminalSession;
  }, [terminalSession]);

  useEffect(() => {
    return () => {
      const activeSession = terminalSessionRef.current;
      if (!activeSession) {
        return;
      }
      terminalSessionRef.current = null;
      void closeCodexAuthPtySession({
        sessionId: activeSession.sessionId,
      });
    };
  }, [closeCodexAuthPtySession]);

  const clearTerminalSessionState = () => {
    terminalSessionRef.current = null;
    setTerminalSession(null);
  };

  const closeActiveTerminalSession = async (silent?: boolean) => {
    const activeSession = terminalSessionRef.current;
    if (!activeSession) {
      return true;
    }
    clearTerminalSessionState();

    try {
      const result = await closeCodexAuthPtySession({
        sessionId: activeSession.sessionId,
      });
      if (result.ok) {
        return true;
      }
      terminalSessionRef.current = activeSession;
      setTerminalSession(activeSession);
      if (!silent) {
        setHasError(true);
        setMessage(
          result.message ?? "Failed to close Daytona terminal session.",
        );
      }
      return false;
    } catch (error) {
      terminalSessionRef.current = activeSession;
      setTerminalSession(activeSession);
      if (!silent) {
        setHasError(true);
        setMessage(
          error instanceof Error
            ? error.message
            : "Failed to close Daytona terminal session.",
        );
      }
      return false;
    }
  };

  const openTerminalSession = async (
    silent?: boolean,
  ): Promise<DaytonaPtySession | null> => {
    const isSilent = silent === true;
    const closedExistingSession = await closeActiveTerminalSession(true);
    if (!closedExistingSession) {
      return null;
    }

    try {
      const result = await openCodexAuthPtySession({});
      if (
        !result.ok ||
        !result.sessionId ||
        !result.webSocketUrl ||
        !result.previewToken
      ) {
        if (!isSilent) {
          setHasError(true);
          setMessage(result.message ?? "Failed to open Daytona terminal.");
        }
        return null;
      }

      const nextSession = {
        sessionId: result.sessionId,
        webSocketUrl: result.webSocketUrl,
        previewToken: result.previewToken,
        initialInput: result.initialInput,
      };
      terminalSessionRef.current = nextSession;
      setTerminalSession(nextSession);
      if (!isSilent) {
        setHasError(false);
        setMessage(result.message ?? "Terminal session ready.");
      }
      return nextSession;
    } catch (error) {
      if (!isSilent) {
        setHasError(true);
        setMessage(
          error instanceof Error
            ? error.message
            : "Failed to open Daytona terminal.",
        );
      }
      return null;
    }
  };

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
      setTerminalTabUrl(shouldShowTerminal ? result.terminalUrl ?? null : null);
      if (!shouldShowTerminal) {
        await closeActiveTerminalSession(true);
        return;
      }

      const nextSession = await openTerminalSession(true);
      if (!nextSession && !result.terminalUrl) {
        setHasError(true);
        setMessage("Failed to open Daytona terminal.");
      }
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
      if (terminalSession || terminalTabUrl) {
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
      const closedTerminal = await closeActiveTerminalSession(true);
      if (!closedTerminal) {
        setHasError(true);
        setMessage("Failed to close Daytona terminal session.");
        return;
      }
      const result = await disconnectCodexProvider({});
      if (!result.ok) {
        setHasError(true);
        setMessage(result.message ?? "Failed to disconnect Codex.");
        return;
      }
      setTerminalStatus(null);
      setTerminalTabUrl(null);
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
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
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
        <div className="flex w-full shrink-0 flex-col gap-2 self-start sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
          {isReady ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handlePrepare(true)}
                disabled={isPreparing || isVerifying || isDisconnecting}
                className="w-full sm:w-auto"
              >
                {isPreparing ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    Opening...
                  </>
                ) : (
                  "Reconnect in Daytona"
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleVerify()}
                disabled={isPreparing || isVerifying || isDisconnecting}
                className="w-full sm:w-auto"
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
                className="w-full sm:w-auto"
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
                className="w-full sm:w-auto"
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
                    className="w-full sm:w-auto"
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
                    className="w-full sm:w-auto"
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
      {terminalSession || terminalTabUrl ? (
        <div className="space-y-2 rounded-md border bg-muted/10 p-2">
          {terminalSession ? (
            <DaytonaPtyTerminal
              session={terminalSession}
              showHeader={false}
              allowInput={false}
              onResizeSession={(sessionId, cols, rows) => {
                void resizeCodexAuthPtySession({
                  sessionId,
                  cols,
                  rows,
                });
              }}
              onSessionError={(terminalMessage) => {
                setHasError(true);
                setMessage(terminalMessage);
              }}
              onSessionExit={(terminalMessage) => {
                setHasError(false);
                setMessage(terminalMessage);
              }}
            />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {terminalStatus === "error"
                ? "Codex could not be verified automatically. Finish the login and try Check login again."
                : "The device-auth login starts automatically here. Finish the browser step, then click Check login."}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {terminalTabUrl ? (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    window.open(
                      terminalTabUrl,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                  disabled={isPreparing || isVerifying || isDisconnecting}
                  className="h-auto px-0 text-xs"
                >
                  Open in tab
                </Button>
              ) : null}
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  void (async () => {
                    const closedSession = await closeActiveTerminalSession();
                    if (!closedSession) {
                      return;
                    }
                    setTerminalTabUrl(null);
                    setTerminalStatus(null);
                  })();
                }}
                disabled={isPreparing || isVerifying || isDisconnecting}
                className="h-auto px-0 text-xs"
              >
                Hide terminal
              </Button>
            </div>
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
