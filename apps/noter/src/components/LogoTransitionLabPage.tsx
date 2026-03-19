import { Button } from "@/components/button";
import { DEFAULT_STATIC_LOGO_SVG_URL } from "@/components/logoStaticSvgContract";
import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

type Point = {
  x: number;
  y: number;
};

type ViewBox = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

type Face = {
  animateTo: Point;
  fill: string;
  points: Point[];
  stroke: string;
  strokeWidth: number;
};

type DragSession = {
  frame: "start" | "end";
  initialOffset: Point;
  pointerId: number;
  pointerStart: Point;
};

const DEFAULT_VIEW_BOX: ViewBox = {
  minX: 0,
  minY: 0,
  width: 500,
  height: 500,
};

function parseViewBox(rawValue: string | null): ViewBox {
  if (!rawValue) {
    return DEFAULT_VIEW_BOX;
  }

  const values = rawValue
    .trim()
    .split(/[\s,]+/)
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value));

  if (values.length !== 4) {
    return DEFAULT_VIEW_BOX;
  }

  return {
    minX: values[0],
    minY: values[1],
    width: values[2],
    height: values[3],
  };
}

function parsePointList(rawValue: string): Point[] {
  const values = rawValue
    .trim()
    .split(/[\s,]+/)
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value));

  const points: Point[] = [];
  for (let index = 0; index < values.length - 1; index += 2) {
    points.push({
      x: values[index],
      y: values[index + 1],
    });
  }

  return points;
}

function parseTranslate(rawValue: string | null): Point {
  if (!rawValue) {
    return { x: 0, y: 0 };
  }

  const values = rawValue
    .trim()
    .split(/[\s,]+/)
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value));

  if (values.length < 2) {
    return { x: 0, y: 0 };
  }

  return {
    x: values[0],
    y: values[1],
  };
}

function parseStrokeWidth(
  strokeWidthAttribute: string | null,
  styleAttribute: string | null,
): number {
  const styleMatch = styleAttribute?.match(/stroke-width\s*:\s*([0-9.]+)/);
  const rawValue = styleMatch?.[1] ?? strokeWidthAttribute ?? "0.14";
  const parsed = Number(rawValue);

  return Number.isFinite(parsed) ? parsed : 0.14;
}

function addOffset(point: Point, offset: Point): Point {
  return {
    x: point.x + offset.x,
    y: point.y + offset.y,
  };
}

function mixOffset(start: Point, end: Point, progress: number): Point {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
}

function formatOffset(point: Point): string {
  return `${point.x.toFixed(3)} ${point.y.toFixed(3)}`;
}

function getFaceCenter(points: Point[], offset: Point): Point {
  if (points.length === 0) {
    return offset;
  }

  const totals = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: totals.x / points.length + offset.x,
    y: totals.y / points.length + offset.y,
  };
}

export function LogoTransitionLabPage() {
  const [faces, setFaces] = useState<Face[]>([]);
  const [viewBox, setViewBox] = useState(DEFAULT_VIEW_BOX);
  const [selectedFaceIndex, setSelectedFaceIndex] = useState<number>(-1);
  const [activeFrame, setActiveFrame] = useState<"start" | "end">("end");
  const [startOffset, setStartOffset] = useState<Point>({ x: 0, y: 0 });
  const [endOffset, setEndOffset] = useState<Point>({ x: 0, y: 0 });
  const [previewProgress, setPreviewProgress] = useState(1);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSvg = async () => {
      const response = await fetch(DEFAULT_STATIC_LOGO_SVG_URL);
      const markup = await response.text();
      if (cancelled) {
        return;
      }

      const document = new DOMParser().parseFromString(markup, "image/svg+xml");
      const svgElement = document.querySelector("svg");
      if (!svgElement) {
        return;
      }

      const parsedFaces = Array.from(
        svgElement.querySelectorAll<SVGPolygonElement>("polygon"),
      )
        .map((polygonElement) => {
          const points = parsePointList(
            polygonElement.getAttribute("points") ?? "",
          );
          if (points.length < 3) {
            return null;
          }

          const animateElement =
            polygonElement.querySelector("animateTransform");

          return {
            animateTo: parseTranslate(
              animateElement?.getAttribute("to") ?? null,
            ),
            fill: polygonElement.getAttribute("fill") ?? "#000000",
            points,
            stroke: polygonElement.getAttribute("stroke") ?? "#000000",
            strokeWidth: parseStrokeWidth(
              polygonElement.getAttribute("stroke-width"),
              polygonElement.getAttribute("style"),
            ),
          };
        })
        .filter((face): face is Face => face !== null);

      const defaultFaceIndex = parsedFaces.findIndex(
        (face) => face.fill.toLowerCase() === "#390000",
      );

      setFaces(parsedFaces);
      setViewBox(parseViewBox(svgElement.getAttribute("viewBox")));
      setSelectedFaceIndex(defaultFaceIndex >= 0 ? defaultFaceIndex : 0);
    };

    void loadSvg();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedFaceIndex < 0 || selectedFaceIndex >= faces.length) {
      return;
    }

    const selectedFace = faces[selectedFaceIndex];
    setStartOffset({ x: 0, y: 0 });
    setEndOffset(selectedFace.animateTo);
    setActiveFrame("end");
    setPreviewProgress(1);
  }, [faces, selectedFaceIndex]);

  const selectedFace =
    selectedFaceIndex >= 0 && selectedFaceIndex < faces.length
      ? faces[selectedFaceIndex]
      : null;

  const getSvgPoint = (clientX: number, clientY: number): Point | null => {
    const svgElement = svgRef.current;
    if (!svgElement) {
      return null;
    }

    const bounds = svgElement.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return null;
    }

    return {
      x:
        viewBox.minX + ((clientX - bounds.left) / bounds.width) * viewBox.width,
      y:
        viewBox.minY +
        ((clientY - bounds.top) / bounds.height) * viewBox.height,
    };
  };

  const currentEditableOffset =
    activeFrame === "start" ? startOffset : endOffset;
  const previewOffset = mixOffset(startOffset, endOffset, previewProgress);

  const beginDrag = (
    event: React.PointerEvent<SVGPolygonElement | SVGCircleElement>,
  ) => {
    if (!selectedFace) {
      return;
    }

    const pointerPoint = getSvgPoint(event.clientX, event.clientY);
    if (!pointerPoint) {
      return;
    }

    dragSessionRef.current = {
      frame: activeFrame,
      initialOffset: currentEditableOffset,
      pointerId: event.pointerId,
      pointerStart: pointerPoint,
    };

    svgRef.current?.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const updateDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const dragSession = dragSessionRef.current;
    if (!dragSession || dragSession.pointerId !== event.pointerId) {
      return;
    }

    const pointerPoint = getSvgPoint(event.clientX, event.clientY);
    if (!pointerPoint) {
      return;
    }

    const nextOffset = {
      x:
        dragSession.initialOffset.x +
        pointerPoint.x -
        dragSession.pointerStart.x,
      y:
        dragSession.initialOffset.y +
        pointerPoint.y -
        dragSession.pointerStart.y,
    };

    if (dragSession.frame === "start") {
      setStartOffset(nextOffset);
      return;
    }

    setEndOffset(nextOffset);
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const dragSession = dragSessionRef.current;
    if (!dragSession || dragSession.pointerId !== event.pointerId) {
      return;
    }

    dragSessionRef.current = null;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f4ef] text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 border border-black/10 bg-white/88 p-2 backdrop-blur-sm">
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link to="/logo">3D</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link to="/logo-iso">Iso</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link to="/logo-svg">SVG</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link to="/logo-iso-study">Study</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link to="/logo-transition-lab-transforms">Transform Lab</Link>
          </Button>
          <div
            aria-current="page"
            className="inline-flex h-9 items-center border border-black bg-black px-3 text-sm font-medium text-white"
          >
            Transition Lab
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="grid content-start gap-4 border border-black/10 bg-white/88 p-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Setup
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Start / End Transition Lab
              </h1>
              <p className="mt-2 text-sm leading-6 text-black/60">
                Click a rhombus in the scene, switch between start and end, then
                drag the active face to where it should land. The scrubber shows
                the straight interpolation between those two points.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Active Frame
              </div>
              <Tabs
                value={activeFrame}
                onValueChange={(value) => {
                  if (value !== "start" && value !== "end") {
                    return;
                  }

                  setActiveFrame(value);
                }}
              >
                <TabsList className="grid h-auto grid-cols-2 rounded-none bg-black/5 p-1">
                  <TabsTrigger value="start" className="rounded-none">
                    Start
                  </TabsTrigger>
                  <TabsTrigger value="end" className="rounded-none">
                    End
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                <label htmlFor="logo-transition-progress-range">Preview</label>
                <span>{Math.round(previewProgress * 100)}%</span>
              </div>
              <input
                id="logo-transition-progress-range"
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(previewProgress * 100)}
                onChange={(event) => {
                  setPreviewProgress(Number(event.target.value) / 100);
                }}
                className="h-2 w-full cursor-pointer accent-black"
              />
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-none"
                  onClick={() => {
                    setPreviewProgress(0);
                  }}
                >
                  0%
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-none"
                  onClick={() => {
                    setPreviewProgress(0.5);
                  }}
                >
                  50%
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-none"
                  onClick={() => {
                    setPreviewProgress(1);
                  }}
                >
                  100%
                </Button>
              </div>
            </div>

            <div className="grid gap-2 border border-black/10 bg-[#fbfaf6] p-3 text-sm leading-6 text-black/65">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Selected Face
              </div>
              <div>
                Polygon {selectedFaceIndex >= 0 ? selectedFaceIndex + 1 : "?"}
              </div>
              <div>Start: {formatOffset(startOffset)}</div>
              <div>End: {formatOffset(endOffset)}</div>
            </div>

            <div className="grid gap-2 border border-black/10 bg-[#fbfaf6] p-3 font-mono text-xs leading-6 text-black/70">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Generated Transform
              </div>
              <div>{`from="${formatOffset(startOffset)}"`}</div>
              <div>{`to="${formatOffset(endOffset)}"`}</div>
            </div>

            <div className="border border-black/10 bg-[#fbfaf6] p-3 text-sm leading-6 text-black/60">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Notes
              </div>
              <p className="mt-2">
                Black outline is the start frame. Orange outline is the end
                frame. Cyan outline is the scrubbed preview. The solid face is
                the one you are dragging right now.
              </p>
            </div>
          </div>

          <div className="grid gap-3 border border-black/10 bg-white/88 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                  Workspace
                </div>
                <div className="mt-1 text-sm text-black/60">
                  Click any rhombus to select it. Drag the solid version of the
                  selected face.
                </div>
              </div>
              <div className="font-mono text-[11px] text-black/45">
                /logo-transition-lab
              </div>
            </div>

            <div className="flex min-h-[38rem] items-center justify-center border border-black/10 bg-[#fcfbf7] p-4">
              {selectedFace ? (
                <svg
                  ref={svgRef}
                  viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
                  className="block h-auto w-full max-w-[42rem] touch-none"
                  onPointerCancel={endDrag}
                  onPointerMove={updateDrag}
                  onPointerUp={endDrag}
                >
                  {faces.map((face, index) => (
                    <polygon
                      key={`face-${index}`}
                      points={face.points
                        .map((point) => `${point.x} ${point.y}`)
                        .join(" ")}
                      fill={face.fill}
                      stroke={face.stroke}
                      strokeWidth={face.strokeWidth}
                      opacity={index === selectedFaceIndex ? 0.18 : 1}
                      onClick={() => {
                        setSelectedFaceIndex(index);
                      }}
                      style={{ cursor: "pointer" }}
                    />
                  ))}

                  <polygon
                    points={selectedFace.points
                      .map((point) => `${point.x} ${point.y}`)
                      .join(" ")}
                    fill="none"
                    stroke="#111111"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    transform={`translate(${startOffset.x} ${startOffset.y})`}
                  />

                  <polygon
                    points={selectedFace.points
                      .map((point) => `${point.x} ${point.y}`)
                      .join(" ")}
                    fill="none"
                    stroke="#ff5a1f"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    transform={`translate(${endOffset.x} ${endOffset.y})`}
                  />

                  <polygon
                    points={selectedFace.points
                      .map((point) => `${point.x} ${point.y}`)
                      .join(" ")}
                    fill="none"
                    stroke="#0ea5e9"
                    strokeWidth={1.5}
                    transform={`translate(${previewOffset.x} ${previewOffset.y})`}
                  />

                  <polygon
                    points={selectedFace.points
                      .map((point) => `${point.x} ${point.y}`)
                      .join(" ")}
                    fill={selectedFace.fill}
                    fillOpacity={0.88}
                    stroke={selectedFace.stroke}
                    strokeWidth={selectedFace.strokeWidth}
                    transform={`translate(${currentEditableOffset.x} ${currentEditableOffset.y})`}
                    onPointerDown={beginDrag}
                    style={{ cursor: "grab" }}
                  />

                  {selectedFace.points.map((point, pointIndex) => {
                    const positionedPoint = addOffset(
                      point,
                      currentEditableOffset,
                    );
                    return (
                      <circle
                        key={`handle-${pointIndex}`}
                        cx={positionedPoint.x}
                        cy={positionedPoint.y}
                        r={5}
                        fill={activeFrame === "start" ? "#111111" : "#ff5a1f"}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        onPointerDown={beginDrag}
                        style={{ cursor: "grab" }}
                      />
                    );
                  })}

                  <circle
                    cx={getFaceCenter(selectedFace.points, startOffset).x}
                    cy={getFaceCenter(selectedFace.points, startOffset).y}
                    r={4}
                    fill="#111111"
                  />
                  <circle
                    cx={getFaceCenter(selectedFace.points, endOffset).x}
                    cy={getFaceCenter(selectedFace.points, endOffset).y}
                    r={4}
                    fill="#ff5a1f"
                  />
                  <circle
                    cx={getFaceCenter(selectedFace.points, previewOffset).x}
                    cy={getFaceCenter(selectedFace.points, previewOffset).y}
                    r={4}
                    fill="#0ea5e9"
                  />
                </svg>
              ) : (
                <div className="text-sm text-black/50">Loading SVG lab…</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
