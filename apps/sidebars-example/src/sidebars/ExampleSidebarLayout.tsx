import {
  SidebarLayout,
  type SidebarLayoutResizeHandleLabels,
  type SidebarLayoutResizeHandleValueTextFormatter,
} from "@samebase/sidebars";
import { PaneFrame, type PaneFrameProps } from "@samebase/sidebars/pane-frame";
import { useSidebarActions, useSidebarLayoutPresentation } from "@samebase/sidebars/runtime";
import { Link } from "@tanstack/react-router";
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

function ExampleAddressChrome({ hasLeft, hasRight }: { hasLeft: boolean; hasRight: boolean }) {
  const { setMobilePane, toggleLeftPane, toggleRightPane } = useSidebarActions();
  const { isMobile, mobileMergeProgress, mobilePane, mobilePaneScrollProgress } =
    useSidebarLayoutPresentation();
  const mergePercent = Math.round((mobileMergeProgress?.progress ?? 0) * 100);
  const scrollPercent = Math.round(mobilePaneScrollProgress * 100);

  return (
    <div className="example-address-chrome">
      <Link className="example-wordmark" to="/">
        sidebars
      </Link>

      <nav aria-label="Example routes" className="example-route-nav">
        <Link activeProps={{ "data-active": "" }} to="/">
          Overview
        </Link>
        <Link activeProps={{ "data-active": "" }} to="/docs">
          Docs
        </Link>
        <Link activeProps={{ "data-active": "" }} to="/workbench">
          Workbench
        </Link>
      </nav>

      <div aria-label="Live sidebar state" className="example-layout-status">
        <Badge variant="outline">{isMobile ? "mobile" : "desktop"}</Badge>
        {isMobile ? <Badge variant="secondary">pane: {mobilePane}</Badge> : null}
        {isMobile ? (
          <Progress
            aria-label="Mobile pane scroll progress"
            className="example-state-progress"
            value={scrollPercent}
          />
        ) : null}
        {mobileMergeProgress ? (
          <Badge variant="outline">
            merge: {mobileMergeProgress.side} {mergePercent}%
          </Badge>
        ) : null}
      </div>

      <div className="example-sidebar-actions">
        {hasLeft ? (
          <Button
            aria-label={
              isMobile && mobilePane === "left" ? "Show main content" : "Toggle navigation sidebar"
            }
            onClick={
              isMobile && mobilePane === "left" ? () => setMobilePane("main") : toggleLeftPane
            }
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <PanelLeft />
          </Button>
        ) : null}
        {hasRight ? (
          <Button
            aria-label={
              isMobile && mobilePane === "right" ? "Show main content" : "Toggle inspector sidebar"
            }
            onClick={
              isMobile && mobilePane === "right" ? () => setMobilePane("main") : toggleRightPane
            }
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <PanelRight />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ExampleSidebarLayout({
  left,
  main,
  right,
}: {
  left?: PaneFrameProps;
  main: PaneFrameProps;
  right?: PaneFrameProps;
}) {
  return (
    <>
      <SidebarLayout
        addressChrome={
          <ExampleAddressChrome hasLeft={left !== undefined} hasRight={right !== undefined} />
        }
        formatResizeHandleValueText={formatResizeHandleValueText}
        left={left ? <PaneFrame {...left} /> : undefined}
        main={<PaneFrame {...main} />}
        mobileMinResizeBehavior="min_resize_to_merge"
        resizeHandleLabels={RESIZE_HANDLE_LABELS}
        right={right ? <PaneFrame {...right} /> : undefined}
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
