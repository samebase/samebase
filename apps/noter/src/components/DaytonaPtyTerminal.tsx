import { useEffect, useRef, useState } from "react";
import type { FitAddon as XTermFitAddon } from "@xterm/addon-fit";
import type { Terminal as XTermTerminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { cn } from "@/lib/utils";
import {
  buildAuthenticatedDaytonaPtyUrl,
  DAYTONA_PTY_PROMPT_WAKEUP_INPUT,
  DAYTONA_PTY_WEBSOCKET_PROTOCOL,
  hasDaytonaPtyInitialOutput,
  parseDaytonaPtyControlMessage,
  resolveDaytonaPtyCloseOutcome,
  shouldWakeDaytonaPtyPrompt,
} from "@/lib/daytonaPty";

export type DaytonaPtySession = {
  sessionId: string;
  webSocketUrl: string;
  previewToken: string;
  sandboxId?: string;
  initialInput?: string;
  initialOutput?: string;
};

export type DaytonaPtyConnectionState =
  | "connecting"
  | "connected"
  | "closed"
  | "error";

interface DaytonaPtyTerminalProps {
  session: DaytonaPtySession;
  className?: string;
  title?: string;
  showHeader?: boolean;
  allowInput?: boolean;
  onResizeSession: (sessionId: string, cols: number, rows: number) => void;
  onSessionError?: (message: string) => void;
  onSessionExit?: (message: string) => void;
  onConnectionStateChange?: (
    state: DaytonaPtyConnectionState,
    statusMessage: string,
  ) => void;
}

export function DaytonaPtyTerminal({
  session,
  className,
  title = "Daytona Terminal (xterm)",
  showHeader = true,
  allowInput = true,
  onResizeSession,
  onSessionError,
  onSessionExit,
  onConnectionStateChange,
}: DaytonaPtyTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onResizeSessionRef = useRef(onResizeSession);
  const onSessionErrorRef = useRef(onSessionError);
  const onSessionExitRef = useRef(onSessionExit);
  const onConnectionStateChangeRef = useRef(onConnectionStateChange);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const [connectionState, setConnectionState] =
    useState<DaytonaPtyConnectionState>("connecting");
  const [statusMessage, setStatusMessage] = useState("Connecting to Daytona…");

  useEffect(() => {
    onResizeSessionRef.current = onResizeSession;
  }, [onResizeSession]);

  useEffect(() => {
    onSessionErrorRef.current = onSessionError;
  }, [onSessionError]);

  useEffect(() => {
    onSessionExitRef.current = onSessionExit;
  }, [onSessionExit]);

  useEffect(() => {
    onConnectionStateChangeRef.current = onConnectionStateChange;
  }, [onConnectionStateChange]);

  useEffect(() => {
    onConnectionStateChangeRef.current?.(connectionState, statusMessage);
  }, [connectionState, statusMessage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    lastSizeRef.current = null;
    setConnectionState("connecting");
    setStatusMessage("Connecting to Daytona…");

    let isDisposed = false;
    let sessionErrorReported = false;
    let resizeObserver: ResizeObserver | null = null;
    let dataDisposable: { dispose: () => void } | null = null;
    let socket: WebSocket | null = null;
    let terminal: XTermTerminal | null = null;
    let fitAddon: XTermFitAddon | null = null;
    let initialInputTimeout: number | null = null;
    let promptWakeupTimeout: number | null = null;

    const textDecoder = new TextDecoder();
    const textEncoder = new TextEncoder();
    const resizeTimeoutIds = new Set<number>();
    const initialOutput =
      typeof session.initialOutput === "string" ? session.initialOutput : "";
    const shouldWakePrompt = shouldWakeDaytonaPtyPrompt({
      allowInput,
      initialInput: session.initialInput,
      initialOutput,
    });

    const reportSessionError = (message: string) => {
      if (isDisposed || sessionErrorReported) {
        return;
      }
      sessionErrorReported = true;
      onSessionErrorRef.current?.(message);
    };

    const sendResize = () => {
      if (isDisposed) {
        return;
      }
      if (terminal === null) {
        return;
      }
      if (fitAddon === null) {
        return;
      }
      const activeTerminal = terminal;
      fitAddon.fit();
      const cols = activeTerminal.cols;
      const rows = activeTerminal.rows;
      const previous = lastSizeRef.current;
      if (previous?.cols === cols && previous.rows === rows) {
        return;
      }
      lastSizeRef.current = { cols, rows };
      onResizeSessionRef.current(session.sessionId, cols, rows);
    };

    const queueResize = () => {
      const timeoutId = window.setTimeout(() => {
        resizeTimeoutIds.delete(timeoutId);
        sendResize();
      }, 0);
      resizeTimeoutIds.add(timeoutId);
    };

    let sawTerminalPayload = hasDaytonaPtyInitialOutput(initialOutput);
    let initialInputSent = false;

    const cancelPromptWakeup = () => {
      if (promptWakeupTimeout !== null) {
        window.clearTimeout(promptWakeupTimeout);
        promptWakeupTimeout = null;
      }
    };

    const markTerminalPayloadReceived = () => {
      sawTerminalPayload = true;
      cancelPromptWakeup();
    };

    const schedulePromptWakeup = () => {
      if (
        !shouldWakePrompt ||
        sawTerminalPayload ||
        promptWakeupTimeout !== null
      ) {
        return;
      }
      if (socket === null) {
        return;
      }
      const activeSocket = socket;
      promptWakeupTimeout = window.setTimeout(() => {
        promptWakeupTimeout = null;
        if (
          isDisposed ||
          sawTerminalPayload ||
          activeSocket.readyState !== WebSocket.OPEN
        ) {
          return;
        }
        activeSocket.send(textEncoder.encode(DAYTONA_PTY_PROMPT_WAKEUP_INPUT));
      }, 250);
    };

    // React Router prerender evaluates route modules on the server, so xterm
    // must stay behind the client-only effect boundary.
    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")])
      .then(([{ Terminal }, { FitAddon }]) => {
        if (isDisposed) {
          return;
        }

        terminal = new Terminal({
          disableStdin: !allowInput,
          cursorBlink: true,
          fontFamily:
            '"SF Mono", "Cascadia Code", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
          fontSize: 13,
          lineHeight: 1.25,
          scrollback: 3000,
          theme: {
            background: "#0b1220",
            foreground: "#e2e8f0",
            cursor: "#f8fafc",
            cursorAccent: "#0b1220",
            selectionBackground: "rgba(148, 163, 184, 0.28)",
            black: "#0f172a",
            red: "#f87171",
            green: "#4ade80",
            yellow: "#fbbf24",
            blue: "#60a5fa",
            magenta: "#c084fc",
            cyan: "#22d3ee",
            white: "#e2e8f0",
            brightBlack: "#475569",
            brightRed: "#fca5a5",
            brightGreen: "#86efac",
            brightYellow: "#fcd34d",
            brightBlue: "#93c5fd",
            brightMagenta: "#d8b4fe",
            brightCyan: "#67e8f9",
            brightWhite: "#f8fafc",
          },
        });
        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(container);
        if (hasDaytonaPtyInitialOutput(initialOutput)) {
          terminal.write(initialOutput);
        }

        resizeObserver = new ResizeObserver(() => {
          queueResize();
        });
        resizeObserver.observe(container);

        const authenticatedUrl = buildAuthenticatedDaytonaPtyUrl({
          webSocketUrl: session.webSocketUrl,
          previewToken: session.previewToken,
        });
        socket = new WebSocket(
          authenticatedUrl,
          DAYTONA_PTY_WEBSOCKET_PROTOCOL,
        );
        socket.binaryType = "arraybuffer";
        const activeSocket = socket;
        const activeTerminal = terminal;

        dataDisposable = allowInput
          ? activeTerminal.onData((data) => {
              cancelPromptWakeup();
              if (activeSocket.readyState !== WebSocket.OPEN) {
                return;
              }
              activeSocket.send(textEncoder.encode(data));
            })
          : null;

        activeSocket.addEventListener("message", (event) => {
          if (isDisposed) {
            return;
          }
          if (typeof event.data === "string") {
            const controlMessage = parseDaytonaPtyControlMessage(event.data);
            if (controlMessage?.type === "control") {
              if (controlMessage.status === "connected") {
                setConnectionState("connected");
                setStatusMessage("Connected");
                if (
                  !initialInputSent &&
                  typeof session.initialInput === "string" &&
                  session.initialInput.length > 0 &&
                  activeSocket.readyState === WebSocket.OPEN
                ) {
                  initialInputSent = true;
                  initialInputTimeout = window.setTimeout(() => {
                    if (
                      isDisposed ||
                      activeSocket.readyState !== WebSocket.OPEN
                    ) {
                      return;
                    }
                    activeSocket.send(
                      textEncoder.encode(session.initialInput ?? ""),
                    );
                  }, 200);
                }
                schedulePromptWakeup();
                queueResize();
                return;
              }

              const message =
                controlMessage.error ?? "Daytona terminal connection failed.";
              setConnectionState("error");
              setStatusMessage(message);
              activeTerminal.writeln(`\r\n[terminal error] ${message}`);
              reportSessionError(message);
              return;
            }

            markTerminalPayloadReceived();
            activeTerminal.write(event.data);
            return;
          }

          if (event.data instanceof ArrayBuffer) {
            markTerminalPayloadReceived();
            activeTerminal.write(
              textDecoder.decode(new Uint8Array(event.data), { stream: true }),
            );
          }
        });

        activeSocket.addEventListener("error", () => {
          if (isDisposed) {
            return;
          }
          setConnectionState("error");
          setStatusMessage("Terminal connection error.");
          reportSessionError("Terminal connection error.");
        });

        activeSocket.addEventListener("close", (event) => {
          if (isDisposed) {
            return;
          }
          const trailingText = textDecoder.decode();
          if (trailingText.length > 0) {
            activeTerminal.write(trailingText);
          }
          const { message, state } = resolveDaytonaPtyCloseOutcome({
            eventCode: event.code,
            rawReason: event.reason,
          });
          const nextState: DaytonaPtyConnectionState = state;
          setConnectionState(nextState);
          setStatusMessage(message);
          activeTerminal.writeln(`\r\n[session ended] ${message}`);
          if (nextState === "error") {
            reportSessionError(message);
            return;
          }
          onSessionExitRef.current?.(message);
        });

        queueResize();
      })
      .catch((error: unknown) => {
        if (isDisposed) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : "Daytona terminal failed to initialize.";
        setConnectionState("error");
        setStatusMessage(message);
        reportSessionError(message);
      });

    return () => {
      isDisposed = true;
      if (initialInputTimeout !== null) {
        window.clearTimeout(initialInputTimeout);
      }
      if (promptWakeupTimeout !== null) {
        window.clearTimeout(promptWakeupTimeout);
      }
      for (const timeoutId of resizeTimeoutIds) {
        window.clearTimeout(timeoutId);
      }
      resizeTimeoutIds.clear();
      resizeObserver?.disconnect();
      dataDisposable?.dispose();
      socket?.close();
      terminal?.dispose();
    };
  }, [
    allowInput,
    session.initialInput,
    session.initialOutput,
    session.previewToken,
    session.sessionId,
    session.webSocketUrl,
  ]);

  return (
    <div
      className={cn(
        "overflow-hidden corner-notch-1 border border-slate-800 bg-slate-950 text-slate-100 shadow-sm",
        className,
      )}
    >
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/80 px-3 py-2 text-xs">
          <span className="font-medium text-slate-200">{title}</span>
          <span
            className={cn(
              "corner-notch-1 px-2 py-0.5 text-[11px]",
              connectionState === "connected"
                ? "bg-emerald-500/15 text-emerald-300"
                : connectionState === "error"
                  ? "bg-rose-500/15 text-rose-300"
                  : connectionState === "closed"
                    ? "bg-slate-500/15 text-slate-300"
                    : "bg-amber-500/15 text-amber-300",
            )}
          >
            {statusMessage}
          </span>
        </div>
      ) : null}
      <div
        ref={containerRef}
        className="h-[360px] w-full overflow-hidden bg-slate-950 px-2 py-1"
      />
    </div>
  );
}
