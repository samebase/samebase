import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";
import { Button } from "./ui/button";
import { ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { cn } from "../lib/utils";

interface CodespaceIframeProps {
  vaultId: Id<"vaults">;
  filePath?: string;
  className?: string;
}

export function CodespaceIframe({
  vaultId,
  filePath,
  className,
}: CodespaceIframeProps) {
  const codespace = useQuery(api.codespacesMutations.getActiveCodespace, { vaultId });
  const [iframeError, setIframeError] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

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

  // Construct GitHub Codespace web URL with optional file path
  // Format: https://{codespace-name}.github.dev
  // Add file path if specified: ?file=/workspaces/repo/path/to/file.ts
  let iframeUrl = codespace.webUrl;
  if (filePath) {
    // GitHub Codespace URLs accept ?file parameter for opening specific files
    const workspaceFolder = codespace.webUrl.split("-")[0]; // Extract repo name from URL
    iframeUrl += `?file=/workspaces/${filePath}`;
  }

  if (iframeError) {
    return (
      <div className={cn("flex items-center justify-center h-full p-4", className)}>
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="h-8 w-8 mx-auto text-red-600" />
          <p className="text-sm text-muted-foreground">
            Unable to load Codespace. You may need to re-authenticate with
            GitHub.
          </p>
          <Button onClick={() => window.open(iframeUrl, "_blank")} variant="outline">
            <ExternalLink className="h-4 w-4 mr-2" />
            Open in New Tab
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full", className)}>
      {!iframeLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
            <p className="text-sm text-muted-foreground">
              Loading VS Code...
            </p>
          </div>
        </div>
      )}
      <iframe
        src={iframeUrl}
        className="w-full h-full border-0"
        allow="clipboard-read; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"
        title="GitHub Codespace"
        onLoad={() => setIframeLoaded(true)}
        onError={() => setIframeError(true)}
      />
    </div>
  );
}
