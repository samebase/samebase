import { Button } from "@/components/ui/button";
import {
  buildDirectNoterSyncConnectCommand,
  buildPublishedNoterSyncConnectCommand,
  buildNoterSyncScriptUrl,
  readMachineConnectBootstrapSearch,
} from "@/lib/noterSync";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

type CopyableCommandBlockProps = {
  command: string;
  description: string;
  label: string;
};

type MachineConnectPageContentProps = {
  directCommand: string;
  openedByCli: boolean;
  packageCommand: string;
  scriptUrl: string;
  testId?: string;
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

export function MachineConnectPageContent({
  directCommand,
  openedByCli,
  packageCommand,
  scriptUrl,
  testId,
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
            Run one of these on the machine that already has Codex installed.
          </p>
        </div>

        {openedByCli ? (
          <section className="corner-notch-1 border border-border p-4">
            <p className="text-sm text-muted-foreground">
              The bootstrap already ran on this machine and opened the browser
              here.
            </p>
          </section>
        ) : null}

        <CopyableCommandBlock
          label="Published package"
          description="Use this once `@noter-md/sync` is published."
          command={packageCommand}
        />

        <CopyableCommandBlock
          label="Direct hosted file"
          description="Use this today for prod, preview, or local deploy testing."
          command={directCommand}
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
      </div>
    </div>
  );
}

export function MachineConnectPage() {
  const location = useLocation();
  const bootstrapSearch = readMachineConnectBootstrapSearch(location.search);
  const scriptUrl = buildNoterSyncScriptUrl(resolveCurrentOrigin());

  return (
    <MachineConnectPageContent
      directCommand={buildDirectNoterSyncConnectCommand(scriptUrl)}
      openedByCli={bootstrapSearch.openedByCli}
      packageCommand={buildPublishedNoterSyncConnectCommand()}
      scriptUrl={scriptUrl}
    />
  );
}
