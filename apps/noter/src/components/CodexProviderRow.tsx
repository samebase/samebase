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
import { DAYTONA_PAUSED } from "../../shared/daytonaPause";

const CodexProviderLogo = ({ className }: { className?: string }) => (
  <span className={clsx("inline-flex items-center justify-center", className)}>
    <img src={codexAppLogo} alt="" className="h-5 w-5" />
  </span>
);

export function CodexProviderRow() {
  const codexConnection = useQuery(api.users.getCodexConnectionStatus);
  const prepareCodexAuthSandbox = useAction(
    api.daytona.actions.prepareCodexAuthSandbox,
  );
  const verifyCodexLoginInSandbox = useAction(
    api.daytona.actions.verifyCodexLoginInSandbox,
  );
  const disconnectCodexProvider = useAction(
    api.daytona.actions.disconnectCodexProvider,
  );
  const openCodexAuthPtySession = useAction(
    api.daytona.terminal.openCodexAuthPtySession,
  );
  const resizeCodexAuthPtySession = useAction(
    api.daytona.terminal.resizeCodexAuthPtySession,
  );
  const closeCodexAuthPtySession = useAction(
    api.daytona.terminal.closeCodexAuthPtySession,
  );
  const [isPreparing, setIsPreparing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isClosingTerminal, setIsClosingTerminal] = useState(false);
  const [terminalTabUrl, setTerminalTabUrl] = useState<string | null>(null);
  const [terminalSession, setTerminalSession] =
    useState<DaytonaPtySession | null>(null);
  const [terminalStatus, setTerminalStatus] = useState<
    "ready" | "needs_reauth" | "error" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const terminalSessionRef = useRef<DaytonaPtySession | null>(null);
  const pendingTerminalClosePromiseRef = useRef<Promise<boolean> | null>(null);

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
      }).catch((error) => {
        console.warn("codex:pty:cleanup-close-failed", {
          sessionId: activeSession.sessionId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    };
  }, [closeCodexAuthPtySession]);

  const clearTerminalSessionState = () => {
    terminalSessionRef.current = null;
    setTerminalSession(null);
  };

  const closeActiveTerminalSession = async (silent?: boolean) => {
    const pendingClosePromise = pendingTerminalClosePromiseRef.current;
    if (pendingClosePromise) {
      return await pendingClosePromise;
    }
    const activeSession = terminalSessionRef.current;
    if (!activeSession) {
      return true;
    }
    const closePromise = (async () => {
      setIsClosingTerminal(true);
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
      } finally {
        pendingTerminalClosePromiseRef.current = null;
        setIsClosingTerminal(false);
      }
    })();
    pendingTerminalClosePromiseRef.current = closePromise;
    return await closePromise;
  };

  const openTerminalSession = async (
    silent?: boolean,
  ): Promise<DaytonaPtySession | null> => {
    const isSilent = silent === true;
    const pendingClosePromise = pendingTerminalClosePromiseRef.current;
    if (pendingClosePromise) {
      const closedPendingSession = await pendingClosePromise;
      if (!closedPendingSession) {
        throw new Error("Failed to close Daytona terminal session.");
      }
    }
    const closedExistingSession = await closeActiveTerminalSession(true);
    if (!closedExistingSession) {
      throw new Error("Failed to close Daytona terminal session.");
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
    if (isPreparing || isVerifying || isDisconnecting || isClosingTerminal) {
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
        const closedSession = await closeActiveTerminalSession(true);
        if (!closedSession) {
          setHasError(true);
          setMessage("Failed to close Daytona terminal session.");
          return;
        }
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
    if (isPreparing || isVerifying || isDisconnecting || isClosingTerminal) {
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
    if (isPreparing || isVerifying || isDisconnecting || isClosingTerminal) {
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

  if (DAYTONA_PAUSED) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 basis-[11rem] items-start gap-3">
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
        <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-2 self-start">
          {isReady ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handlePrepare(true)}
                disabled={
                  isPreparing ||
                  isVerifying ||
                  isDisconnecting ||
                  isClosingTerminal
                }
                className="h-auto max-w-full whitespace-normal py-2 text-left"
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
                disabled={
                  isPreparing ||
                  isVerifying ||
                  isDisconnecting ||
                  isClosingTerminal
                }
                className="h-auto max-w-full whitespace-normal py-2 text-left"
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
                disabled={
                  isPreparing ||
                  isVerifying ||
                  isDisconnecting ||
                  isClosingTerminal
                }
                className="h-auto max-w-full whitespace-normal py-2 text-left"
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
                disabled={
                  isPreparing ||
                  isVerifying ||
                  isDisconnecting ||
                  isClosingTerminal
                }
                className="h-auto max-w-full whitespace-normal py-2 text-left"
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
                    disabled={
                      isPreparing ||
                      isVerifying ||
                      isDisconnecting ||
                      isClosingTerminal
                    }
                    className="h-auto max-w-full whitespace-normal py-2 text-left"
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
                    disabled={
                      isPreparing ||
                      isVerifying ||
                      isDisconnecting ||
                      isClosingTerminal
                    }
                    className="h-auto max-w-full whitespace-normal py-2 text-left"
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
        <div
          className={clsx(
            "space-y-2 corner-notch-1 border bg-muted/10 p-2",
            terminalSession &&
              "max-sm:relative max-sm:left-1/2 max-sm:w-screen max-sm:-translate-x-1/2 max-sm:rounded-none max-sm:border-x-0 max-sm:px-0 max-sm:py-2",
          )}
        >
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
                }).catch((error) => {
                  console.warn("codex:pty:resize-failed", {
                    sessionId,
                    message:
                      error instanceof Error ? error.message : String(error),
                  });
                });
              }}
              onSessionError={(terminalMessage) => {
                setTerminalStatus("error");
                setHasError(true);
                setMessage(terminalMessage);
              }}
              onSessionExit={(terminalMessage) => {
                setHasError(false);
                setMessage(terminalMessage);
              }}
            />
          ) : null}
          <div className={clsx(terminalSession && "px-4 sm:px-0")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {terminalStatus === "error"
                  ? "Codex could not be verified automatically. Finish the login and try Check login again."
                  : terminalSession
                    ? "The device-auth login starts automatically here. Finish the browser step, then click Check login."
                    : "Open the Daytona terminal in a new tab to finish the device-auth login, then click Check login."}
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
                    disabled={
                      isPreparing ||
                      isVerifying ||
                      isDisconnecting ||
                      isClosingTerminal
                    }
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
                  disabled={
                    isPreparing ||
                    isVerifying ||
                    isDisconnecting ||
                    isClosingTerminal
                  }
                  className="h-auto px-0 text-xs"
                >
                  {isClosingTerminal ? "Hiding..." : "Hide terminal"}
                </Button>
              </div>
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
