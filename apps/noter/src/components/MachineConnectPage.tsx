import { Button } from "@/components/ui/button";
import { ConnectedMachineHeartbeatLogSection } from "@/components/ConnectedMachineHeartbeatLog";
import { useNow } from "@/hooks/useNow";
import {
  formatConnectedMachineHeartbeatTimestamp,
  useConnectedMachineHeartbeatLog,
} from "@/lib/connectedMachineHeartbeatLog";
import {
  buildDirectNoterSyncConnectCommand,
  buildDirectNoterSyncRunCommand,
  buildNoterSyncScriptUrl,
  buildPublishedNoterSyncConnectCommand,
  buildPublishedNoterSyncRunCommand,
  readMachineConnectBootstrapSearch,
} from "@/lib/noterSync";
import {
  resolveAuthoritativeNow,
  resolveConnectedMachineStatus,
  resolveMachineRegistrationState,
} from "../../shared/connectedMachinePresence";
import { useMutation, useQuery } from "convex/react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import type { ConnectedMachineView } from "../../convex/connectedMachineModel";
import { api } from "../../convex/_generated/api";

type CopyableCommandBlockProps = {
  command: string;
  description: string;
  label: string;
};

type ConnectedMachineItem = ConnectedMachineView;

type MachineApprovalState =
  | {
      kind: "idle";
    }
  | {
      kind: "loading";
    }
  | {
      kind: "sign_in_required";
    }
  | {
      kind: "not_found";
    }
  | {
      kind: "pending";
      connectorVersion: string;
      displayName: string;
      expiresAt: number;
      hostname: string;
      machineId: string;
      os: "linux" | "macos" | "windows";
    }
  | {
      kind: "approved";
      connectorVersion: string;
      displayName: string;
      hostname: string;
      machineId: string;
      os: "linux" | "macos" | "windows";
    }
  | {
      kind: "expired";
      connectorVersion: string;
      displayName: string;
      expiresAt: number;
      hostname: string;
      machineId: string;
      os: "linux" | "macos" | "windows";
    };

type MachineConnectPageContentProps = {
  approvalError: string | null;
  connectedMachines: ConnectedMachineItem[];
  directConnectCommand: string;
  directRunCommand: string;
  heartbeatLog: string;
  isApproving: boolean;
  openedByCli: boolean;
  packageConnectCommand: string;
  packageRunCommand: string;
  requestState: MachineApprovalState;
  scriptUrl: string;
  testId?: string;
  onApprove?: () => void;
};

function resolveCurrentOrigin(): string {
  if (typeof window === "undefined") {
    return "https://noter.md";
  }

  return window.location.origin;
}

function CopyableCommandBlock({
  command,
  description,
  label,
}: CopyableCommandBlockProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  useEffect(() => {
    if (copyState !== "copied") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyState("idle");
    }, 1_500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copyState]);

  const handleCopyClick = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section className="corner-notch-1 border border-border p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-medium">{label}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleCopyClick()}
        >
          {copyState === "copied" ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copyState === "copied"
            ? "Copied"
            : copyState === "failed"
              ? "Copy failed"
              : "Copy"}
        </Button>
      </div>
      <code className="mt-4 block overflow-x-auto whitespace-pre-wrap break-all bg-muted/40 px-3 py-3 text-sm">
        {command}
      </code>
    </section>
  );
}

function renderMachineApprovalState(args: {
  directRunCommand: string;
  isApproving: boolean;
  onApprove?: () => void;
  packageRunCommand: string;
  requestState: MachineApprovalState;
}) {
  const machineSummary =
    args.requestState.kind === "pending" ||
    args.requestState.kind === "approved" ||
    args.requestState.kind === "expired"
      ? `${args.requestState.displayName} on ${args.requestState.hostname}`
      : null;

  switch (args.requestState.kind) {
    case "idle":
      return null;
    case "loading":
      return (
        <section className="corner-notch-1 border border-border p-4">
          <p className="text-sm text-muted-foreground">
            Checking this machine handoff.
          </p>
        </section>
      );
    case "sign_in_required":
      return (
        <section className="corner-notch-1 border border-border p-4">
          <p className="text-sm text-muted-foreground">
            Sign in to approve this machine from the browser handoff page.
          </p>
        </section>
      );
    case "not_found":
      return (
        <section className="corner-notch-1 border border-border p-4">
          <p className="text-sm text-muted-foreground">
            This machine handoff is missing or no longer available. Rerun the
            connect command from the terminal to start a fresh approval.
          </p>
        </section>
      );
    case "expired":
      return (
        <section className="corner-notch-1 border border-border p-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">{machineSummary}</p>
            <p className="text-sm text-muted-foreground">
              This approval window expired before the browser approved it. Rerun
              the connect command from the terminal to request a fresh handoff.
            </p>
          </div>
        </section>
      );
    case "pending":
      return (
        <section className="corner-notch-1 border border-border p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium">Approve this machine</p>
              <p className="text-sm text-muted-foreground">{machineSummary}</p>
              <p className="text-sm text-muted-foreground">
                Codex {args.requestState.connectorVersion} on{" "}
                {args.requestState.os}
              </p>
            </div>
            <Button
              onClick={args.onApprove}
              disabled={args.isApproving || !args.onApprove}
            >
              {args.isApproving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {args.isApproving ? "Approving..." : "Approve machine"}
            </Button>
          </div>
        </section>
      );
    case "approved":
      return (
        <section className="corner-notch-1 border border-border p-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Machine approved</p>
              <p className="text-sm text-muted-foreground">{machineSummary}</p>
              <p className="text-sm text-muted-foreground">
                The terminal can finish bootstrap now. Start the local connector
                with one of these commands to publish heartbeats from this
                machine.
              </p>
            </div>

            <CopyableCommandBlock
              label="Published package run"
              description="Use this once `@noter-md/sync` is published."
              command={args.packageRunCommand}
            />

            <CopyableCommandBlock
              label="Direct hosted file run"
              description="Use this today for prod, preview, or local deploy testing."
              command={args.directRunCommand}
            />
          </div>
        </section>
      );
  }
}

function ConnectedMachineList({
  machines,
}: {
  machines: ConnectedMachineItem[];
}) {
  if (machines.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Connected machines</h2>
        <p className="text-sm text-muted-foreground">
          Machine presence updates here once a local connector is running.
        </p>
      </div>
      <div className="grid gap-3">
        {machines.map((machine) => (
          <section
            key={machine.machineId}
            className="corner-notch-1 border border-border p-4"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">{machine.displayName}</p>
                <p className="text-sm text-muted-foreground">
                  {machine.hostname}
                </p>
                <p className="text-sm text-muted-foreground">
                  {machine.connectorVersion}
                </p>
                <p className="text-sm text-muted-foreground">
                  Last ping{" "}
                  {formatConnectedMachineHeartbeatTimestamp(machine.lastSeenAt)}
                </p>
              </div>
              <div className="text-sm font-medium">
                {machine.status === "online" ? "Online" : "Offline"}
              </div>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

export function MachineConnectPageContent({
  approvalError,
  connectedMachines,
  directConnectCommand,
  directRunCommand,
  heartbeatLog,
  isApproving,
  openedByCli,
  packageConnectCommand,
  packageRunCommand,
  requestState,
  scriptUrl,
  testId,
  onApprove,
}: MachineConnectPageContentProps) {
  return (
    <div className="container max-w-3xl py-6" data-testid={testId}>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Connected machine
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Connect this machine
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Run the connect command on the machine that already has Codex
            installed, then approve the browser handoff here.
          </p>
        </div>

        {connectedMachines.length > 0 ? (
          <ConnectedMachineHeartbeatLogSection heartbeatLog={heartbeatLog} />
        ) : null}

        {openedByCli ? (
          <section className="corner-notch-1 border border-border p-4">
            <p className="text-sm text-muted-foreground">
              The bootstrap already ran on this machine and opened the browser
              here.
            </p>
          </section>
        ) : null}

        {renderMachineApprovalState({
          directRunCommand,
          isApproving,
          onApprove,
          packageRunCommand,
          requestState,
        })}

        {approvalError ? (
          <section className="corner-notch-1 border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{approvalError}</p>
          </section>
        ) : null}

        <CopyableCommandBlock
          label="Published package connect"
          description="Use this once `@noter-md/sync` is published."
          command={packageConnectCommand}
        />

        <CopyableCommandBlock
          label="Direct hosted file connect"
          description="Use this today for prod, preview, or local deploy testing."
          command={directConnectCommand}
        />

        <p className="text-sm text-muted-foreground">
          <a
            href={scriptUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            Open <code>noter.js</code>
            <ExternalLink className="h-4 w-4" />
          </a>
        </p>

        <ConnectedMachineList machines={connectedMachines} />
      </div>
    </div>
  );
}

export function MachineConnectPage() {
  const location = useLocation();
  const [isApproving, setIsApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [machineRegistrationClockSync, setMachineRegistrationClockSync] =
    useState<{
      browserNowAtSync: number;
      requestId: string;
      serverNowAtSync: number;
    } | null>(null);
  const bootstrapSearch = readMachineConnectBootstrapSearch(location.search);
  const scriptUrl = buildNoterSyncScriptUrl(resolveCurrentOrigin());
  const connectedMachinesQuery = useQuery(
    api.connectedMachines.listConnectedMachines,
  );
  const now = useNow({
    enabled:
      Boolean(bootstrapSearch.requestId) ||
      (connectedMachinesQuery?.length ?? 0) > 0,
    intervalMs: 1_000,
  });
  const approveMachineRegistrationRequest = useMutation(
    api.connectedMachines.approveMachineRegistrationRequest,
  );
  const machineRegistrationRequest = useQuery(
    api.connectedMachines.getMachineRegistrationRequestForBrowser,
    bootstrapSearch.requestId
      ? { requestId: bootstrapSearch.requestId }
      : "skip",
  );
  const connectedMachines: ConnectedMachineItem[] = (
    connectedMachinesQuery ?? []
  )
    .map((machine) => ({
      ...machine,
      status: resolveConnectedMachineStatus({
        lastSeenAt: machine.lastSeenAt,
        now,
        status: machine.status,
      }),
    }))
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "online" ? -1 : 1;
      }
      if (left.lastSeenAt !== right.lastSeenAt) {
        return right.lastSeenAt - left.lastSeenAt;
      }
      return left.displayName.localeCompare(right.displayName);
    });
  const heartbeatLog = useConnectedMachineHeartbeatLog(connectedMachines);
  const pendingMachineRegistrationId =
    machineRegistrationRequest?.kind === "pending"
      ? machineRegistrationRequest.requestId
      : null;
  const pendingMachineRegistrationServerNow =
    machineRegistrationRequest?.kind === "pending"
      ? machineRegistrationRequest.serverNow
      : null;
  const machineRegistrationNow =
    pendingMachineRegistrationId &&
    typeof pendingMachineRegistrationServerNow === "number"
      ? resolveAuthoritativeNow({
          browserNow: now,
          browserNowAtSync:
            machineRegistrationClockSync?.requestId ===
            pendingMachineRegistrationId
              ? machineRegistrationClockSync.browserNowAtSync
              : now,
          serverNowAtSync:
            machineRegistrationClockSync?.requestId ===
            pendingMachineRegistrationId
              ? machineRegistrationClockSync.serverNowAtSync
              : pendingMachineRegistrationServerNow,
        })
      : now;

  useEffect(() => {
    setApprovalError(null);
    setIsApproving(false);
  }, [bootstrapSearch.requestId]);

  useEffect(() => {
    if (
      !pendingMachineRegistrationId ||
      typeof pendingMachineRegistrationServerNow !== "number"
    ) {
      setMachineRegistrationClockSync(null);
      return;
    }

    setMachineRegistrationClockSync({
      browserNowAtSync: Date.now(),
      requestId: pendingMachineRegistrationId,
      serverNowAtSync: pendingMachineRegistrationServerNow,
    });
  }, [pendingMachineRegistrationId, pendingMachineRegistrationServerNow]);

  const handleApprove = async () => {
    if (!bootstrapSearch.requestId || isApproving) {
      return;
    }

    setApprovalError(null);
    setIsApproving(true);
    try {
      await approveMachineRegistrationRequest({
        requestId: bootstrapSearch.requestId,
      });
    } catch (error) {
      setApprovalError(
        error instanceof Error ? error.message : "Could not approve machine.",
      );
    } finally {
      setIsApproving(false);
    }
  };

  const requestState: MachineApprovalState = (() => {
    if (!bootstrapSearch.requestId) {
      return {
        kind: "idle",
      };
    }

    if (machineRegistrationRequest === undefined) {
      return {
        kind: "loading",
      };
    }

    switch (machineRegistrationRequest.kind) {
      case "sign_in_required":
      case "not_found":
        return machineRegistrationRequest;
      case "expired":
        return machineRegistrationRequest;
      case "pending": {
        const state = resolveMachineRegistrationState({
          approvedAt: undefined,
          expiresAt: machineRegistrationRequest.expiresAt,
          now: machineRegistrationNow,
        });
        return state === "expired"
          ? {
              ...machineRegistrationRequest,
              kind: "expired",
            }
          : machineRegistrationRequest;
      }
      case "approved":
        return machineRegistrationRequest;
      default: {
        const unexpectedRequest: never = machineRegistrationRequest;
        throw new Error(
          `Unexpected machine registration request state: ${JSON.stringify(unexpectedRequest)}`,
        );
      }
    }
  })();

  return (
    <MachineConnectPageContent
      approvalError={approvalError}
      connectedMachines={connectedMachines}
      directConnectCommand={buildDirectNoterSyncConnectCommand(scriptUrl)}
      directRunCommand={buildDirectNoterSyncRunCommand(scriptUrl)}
      heartbeatLog={heartbeatLog}
      isApproving={isApproving}
      openedByCli={bootstrapSearch.openedByCli}
      onApprove={
        requestState.kind === "pending" ? () => void handleApprove() : undefined
      }
      packageConnectCommand={buildPublishedNoterSyncConnectCommand()}
      packageRunCommand={buildPublishedNoterSyncRunCommand()}
      requestState={requestState}
      scriptUrl={scriptUrl}
    />
  );
}
