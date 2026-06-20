import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { BrowserStorageSidebarContent } from "@/components/BrowserStorageSidebarContent";
import { useBrowserLocalStorageSnapshot } from "@/hooks/useBrowserLocalStorageSnapshot";
import { type LocalStorageSnapshot } from "@/lib/localStorageSnapshot";

function formatLocalStorageValue(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function LocalStorageUnavailableState({ errorMessage }: { errorMessage: string }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <p role="alert" className="max-w-xl text-sm text-muted-foreground">
        {errorMessage}
      </p>
    </div>
  );
}

function LocalStorageEntriesTable({ snapshot }: { snapshot: LocalStorageSnapshot }) {
  if (snapshot.kind === "unavailable") {
    return <LocalStorageUnavailableState errorMessage={snapshot.errorMessage} />;
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
                  {formatLocalStorageValue(entry.value)}
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
  const snapshot = useBrowserLocalStorageSnapshot();

  return (
    <AppWorkspaceRouteChrome
      left={{ content: <BrowserStorageSidebarContent currentView="localStorage" /> }}
    >
      <LocalStorageEntriesTable snapshot={snapshot} />
    </AppWorkspaceRouteChrome>
  );
}
