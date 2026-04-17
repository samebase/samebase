import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import mobileSidebarSpecRaw from "../../../../specs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md?raw";
import { MonacoSurface } from "@/components/MonacoSurface";
import { ProsemarkSurface } from "@/components/ProsemarkSurface";
import {
  getPaneQueueSettledIndex,
  getPaneQueueTrackWidthPx,
  getPaneQueueVisibleStartPx,
  type PaneQueueMetrics,
} from "@/lib/mobile-pane-layout";

const MOBILE_BREAKPOINT_PX = 768;
const MOBILE_DRAG_SLOP_PX = 12;
const MOBILE_SIDEBAR_MIN_WIDTH_PX = 160;
const MOBILE_VISIBLE_MAIN_STRIP_PX = 32;

type NonEmptyArray<T> = readonly [T, ...T[]];

type PointerSample = {
  clientX: number;
  timeMs: number;
};

type PointerGesturePhase = "pending" | "swiping";
type PaneKind = "monaco" | "prosemark";
type PaneSpec = {
  id: string;
  kind: PaneKind;
  paneTestId: string;
  surfaceTestId: string;
};

const paneSpecs = [
  {
    id: "pane-0",
    kind: "prosemark",
    paneTestId: "workspace-layout-v2-pane-0",
    surfaceTestId: "workspace-layout-v2-surface-0",
  },
  {
    id: "pane-1",
    kind: "monaco",
    paneTestId: "workspace-layout-v2-pane-1",
    surfaceTestId: "workspace-layout-v2-surface-1",
  },
  {
    id: "pane-2",
    kind: "monaco",
    paneTestId: "workspace-layout-v2-pane-2",
    surfaceTestId: "workspace-layout-v2-surface-2",
  },
  {
    id: "pane-3",
    kind: "monaco",
    paneTestId: "workspace-layout-v2-pane-3",
    surfaceTestId: "workspace-layout-v2-surface-3",
  },
] satisfies NonEmptyArray<PaneSpec>;

function renderPaneSurface(pane: PaneSpec) {
  if (pane.kind === "prosemark") {
    return (
      <ProsemarkSurface
        dataTestId={pane.surfaceTestId}
        initialValue={mobileSidebarSpecRaw}
      />
    );
  }

  return (
    <MonacoSurface
      dataTestId={pane.surfaceTestId}
      initialValue={mobileSidebarSpecRaw}
    />
  );
}

function getMobileSidebarWidthPx(viewportWidthPx: number) {
  // Keep the same exposed-strip budget the old sidebar layout used.
  return Math.max(
    MOBILE_SIDEBAR_MIN_WIDTH_PX,
    Math.round(viewportWidthPx - MOBILE_VISIBLE_MAIN_STRIP_PX),
  );
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
  const [activePaneIndex, setActivePaneIndex] = createSignal(1);
  const [dragOffsetPx, setDragOffsetPx] = createSignal(0);
  const [isDragging, setIsDragging] = createSignal(false);

  let viewportRef: HTMLElement | undefined;
  let activePointerId: number | null = null;
  let gesturePhase: PointerGesturePhase = "pending";
  let gestureStartX = 0;
  let gestureStartY = 0;
  let gestureStartPaneIndex = 1;
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
  const mobilePaneWidthPx = createMemo(() =>
    getMobileSidebarWidthPx(viewportWidthPx()),
  );
  const mobileMetrics = createMemo<PaneQueueMetrics>(() => ({
    paneCount: paneSpecs.length,
    paneWidthPx: mobilePaneWidthPx(),
    viewportWidthPx: viewportWidthPx(),
    visibleStripPx: MOBILE_VISIBLE_MAIN_STRIP_PX,
  }));
  const mobileTrackWidthPx = createMemo(() =>
    getPaneQueueTrackWidthPx(mobileMetrics()),
  );
  const mobileVisibleStartPx = createMemo(() =>
    getPaneQueueVisibleStartPx({
      currentPaneIndex: activePaneIndex(),
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
    gestureStartPaneIndex = activePaneIndex();
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
    const nextPaneIndex = getPaneQueueSettledIndex({
      currentPaneIndex: gestureStartPaneIndex,
      dragOffsetPx: releasedDragOffsetPx,
      metrics: mobileMetrics(),
      velocityPxPerMs,
    });
    setActivePaneIndex(nextPaneIndex);
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
            <For each={paneSpecs}>
              {(pane, index) => (
                <section
                  aria-label={`Pane ${index() + 1}`}
                  class={
                    index() < paneSpecs.length - 1
                      ? `${paneClass} flex-1 border-r border-border`
                      : `${paneClass} flex-1`
                  }
                  data-pane-id={pane.id}
                  data-testid={pane.paneTestId}
                >
                  {renderPaneSurface(pane)}
                </section>
              )}
            </For>
          </div>
        }
      >
        <div
          class="h-full overflow-hidden touch-pan-y"
          data-mobile-pane={paneSpecs[activePaneIndex()]?.id ?? ""}
          data-mobile-pane-index={activePaneIndex()}
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
            <For each={paneSpecs}>
              {(pane, index) => (
                <section
                  aria-label={`Pane ${index() + 1}`}
                  class={
                    index() < paneSpecs.length - 1
                      ? `${paneClass} shrink-0 border-r border-border`
                      : `${paneClass} shrink-0`
                  }
                  data-pane-id={pane.id}
                  data-testid={pane.paneTestId}
                  style={{ width: `${mobilePaneWidthPx()}px` }}
                >
                  {renderPaneSurface(pane)}
                </section>
              )}
            </For>
          </div>
        </div>
      </Show>
    </main>
  );
}
