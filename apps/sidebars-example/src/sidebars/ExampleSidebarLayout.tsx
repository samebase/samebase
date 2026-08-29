import {
  SidebarLayout,
  type SidebarLayoutResizeHandleLabels,
  type SidebarLayoutResizeHandleValueTextFormatter,
} from "@samebase/sidebars/SidebarLayout";
import { PaneFrame, type PaneFrameProps } from "@samebase/sidebars/PaneFrame";
import { useSidebarActions, useSidebarLayoutPresentation } from "@samebase/sidebars/SidebarRuntime";
import { PanelLeft, PanelRight } from "lucide-react";
import {
  exampleSidebarDesktopPrehydrationScript,
  exampleSidebarMobilePrehydrationScript,
} from "./exampleSidebarState";

const RESIZE_HANDLE_LABELS = {
  left: "Resize links sidebar",
  right: "Resize behavior sidebar",
} satisfies SidebarLayoutResizeHandleLabels;

const formatResizeHandleValueText: SidebarLayoutResizeHandleValueTextFormatter = ({ widthPx }) =>
  `${widthPx} pixels wide`;

function ExampleAddressChrome() {
  const { setMobilePane, toggleLeftPane, toggleRightPane } = useSidebarActions();
  const { isMobile, leftDesktopOpen, mobilePane, rightDesktopOpen } =
    useSidebarLayoutPresentation();
  const leftShown = isMobile ? mobilePane === "left" : leftDesktopOpen;
  const rightShown = isMobile ? mobilePane === "right" : rightDesktopOpen;

  return (
    <div className="example-address-chrome">
      <span className="example-wordmark">sidebars</span>

      <div className="example-sidebar-actions">
        <button
          aria-label="Left sidebar"
          aria-pressed={leftShown}
          className="example-sidebar-toggle"
          onClick={isMobile && leftShown ? () => setMobilePane("main") : toggleLeftPane}
          type="button"
        >
          <PanelLeft />
        </button>
        <button
          aria-label="Right sidebar"
          aria-pressed={rightShown}
          className="example-sidebar-toggle"
          onClick={isMobile && rightShown ? () => setMobilePane("main") : toggleRightPane}
          type="button"
        >
          <PanelRight />
        </button>
      </div>
    </div>
  );
}

export function ExampleSidebarLayout({
  left,
  main,
  right,
}: {
  left: PaneFrameProps;
  main: PaneFrameProps;
  right: PaneFrameProps;
}) {
  return (
    <>
      <SidebarLayout
        addressChrome={<ExampleAddressChrome />}
        formatResizeHandleValueText={formatResizeHandleValueText}
        left={<PaneFrame {...left} />}
        main={<PaneFrame {...main} />}
        mobileMinResizeBehavior="min_resize_to_merge"
        resizeHandleLabels={RESIZE_HANDLE_LABELS}
        right={<PaneFrame {...right} />}
      />
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: exampleSidebarDesktopPrehydrationScript }}
      />
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: exampleSidebarMobilePrehydrationScript }}
      />
    </>
  );
}
