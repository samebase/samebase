import { useState } from "react";
import {
  isLikelyStaleAssetError,
  readBootFailureMessage,
  reloadApp,
  resetLocalAppData,
} from "@/lib/appBootRecovery";
import { readAppBuildCommit } from "@/lib/appBuildMetadata";

type AppBootFailureStateProps = {
  error: unknown;
};

export function AppBootFailureState({ error }: AppBootFailureStateProps) {
  const [pendingAction, setPendingAction] = useState<"reload" | "reset" | null>(
    null,
  );
  const isStaleAssetFailure = isLikelyStaleAssetError(error);
  const errorMessage = readBootFailureMessage(error);
  const buildCommit = readAppBuildCommit();

  const handleReload = () => {
    if (pendingAction !== null) {
      return;
    }
    setPendingAction("reload");
    reloadApp();
  };

  const handleReset = async () => {
    if (pendingAction !== null) {
      return;
    }

    setPendingAction("reset");
    try {
      await resetLocalAppData();
    } finally {
      reloadApp();
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-10">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            App Recovery
          </p>
          <h1 className="text-xl font-medium">
            {isStaleAssetFailure
              ? "Noter updated while this tab was open."
              : "Noter could not finish loading."}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {isStaleAssetFailure
              ? "This device is still trying to load older app files. Reload first. If that does not recover, reset the saved browser data for noter on this device."
              : "The app hit an unexpected startup error. Reload first. If it keeps happening, reset the saved browser data for noter on this device."}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleReload}
            disabled={pendingAction !== null}
            className="inline-flex h-9 items-center justify-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {pendingAction === "reload" ? "Reloading..." : "Reload app"}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleReset();
            }}
            disabled={pendingAction !== null}
            className="inline-flex h-9 items-center justify-center border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            {pendingAction === "reset" ? "Resetting..." : "Reset local data"}
          </button>
        </div>

        <div className="space-y-2 border px-4 py-3 text-sm leading-6">
          <p>
            Reset local data clears saved browser storage for noter on this
            device and may sign you out.
          </p>
          <p className="text-muted-foreground">Build: {buildCommit}</p>
          {errorMessage ? (
            <p className="break-words text-muted-foreground">
              Error: {errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
