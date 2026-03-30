import { Button } from "@/components/ui/button";
import {
  buildNoterSyncConnectCommand,
  buildNoterSyncScriptUrl,
  readMachineConnectBootstrapSearch,
} from "@/lib/noterSync";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

type MachineConnectPageContentProps = {
  command: string;
  deployOrigin: string;
  installationId: string | null;
  openedByCli: boolean;
  scriptUrl: string;
  sourceUrl: string | null;
  testId?: string;
};

function resolveCurrentOrigin(): string {
  if (typeof window === "undefined") {
    return "https://noter.md";
  }

  return window.location.origin;
}

/**
 * The CLI echoes its source URL back into the browser handoff so preview
 * installs stay pinned to the exact deploy that launched them.
 */
function resolveDeployOrigin(sourceUrl: string | null, fallbackOrigin: string) {
  if (!sourceUrl) {
    return fallbackOrigin;
  }

  try {
    return new URL(sourceUrl).origin;
  } catch {
    return fallbackOrigin;
  }
}

export function MachineConnectPageContent({
  command,
  deployOrigin,
  installationId,
  openedByCli,
  scriptUrl,
  sourceUrl,
  testId,
}: MachineConnectPageContentProps) {
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
            Run the command on the machine that already has Codex installed. The
            normal user path is just the published <code>@noter-md/sync</code>{" "}
            package, while this deploy still exposes its own single-file{" "}
            <code>noter.js</code> artifact below for preview and local testing.
          </p>
        </div>

        {openedByCli ? (
          <section className="corner-notch-1 border border-border p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <h2 className="text-sm font-medium">CLI handoff detected</h2>
                <p className="text-sm text-muted-foreground">
                  This page was opened by the local bootstrap command, so the
                  machine-side installer has already written its local state and
                  handed the browser back here.
                </p>
              </div>
              {installationId ? (
                <div className="break-all text-xs text-muted-foreground">
                  installation: {installationId}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="corner-notch-1 border border-border p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-medium">Install command</h2>
              <p className="text-sm text-muted-foreground">
                Copy the normal user command. It defaults to noter.md, so people
                do not need to think about deploy URLs.
              </p>
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

        <div className="grid gap-4 md:grid-cols-2">
          <section className="corner-notch-1 border border-border p-4">
            <h2 className="text-sm font-medium">Deploy origin</h2>
            <p className="mt-2 break-all text-sm text-muted-foreground">
              {deployOrigin}
            </p>
          </section>

          <section className="corner-notch-1 border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-medium">Installer source</h2>
              <a
                href={scriptUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Open
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            <p className="mt-2 break-all text-sm text-muted-foreground">
              {sourceUrl ?? scriptUrl}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Advanced path: download this single file directly when you want to
              test a preview or local implementation without publishing a new
              package first.
            </p>
          </section>
        </div>

        <section className="corner-notch-1 border border-border p-4">
          <h2 className="text-sm font-medium">What happens next</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The bootstrap checks that Codex is available, writes a local
            installation record keyed by the selected source URL, and then opens
            Noter back on this route so the browser can finish the machine
            registration flow.
          </p>
        </section>
      </div>
    </div>
  );
}

export function MachineConnectPage() {
  const location = useLocation();
  const bootstrapSearch = readMachineConnectBootstrapSearch(location.search);
  const currentOrigin = resolveCurrentOrigin();
  const deployOrigin = resolveDeployOrigin(
    bootstrapSearch.sourceUrl,
    currentOrigin,
  );
  const scriptUrl = buildNoterSyncScriptUrl(deployOrigin);

  return (
    <MachineConnectPageContent
      command={buildNoterSyncConnectCommand()}
      deployOrigin={deployOrigin}
      installationId={bootstrapSearch.installationId}
      openedByCli={bootstrapSearch.openedByCli}
      scriptUrl={scriptUrl}
      sourceUrl={bootstrapSearch.sourceUrl ?? scriptUrl}
    />
  );
}
