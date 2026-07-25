import {
  SIERPINSKI_CARPET_HOVER_HOLES,
  readSierpinskiCarpetHoleOpenness,
  readSierpinskiCarpetHoleRevealedRect,
  type SierpinskiCarpetHoverConfig,
  type SierpinskiCarpetHoverMechanic,
  type SierpinskiCarpetHoverPointer,
} from "@samebase/logo-model/sierpinski-carpet-hover";
import { useCallback, useEffect, useRef, useState } from "react";

const CARPET_FRAME_PADDING = 1.12;
const RENDER_PIXEL_RATIO_MAX = 2;
// Matches the former 0.25-per-frame lerp at 60Hz while staying refresh-rate
// independent: 1 - exp(-16.7 / 58) is roughly 0.25.
const OPENNESS_SMOOTHING_TAU_MS = 58;
const OPENNESS_SETTLE_EPSILON = 0.001;
const FRAME_ELAPSED_MAX_MS = 100;
// The first frame after idle or suspension steps one nominal 60Hz frame;
// carrying the real gap through the clamp above would snap most of the
// animation on restart.
const FRAME_ELAPSED_RESTART_MS = 1000 / 60;

/**
Holes are sorted by depth, so every reveal cap owns a stable prefix of the
hole list; the draw loop only visits that prefix instead of the full
depth-six model.
*/
const HOLE_PREFIX_BY_MAX_DEPTH = (() => {
  const prefixByDepth = new Map<number, number>();
  for (const [index, hole] of SIERPINSKI_CARPET_HOVER_HOLES.entries()) {
    prefixByDepth.set(hole.depth, index + 1);
  }

  return prefixByDepth;
})();

function readActiveHoleCount(config: SierpinskiCarpetHoverConfig): number {
  return HOLE_PREFIX_BY_MAX_DEPTH.get(config.maxDepth) ?? SIERPINSKI_CARPET_HOVER_HOLES.length;
}

export type SierpinskiCarpetHoverSceneConfig = SierpinskiCarpetHoverConfig & {
  mechanic: SierpinskiCarpetHoverMechanic;
};

/**
The static fallback draws the resting depth-one carpet with the exact
letterboxed square readCarpetFrame produces: a unit viewBox with "meet"
scaling maps to the centered min(width, height) box, and these fractions
place the same padded square and center ninth inside it. The canvas draw
must stay pixel-aligned with this path so the crossfade never jumps.
*/
const FALLBACK_SIDE = 1 / CARPET_FRAME_PADDING;
const FALLBACK_ORIGIN = (1 - FALLBACK_SIDE) / 2;
const FALLBACK_HOLE_SIDE = FALLBACK_SIDE / 3;
const FALLBACK_HOLE_ORIGIN = (1 - FALLBACK_HOLE_SIDE) / 2;
const STATIC_FALLBACK_PATH = [
  `M${FALLBACK_ORIGIN.toFixed(6)} ${FALLBACK_ORIGIN.toFixed(6)}`,
  `h${FALLBACK_SIDE.toFixed(6)}v${FALLBACK_SIDE.toFixed(6)}h-${FALLBACK_SIDE.toFixed(6)}Z`,
  `M${FALLBACK_HOLE_ORIGIN.toFixed(6)} ${FALLBACK_HOLE_ORIGIN.toFixed(6)}`,
  `h${FALLBACK_HOLE_SIDE.toFixed(6)}v${FALLBACK_HOLE_SIDE.toFixed(6)}h-${FALLBACK_HOLE_SIDE.toFixed(6)}Z`,
].join("");

/**
The carpet is the largest centered square that keeps the same breathing room
the menger scene gives its frustum. Pointer math and painting must share this
frame so unit coordinates line up with drawn pixels.
*/
function readCarpetFrame(width: number, height: number) {
  const side = Math.min(width, height) / CARPET_FRAME_PADDING;

  return {
    originX: (width - side) / 2,
    originY: (height - side) / 2,
    side,
  };
}

type ClientPoint = {
  x: number;
  y: number;
};

/**
Fills its container with a pointer-revealed Sierpinski carpet: the depth-one
hole is the resting mark, deeper holes open around the pointer per config.
The pointer is tracked page-wide in client coordinates and re-projected onto
the carpet every frame, so scrolling under a stationary pointer keeps the
reveal attached to the cursor, and the surface heals when the pointer leaves
the page or a touch lifts. touchReveal decides whether touch gestures drive
the reveal (the lab) or stay with page scrolling (the landing hero).
*/
export function SierpinskiCarpetHoverScene({
  carpetColor,
  config,
  touchReveal,
}: {
  carpetColor: string;
  config: SierpinskiCarpetHoverSceneConfig;
  touchReveal: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const carpetColorRef = useRef(carpetColor);
  const configRef = useRef(config);
  const touchRevealRef = useRef(touchReveal);
  const clientPointerRef = useRef<ClientPoint | null>(null);
  // Slide anchors outlive the hover so healing wipes keep their direction
  // after the pointer leaves the page.
  const lastClientPointerRef = useRef<ClientPoint | null>(null);
  // The openness buffer is ~300KB; the lazy initializer allocates it once
  // instead of building and discarding one on every render.
  const [opennessBuffer] = useState(() => new Float64Array(SIERPINSKI_CARPET_HOVER_HOLES.length));
  const frameRef = useRef(0);
  // Null whenever the draw loop is idle, so restarts step from a nominal
  // frame instead of the stale gap since the last run.
  const lastFrameTimeRef = useRef<number | null>(null);
  const prefersReducedMotionRef = useRef(false);
  const visibleRef = useRef(true);
  const drawRef = useRef<(timestampMs?: number) => void>(() => {});
  const sceneReadyRef = useRef(false);
  // The server-rendered SVG fallback stays visible until the canvas has
  // painted a real-size frame, so first paint always shows the resting mark.
  const [isSceneReady, setIsSceneReady] = useState(false);

  const scheduleFrame = useCallback(() => {
    if (frameRef.current !== 0 || !visibleRef.current) {
      return;
    }

    frameRef.current = window.requestAnimationFrame((timestampMs) => {
      frameRef.current = 0;
      drawRef.current(timestampMs);
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!container || !canvas || !context) {
      return;
    }

    // Depth-one holes are the resting logo state, so they start open instead
    // of animating in on mount.
    for (const [index, hole] of SIERPINSKI_CARPET_HOVER_HOLES.entries()) {
      if (hole.depth === 1) {
        opennessBuffer[index] = 1;
      }
    }

    const toUnitPointer = (
      clientPoint: ClientPoint | null,
    ): SierpinskiCarpetHoverPointer | null => {
      if (clientPoint === null) {
        return null;
      }

      const bounds = container.getBoundingClientRect();
      const frame = readCarpetFrame(bounds.width, bounds.height);
      if (frame.side <= 0) {
        return null;
      }

      return {
        x: (clientPoint.x - bounds.left - frame.originX) / frame.side,
        y: (clientPoint.y - bounds.top - frame.originY) / frame.side,
      };
    };

    const draw = (timestampMs?: number) => {
      const pixelRatio = Math.min(window.devicePixelRatio, RENDER_PIXEL_RATIO_MAX);
      const width = canvas.width / pixelRatio;
      const height = canvas.height / pixelRatio;
      // A display-none instance (the landing hero below desktop width) keeps
      // its canvas at the 1px floor; skip hole math until it has real size.
      if (width <= 1 && height <= 1) {
        return;
      }

      const now = timestampMs ?? performance.now();
      const previousFrameTime = lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      const elapsedMs =
        previousFrameTime === null
          ? FRAME_ELAPSED_RESTART_MS
          : Math.min(Math.max(now - previousFrameTime, 0), FRAME_ELAPSED_MAX_MS);
      const smoothing = prefersReducedMotionRef.current
        ? 1
        : 1 - Math.exp(-elapsedMs / OPENNESS_SMOOTHING_TAU_MS);

      const frame = readCarpetFrame(width, height);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = carpetColorRef.current;
      context.fillRect(frame.originX, frame.originY, frame.side, frame.side);

      // Client coordinates re-project every frame, so scrolling the page
      // under a stationary pointer moves the reveal with the carpet.
      const pointer = toUnitPointer(clientPointerRef.current);
      const directionPointer = pointer ?? toUnitPointer(lastClientPointerRef.current);
      const openness = opennessBuffer;
      const activeHoleCount = readActiveHoleCount(configRef.current);
      let settled = true;
      for (let index = 0; index < activeHoleCount; index += 1) {
        const hole = SIERPINSKI_CARPET_HOVER_HOLES[index];
        const target = readSierpinskiCarpetHoleOpenness(hole, pointer, configRef.current);
        const current = openness[index] ?? 0;
        let next = current + (target - current) * smoothing;
        if (Math.abs(next - target) < OPENNESS_SETTLE_EPSILON) {
          next = target;
        } else {
          settled = false;
        }
        openness[index] = next;

        const revealedRect = readSierpinskiCarpetHoleRevealedRect(
          hole,
          next,
          configRef.current.mechanic,
          directionPointer,
        );
        if (revealedRect) {
          context.clearRect(
            frame.originX + revealedRect.x * frame.side,
            frame.originY + revealedRect.y * frame.side,
            revealedRect.width * frame.side,
            revealedRect.height * frame.side,
          );
        }
      }

      container.dataset.carpetSettled = settled ? "true" : "false";
      if (!sceneReadyRef.current) {
        sceneReadyRef.current = true;
        setIsSceneReady(true);
      }
      if (!settled) {
        scheduleFrame();
      } else {
        lastFrameTimeRef.current = null;
      }
    };

    const resizeCanvas = () => {
      const pixelRatio = Math.min(window.devicePixelRatio, RENDER_PIXEL_RATIO_MAX);
      canvas.width = Math.max(Math.round(container.clientWidth * pixelRatio), 1);
      canvas.height = Math.max(Math.round(container.clientHeight * pixelRatio), 1);
      // The backing store tracks layout even offscreen; painting waits for
      // the intersection observer's re-entry frame.
      if (visibleRef.current) {
        draw();
      }
    };

    // The reveal tracks the pointer across the whole page, not only the
    // canvas, so nearby holes keep reacting while the mouse is over the
    // chrome. Healing starts when the pointer leaves the page or a touch or
    // pen lifts; a released mouse keeps hovering. Surfaces with touchReveal
    // off ignore touch pointers entirely, so taps neither reveal nor heal.
    const onWindowPointerMove = (event: PointerEvent) => {
      if (!event.isPrimary || (event.pointerType === "touch" && !touchRevealRef.current)) {
        return;
      }

      clientPointerRef.current = { x: event.clientX, y: event.clientY };
      lastClientPointerRef.current = clientPointerRef.current;
      scheduleFrame();
    };
    const onWindowPointerEnd = (event: PointerEvent) => {
      if (!event.isPrimary || event.pointerType === "mouse") {
        return;
      }
      if (event.pointerType === "touch" && !touchRevealRef.current) {
        return;
      }

      clientPointerRef.current = null;
      scheduleFrame();
    };
    const onPagePointerLeave = () => {
      clientPointerRef.current = null;
      scheduleFrame();
    };
    // Capture-phase scroll covers the window and every nested scroller, so a
    // stationary pointer keeps projecting onto the moving carpet.
    const onAnyScroll = () => {
      scheduleFrame();
    };
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerEnd);
    window.addEventListener("pointercancel", onWindowPointerEnd);
    window.addEventListener("scroll", onAnyScroll, { capture: true, passive: true });
    document.documentElement.addEventListener("pointerleave", onPagePointerLeave);

    drawRef.current = draw;
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotionRef.current = reducedMotionQuery.matches;
    const onReducedMotionChange = (event: MediaQueryListEvent) => {
      prefersReducedMotionRef.current = event.matches;
      scheduleFrame();
    };
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);
    // Suspend the draw loop entirely while the scene is scrolled offscreen.
    const intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (!entry) {
        return;
      }

      visibleRef.current = entry.isIntersecting;
      if (entry.isIntersecting) {
        // A suspension can freeze the clock mid-animation; restart nominal.
        lastFrameTimeRef.current = null;
        scheduleFrame();
      }
    });
    intersectionObserver.observe(container);
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);
    resizeCanvas();

    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerEnd);
      window.removeEventListener("pointercancel", onWindowPointerEnd);
      window.removeEventListener("scroll", onAnyScroll, { capture: true });
      document.documentElement.removeEventListener("pointerleave", onPagePointerLeave);
      reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
      drawRef.current = () => {};
      if (frameRef.current !== 0) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
    };
  }, [opennessBuffer, scheduleFrame]);

  useEffect(() => {
    configRef.current = config;
    carpetColorRef.current = carpetColor;
    touchRevealRef.current = touchReveal;
    // Holes beyond a lowered reveal cap leave the draw prefix, so their
    // openness closes immediately instead of freezing mid-heal.
    opennessBuffer.fill(0, readActiveHoleCount(config));
    // Offscreen instances defer the repaint to the intersection observer's
    // re-entry frame.
    if (visibleRef.current) {
      drawRef.current();
    }
  }, [carpetColor, config, opennessBuffer, touchReveal]);

  return (
    <div
      ref={containerRef}
      aria-label="Sierpinski carpet hover reveal"
      className={`relative h-full min-h-0 w-full select-none ${touchReveal ? "touch-none" : ""}`}
      data-carpet-ready={isSceneReady ? "true" : "false"}
      data-testid="logo-carpet-hover-scene"
      role="img"
    >
      <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />
      {/* The renderer handoff crossfades to preserve visual continuity, not
      to add decorative motion; both layers draw the same resting geometry. */}
      <svg
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-10 h-full w-full transition-opacity duration-300 ease-out ${isSceneReady ? "opacity-0" : "opacity-100"}`}
        data-testid="logo-carpet-hover-fallback"
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 1 1"
      >
        <path d={STATIC_FALLBACK_PATH} fill={carpetColor} fillRule="evenodd" />
      </svg>
    </div>
  );
}
