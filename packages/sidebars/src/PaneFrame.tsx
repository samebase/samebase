import { type ReactNode } from "react";

export type PaneFrameProps = {
  header?: ReactNode;
  content?: ReactNode;
  footer?: ReactNode;
  headerVisibility?: "all" | "desktop";
  scrollRestorationId?: string;
};

/**
The header row and content scroller each declare an anonymous CSS container.
Pane content can respond to its own width instead of the window width.
*/
export function PaneFrame({
  header,
  content,
  footer,
  headerVisibility = "all",
  scrollRestorationId,
}: PaneFrameProps) {
  return (
    <section data-sidebar-layout-part="pane-frame">
      {header ? (
        <div data-header-visibility={headerVisibility} data-sidebar-layout-part="pane-header">
          {header}
        </div>
      ) : null}

      <div
        data-scroll-restoration-id={scrollRestorationId}
        data-sidebar-layout-part="pane-scrollport"
      >
        <div data-sidebar-layout-part="pane-content">{content}</div>
      </div>

      {footer ? <div data-sidebar-layout-part="pane-footer">{footer}</div> : null}
    </section>
  );
}
