import { Button } from "@/components/button";
import {
  TRANSFORM_LAB_VIEW_BOX,
  createTransformLabScene,
  type TransformLabScene,
} from "@/components/logoTransitionTransformFaces";
import {
  addOffset,
  formatOffset,
  getFaceCenter,
  mixOffset,
  type DragSession,
  type Point,
} from "@/components/logoTransitionLabUtils";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_ROTATION_DEGREES,
} from "@/components/logoVoxelState";
import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

type ViewBox = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

type Face = {
  fill: string;
  key: string;
  points: Point[];
  stroke: string;
  strokeWidth: number;
};

type AxisGuideLine = TransformLabScene["axisGuideLines"][number];

const EDGE_STROKE = "#111111";
const EDGE_STROKE_WIDTH = 0.9;

export function LogoTransitionLabPage() {
  const [faces, setFaces] = useState<Face[]>([]);
  const [axisGuideLines, setAxisGuideLines] = useState<AxisGuideLine[]>([]);
  const [viewBox] = useState<ViewBox>(TRANSFORM_LAB_VIEW_BOX);
  const [selectedFaceKey, setSelectedFaceKey] = useState<string | null>(null);
  const [activeFrame, setActiveFrame] = useState<"start" | "end">("end");
  const [startOffset, setStartOffset] = useState<Point>({ x: 0, y: 0 });
  const [endOffset, setEndOffset] = useState<Point>({ x: 0, y: 0 });
  const [previewProgress, setPreviewProgress] = useState(1);
  const [elevationDegrees, setElevationDegrees] = useState(
    DEFAULT_ELEVATION_DEGREES,
  );
  const [rotationDegrees, setRotationDegrees] = useState(
    DEFAULT_ROTATION_DEGREES,
  );
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);

  useEffect(() => {
    // Reuse the exact same simplified cube scene generator as the transform
    // lab so the drag workflow matches the math/debug view one-to-one.
    const scene = createTransformLabScene({
      elevationDegrees,
      includeAxes: true,
      projectionMode: "three",
      rotationDegrees,
    });
    const parsedFaces = scene.faces.map((face) => ({
      fill: face.color,
      key: face.key,
      points: face.corners.map((point) => ({ x: point.x, y: point.y })),
      stroke: EDGE_STROKE,
      strokeWidth: EDGE_STROKE_WIDTH,
    }));
    const highlightedFace = parsedFaces.find(
      (face) => face.fill.toLowerCase() === "#ef4444",
    );
    const defaultFaceKey = highlightedFace
      ? highlightedFace.key
      : parsedFaces[0]?.key ?? null;

    setFaces(parsedFaces);
    setAxisGuideLines([...scene.axisGuideLines]);
    setSelectedFaceKey((currentFaceKey) =>
      parsedFaces.some((face) => face.key === currentFaceKey)
        ? currentFaceKey
        : defaultFaceKey,
    );
  }, [elevationDegrees, rotationDegrees]);

  useEffect(() => {
    if (!selectedFaceKey) {
      return;
    }

    setStartOffset({ x: 0, y: 0 });
    setEndOffset({ x: 0, y: 0 });
    setActiveFrame("end");
    setPreviewProgress(1);
  }, [selectedFaceKey]);

  const selectedFace =
    selectedFaceKey === null
      ? null
      : faces.find((face) => face.key === selectedFaceKey) ?? null;

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
                This uses the simplified 2x2 cube scene from the transform lab.
                Click a face, switch between start and end, then drag the active
                face to where it should land. The scrubber shows the straight
                interpolation between those two points.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="grid gap-2">
                <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                  <label htmlFor="logo-transition-elevation-range">
                    Elevation
                  </label>
                  <span>{elevationDegrees.toFixed(1)}deg</span>
                </div>
                <input
                  id="logo-transition-elevation-range"
                  type="range"
                  min="-89"
                  max="89"
                  step="0.1"
                  value={elevationDegrees}
                  onChange={(event) => {
                    setElevationDegrees(Number(event.target.value));
                  }}
                  className="h-2 w-full cursor-pointer accent-black"
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                  <label htmlFor="logo-transition-rotation-range">
                    Rotation
                  </label>
                  <span>{rotationDegrees.toFixed(1)}deg</span>
                </div>
                <input
                  id="logo-transition-rotation-range"
                  type="range"
                  min="0"
                  max="360"
                  step="0.1"
                  value={rotationDegrees}
                  onChange={(event) => {
                    setRotationDegrees(Number(event.target.value));
                  }}
                  className="h-2 w-full cursor-pointer accent-black"
                />
              </div>

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
              <div>{selectedFace?.key ?? "?"}</div>
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
                frame. Cyan outline is the scrubbed preview. The live cube stays
                untouched underneath so depth ordering remains readable while
                you drag.
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
                  Click any visible face to select it. Drag the solid version of
                  the selected face. Axis guides and face edges stay visible for
                  debugging.
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
                  {faces.map((face) => (
                    <polygon
                      key={face.key}
                      points={face.points
                        .map((point) => `${point.x} ${point.y}`)
                        .join(" ")}
                      fill={face.fill}
                      stroke={face.stroke}
                      strokeWidth={face.strokeWidth}
                      strokeLinejoin="round"
                      onClick={() => {
                        setSelectedFaceKey(face.key);
                      }}
                      style={{ cursor: "pointer" }}
                    />
                  ))}

                  {axisGuideLines.map((line) => (
                    <g key={line.key} pointerEvents="none">
                      <line
                        x1={line.start.x}
                        y1={line.start.y}
                        x2={line.end.x}
                        y2={line.end.y}
                        stroke={line.color}
                        strokeLinecap="round"
                        strokeWidth={2.25}
                      />
                      <text
                        x={line.labelPosition.x}
                        y={line.labelPosition.y}
                        dominantBaseline="middle"
                        fill={line.color}
                        fontSize="11"
                        fontWeight="700"
                        textAnchor="middle"
                      >
                        {line.label}
                      </text>
                    </g>
                  ))}
                  {axisGuideLines[0] ? (
                    <circle
                      cx={axisGuideLines[0].start.x}
                      cy={axisGuideLines[0].start.y}
                      r={2.75}
                      fill="#111111"
                      pointerEvents="none"
                    />
                  ) : null}

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
                    fill="#000000"
                    fillOpacity={0.001}
                    stroke="none"
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
                <div className="text-sm text-black/50">
                  Loading transition lab…
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
