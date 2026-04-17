import { Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import mobileSidebarSpecRaw from "../../../../specs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md?raw";
import { MonacoSurface } from "@/components/MonacoSurface";
import { ProsemarkSurface } from "@/components/ProsemarkSurface";
import {
  getWorkspaceLayoutV2SettledPane,
  getWorkspaceLayoutV2TrackWidthPx,
  getWorkspaceLayoutV2VisibleStartPx,
  type WorkspaceLayoutV2Metrics,
  type WorkspaceLayoutV2Pane,
} from "@/lib/mobile-pane-layout";

const MOBILE_BREAKPOINT_PX = 768;
const MOBILE_DRAG_SLOP_PX = 12;
const MOBILE_SIDEBAR_MIN_WIDTH_PX = 160;
const MOBILE_VISIBLE_MAIN_STRIP_PX = 32;

type PointerSample = {
  clientX: number;
  timeMs: number;
};

type PointerGesturePhase = "pending" | "swiping";

function getMobileSidebarWidthPx(viewportWidthPx: number) {
  // Keep a visible main strip so an open sidebar still has an easy return grab.
  return Math.max(
    MOBILE_SIDEBAR_MIN_WIDTH_PX,
    Math.round(viewportWidthPx - MOBILE_VISIBLE_MAIN_STRIP_PX),
  );
}

function getMobileMainPaneWidthPx(viewportWidthPx: number) {
  // When main is centered, split the same exposed-strip budget evenly so both
  // side panes stay slightly visible.
  return Math.max(0, viewportWidthPx - MOBILE_VISIBLE_MAIN_STRIP_PX);
}

function getRecentVelocityPxPerMs(samples: readonly PointerSample[]) {
  if (samples.length < 2) {
    return 0;
  }

  const lastSample = samples[samples.length - 1];
  if (!lastSample) {
    return 0;
  }
  const windowStartTimeMs = lastSample.timeMs - 80;
  const referenceSample =
    [...samples]
      .reverse()
      .find((sample) => sample.timeMs <= windowStartTimeMs) ?? samples[0];
  if (!referenceSample) {
    return 0;
  }
  const elapsedMs = Math.max(1, lastSample.timeMs - referenceSample.timeMs);

  return (lastSample.clientX - referenceSample.clientX) / elapsedMs;
}

export function WorkspaceLayoutPage() {
  const [viewportWidthPx, setViewportWidthPx] = createSignal(0);
  const [currentPane, setCurrentPane] =
    createSignal<WorkspaceLayoutV2Pane>("main");
  const [dragOffsetPx, setDragOffsetPx] = createSignal(0);
  const [isDragging, setIsDragging] = createSignal(false);

  let viewportRef: HTMLElement | undefined;
  let activePointerId: number | null = null;
  let gesturePhase: PointerGesturePhase = "pending";
  let gestureStartX = 0;
  let gestureStartY = 0;
  let gestureStartPane: WorkspaceLayoutV2Pane = "main";
  let pointerSamples: PointerSample[] = [];

  onMount(() => {
    const viewportNode = viewportRef;
    if (!viewportNode) {
      return;
    }

    const updateViewportWidth = () => {
      setViewportWidthPx(
        Math.round(viewportNode.getBoundingClientRect().width),
      );
    };

    updateViewportWidth();

    const resizeObserver = new ResizeObserver(() => {
      updateViewportWidth();
    });
    resizeObserver.observe(viewportNode);

    viewportNode.addEventListener("pointercancel", handlePointerEnd, {
      capture: true,
    });
    viewportNode.addEventListener("pointerdown", handlePointerDown, {
      capture: true,
    });
    viewportNode.addEventListener("pointermove", handlePointerMove, {
      capture: true,
    });
    viewportNode.addEventListener("pointerup", handlePointerEnd, {
      capture: true,
    });

    onCleanup(() => {
      resizeObserver.disconnect();
      viewportNode.removeEventListener("pointercancel", handlePointerEnd, {
        capture: true,
      });
      viewportNode.removeEventListener("pointerdown", handlePointerDown, {
        capture: true,
      });
      viewportNode.removeEventListener("pointermove", handlePointerMove, {
        capture: true,
      });
      viewportNode.removeEventListener("pointerup", handlePointerEnd, {
        capture: true,
      });
    });
  });

  const isMobile = createMemo(() => viewportWidthPx() < MOBILE_BREAKPOINT_PX);
  const mobileSidebarWidthPx = createMemo(() =>
    getMobileSidebarWidthPx(viewportWidthPx()),
  );
  const mobileMainPaneWidthPx = createMemo(() =>
    getMobileMainPaneWidthPx(viewportWidthPx()),
  );
  const mobileMetrics = createMemo<WorkspaceLayoutV2Metrics>(() => ({
    leftWidthPx: mobileSidebarWidthPx(),
    mainWidthPx: mobileMainPaneWidthPx(),
    rightWidthPx: mobileSidebarWidthPx(),
    viewportWidthPx: viewportWidthPx(),
  }));
  const mobileTrackWidthPx = createMemo(() =>
    getWorkspaceLayoutV2TrackWidthPx(mobileMetrics()),
  );
  const mobileVisibleStartPx = createMemo(() =>
    getWorkspaceLayoutV2VisibleStartPx({
      currentPane: currentPane(),
      dragOffsetPx: dragOffsetPx(),
      metrics: mobileMetrics(),
    }),
  );

  function resetGesture() {
    if (
      activePointerId !== null &&
      viewportRef?.hasPointerCapture(activePointerId)
    ) {
      viewportRef.releasePointerCapture(activePointerId);
    }
    activePointerId = null;
    gesturePhase = "pending";
    gestureStartX = 0;
    gestureStartY = 0;
    pointerSamples = [];
    setIsDragging(false);
    setDragOffsetPx(0);
  }

  function handlePointerDown(event: PointerEvent) {
    if (!isMobile() || !event.isPrimary || activePointerId !== null) {
      return;
    }

    activePointerId = event.pointerId;
    gesturePhase = "pending";
    gestureStartX = event.clientX;
    gestureStartY = event.clientY;
    gestureStartPane = currentPane();
    pointerSamples = [
      {
        clientX: event.clientX,
        timeMs: event.timeStamp,
      },
    ];
  }

  function handlePointerMove(event: PointerEvent) {
    if (!isMobile() || event.pointerId !== activePointerId) {
      return;
    }

    const dragOffsetXPx = event.clientX - gestureStartX;
    const dragOffsetYPx = event.clientY - gestureStartY;

    if (gesturePhase === "pending") {
      if (
        Math.abs(dragOffsetXPx) < MOBILE_DRAG_SLOP_PX &&
        Math.abs(dragOffsetYPx) < MOBILE_DRAG_SLOP_PX
      ) {
        return;
      }

      if (Math.abs(dragOffsetXPx) <= Math.abs(dragOffsetYPx)) {
        resetGesture();
        return;
      }

      gesturePhase = "swiping";
      viewportRef?.setPointerCapture(event.pointerId);
      setIsDragging(true);
    }

    setDragOffsetPx(dragOffsetXPx);
    pointerSamples = [
      ...pointerSamples.slice(-5),
      {
        clientX: event.clientX,
        timeMs: event.timeStamp,
      },
    ];
  }

  function handlePointerEnd(event: PointerEvent) {
    if (!isMobile() || event.pointerId !== activePointerId) {
      return;
    }

    if (gesturePhase !== "swiping") {
      resetGesture();
      return;
    }

    const releasedDragOffsetPx = event.clientX - gestureStartX;
    const velocityPxPerMs = getRecentVelocityPxPerMs(pointerSamples);
    const nextPane = getWorkspaceLayoutV2SettledPane({
      currentPane: gestureStartPane,
      dragOffsetPx: releasedDragOffsetPx,
      metrics: mobileMetrics(),
      velocityPxPerMs,
    });
    setCurrentPane(nextPane);
    resetGesture();
  }

  const paneClass = "flex h-full min-h-0 min-w-0 flex-col overflow-hidden";

  return (
    <main
      ref={viewportRef}
      class="h-svh overflow-hidden"
      data-testid="workspace-layout-v2-visual-fixture"
    >
      <Show
        when={isMobile()}
        fallback={
          <div
            class="flex h-full overflow-hidden"
            data-workspace-layout-v2="desktop"
          >
            <section
              aria-label="Left pane"
              class={`${paneClass} flex-1 border-r border-border`}
              data-testid="workspace-layout-v2-pane-left"
            >
              <ProsemarkSurface
                dataTestId="workspace-layout-v2-prosemark-surface"
                initialValue={mobileSidebarSpecRaw}
              />
            </section>
            <section
              aria-label="Main pane"
              class={`${paneClass} flex-1 border-r border-border`}
              data-testid="workspace-layout-v2-pane-main"
            >
              <MonacoSurface
                dataTestId="workspace-layout-v2-main-editor-surface"
                initialValue={mobileSidebarSpecRaw}
              />
            </section>
            <section
              aria-label="Right pane"
              class={`${paneClass} flex-1`}
              data-testid="workspace-layout-v2-pane-right"
            >
              <MonacoSurface
                dataTestId="workspace-layout-v2-right-editor-surface"
                initialValue={mobileSidebarSpecRaw}
              />
            </section>
          </div>
        }
      >
        <div
          class="h-full overflow-hidden touch-pan-y"
          data-mobile-pane={currentPane()}
          data-workspace-layout-v2="mobile"
        >
          <div
            class={
              isDragging()
                ? "flex h-full overflow-hidden will-change-transform"
                : "flex h-full overflow-hidden transition-transform duration-150 ease-out will-change-transform"
            }
            style={{
              transform: `translateX(-${mobileVisibleStartPx()}px)`,
              width: `${mobileTrackWidthPx()}px`,
            }}
          >
            <section
              aria-label="Left pane"
              class={`${paneClass} shrink-0 border-r border-border`}
              data-testid="workspace-layout-v2-pane-left"
              style={{ width: `${mobileSidebarWidthPx()}px` }}
            >
              <ProsemarkSurface
                dataTestId="workspace-layout-v2-prosemark-surface"
                initialValue={mobileSidebarSpecRaw}
              />
            </section>
            <section
              aria-label="Main pane"
              class={`${paneClass} shrink-0 border-r border-border`}
              data-testid="workspace-layout-v2-pane-main"
              style={{ width: `${mobileMainPaneWidthPx()}px` }}
            >
              <MonacoSurface
                dataTestId="workspace-layout-v2-main-editor-surface"
                initialValue={mobileSidebarSpecRaw}
              />
            </section>
            <section
              aria-label="Right pane"
              class={`${paneClass} shrink-0`}
              data-testid="workspace-layout-v2-pane-right"
              style={{ width: `${mobileSidebarWidthPx()}px` }}
            >
              <MonacoSurface
                dataTestId="workspace-layout-v2-right-editor-surface"
                initialValue={mobileSidebarSpecRaw}
              />
            </section>
          </div>
        </div>
      </Show>
    </main>
  );
}
