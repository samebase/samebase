import { type ReactNode } from "react";

export type WorkspaceLayoutV2PaneFrameProps = {
  header?: ReactNode;
  content?: ReactNode;
  footer?: ReactNode;
  reserveHeaderSpace?: boolean;

  // TODO: Maybe pass a prefix so we can add testids for each section
  headerTestId?: string;
};

/**
 * Reserve one fixed-height header row for every pane so routes can keep controls
 * visible while the body scrolls without the pane height shifting underneath.
 * Public routes can opt out when they intentionally have no pane header.
 */
export function WorkspaceLayoutV2PaneFrame({
  header,
  content,
  footer,
  reserveHeaderSpace = true,
  headerTestId,
}: WorkspaceLayoutV2PaneFrameProps) {
  const showHeaderRow =
    reserveHeaderSpace || header !== undefined || headerTestId !== undefined;

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      {showHeaderRow ? (
        <div data-testid={headerTestId} className="h-8 shrink-0">
          {header}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <div className="min-h-0 flex-1">{content}</div>
      </div>

      {footer ? <div className="shrink-0">{footer}</div> : null}
    </section>
  );
}
