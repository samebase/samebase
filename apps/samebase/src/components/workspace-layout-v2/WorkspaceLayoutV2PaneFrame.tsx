import { type ReactNode } from "react";

export type WorkspaceLayoutV2PaneFrameProps = {
  header?: ReactNode;
  content?: ReactNode;
  footer?: ReactNode;
  headerTestId?: string;
  headerVisibility?: "all" | "desktop";
};

/**
The header row and content scroller each declare an anonymous CSS container:
responsive pane content uses container variants such as @3xl: against its
pane-width box instead of viewport breakpoints, so every surface adapts to its
own pane width rather than the window's. Viewport units remain only for true
viewport concerns such as svh scroll-end space.
*/
export function WorkspaceLayoutV2PaneFrame({
  header,
  content,
  footer,
  headerTestId,
  headerVisibility = "all",
}: WorkspaceLayoutV2PaneFrameProps) {
  const headerClassName =
    headerVisibility === "desktop"
      ? "@container hidden h-8 shrink-0 md:block"
      : "@container h-8 shrink-0";

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      {header && (
        <div data-testid={headerTestId} className={headerClassName}>
          {header}
        </div>
      )}

      <div className="@container flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <div className="min-h-0 flex-1">{content}</div>
      </div>

      {footer ? <div className="shrink-0">{footer}</div> : null}
    </section>
  );
}
