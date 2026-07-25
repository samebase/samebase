import {
  SIERPINSKI_CARPET_HOVER_HOLES,
  readSierpinskiCarpetHoleOpenness,
  readSierpinskiCarpetHoleRevealedRect,
  type SierpinskiCarpetHoverConfig,
  type SierpinskiCarpetHoverMechanic,
  type SierpinskiCarpetHoverPointer,
} from "@samebase/logo-model/sierpinski-carpet-hover";
import { useCallback, useEffect, useRef } from "react";

const CARPET_FRAME_PADDING = 1.12;
const RENDER_PIXEL_RATIO_MAX = 2;
const OPENNESS_LERP_PER_FRAME = 0.25;
const OPENNESS_SETTLE_EPSILON = 0.001;

export type SierpinskiCarpetHoverSceneConfig = SierpinskiCarpetHoverConfig & {
  mechanic: SierpinskiCarpetHoverMechanic;
};

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

/**
Fills its container with a pointer-revealed Sierpinski carpet: the depth-one
hole is the resting mark, deeper holes open around the pointer per config.
The pointer is tracked page-wide, so the carpet reacts while the mouse roams
the surrounding chrome, and the surface heals when the pointer leaves the
page or a touch lifts.
*/
export function SierpinskiCarpetHoverScene({
  carpetColor,
  config,
}: {
  carpetColor: string;
  config: SierpinskiCarpetHoverSceneConfig;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const carpetColorRef = useRef(carpetColor);
  const configRef = useRef(config);
  const pointerRef = useRef<SierpinskiCarpetHoverPointer | null>(null);
  // Slide direction outlives the hover so healing wipes keep their anchor
  // edge after the pointer leaves the page.
  const lastPointerRef = useRef<SierpinskiCarpetHoverPointer | null>(null);
  const opennessRef = useRef(new Float64Array(SIERPINSKI_CARPET_HOVER_HOLES.length));
  const frameRef = useRef(0);
  const prefersReducedMotionRef = useRef(false);
  const drawRef = useRef<() => void>(() => {});

  const scheduleFrame = useCallback(() => {
    if (frameRef.current !== 0) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      drawRef.current();
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
        opennessRef.current[index] = 1;
      }
    }

    const draw = () => {
      const pixelRatio = Math.min(window.devicePixelRatio, RENDER_PIXEL_RATIO_MAX);
      const width = canvas.width / pixelRatio;
      const height = canvas.height / pixelRatio;
      // A display-none instance (the landing hero below desktop width) keeps
      // its canvas at the 1px floor; skip hole math until it has real size.
      if (width <= 1 && height <= 1) {
        return;
      }

      const frame = readCarpetFrame(width, height);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = carpetColorRef.current;
      context.fillRect(frame.originX, frame.originY, frame.side, frame.side);

      const openness = opennessRef.current;
      let settled = true;
      for (const [index, hole] of SIERPINSKI_CARPET_HOVER_HOLES.entries()) {
        const target = readSierpinskiCarpetHoleOpenness(
          hole,
          pointerRef.current,
          configRef.current,
        );
        const current = openness[index] ?? 0;
        let next = prefersReducedMotionRef.current
          ? target
          : current + (target - current) * OPENNESS_LERP_PER_FRAME;
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
          pointerRef.current ?? lastPointerRef.current,
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
      if (!settled) {
        scheduleFrame();
      }
    };

    const resizeCanvas = () => {
      const pixelRatio = Math.min(window.devicePixelRatio, RENDER_PIXEL_RATIO_MAX);
      canvas.width = Math.max(Math.round(container.clientWidth * pixelRatio), 1);
      canvas.height = Math.max(Math.round(container.clientHeight * pixelRatio), 1);
      draw();
    };

    const readUnitPointer = (event: PointerEvent): SierpinskiCarpetHoverPointer | null => {
      const bounds = container.getBoundingClientRect();
      const frame = readCarpetFrame(bounds.width, bounds.height);
      if (frame.side <= 0) {
        return null;
      }

      return {
        x: (event.clientX - bounds.left - frame.originX) / frame.side,
        y: (event.clientY - bounds.top - frame.originY) / frame.side,
      };
    };
    // The reveal tracks the pointer across the whole page, not only the
    // canvas, so nearby holes keep reacting while the mouse is over the
    // chrome. Healing starts when the pointer leaves the page or a touch or
    // pen lifts; a released mouse keeps hovering.
    const onWindowPointerMove = (event: PointerEvent) => {
      if (!event.isPrimary) {
        return;
      }

      pointerRef.current = readUnitPointer(event);
      lastPointerRef.current = pointerRef.current ?? lastPointerRef.current;
      scheduleFrame();
    };
    const onWindowPointerEnd = (event: PointerEvent) => {
      if (!event.isPrimary || event.pointerType === "mouse") {
        return;
      }

      pointerRef.current = null;
      scheduleFrame();
    };
    const onPagePointerLeave = () => {
      pointerRef.current = null;
      scheduleFrame();
    };
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerEnd);
    window.addEventListener("pointercancel", onWindowPointerEnd);
    document.documentElement.addEventListener("pointerleave", onPagePointerLeave);

    drawRef.current = draw;
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotionRef.current = reducedMotionQuery.matches;
    const onReducedMotionChange = (event: MediaQueryListEvent) => {
      prefersReducedMotionRef.current = event.matches;
      scheduleFrame();
    };
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);
    resizeCanvas();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerEnd);
      window.removeEventListener("pointercancel", onWindowPointerEnd);
      document.documentElement.removeEventListener("pointerleave", onPagePointerLeave);
      reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
      drawRef.current = () => {};
      if (frameRef.current !== 0) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
    };
  }, [scheduleFrame]);

  useEffect(() => {
    configRef.current = config;
    carpetColorRef.current = carpetColor;
    drawRef.current();
  }, [carpetColor, config]);

  return (
    <div
      ref={containerRef}
      aria-label="Sierpinski carpet hover reveal"
      className="h-full min-h-0 w-full cursor-crosshair touch-none select-none"
      data-testid="logo-carpet-hover-scene"
      role="img"
    >
      <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />
    </div>
  );
}
