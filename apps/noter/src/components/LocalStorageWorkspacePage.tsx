import { FileText, RefreshCw } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { SidebarProvider } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { RepositoryWorkspacePaneHeader } from "@/components/RepositoryWorkspacePaneHeader";
import { WorkspaceLayoutV2FullPage } from "@/components/workspace-layout-v2/WorkspaceLayoutV2";
import {
  readBrowserLocalStorageSnapshot,
  type LocalStorageSnapshot,
} from "@/lib/localStorageSnapshot";

const LOCAL_STORAGE_SIDEBAR_WIDTH_PX = 240;

function LocalStorageSidebarContent() {
  return (
    <nav aria-label="Storage views" className="px-1 py-2">
      <div
        aria-current="page"
        data-testid="local-storage-sidebar-file"
        className="flex h-8 min-w-0 items-center gap-2 px-2 text-sm font-medium"
      >
        <FileText className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">localStorage</span>
      </div>
    </nav>
  );
}

function LocalStorageUnavailableState({
  errorMessage,
}: {
  errorMessage: string;
}) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <p role="alert" className="max-w-xl text-sm text-muted-foreground">
        {errorMessage}
      </p>
    </div>
  );
}

function LocalStorageEntriesTable({
  snapshot,
}: {
  snapshot: LocalStorageSnapshot;
}) {
  if (snapshot.kind === "unavailable") {
    return (
      <LocalStorageUnavailableState errorMessage={snapshot.errorMessage} />
    );
  }

  if (snapshot.entries.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-muted-foreground">
        No localStorage values.
      </div>
    );
  }

  return (
    <div className="min-h-full overflow-x-auto p-3">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="w-[34%] px-3 py-2 font-medium">Key</th>
            <th className="px-3 py-2 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.entries.map((entry) => (
            <tr key={entry.key} className="align-top">
              <td className="border-b border-border px-3 py-2">
                <code
                  data-testid="local-storage-entry-key"
                  className="block whitespace-pre-wrap break-words font-mono text-xs"
                >
                  {entry.key}
                </code>
              </td>
              <td className="border-b border-border px-3 py-2">
                <pre
                  data-testid="local-storage-entry-value"
                  className="whitespace-pre-wrap break-words font-mono text-xs leading-5"
                >
                  {entry.value}
                </pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LocalStorageWorkspacePage() {
  const [snapshot, setSnapshot] = useState(readBrowserLocalStorageSnapshot);
  const refreshSnapshot = () => {
    setSnapshot(readBrowserLocalStorageSnapshot());
  };
  const refreshSnapshotFromStorageEvent = useEffectEvent(() => {
    refreshSnapshot();
  });

  /**
   * Keep cross-tab storage changes visible without reinstalling the browser
   * listener when this route re-renders.
   */
  useEffect(() => {
    window.addEventListener("storage", refreshSnapshotFromStorageEvent);
    return () => {
      window.removeEventListener("storage", refreshSnapshotFromStorageEvent);
    };
  }, []);

  return (
    <SidebarProvider
      defaultOpen={true}
      defaultLeftDesktopWidthPx={LOCAL_STORAGE_SIDEBAR_WIDTH_PX}
      defaultLeftMobileWidthPx={LOCAL_STORAGE_SIDEBAR_WIDTH_PX}
      defaultMobilePane="main"
    >
      <WorkspaceLayoutV2FullPage
        dataTestId="local-storage-workspace"
        left={{
          content: <LocalStorageSidebarContent />,
        }}
        main={{
          header: (
            <RepositoryWorkspacePaneHeader
              title="localStorage"
              right={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Refresh localStorage"
                  title="Refresh localStorage"
                  className="h-8 w-8"
                  onClick={refreshSnapshot}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              }
            />
          ),
          content: <LocalStorageEntriesTable snapshot={snapshot} />,
        }}
        leftToggleVisibility="all"
      />
    </SidebarProvider>
  );
}
