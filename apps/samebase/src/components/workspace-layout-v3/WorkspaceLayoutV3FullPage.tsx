import { WorkspaceLayoutV3, type WorkspaceLayoutV3Pane } from "./WorkspaceLayoutV3";
import { WorkspacePaneTrailProvider } from "./WorkspacePaneRuntime";

/**
 * Pane trail shell. Routes own the trail derivation (which panes exist comes
 * from the URL); this shell owns durable widths/collapses via the storage
 * key. The app-level address chrome above the route already carries the URL
 * editor, so the trail has no header row of its own.
 */
export function WorkspaceLayoutV3FullPage({
  panes,
  storageKey,
  dataTestId,
}: {
  panes: readonly WorkspaceLayoutV3Pane[];
  storageKey: string;
  dataTestId?: string;
}) {
  return (
    <WorkspacePaneTrailProvider storageKey={storageKey}>
      <div
        data-testid={dataTestId}
        className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
      >
        <WorkspaceLayoutV3 panes={panes} />
      </div>
    </WorkspacePaneTrailProvider>
  );
}
