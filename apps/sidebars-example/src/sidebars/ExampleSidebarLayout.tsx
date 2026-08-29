import {
  SidebarLayout,
  type SidebarLayoutResizeHandleLabels,
  type SidebarLayoutResizeHandleValueTextFormatter,
} from "@samebase/sidebars/SidebarLayout";
import { PaneFrame, type PaneFrameProps } from "@samebase/sidebars/PaneFrame";
import { useSidebarActions, useSidebarLayoutPresentation } from "@samebase/sidebars/SidebarRuntime";
import { PanelLeft, PanelRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  exampleSidebarDesktopPrehydrationScript,
  exampleSidebarMobilePrehydrationScript,
} from "./exampleSidebarState";

const RESIZE_HANDLE_LABELS = {
  left: "Resize navigation sidebar",
  right: "Resize inspector sidebar",
} satisfies SidebarLayoutResizeHandleLabels;

const formatResizeHandleValueText: SidebarLayoutResizeHandleValueTextFormatter = ({ widthPx }) =>
  `${widthPx} pixels wide`;

function ExampleAddressChrome() {
  const { setMobilePane, toggleLeftPane, toggleRightPane } = useSidebarActions();
  const {
    isMobile,
    leftDesktopOpen,
    mobileMergeProgress,
    mobilePane,
    mobilePaneScrollProgress,
    rightDesktopOpen,
  } = useSidebarLayoutPresentation();
  const mergePercent = Math.round((mobileMergeProgress?.progress ?? 0) * 100);
  const scrollPercent = Math.round(mobilePaneScrollProgress * 100);
  const mobileStatus = mobileMergeProgress
    ? `${mobileMergeProgress.side} ${mergePercent}%`
    : mobilePane;
  const leftShown = isMobile ? mobilePane === "left" : leftDesktopOpen;
  const rightShown = isMobile ? mobilePane === "right" : rightDesktopOpen;

  return (
    <div className="example-address-chrome">
      <span className="example-wordmark">sidebars</span>

      <div aria-label="Live sidebar state" className="example-layout-status">
        <Badge variant="outline">{isMobile ? mobileStatus : "desktop"}</Badge>
        {isMobile ? (
          <Progress
            aria-label={
              mobileMergeProgress ? "Mobile merge progress" : "Mobile pane scroll progress"
            }
            className="example-state-progress"
            value={mobileMergeProgress ? mergePercent : scrollPercent}
          />
        ) : null}
      </div>

      <div className="example-sidebar-actions">
        <Button
          aria-label="Navigation sidebar"
          aria-pressed={leftShown}
          onClick={isMobile && leftShown ? () => setMobilePane("main") : toggleLeftPane}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <PanelLeft />
        </Button>
        <Button
          aria-label="Inspector sidebar"
          aria-pressed={rightShown}
          onClick={isMobile && rightShown ? () => setMobilePane("main") : toggleRightPane}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <PanelRight />
        </Button>
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
