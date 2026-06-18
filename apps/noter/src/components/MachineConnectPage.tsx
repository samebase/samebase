import { Button } from "@/components/ui/button";
import { ConnectedMachineHeartbeatLogSection } from "@/components/ConnectedMachineHeartbeatLog";
import { AppPageScrollShell } from "@/components/AppPageScrollShell";
import { Link, getRouteApi } from "@tanstack/react-router";
import { useNow } from "@/hooks/useNow";
import {
  formatConnectedMachineHeartbeatTimestamp,
  useConnectedMachineHeartbeatLog,
} from "@/lib/connectedMachineHeartbeatLog";
import {
  buildMachinesWorkspaceLinkOptions,
  buildDirectNoterSyncConnectCommand,
  buildDirectNoterSyncRunCommand,
  buildNoterSyncScriptUrl,
  buildPublishedNoterSyncConnectCommand,
  buildPublishedNoterSyncRunCommand,
} from "@/lib/noterSync";
import { type MachineConnectRouteSearch } from "@/routeSearch/machineConnect";
import {
  resolveAuthoritativeNow,
  resolveConnectedMachineStatus,
  resolveMachineRegistrationState,
} from "../../shared/connectedMachinePresence";
import { useMutation, useQuery } from "convex/react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import type { ConnectedMachineView } from "../../convex/connectedMachineModel";
import { api } from "../../convex/_generated/api";
import { MACHINE_CONNECT_ROUTE } from "@/lib/noterSync";

type CopyableCommandBlockProps = {
  command: string;
  description: string;
  label: string;
};

type DirectCommandVariant = CopyableCommandBlockProps;

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
  directConnectCommands: DirectCommandVariant[];
  directRunCommands: DirectCommandVariant[];
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

const CONNECTED_MACHINES_SECTION_ID = "connected-machines";
const machineConnectRouteApi = getRouteApi(MACHINE_CONNECT_ROUTE);

function resolveCurrentOrigin(): string {
  if (typeof window === "undefined") {
    return "https://noter.md";
  }

  return window.location.origin;
}

function LocalRequirementsSection() {
  return (
    <section className="corner-notch-1 border border-border p-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Local requirements</p>
        <p className="text-sm text-muted-foreground">
          These commands need <code>node</code> and the Codex CLI <code>codex</code> on your PATH.
          Check with <code>node --version</code> and <code>codex --version</code>. The direct
          hosted-file examples also need <code>curl</code>. On macOS/Linux, check with{" "}
          <code>curl --version</code>. In Windows PowerShell, check with{" "}
          <code>curl.exe --version</code> so the prerequisite matches the command below and bypasses
          the built-in <code>Invoke-WebRequest</code> alias.
        </p>
        <p className="text-sm text-muted-foreground">
          Mobile live control also needs <code>cloudflared</code> on your PATH. Check with{" "}
          <code>cloudflared --version</code>. Without it, the machine can still connect and publish
          presence, but Noter marks live control unavailable until the Cloudflare quick tunnel
          binary is installed.
        </p>
        <p className="text-sm text-muted-foreground">
          macOS: if you want <code>nvm</code>, use the official installer, then run{" "}
          <code>nvm install --lts</code>. The <code>nvm</code> project does not support
          Homebrew-installed <code>nvm</code>. macOS already ships with <code>curl</code>; if it is
          missing or too old, install it with <code>brew install curl</code>.
        </p>
        <p className="text-sm text-muted-foreground">
          Windows PowerShell: if <code>winget</code> is available, run{" "}
          <code>winget install --id OpenJS.NodeJS.LTS -e</code>. Recent Windows versions usually
          already include <code>curl.exe</code>; if yours does not, install curl with{" "}
          <code>winget</code> or another package manager. For mobile live control, install
          Cloudflare Tunnel with <code>winget install --id Cloudflare.cloudflared -e</code>.
        </p>
        <p className="text-sm text-muted-foreground">
          Linux: install Node.js with your preferred setup, then make sure the <code>curl</code>{" "}
          package is present too, for example <code>apt install curl</code> or{" "}
          <code>dnf install curl</code>.
        </p>
        <p className="text-sm text-muted-foreground">
          If you prefer an installer, use the current Node.js LTS download from{" "}
          <a
            href="https://nodejs.org/en/download"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 transition-colors hover:text-foreground"
          >
            nodejs.org
          </a>
          .
        </p>
        <p className="text-sm text-muted-foreground">
          If <code>codex</code> is missing, install the official Codex CLI with{" "}
          <code>npm install -g @openai/codex</code>. The Codex desktop app alone does not guarantee
          that the shell command exists on this machine, and OpenAI currently documents native
          Windows CLI support as experimental.
        </p>
      </div>
    </section>
  );
}

/**
 * Show both shell variants explicitly so the browser never has to guess which
 * command the operator wants to copy.
 */
function buildDirectCommandVariants(args: {
  action: "connect" | "run";
  scriptUrl: string;
}): DirectCommandVariant[] {
  const commandBuilder =
    args.action === "connect" ? buildDirectNoterSyncConnectCommand : buildDirectNoterSyncRunCommand;

  return [
    {
      command: commandBuilder(args.scriptUrl, "macos"),
      description: "Use this today in Terminal, zsh, bash, fish, or another Unix shell.",
      label: `Direct hosted file ${args.action} (Unix/macOS)`,
    },
    {
      command: commandBuilder(args.scriptUrl, "windows"),
      description:
        "Use this today in Windows PowerShell. `curl.exe` avoids the built-in `Invoke-WebRequest` alias. In Command Prompt, replace the single quotes with double quotes.",
      label: `Direct hosted file ${args.action} (Windows PowerShell)`,
    },
  ];
}

function CopyableCommandBlock({ command, description, label }: CopyableCommandBlockProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

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
        <Button variant="outline" size="sm" onClick={() => void handleCopyClick()}>
          {copyState === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}
        </Button>
      </div>
      <code className="mt-4 block overflow-x-auto whitespace-pre-wrap break-all bg-muted/40 px-3 py-3 font-mono text-xs leading-5 md:whitespace-pre md:break-normal">
        {command}
      </code>
    </section>
  );
}

function renderDirectCommandVariants(commandVariants: DirectCommandVariant[]): ReactElement[] {
  return commandVariants.map((commandVariant) => (
    <CopyableCommandBlock
      key={commandVariant.label}
      label={commandVariant.label}
      description={commandVariant.description}
      command={commandVariant.command}
    />
  ));
}

function renderMachineApprovalState(args: {
  directRunCommands: DirectCommandVariant[];
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
          <p className="text-sm text-muted-foreground">Checking this machine handoff.</p>
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
            This machine handoff is missing or no longer available. Rerun the connect command from
            the terminal to start a fresh approval.
          </p>
        </section>
      );
    case "expired":
      return (
        <section className="corner-notch-1 border border-border p-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">{machineSummary}</p>
            <p className="text-sm text-muted-foreground">
              This approval window expired before the browser approved it. Rerun the connect command
              from the terminal to request a fresh handoff.
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
                Codex {args.requestState.connectorVersion} on {args.requestState.os}
              </p>
            </div>
            <Button onClick={args.onApprove} disabled={args.isApproving || !args.onApprove}>
              {args.isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
                The terminal can finish bootstrap now. Start the local connector with one of these
                commands to publish heartbeats from this machine.
              </p>
            </div>

            <CopyableCommandBlock
              label="Published package run"
              description="Use this once `@noter-md/sync` is published."
              command={args.packageRunCommand}
            />

            {renderDirectCommandVariants(args.directRunCommands)}
          </div>
        </section>
      );
  }
}

function readMachineLiveControlSummary(machine: ConnectedMachineItem): {
  detail: string | null;
  label: string;
} {
  if (machine.controlStatus === "ready") {
    return {
      detail:
        typeof machine.controlUrlUpdatedAt === "number"
          ? `Published ${formatConnectedMachineHeartbeatTimestamp(machine.controlUrlUpdatedAt)}`
          : null,
      label: "Live control ready",
    };
  }

  if (machine.controlStatus === "starting") {
    return {
      detail: machine.controlStatusDetail ?? null,
      label: "Starting live control",
    };
  }

  if (machine.controlStatus === "unavailable") {
    return {
      detail: machine.controlStatusDetail ?? null,
      label: "Live control unavailable",
    };
  }

  return {
    detail: null,
    label: "Presence only",
  };
}

function ConnectedMachineList({ machines }: { machines: ConnectedMachineItem[] }) {
  if (machines.length === 0) {
    return null;
  }

  return (
    <section
      data-route-url-hash-suggestion={CONNECTED_MACHINES_SECTION_ID}
      id={CONNECTED_MACHINES_SECTION_ID}
      className="space-y-3"
    >
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Connected machines</h2>
        <p className="text-sm text-muted-foreground">
          Machine presence updates here once a local connector is running.
        </p>
      </div>
      <div className="grid gap-3">
        {machines.map((machine) => {
          const liveControl = readMachineLiveControlSummary(machine);

          return (
            <section key={machine.machineId} className="corner-notch-1 border border-border p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{machine.displayName}</p>
                  <p className="text-sm text-muted-foreground">{machine.hostname}</p>
                  <p className="text-sm text-muted-foreground">{machine.connectorVersion}</p>
                  <p className="text-sm text-muted-foreground">
                    Last ping {formatConnectedMachineHeartbeatTimestamp(machine.lastSeenAt)}
                  </p>
                  <p className="text-sm text-muted-foreground">{liveControl.label}</p>
                  {liveControl.detail ? (
                    <p className="text-sm text-muted-foreground">{liveControl.detail}</p>
                  ) : null}
                </div>
                <div className="text-sm font-medium">
                  <div>{machine.status === "online" ? "Online" : "Offline"}</div>
                  {machine.status === "online" && machine.controlStatus === "ready" ? (
                    <Button asChild className="mt-3" size="sm">
                      <Link
                        {...buildMachinesWorkspaceLinkOptions({
                          machineId: machine.machineId,
                        })}
                      >
                        Open threads
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

export function MachineConnectPageContent({
  approvalError,
  connectedMachines,
  directConnectCommands,
  directRunCommands,
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
  const connectedMachinesAnchor = `#${CONNECTED_MACHINES_SECTION_ID}`;

  return (
    <div className="container max-w-3xl py-6" data-testid={testId}>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Connected machine
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Connect this machine</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Run the connect command on the machine that already has Node.js and the Codex CLI on
            PATH, then approve the browser handoff here.
          </p>
        </div>

        <section className="corner-notch-1 border border-border p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Your machine list lives on this page</p>
              <p className="text-sm text-muted-foreground">
                Once <code>noter-sync run</code> is publishing heartbeats, scroll down to Connected
                machines here to open live control.
              </p>
            </div>
            {connectedMachines.length > 0 ? (
              <Button asChild variant="outline" size="sm">
                <a href={connectedMachinesAnchor}>Jump to connected machines</a>
              </Button>
            ) : null}
          </div>
        </section>

        <LocalRequirementsSection />

        {connectedMachines.length > 0 ? (
          <ConnectedMachineHeartbeatLogSection heartbeatLog={heartbeatLog} />
        ) : null}

        {openedByCli ? (
          <section className="corner-notch-1 border border-border p-4">
            <p className="text-sm text-muted-foreground">
              The bootstrap already ran on this machine and opened the browser here.
            </p>
          </section>
        ) : null}

        {renderMachineApprovalState({
          directRunCommands,
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

        {renderDirectCommandVariants(directConnectCommands)}

        <p className="text-sm text-muted-foreground">
          <a
            href={scriptUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            Open <code>noter.ts</code>
            <ExternalLink className="h-4 w-4" />
          </a>
        </p>

        <ConnectedMachineList machines={connectedMachines} />
      </div>
    </div>
  );
}

export function MachineConnectPage() {
  const routeSearch = machineConnectRouteApi.useSearch();
  const [isApproving, setIsApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [machineRegistrationClockSync, setMachineRegistrationClockSync] = useState<{
    browserNowAtSync: number;
    requestId: string;
    serverNowAtSync: number;
  } | null>(null);
  const bootstrapSearch = {
    openedByCli: routeSearch.openedByCli ?? false,
    requestId: routeSearch.requestId ?? null,
  } satisfies {
    openedByCli: boolean;
    requestId: MachineConnectRouteSearch["requestId"] | null;
  };
  const scriptUrl = buildNoterSyncScriptUrl(resolveCurrentOrigin());
  const connectedMachinesQuery = useQuery(api.connectedMachines.listConnectedMachines);
  const now = useNow({
    enabled: Boolean(bootstrapSearch.requestId) || (connectedMachinesQuery?.length ?? 0) > 0,
    intervalMs: 1_000,
  });
  const approveMachineRegistrationRequest = useMutation(
    api.connectedMachines.approveMachineRegistrationRequest,
  );
  const machineRegistrationRequest = useQuery(
    api.connectedMachines.getMachineRegistrationRequestForBrowser,
    bootstrapSearch.requestId ? { requestId: bootstrapSearch.requestId } : "skip",
  );
  // Preserve the backend order from `connectedMachinesQuery`; this map only
  // derives the displayed status with `resolveConnectedMachineStatus(now, ...)`
  // and must not re-sort `connectedMachines` on the client.
  const connectedMachines: ConnectedMachineItem[] = (connectedMachinesQuery ?? []).map(
    (machine) => ({
      ...machine,
      status: resolveConnectedMachineStatus({
        lastSeenAt: machine.lastSeenAt,
        now,
        status: machine.status,
      }),
    }),
  );
  const heartbeatLog = useConnectedMachineHeartbeatLog(connectedMachines);
  const pendingMachineRegistrationId =
    machineRegistrationRequest?.kind === "pending" ? machineRegistrationRequest.requestId : null;
  const pendingMachineRegistrationServerNow =
    machineRegistrationRequest?.kind === "pending" ? machineRegistrationRequest.serverNow : null;
  const machineRegistrationNow =
    pendingMachineRegistrationId && typeof pendingMachineRegistrationServerNow === "number"
      ? resolveAuthoritativeNow({
          browserNow: now,
          browserNowAtSync:
            machineRegistrationClockSync?.requestId === pendingMachineRegistrationId
              ? machineRegistrationClockSync.browserNowAtSync
              : now,
          serverNowAtSync:
            machineRegistrationClockSync?.requestId === pendingMachineRegistrationId
              ? machineRegistrationClockSync.serverNowAtSync
              : pendingMachineRegistrationServerNow,
        })
      : now;

  useEffect(() => {
    setApprovalError(null);
    setIsApproving(false);
  }, [bootstrapSearch.requestId]);

  useEffect(() => {
    if (!pendingMachineRegistrationId || typeof pendingMachineRegistrationServerNow !== "number") {
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
      setApprovalError(error instanceof Error ? error.message : "Could not approve machine.");
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
    <AppPageScrollShell>
      <MachineConnectPageContent
        approvalError={approvalError}
        connectedMachines={connectedMachines}
        directConnectCommands={buildDirectCommandVariants({
          action: "connect",
          scriptUrl,
        })}
        directRunCommands={buildDirectCommandVariants({
          action: "run",
          scriptUrl,
        })}
        heartbeatLog={heartbeatLog}
        isApproving={isApproving}
        openedByCli={bootstrapSearch.openedByCli}
        onApprove={requestState.kind === "pending" ? () => void handleApprove() : undefined}
        packageConnectCommand={buildPublishedNoterSyncConnectCommand()}
        packageRunCommand={buildPublishedNoterSyncRunCommand()}
        requestState={requestState}
        scriptUrl={scriptUrl}
      />
    </AppPageScrollShell>
  );
}
