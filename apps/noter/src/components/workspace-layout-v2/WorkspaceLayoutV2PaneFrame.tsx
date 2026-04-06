import { type ReactNode } from "react";

type WorkspaceLayoutV2PaneFrameProps = {
  children: ReactNode;
  header?: ReactNode;
  headerTestId?: string;
};

/**
 * Reserve one fixed-height header row for every pane so routes can keep controls
 * visible while the body scrolls without the pane height shifting underneath.
 */
export function WorkspaceLayoutV2PaneFrame({
  children,
  header,
  headerTestId,
}: WorkspaceLayoutV2PaneFrameProps) {
  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div
        data-testid={headerTestId}
        className="h-8 shrink-0 border-b border-border"
      >
        {header}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </section>
  );
}
