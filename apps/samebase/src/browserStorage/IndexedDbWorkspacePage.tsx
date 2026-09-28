import { AppWorkspaceRouteChrome } from "@/appShell/AppWorkspaceShell";
import { BrowserStorageSidebarContent } from "@/browserStorage/BrowserStorageSidebarContent";
import { useBrowserIndexedDbSnapshot } from "@/browserStorage/useBrowserIndexedDbSnapshot";
import { type IndexedDbSnapshot } from "@/browserStorage/indexedDbSnapshot";

function IndexedDbUnavailableState({ errorMessage }: { errorMessage: string }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <p role="alert" className="max-w-xl text-sm text-muted-foreground">
        {errorMessage}
      </p>
    </div>
  );
}

function IndexedDbLoadingState() {
  return (
    <div className="flex min-h-full items-center justify-center p-6 text-sm text-muted-foreground">
      Loading indexedDB values.
    </div>
  );
}

function IndexedDbEntriesTable({ snapshot }: { snapshot: IndexedDbSnapshot }) {
  if (snapshot.kind === "loading") {
    return <IndexedDbLoadingState />;
  }

  if (snapshot.kind === "unavailable") {
    return <IndexedDbUnavailableState errorMessage={snapshot.errorMessage} />;
  }

  if (snapshot.entries.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center p-6 text-sm text-muted-foreground">
        No indexedDB values.
      </div>
    );
  }

  return (
    <div className="min-h-full overflow-x-auto p-3">
      <table className="w-full min-w-[960px] table-fixed border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="w-[18%] px-3 py-2 font-medium">Database</th>
            <th className="w-[18%] px-3 py-2 font-medium">Store</th>
            <th className="w-[24%] px-3 py-2 font-medium">Key</th>
            <th className="px-3 py-2 font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.entries.map((entry, entryIndex) => (
            <tr
              key={`${entry.databaseName}\n${entry.objectStoreName}\n${entry.key}\n${entryIndex}`}
              className="align-top"
            >
              <td className="border-b border-border px-3 py-2">
                <code
                  data-testid="indexed-db-entry-database"
                  className="block whitespace-pre-wrap break-words font-mono text-xs"
                >
                  {entry.databaseName}
                </code>
              </td>
              <td className="border-b border-border px-3 py-2">
                <code
                  data-testid="indexed-db-entry-store"
                  className="block whitespace-pre-wrap break-words font-mono text-xs"
                >
                  {entry.objectStoreName}
                </code>
              </td>
              <td className="border-b border-border px-3 py-2">
                <code
                  data-testid="indexed-db-entry-key"
                  className="block whitespace-pre-wrap break-words font-mono text-xs"
                >
                  {entry.key}
                </code>
              </td>
              <td className="border-b border-border px-3 py-2">
                <pre
                  data-testid="indexed-db-entry-value"
                  className="whitespace-pre-wrap break-words font-mono text-xs leading-5"
                >
                  {entry.value}
                </pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {snapshot.truncatedStores.length > 0 ? (
        <p className="px-3 pt-3 text-xs text-muted-foreground">
          Some object stores have more values than shown.
        </p>
      ) : null}
    </div>
  );
}

export function IndexedDbWorkspacePage() {
  const snapshot = useBrowserIndexedDbSnapshot();

  return (
    <AppWorkspaceRouteChrome left={{ content: <BrowserStorageSidebarContent /> }}>
      <IndexedDbEntriesTable snapshot={snapshot} />
    </AppWorkspaceRouteChrome>
  );
}
