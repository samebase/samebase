import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

type HtmlCanvasDrawElement = {
  (element: Element, dx: number, dy: number): DOMMatrix;
  (
    element: Element,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): DOMMatrix;
};

type HtmlCanvasMode = "tear" | "sheet" | "orbit";
type HtmlCanvasSupportState = "checking" | "available" | "missing";

type HtmlCanvasPaintEvent = Event & {
  readonly changedElements?: readonly Element[];
};

declare global {
  interface CanvasRenderingContext2D {
    drawElement?: HtmlCanvasDrawElement;
    drawElementImage?: HtmlCanvasDrawElement;
  }

  interface HTMLCanvasElement {
    onpaint?: ((this: HTMLCanvasElement, event: HtmlCanvasPaintEvent) => void) | null;
    requestPaint?: () => void;
  }
}

const HTML_CANVAS_MODES = ["tear", "sheet", "orbit"] as const satisfies readonly HtmlCanvasMode[];
const INITIAL_SOURCE_TEXT = "A page can become material once styled HTML is available as pixels.";
const INITIAL_INTENSITY = 48;
const INITIAL_COPIES = 7;

const MODE_LABELS = {
  orbit: "Orbit",
  sheet: "Sheet",
  tear: "Tear",
} as const satisfies Record<HtmlCanvasMode, string>;

const MODE_BUTTON_CLASS_NAMES = {
  active: "h-8 rounded-none border-black bg-black text-white hover:bg-black hover:text-white",
  inactive: "h-8 rounded-none border-black/20 bg-white text-black hover:bg-black/5",
} as const;

function getDrawElementSupport(context: CanvasRenderingContext2D | null): boolean {
  return Boolean(context?.drawElementImage ?? context?.drawElement);
}

function drawElementFull({
  context,
  element,
  x,
  y,
}: {
  context: CanvasRenderingContext2D;
  element: Element;
  x: number;
  y: number;
}): DOMMatrix | null {
  if (context.drawElementImage) {
    return context.drawElementImage(element, x, y);
  }
  if (context.drawElement) {
    return context.drawElement(element, x, y);
  }
  return null;
}

function drawElementCrop({
  context,
  destinationHeight,
  destinationWidth,
  destinationX,
  destinationY,
  element,
  sourceHeight,
  sourceWidth,
  sourceX,
  sourceY,
}: {
  context: CanvasRenderingContext2D;
  destinationHeight: number;
  destinationWidth: number;
  destinationX: number;
  destinationY: number;
  element: Element;
  sourceHeight: number;
  sourceWidth: number;
  sourceX: number;
  sourceY: number;
}): DOMMatrix | null {
  if (context.drawElementImage) {
    return context.drawElementImage(
      element,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      destinationX,
      destinationY,
      destinationWidth,
      destinationHeight,
    );
  }
  if (context.drawElement) {
    return context.drawElement(
      element,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      destinationX,
      destinationY,
      destinationWidth,
      destinationHeight,
    );
  }
  return null;
}

function resizeCanvasToCssPixels(canvas: HTMLCanvasElement): boolean {
  const rect = canvas.getBoundingClientRect();
  const nextWidth = Math.max(1, Math.round(rect.width));
  const nextHeight = Math.max(1, Math.round(rect.height));
  if (canvas.width === nextWidth && canvas.height === nextHeight) {
    return false;
  }

  canvas.width = nextWidth;
  canvas.height = nextHeight;
  return true;
}

function drawUnavailableCanvas(context: CanvasRenderingContext2D, width: number, height: number) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f7f7f2";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#d5d2c8";
  context.lineWidth = 1;

  const gridSize = 28;
  for (let x = 0; x <= width; x += gridSize) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += gridSize) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function drawCanvasBackground(context: CanvasRenderingContext2D, width: number, height: number) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#f7f7f2";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#23211f";
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, width - 1, height - 1);
}

function setSourceTransform(sourceElement: HTMLElement, matrix: DOMMatrix | null) {
  sourceElement.style.transform = matrix ? matrix.toString() : "";
}

function drawSheetMode({
  context,
  height,
  phase,
  sourceElement,
  sourceHeight,
  sourceWidth,
  strength,
  width,
}: {
  context: CanvasRenderingContext2D;
  height: number;
  phase: number;
  sourceElement: HTMLElement;
  sourceHeight: number;
  sourceWidth: number;
  strength: number;
  width: number;
}) {
  const x = (width - sourceWidth) / 2;
  const y = (height - sourceHeight) / 2 + Math.sin(phase) * strength * 0.16;
  context.save();
  context.translate(x + sourceWidth / 2, y + sourceHeight / 2);
  context.rotate(Math.sin(phase * 0.7) * 0.025);
  const matrix = drawElementFull({
    context,
    element: sourceElement,
    x: -sourceWidth / 2,
    y: -sourceHeight / 2,
  });
  context.restore();
  setSourceTransform(sourceElement, matrix);
}

function drawOrbitMode({
  context,
  copies,
  height,
  phase,
  sourceElement,
  sourceHeight,
  sourceWidth,
  strength,
  width,
}: {
  context: CanvasRenderingContext2D;
  copies: number;
  height: number;
  phase: number;
  sourceElement: HTMLElement;
  sourceHeight: number;
  sourceWidth: number;
  strength: number;
  width: number;
}) {
  let primaryMatrix: DOMMatrix | null = null;
  const centerX = width / 2;
  const centerY = height / 2;

  for (let index = 0; index < copies; index += 1) {
    const progress = copies === 1 ? 0 : index / (copies - 1);
    const angle = phase + progress * Math.PI * 2;
    const radius = strength * (0.6 + progress * 0.55);
    const scale = 1 - progress * 0.06;
    const x = centerX + Math.cos(angle) * radius - (sourceWidth * scale) / 2;
    const y = centerY + Math.sin(angle * 1.3) * radius * 0.38 - (sourceHeight * scale) / 2;
    context.save();
    context.globalAlpha = 1 - progress * 0.08;
    context.translate(x + (sourceWidth * scale) / 2, y + (sourceHeight * scale) / 2);
    context.rotate(Math.sin(angle) * 0.055);
    context.scale(scale, scale);
    const matrix = drawElementFull({
      context,
      element: sourceElement,
      x: -sourceWidth / 2,
      y: -sourceHeight / 2,
    });
    context.restore();
    primaryMatrix ??= matrix;
  }

  setSourceTransform(sourceElement, primaryMatrix);
}

function drawTearMode({
  context,
  height,
  phase,
  pointer,
  sourceElement,
  sourceHeight,
  sourceWidth,
  strength,
  width,
}: {
  context: CanvasRenderingContext2D;
  height: number;
  phase: number;
  pointer: { x: number; y: number };
  sourceElement: HTMLElement;
  sourceHeight: number;
  sourceWidth: number;
  strength: number;
  width: number;
}) {
  const baseX = (width - sourceWidth) / 2;
  const baseY = (height - sourceHeight) / 2;
  const stripCount = 34;
  const stripWidth = sourceWidth / stripCount;

  sourceElement.style.transform = `translate(${baseX}px, ${baseY}px)`;

  for (let index = 0; index < stripCount; index += 1) {
    const sourceX = index * stripWidth;
    const stripProgress = (sourceX + stripWidth / 2) / sourceWidth;
    const pointerPull = Math.max(0, 1 - Math.abs(stripProgress - pointer.x) * 3.2);
    const side = stripProgress < pointer.x ? -1 : 1;
    const wave = Math.sin(stripProgress * 18 + phase * 2.4) * strength * 0.1;
    const destinationX = baseX + sourceX + side * pointerPull * strength * 0.54 + wave;
    const destinationY =
      baseY +
      Math.sin(stripProgress * 8 + phase) * strength * 0.16 +
      pointerPull * (pointer.y - 0.5) * strength * 1.2;

    context.save();
    context.globalAlpha = 1 - pointerPull * 0.08;
    drawElementCrop({
      context,
      destinationHeight: sourceHeight,
      destinationWidth: stripWidth + 1,
      destinationX,
      destinationY,
      element: sourceElement,
      sourceHeight,
      sourceWidth: stripWidth + 1,
      sourceX,
      sourceY: 0,
    });
    context.restore();
  }
}

function renderHtmlCanvasLab({
  context,
  copies,
  mode,
  phase,
  pointer,
  sourceElement,
  strength,
}: {
  context: CanvasRenderingContext2D;
  copies: number;
  mode: HtmlCanvasMode;
  phase: number;
  pointer: { x: number; y: number };
  sourceElement: HTMLElement;
  strength: number;
}) {
  const canvas = context.canvas;
  const width = canvas.width;
  const height = canvas.height;
  const sourceRect = sourceElement.getBoundingClientRect();
  const sourceWidth = Math.max(1, Math.round(sourceRect.width));
  const sourceHeight = Math.max(1, Math.round(sourceRect.height));

  drawCanvasBackground(context, width, height);

  switch (mode) {
    case "sheet":
      drawSheetMode({
        context,
        height,
        phase,
        sourceElement,
        sourceHeight,
        sourceWidth,
        strength,
        width,
      });
      return;
    case "orbit":
      drawOrbitMode({
        context,
        copies,
        height,
        phase,
        sourceElement,
        sourceHeight,
        sourceWidth,
        strength,
        width,
      });
      return;
    case "tear":
      drawTearMode({
        context,
        height,
        phase,
        pointer,
        sourceElement,
        sourceHeight,
        sourceWidth,
        strength,
        width,
      });
      return;
    default:
      mode satisfies never;
  }
}

export function HtmlCanvasLabPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5 });
  const paintCountRef = useRef(0);
  const [supportState, setSupportState] = useState<HtmlCanvasSupportState>("checking");
  const [paintCount, setPaintCount] = useState(0);
  const [mode, setMode] = useState<HtmlCanvasMode>("tear");
  const [sourceText, setSourceText] = useState(INITIAL_SOURCE_TEXT);
  const [intensity, setIntensity] = useState(INITIAL_INTENSITY);
  const [copies, setCopies] = useState(INITIAL_COPIES);

  const updatePointer = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    pointerRef.current = {
      x: rect.width > 0 ? Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1) : 0.5,
      y: rect.height > 0 ? Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1) : 0.5,
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const sourceElement = sourceRef.current;
    if (!canvas || !sourceElement) {
      return;
    }

    canvas.setAttribute("layoutsubtree", "");
    const context = canvas.getContext("2d");
    if (!context) {
      setSupportState("missing");
      return;
    }

    const isSupported = getDrawElementSupport(context);
    setSupportState(isSupported ? "available" : "missing");

    const handleResize = () => {
      const didResize = resizeCanvasToCssPixels(canvas);
      if (!isSupported) {
        drawUnavailableCanvas(context, canvas.width, canvas.height);
        return;
      }
      if (didResize) {
        canvas.requestPaint?.();
      }
    };
    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(canvas);

    if (!isSupported) {
      return () => {
        resizeObserver.disconnect();
      };
    }

    const startedAt = performance.now();
    const paint = () => {
      paintCountRef.current += 1;
      if (paintCountRef.current % 12 === 0) {
        setPaintCount(paintCountRef.current);
      }
      renderHtmlCanvasLab({
        context,
        copies,
        mode,
        phase: (performance.now() - startedAt) / 1000,
        pointer: pointerRef.current,
        sourceElement,
        strength: intensity,
      });
    };

    canvas.onpaint = () => {
      paint();
    };

    let animationFrameId = 0;
    const frame = () => {
      paint();
      canvas.requestPaint?.();
      animationFrameId = window.requestAnimationFrame(frame);
    };
    animationFrameId = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      canvas.onpaint = null;
    };
  }, [copies, intensity, mode, sourceText]);

  return (
    <div data-testid="html-canvas-lab" className="min-h-screen bg-[#f7f7f2] text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-3 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2 border border-black/10 bg-white p-2">
          <div
            aria-current="page"
            className="inline-flex h-8 items-center border border-black bg-black px-3 text-sm font-medium text-white"
          >
            HTML Canvas Lab
          </div>
          <Button asChild size="sm" variant="outline" className="h-8 rounded-none">
            <Link to="/">Landing</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-8 rounded-none">
            <a href="https://html-in-canvas.dev/demos/" target="_blank" rel="noreferrer">
              Demos
            </a>
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="grid content-start gap-3 border border-black/10 bg-white p-3">
            <div className="grid gap-1">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Status
              </div>
              <div className="font-mono text-sm">
                {supportState === "available"
                  ? "drawElementImage"
                  : supportState === "checking"
                    ? "checking"
                    : "canvas-draw-element off"}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Mode
              </div>
              <div className="grid grid-cols-3 gap-2">
                {HTML_CANVAS_MODES.map((candidateMode) => (
                  <button
                    key={candidateMode}
                    type="button"
                    className={
                      mode === candidateMode
                        ? MODE_BUTTON_CLASS_NAMES.active
                        : MODE_BUTTON_CLASS_NAMES.inactive
                    }
                    onClick={() => {
                      setMode(candidateMode);
                    }}
                  >
                    {MODE_LABELS[candidateMode]}
                  </button>
                ))}
              </div>
            </div>

            <label className="grid gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Text
              </span>
              <textarea
                className="min-h-24 resize-y border border-black/20 bg-[#f7f7f2] px-2 py-2 text-sm leading-5 outline-none focus:border-black"
                value={sourceText}
                onChange={(event) => {
                  setSourceText(event.target.value);
                }}
              />
            </label>

            <label className="grid gap-2">
              <span className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                <span>Intensity</span>
                <span>{intensity}</span>
              </span>
              <input
                className="h-2 w-full cursor-pointer accent-black"
                max="96"
                min="0"
                onChange={(event) => {
                  setIntensity(Number(event.target.value));
                }}
                step="1"
                type="range"
                value={intensity}
              />
            </label>

            <label className="grid gap-2">
              <span className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                <span>Copies</span>
                <span>{copies}</span>
              </span>
              <input
                className="h-2 w-full cursor-pointer accent-black"
                max="12"
                min="1"
                onChange={(event) => {
                  setCopies(Number(event.target.value));
                }}
                step="1"
                type="range"
                value={copies}
              />
            </label>

            <div className="grid gap-1 border border-black/10 bg-[#f7f7f2] p-2 font-mono text-xs text-black/60">
              <div>paint {paintCount}</div>
              <div>route /html-canvas</div>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            data-testid="html-canvas-lab-canvas"
            className="min-h-[34rem] w-full touch-none bg-[#f7f7f2]"
            onPointerDown={updatePointer}
            onPointerMove={updatePointer}
          >
            <div
              ref={sourceRef}
              className="absolute left-0 top-0 w-[24rem] border border-black bg-white p-5 text-black"
            >
              <div className="flex items-center justify-between gap-3 border-b border-black/15 pb-3">
                <div className="font-mono text-xs uppercase tracking-[0.2em] text-black/55">
                  noter.md
                </div>
                <div className="border border-black px-2 py-1 font-mono text-xs">canvas</div>
              </div>
              <div className="grid gap-3 pt-4">
                <h1 className="text-3xl font-semibold leading-tight tracking-normal">
                  HTML as material
                </h1>
                <p className="text-sm leading-6 text-black/70">{sourceText}</p>
                <div className="grid grid-cols-3 border border-black/15 text-center font-mono text-xs">
                  <div className="border-r border-black/15 p-2">DOM</div>
                  <div className="border-r border-black/15 p-2">Canvas</div>
                  <div className="p-2">Shader</div>
                </div>
              </div>
            </div>
          </canvas>
        </div>
      </div>
    </div>
  );
}
