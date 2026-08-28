import { type ReactNode } from "react";

export type WorkspaceLayoutV2PaneFrameProps = {
  header?: ReactNode;
  content?: ReactNode;
  footer?: ReactNode;
  headerTestId?: string;
  headerVisibility?: "all" | "desktop";
  scrollRestorationId?: string;
};

/**
The header row and content scroller each declare an anonymous CSS container.
Pane content can respond to its own width instead of the window width.
*/
export function WorkspaceLayoutV2PaneFrame({
  header,
  content,
  footer,
  headerTestId,
  headerVisibility = "all",
  scrollRestorationId,
}: WorkspaceLayoutV2PaneFrameProps) {
  return (
    <section data-workspace-layout-part="pane-frame">
      {header ? (
        <div
          data-header-visibility={headerVisibility}
          data-testid={headerTestId}
          data-workspace-layout-part="pane-header"
        >
          {header}
        </div>
      ) : null}

      <div
        data-scroll-restoration-id={scrollRestorationId}
        data-workspace-layout-part="pane-scrollport"
      >
        <div data-workspace-layout-part="pane-content">{content}</div>
      </div>

      {footer ? <div data-workspace-layout-part="pane-footer">{footer}</div> : null}
    </section>
  );
}
