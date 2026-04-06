import { type ReactNode } from "react";

type WorkspaceLayoutV2PaneFrameProps = {
  bodyTestId?: string;
  children: ReactNode;
  dataTestId?: string;
  header?: ReactNode;
  headerTestId?: string;
};

/**
 * Reserve one fixed-height header row for every pane so routes can keep controls
 * visible while the body scrolls without the pane height shifting underneath.
 */
export function WorkspaceLayoutV2PaneFrame({
  bodyTestId,
  children,
  dataTestId,
  header,
  headerTestId,
}: WorkspaceLayoutV2PaneFrameProps) {
  return (
    <section
      data-testid={dataTestId}
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <div
        data-testid={headerTestId}
        className="h-9 shrink-0 border-b border-border/50 px-3"
      >
        <div className="h-full overflow-hidden">{header}</div>
      </div>
      <div
        data-testid={bodyTestId}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        {children}
      </div>
    </section>
  );
}
