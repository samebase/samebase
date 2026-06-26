import { Button } from "@/components/ui/button";
import {
  promptForPwaInstall,
  readPwaInstallStatus,
  subscribePwaInstallAvailability,
  type PwaInstallStatus,
} from "@/lib/pwaInstall";
import { Download, Loader2, Share } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

const PWA_INSTALL_ACTION_CLASS_NAME =
  "vault-dashboard-sidebar-inset flex flex-col items-stretch gap-2 border-t border-border/50 py-3";
const PWA_INSTALL_ACTION_BUTTON_CLASS_NAME =
  "h-auto min-h-8 w-full whitespace-normal py-2 text-left";

function readServerPwaInstallStatus(): PwaInstallStatus {
  return "unavailable";
}

function usePwaInstallStatus() {
  return useSyncExternalStore(
    subscribePwaInstallAvailability,
    readPwaInstallStatus,
    readServerPwaInstallStatus,
  );
}

function IosPwaInstallAction() {
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  return (
    <div data-testid="pwa-install-action" className={PWA_INSTALL_ACTION_CLASS_NAME}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={PWA_INSTALL_ACTION_BUTTON_CLASS_NAME}
        onClick={() => {
          setShowInstallHelp((current) => !current);
        }}
      >
        <Share className="mr-1 h-3.5 w-3.5" />
        Install app
      </Button>
      {showInstallHelp ? (
        <p data-testid="pwa-install-ios-help" className="text-xs leading-5 text-muted-foreground">
          Share, then Add to Home Screen.
        </p>
      ) : null}
    </div>
  );
}

function PromptPwaInstallAction() {
  const [isPrompting, setIsPrompting] = useState(false);
  const [promptFailed, setPromptFailed] = useState(false);

  return (
    <div data-testid="pwa-install-action" className={PWA_INSTALL_ACTION_CLASS_NAME}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={PWA_INSTALL_ACTION_BUTTON_CLASS_NAME}
        disabled={isPrompting}
        onClick={() => {
          if (isPrompting) {
            return;
          }

          setIsPrompting(true);
          setPromptFailed(false);
          void promptForPwaInstall()
            .then((result) => {
              if (result.kind === "unavailable") {
                setPromptFailed(true);
              }
            })
            .catch(() => {
              setPromptFailed(true);
            })
            .finally(() => {
              setIsPrompting(false);
            });
        }}
      >
        {isPrompting ? (
          <>
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            Opening...
          </>
        ) : (
          <>
            <Download className="mr-1 h-3.5 w-3.5" />
            Install app
          </>
        )}
      </Button>
      {promptFailed ? (
        <p className="text-xs leading-5 text-muted-foreground">Install is not available.</p>
      ) : null}
    </div>
  );
}

export function PwaInstallAction() {
  const installStatus = usePwaInstallStatus();

  if (installStatus === "unavailable") {
    return null;
  }

  if (installStatus === "ios-safari") {
    return <IosPwaInstallAction />;
  }

  return <PromptPwaInstallAction />;
}
