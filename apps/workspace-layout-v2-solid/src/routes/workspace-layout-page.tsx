import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import solidLabNotesRaw from "../../SOLID_LAB_NOTES.md?raw";
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
const MOBILE_PANE_MIN_WIDTH_PX = 160;
const MOBILE_RESIZE_HANDLE_TOUCH_HEIGHT_PX = 64;
const MOBILE_RESIZE_HANDLE_TOUCH_WIDTH_PX = 16;
const MOBILE_VISIBLE_MAIN_STRIP_PX = 32;

type NonEmptyArray<T> = readonly [T, ...T[]];

type PointerSample = {
  clientX: number;
  timeMs: number;
};

type PointerGesturePhase = "pending" | "swiping";
type PaneKind = "monaco" | "prosemark";
type ResizeHandleSide = "left" | "right";
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
        initialValue={solidLabNotesRaw}
      />
    );
  }

  return (
    <MonacoSurface
      dataTestId={pane.surfaceTestId}
      initialValue={solidLabNotesRaw}
    />
  );
}

function getMobilePaneMaxWidthPx(viewportWidthPx: number) {
  // Keep the same exposed-strip budget the old sidebar layout used.
  return Math.max(
    MOBILE_PANE_MIN_WIDTH_PX,
    Math.round(viewportWidthPx - MOBILE_VISIBLE_MAIN_STRIP_PX),
  );
}

function clampNumber(value: number, minValue: number, maxValue: number) {
  return Math.max(minValue, Math.min(value, maxValue));
}

function areNumberArraysEqual(
  leftValues: readonly number[],
  rightValues: readonly number[],
) {
  if (leftValues.length !== rightValues.length) {
    return false;
  }

  for (let index = 0; index < leftValues.length; index += 1) {
    if (leftValues[index] !== rightValues[index]) {
      return false;
    }
  }

  return true;
}

function isResizeHandleTarget(
  target: EventTarget | null,
  viewportNode: HTMLElement | undefined,
) {
  let node = target instanceof Element ? target : null;

  while (node !== null && node !== viewportNode) {
    if (node.hasAttribute("data-workspace-layout-v2-resize-handle")) {
      return true;
    }
    node = node.parentElement;
  }

  return false;
}

function getPaneIndexFromTarget(
  target: EventTarget | null,
  viewportNode: HTMLElement | undefined,
) {
  let node = target instanceof Element ? target : null;

  while (node !== null && node !== viewportNode) {
    const paneIndexAttribute = node.getAttribute("data-pane-index");
    if (paneIndexAttribute !== null) {
      const paneIndex = Number(paneIndexAttribute);
      return Number.isInteger(paneIndex) ? paneIndex : null;
    }
    node = node.parentElement;
  }

  return null;
}

function blurFocusedWorkspaceEditor(viewportNode: HTMLElement | undefined) {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) {
    return;
  }
  if (viewportNode && !viewportNode.contains(activeElement)) {
    return;
  }

  activeElement.blur();
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
  const [activeResizePaneIndex, setActiveResizePaneIndex] = createSignal<
    number | null
  >(null);
  const [dragOffsetPx, setDragOffsetPx] = createSignal(0);
  const [isDragging, setIsDragging] = createSignal(false);
  const [mobilePaneWidthsPx, setMobilePaneWidthsPx] = createSignal<
    readonly number[]
  >([]);

  let viewportRef: HTMLElement | undefined;
  let activePointerId: number | null = null;
  let activeResizePointerId: number | null = null;
  let gesturePhase: PointerGesturePhase = "pending";
  let gestureStartX = 0;
  let gestureStartY = 0;
  let gestureStartPaneIndex = 1;
  let pointerSamples: PointerSample[] = [];
  let activeResizeHandleSide: ResizeHandleSide | null = null;
  let resizeStartPaneWidthPx = 0;
  let resizeStartX = 0;
  let pointerDownPaneIndex: number | null = null;
  let shouldSuppressNextClick = false;
  let clickSuppressionSetAtMs = 0;

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
    viewportNode.addEventListener("click", handleClickCapture, {
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
      viewportNode.removeEventListener("click", handleClickCapture, {
        capture: true,
      });
    });
  });

  const isMobile = createMemo(() => viewportWidthPx() < MOBILE_BREAKPOINT_PX);
  const mobilePaneMaxWidthPx = createMemo(() =>
    getMobilePaneMaxWidthPx(viewportWidthPx()),
  );
  const isResizing = createMemo(() => activeResizePaneIndex() !== null);

  createEffect(() => {
    const mobilePaneMaxWidth = mobilePaneMaxWidthPx();
    if (mobilePaneMaxWidth <= 0) {
      return;
    }

    setMobilePaneWidthsPx((previousWidthsPx) => {
      const nextWidthsPx =
        previousWidthsPx.length === paneSpecs.length
          ? previousWidthsPx.map((paneWidthPx) =>
              clampNumber(
                paneWidthPx,
                MOBILE_PANE_MIN_WIDTH_PX,
                mobilePaneMaxWidth,
              ),
            )
          : paneSpecs.map(() => mobilePaneMaxWidth);

      return areNumberArraysEqual(previousWidthsPx, nextWidthsPx)
        ? previousWidthsPx
        : nextWidthsPx;
    });
  });

  const mobileMetrics = createMemo<PaneQueueMetrics>(() => ({
    paneCount: paneSpecs.length,
    paneWidthsPx: mobilePaneWidthsPx(),
    viewportWidthPx: viewportWidthPx(),
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
    pointerDownPaneIndex = null;
    pointerSamples = [];
    setIsDragging(false);
    setDragOffsetPx(0);
  }

  function resetResize() {
    if (
      activeResizePointerId !== null &&
      viewportRef?.hasPointerCapture(activeResizePointerId)
    ) {
      viewportRef.releasePointerCapture(activeResizePointerId);
    }
    activeResizePointerId = null;
    activeResizeHandleSide = null;
    resizeStartPaneWidthPx = 0;
    resizeStartX = 0;
    setActiveResizePaneIndex(null);
  }

  function handleResizePointerDown(
    paneIndex: number,
    side: ResizeHandleSide,
    event: PointerEvent,
  ) {
    if (
      !isMobile() ||
      !event.isPrimary ||
      activePointerId !== null ||
      activeResizePointerId !== null
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    activeResizePointerId = event.pointerId;
    activeResizeHandleSide = side;
    resizeStartPaneWidthPx =
      mobilePaneWidthsPx()[paneIndex] ?? mobilePaneMaxWidthPx();
    resizeStartX = event.clientX;
    setActiveResizePaneIndex(paneIndex);
    viewportRef?.setPointerCapture(event.pointerId);
  }

  function handleActiveResizePointerMove(event: PointerEvent) {
    if (event.pointerId !== activeResizePointerId) {
      return;
    }

    const paneIndex = activeResizePaneIndex();
    if (paneIndex === null) {
      return;
    }

    const resizeDeltaPx =
      activeResizeHandleSide === "left"
        ? resizeStartX - event.clientX
        : event.clientX - resizeStartX;
    const nextPaneWidthPx = clampNumber(
      resizeStartPaneWidthPx + resizeDeltaPx,
      MOBILE_PANE_MIN_WIDTH_PX,
      mobilePaneMaxWidthPx(),
    );

    setMobilePaneWidthsPx((previousWidthsPx) => {
      const nextWidthsPx = previousWidthsPx.map((paneWidthPx, index) =>
        index === paneIndex ? nextPaneWidthPx : paneWidthPx,
      );

      return areNumberArraysEqual(previousWidthsPx, nextWidthsPx)
        ? previousWidthsPx
        : nextWidthsPx;
    });
  }

  function handleActiveResizePointerEnd(event: PointerEvent) {
    if (event.pointerId !== activeResizePointerId) {
      return;
    }

    resetResize();
  }

  function handlePointerDown(event: PointerEvent) {
    if (
      !isMobile() ||
      !event.isPrimary ||
      activePointerId !== null ||
      activeResizePointerId !== null ||
      isResizeHandleTarget(event.target, viewportRef)
    ) {
      return;
    }

    shouldSuppressNextClick = false;

    pointerDownPaneIndex = getPaneIndexFromTarget(event.target, viewportRef);
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

    if (
      pointerDownPaneIndex !== null &&
      pointerDownPaneIndex !== gestureStartPaneIndex
    ) {
      event.preventDefault();
    }
  }

  function handlePointerMove(event: PointerEvent) {
    if (activeResizePointerId !== null) {
      handleActiveResizePointerMove(event);
      return;
    }

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

      // Swiping is navigation, so it should dismiss any editor focus first.
      blurFocusedWorkspaceEditor(viewportRef);
      shouldSuppressNextClick = true;
      clickSuppressionSetAtMs = event.timeStamp;
      gesturePhase = "swiping";
      event.preventDefault();
      viewportRef?.setPointerCapture(event.pointerId);
      setIsDragging(true);
    }

    event.preventDefault();
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
    if (activeResizePointerId !== null) {
      handleActiveResizePointerEnd(event);
      return;
    }

    if (!isMobile() || event.pointerId !== activePointerId) {
      return;
    }

    if (gesturePhase !== "swiping") {
      if (
        pointerDownPaneIndex !== null &&
        pointerDownPaneIndex !== activePaneIndex()
      ) {
        blurFocusedWorkspaceEditor(viewportRef);
        shouldSuppressNextClick = true;
        clickSuppressionSetAtMs = event.timeStamp;
        event.preventDefault();
        setActivePaneIndex(pointerDownPaneIndex);
      }
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
    shouldSuppressNextClick = true;
    clickSuppressionSetAtMs = event.timeStamp;
    event.preventDefault();
    setActivePaneIndex(nextPaneIndex);
    resetGesture();
  }

  function handleClickCapture(event: MouseEvent) {
    if (!shouldSuppressNextClick || event.timeStamp < clickSuppressionSetAtMs) {
      return;
    }

    shouldSuppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  const paneClass =
    "relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden";
  const resizeHandleTouchStyle = {
    height: `${MOBILE_RESIZE_HANDLE_TOUCH_HEIGHT_PX}px`,
    width: `${MOBILE_RESIZE_HANDLE_TOUCH_WIDTH_PX}px`,
  };
  const resizeGripDots = (
    <div class="flex h-full w-full items-center justify-center">
      <div class="flex h-6 w-3 items-center justify-center rounded-full border border-border bg-background/95">
        <div class="flex flex-col items-center justify-center gap-[2px]">
          <div class="h-[2px] w-[2px] rounded-full bg-cyan-400 shadow-[0_0_4px_rgba(34,211,238,0.95)]" />
          <div class="h-[2px] w-[2px] rounded-full bg-cyan-400 shadow-[0_0_4px_rgba(34,211,238,0.95)]" />
          <div class="h-[2px] w-[2px] rounded-full bg-cyan-400 shadow-[0_0_4px_rgba(34,211,238,0.95)]" />
        </div>
      </div>
    </div>
  );

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
                  data-pane-index={index()}
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
              isDragging() || isResizing()
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
                  data-pane-index={index()}
                  data-pane-id={pane.id}
                  data-testid={pane.paneTestId}
                  style={{
                    width: `${mobilePaneWidthsPx()[index()] ?? mobilePaneMaxWidthPx()}px`,
                  }}
                >
                  {renderPaneSurface(pane)}
                  <Show when={activePaneIndex() === index()}>
                    <>
                      <div
                        class="absolute left-0 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 touch-none"
                        data-testid="workspace-layout-v2-mobile-resize-handle-left"
                        data-workspace-layout-v2-resize-handle=""
                        onPointerDown={(event) =>
                          handleResizePointerDown(index(), "left", event)
                        }
                        style={resizeHandleTouchStyle}
                      >
                        {resizeGripDots}
                      </div>
                      <div
                        class="absolute right-0 top-1/2 z-20 translate-x-1/2 -translate-y-1/2 touch-none"
                        data-testid="workspace-layout-v2-mobile-resize-handle-right"
                        data-workspace-layout-v2-resize-handle=""
                        onPointerDown={(event) =>
                          handleResizePointerDown(index(), "right", event)
                        }
                        style={resizeHandleTouchStyle}
                      >
                        {resizeGripDots}
                      </div>
                    </>
                  </Show>
                </section>
              )}
            </For>
          </div>
        </div>
      </Show>
    </main>
  );
}
