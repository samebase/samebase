import { useEffect, useRef, useState, type ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useElementSize } from "@/hooks/useElementSize";
import { cn } from "@/lib/utils";
import {
  WORKSPACE_FOCUS_PANE_MIN_WIDTH_PX,
  WORKSPACE_PANE_COLLAPSE_SLACK_PX,
  WORKSPACE_PANE_MIN_WIDTH_PX,
  WORKSPACE_PANE_MOBILE_SETTLE_DELAY_MS,
  WORKSPACE_PANE_RAIL_WIDTH_PX,
  getWorkspacePaneTrailNearestIndex,
  solveWorkspacePaneTrail,
} from "./WorkspaceLayoutV3Geometry";
import { WorkspaceLayoutV3ResizeHandle } from "./WorkspaceLayoutV3ResizeHandle";
import { useWorkspacePaneTrail } from "./WorkspacePaneRuntime";

export type WorkspaceLayoutV3Pane = {
  id: string;
  title: string;
  /** Rendered at 16px inside the collapsed rail button. */
  icon: ReactNode;
  content: ReactNode;
  minWidthPx?: number;
};

/**
 * The pane trail workspace. Desktop lays the trail out as titled columns
 * where the last pane flexes; a context pane collapses into its own 32px
 * icon rail and back as a width transition on one continuous element, so
 * cause and effect stay visible when the solver trades space between panes.
 * Mobile lays the same trail out as a full-width scroll-snap carousel under
 * a segment strip. Panes are created and removed by navigation, never by
 * chrome buttons; the only pane controls are drag-past-min (collapse), rail
 * clicks (expand), and strip segments (mobile navigation).
 */
export function WorkspaceLayoutV3({
  panes,
  dataTestId,
}: {
  panes: readonly WorkspaceLayoutV3Pane[];
  dataTestId?: string;
}) {
  const isMobile = useIsMobile();
  const { state, lastExpandedId, actions } = useWorkspacePaneTrail();

  // Cmd/Ctrl+B keeps its v2 muscle memory: toggle the nearest context pane.
  // Shift widens it to focus mode (all context panes collapse or restore).
  useEffect(() => {
    if (isMobile) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "b") {
        return;
      }
      if (event.defaultPrevented) {
        return;
      }
      const contextPaneIds = panes.slice(0, -1).map((pane) => pane.id);
      if (contextPaneIds.length === 0) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        const allCollapsed = contextPaneIds.every((paneId) =>
          state.collapsedPaneIds.includes(paneId),
        );
        actions.setAllContextCollapsed(contextPaneIds, !allCollapsed);
        return;
      }
      const nearestContextPaneId = contextPaneIds[contextPaneIds.length - 1];
      if (state.collapsedPaneIds.includes(nearestContextPaneId)) {
        actions.expandPane(nearestContextPaneId);
      } else {
        actions.collapsePane(nearestContextPaneId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [actions, isMobile, panes, state.collapsedPaneIds]);

  if (isMobile) {
    return <WorkspaceLayoutV3MobileTrail panes={panes} dataTestId={dataTestId} />;
  }
  return (
    <WorkspaceLayoutV3DesktopTrail
      panes={panes}
      dataTestId={dataTestId}
      state={state}
      lastExpandedId={lastExpandedId}
      actions={actions}
    />
  );
}

function WorkspaceLayoutV3PaneHeader({ title }: { title: string }) {
  return (
    <div className="flex h-8 shrink-0 items-center border-b border-border px-3">
      <span className="truncate text-xs text-muted-foreground">{title}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop projection                                                   */
/* ------------------------------------------------------------------ */

function WorkspaceLayoutV3DesktopTrail({
  panes,
  dataTestId,
  state,
  lastExpandedId,
  actions,
}: {
  panes: readonly WorkspaceLayoutV3Pane[];
  dataTestId?: string;
  state: ReturnType<typeof useWorkspacePaneTrail>["state"];
  lastExpandedId: string | null;
  actions: ReturnType<typeof useWorkspacePaneTrail>["actions"];
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidthPx, setViewportWidthPx] = useState(0);
  useElementSize(viewportRef, (size) => {
    setViewportWidthPx(size.widthPx);
  });

  const panesById = new Map(panes.map((pane) => [pane.id, pane]));
  const solution = solveWorkspacePaneTrail({
    panes: panes.map((pane) => ({
      id: pane.id,
      minWidthPx: pane.minWidthPx ?? WORKSPACE_PANE_MIN_WIDTH_PX,
    })),
    // Solve against a huge viewport until measured so first paint never
    // auto-collapses panes it would immediately re-expand.
    viewportWidthPx: viewportWidthPx > 0 ? viewportWidthPx : Number.MAX_SAFE_INTEGER,
    widths: state.widths,
    userCollapsed: new Set(state.collapsedPaneIds),
    lastExpandedId,
  });

  const contextMaxWidthPx = Math.max(
    WORKSPACE_PANE_MIN_WIDTH_PX,
    viewportWidthPx - WORKSPACE_FOCUS_PANE_MIN_WIDTH_PX - WORKSPACE_PANE_RAIL_WIDTH_PX,
  );

  return (
    <div
      ref={viewportRef}
      data-testid={dataTestId}
      data-workspace-layout-v3="desktop"
      className="relative flex min-h-0 flex-1 overflow-hidden bg-background"
    >
      {solution.entries.map((entry) => {
        const pane = panesById.get(entry.id);
        if (pane === undefined) {
          return null;
        }

        if (entry.kind === "focus") {
          return (
            <div
              key={pane.id}
              data-workspace-layout-v3-pane={pane.id}
              data-workspace-layout-v3-focus-pane
              className="flex h-full min-w-0 flex-1 flex-col bg-background"
            >
              <WorkspaceLayoutV3PaneHeader title={pane.title} />
              <div className="min-h-0 flex-1 overflow-y-auto">{pane.content}</div>
            </div>
          );
        }

        return (
          <WorkspaceLayoutV3DesktopContextPane
            key={pane.id}
            pane={pane}
            collapsed={entry.kind === "rail"}
            isAutoCollapsed={solution.autoCollapsed.has(pane.id)}
            widthPx={entry.kind === "pane" ? entry.widthPx : WORKSPACE_PANE_RAIL_WIDTH_PX}
            maxWidthPx={contextMaxWidthPx}
            onCommitWidthPx={(widthPx) => {
              actions.setPaneWidthPx(pane.id, widthPx);
            }}
            onCollapse={() => {
              actions.collapsePane(pane.id);
            }}
            onExpand={() => {
              actions.expandPane(pane.id);
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * One context pane, expanded or collapsed. Both states share this element so
 * collapse/expand render as a width transition the eye can follow. Width
 * edits stay local while a drag is active (pointermove never round-trips the
 * persisted store, and the transition is suspended so the edge tracks the
 * pointer); the width commits on release, and releasing deep below the
 * minimum collapses instead.
 */
function WorkspaceLayoutV3DesktopContextPane({
  pane,
  collapsed,
  isAutoCollapsed,
  widthPx,
  maxWidthPx,
  onCommitWidthPx,
  onCollapse,
  onExpand,
}: {
  pane: WorkspaceLayoutV3Pane;
  collapsed: boolean;
  isAutoCollapsed: boolean;
  widthPx: number;
  maxWidthPx: number;
  onCommitWidthPx: (widthPx: number) => void;
  onCollapse: () => void;
  onExpand: () => void;
}) {
  const [draftWidthPx, setDraftWidthPx] = useState<number | null>(null);
  const [hasCollapseIntent, setHasCollapseIntent] = useState(false);
  const draftWidthRef = useRef<number | null>(null);
  const collapseIntentRef = useRef(false);

  const minWidthPx = pane.minWidthPx ?? WORKSPACE_PANE_MIN_WIDTH_PX;
  const renderedWidthPx = collapsed ? WORKSPACE_PANE_RAIL_WIDTH_PX : (draftWidthPx ?? widthPx);

  return (
    <div
      data-workspace-layout-v3-pane={pane.id}
      data-workspace-layout-v3-pane-state={collapsed ? "rail" : "open"}
      data-collapse-intent={hasCollapseIntent ? "true" : undefined}
      className={cn(
        // overflow-hidden must NOT live on this wrapper: it would clip the
        // outer half of the centered edge resize handle and halve its hit
        // area. The content wrapper below clips instead.
        "relative flex h-full min-w-0 shrink-0 flex-col border-r border-border bg-background",
        draftWidthPx === null && "transition-[width]",
        hasCollapseIntent && "opacity-60",
      )}
      style={{ width: `${renderedWidthPx}px` }}
    >
      {collapsed ? (
        <button
          type="button"
          data-workspace-layout-v3-rail-pane={pane.id}
          aria-label={`Expand ${pane.title} pane`}
          title={isAutoCollapsed ? `${pane.title} (collapsed for space)` : pane.title}
          className="flex h-full w-full flex-col items-center pt-2 hover:bg-muted/50"
          onClick={onExpand}
        >
          <span className={cn("text-muted-foreground", isAutoCollapsed && "opacity-60")}>
            {pane.icon}
          </span>
        </button>
      ) : (
        <>
          <WorkspaceLayoutV3PaneHeader title={pane.title} />
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{pane.content}</div>
          <WorkspaceLayoutV3ResizeHandle
            ariaLabel={`Resize ${pane.title} pane`}
            currentSizePx={renderedWidthPx}
            dataTestId={`workspace-layout-v3-resize-${pane.id}`}
            maxSizePx={Math.max(minWidthPx, maxWidthPx)}
            minSizePx={minWidthPx}
            onSizeChange={(sizePx) => {
              draftWidthRef.current = sizePx;
              setDraftWidthPx(sizePx);
            }}
            onRawSizeChange={(rawSizePx) => {
              const intent = rawSizePx < minWidthPx - WORKSPACE_PANE_COLLAPSE_SLACK_PX;
              collapseIntentRef.current = intent;
              setHasCollapseIntent(intent);
            }}
            onResizeEnd={() => {
              const committedWidthPx = draftWidthRef.current;
              const shouldCollapse = collapseIntentRef.current;
              draftWidthRef.current = null;
              collapseIntentRef.current = false;
              setDraftWidthPx(null);
              setHasCollapseIntent(false);
              if (shouldCollapse) {
                // Keep the pre-drag width so the pane reopens at a useful size.
                onCollapse();
                return;
              }
              if (committedWidthPx !== null) {
                onCommitWidthPx(committedWidthPx);
              }
            }}
            pointerTarget="edge"
            positionPx={renderedWidthPx}
            resizeFrom="left"
          />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile projection                                                    */
/* ------------------------------------------------------------------ */

function WorkspaceLayoutV3MobileTrail({
  panes,
  dataTestId,
}: {
  panes: readonly WorkspaceLayoutV3Pane[];
  dataTestId?: string;
}) {
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const settleTimeoutRef = useRef<number | null>(null);
  const [paneWidthPx, setPaneWidthPx] = useState(0);
  const [activeIndex, setActiveIndex] = useState(panes.length - 1);
  useElementSize(carouselRef, (size) => {
    setPaneWidthPx(size.widthPx);
  });

  // Navigation grows or shrinks the trail; align the carousel to the focus
  // pane whenever that happens (this is also what advances the carousel when
  // tapping content drills down). Programmatic moves are instant scrollLeft
  // writes: smooth scrolling inside a snap-mandatory container settles on
  // intermediate snap points in WebKit.
  const previousPaneCountRef = useRef(panes.length);
  useEffect(() => {
    if (previousPaneCountRef.current === panes.length) {
      return;
    }
    previousPaneCountRef.current = panes.length;
    const focusIndex = panes.length - 1;
    setActiveIndex(focusIndex);
    const carousel = carouselRef.current;
    if (carousel !== null) {
      carousel.scrollLeft = focusIndex * carousel.clientWidth;
    }
  }, [panes.length]);

  const scrollToIndex = (index: number) => {
    setActiveIndex(index);
    const carousel = carouselRef.current;
    if (carousel !== null) {
      carousel.scrollLeft = index * carousel.clientWidth;
    }
  };

  return (
    <div
      data-testid={dataTestId}
      data-workspace-layout-v3="mobile"
      className="flex min-h-0 flex-1 flex-col bg-background"
    >
      <div
        data-workspace-layout-v3-strip
        className="flex h-8 shrink-0 items-stretch overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {panes.map((pane, index) => (
          <button
            key={pane.id}
            type="button"
            data-workspace-layout-v3-strip-segment={pane.id}
            aria-current={index === activeIndex ? "true" : undefined}
            className={cn(
              "max-w-[10rem] shrink-0 truncate border-b-2 px-2.5 text-xs",
              index === activeIndex
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground",
            )}
            onClick={() => {
              scrollToIndex(index);
            }}
          >
            {pane.title}
          </button>
        ))}
      </div>
      <div
        ref={carouselRef}
        data-workspace-layout-v3-carousel
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-y-hidden overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={() => {
          if (settleTimeoutRef.current !== null) {
            window.clearTimeout(settleTimeoutRef.current);
          }
          settleTimeoutRef.current = window.setTimeout(() => {
            settleTimeoutRef.current = null;
            const carousel = carouselRef.current;
            if (carousel === null) {
              return;
            }
            setActiveIndex(
              getWorkspacePaneTrailNearestIndex({
                scrollLeftPx: carousel.scrollLeft,
                paneWidthPx: carousel.clientWidth,
                paneCount: panes.length,
              }),
            );
          }, WORKSPACE_PANE_MOBILE_SETTLE_DELAY_MS);
        }}
      >
        {panes.map((pane) => (
          <div
            key={pane.id}
            data-workspace-layout-v3-pane={pane.id}
            className="flex h-full shrink-0 snap-start snap-always flex-col border-r border-border bg-background"
            style={{ width: paneWidthPx > 0 ? `${paneWidthPx}px` : "100%" }}
          >
            <div className="min-h-0 flex-1 overflow-y-auto">{pane.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
