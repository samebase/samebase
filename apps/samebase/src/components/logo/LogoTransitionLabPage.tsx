import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import {
  STANDARD_TWO_BY_TWO_TRANSITION_CUBE_SCENE,
  TRANSITION_CUBE_DEFAULT_END_OFFSET,
  TRANSITION_CUBE_DEFAULT_SELECTED_KEY,
  type TransitionCubeFace,
} from "@/components/logo/logoTransitionCubeScene";
import {
  addOffset,
  formatOffset,
  mixOffset,
  type DragSession,
  type Point,
} from "@/components/logo/logoTransitionLabUtils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRef, useState } from "react";

const CUBE_FACE_STROKE_WIDTH = 0.9;
const SELECTED_CUBE_STROKE_WIDTH = 1.35;

function serializePoints(points: readonly Point[]): string {
  return points.map((point) => `${point.x} ${point.y}`).join(" ");
}

function offsetPoints(points: readonly Point[], offset: Point): Point[] {
  return points.map((point) => addOffset(point, offset));
}

export function LogoTransitionLabPage() {
  const [selectedCubeKey, setSelectedCubeKey] = useState(TRANSITION_CUBE_DEFAULT_SELECTED_KEY);
  const [activeFrame, setActiveFrame] = useState<"start" | "end">("end");
  const [startOffset, setStartOffset] = useState<Point>({ x: 0, y: 0 });
  const [endOffset, setEndOffset] = useState<Point>(TRANSITION_CUBE_DEFAULT_END_OFFSET);
  const [previewProgress, setPreviewProgress] = useState(1);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const scene = STANDARD_TWO_BY_TWO_TRANSITION_CUBE_SCENE;
  const selectedCube = scene.cubes.find((cube) => cube.key === selectedCubeKey) ?? null;
  const selectedCubeFaces = scene.faces.filter((face) => face.cubeKey === selectedCubeKey);

  const selectCube = (cubeKey: string) => {
    if (cubeKey === selectedCubeKey) {
      return;
    }

    setSelectedCubeKey(cubeKey);
    setStartOffset({ x: 0, y: 0 });
    setEndOffset(TRANSITION_CUBE_DEFAULT_END_OFFSET);
    setActiveFrame("end");
    setPreviewProgress(1);
  };

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
      x: scene.viewBox.minX + ((clientX - bounds.left) / bounds.width) * scene.viewBox.width,
      y: scene.viewBox.minY + ((clientY - bounds.top) / bounds.height) * scene.viewBox.height,
    };
  };

  const currentEditableOffset = activeFrame === "start" ? startOffset : endOffset;
  const previewOffset = mixOffset(startOffset, endOffset, previewProgress);
  const selectedCubeCenter = selectedCube
    ? addOffset(selectedCube.projectedCenter, currentEditableOffset)
    : null;

  const beginDrag = (event: React.PointerEvent<SVGPolygonElement | SVGCircleElement>) => {
    if (!selectedCube) {
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
      x: dragSession.initialOffset.x + pointerPoint.x - dragSession.pointerStart.x,
      y: dragSession.initialOffset.y + pointerPoint.y - dragSession.pointerStart.y,
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

  const renderCubeOutline = ({
    faces,
    offset,
    stroke,
    strokeDasharray,
  }: {
    faces: readonly TransitionCubeFace[];
    offset: Point;
    stroke: string;
    strokeDasharray?: string;
  }) =>
    faces.map((face) => (
      <polygon
        key={`${face.key}:${stroke}:${offset.x}:${offset.y}`}
        points={serializePoints(offsetPoints(face.points, offset))}
        fill="none"
        stroke={stroke}
        strokeDasharray={strokeDasharray}
        strokeWidth={SELECTED_CUBE_STROKE_WIDTH}
      />
    ));

  return (
    <div className="mx-auto grid max-w-7xl gap-6 p-4 text-black sm:px-6">
      <div className="flex flex-wrap items-center gap-2 border border-black/10 bg-white p-2">
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to="/logo">3D</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to="/logo/iso">Iso</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to="/logo/svg">SVG</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to="/logo/single-cube">Study</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to="/logo/transition/transforms">Transform Lab</Link>
        </Button>
        <div
          aria-current="page"
          className="inline-flex h-9 items-center border border-black bg-black px-3 text-sm font-medium text-white"
        >
          Transition Lab
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="grid content-start gap-4 border border-black/10 bg-white p-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
              Setup
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">2x2 Cube Transition Lab</h1>
            <p className="mt-2 text-sm leading-6 text-black/60">
              The scene starts from a solid 2x2x2 block. Pick a visible cube, set its start and end
              positions, then scrub the straight translation between them.
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
              Selected Cube
            </div>
            <div>{selectedCube?.label ?? "None"}</div>
            <div>Start: {formatOffset(startOffset)}</div>
            <div>End: {formatOffset(endOffset)}</div>
          </div>

          <div className="grid gap-2 border border-black/10 bg-[#fbfaf6] p-3 font-mono text-xs leading-6 text-black/70">
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
              Generated Transform
            </div>
            <div>{`cube="${selectedCube?.key ?? "none"}"`}</div>
            <div>{`from="${formatOffset(startOffset)}"`}</div>
            <div>{`to="${formatOffset(endOffset)}"`}</div>
          </div>

          <div className="border border-black/10 bg-[#fbfaf6] p-3 text-sm leading-6 text-black/60">
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
              Notes
            </div>
            <p className="mt-2">
              Black outline is start, orange is end, and cyan is the current preview. The solid
              offset cube is the active frame.
            </p>
          </div>
        </div>

        <div className="grid gap-3 border border-black/10 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Workspace
              </div>
              <div className="mt-1 text-sm text-black/60">
                Visible cube faces are selectable. Drag the solid offset cube.
              </div>
            </div>
            <div className="font-mono text-[11px] text-black/45">/logo/transition</div>
          </div>

          <div className="flex min-h-[38rem] items-center justify-center border border-black/10 bg-[#fcfbf7] p-4">
            {selectedCube ? (
              <svg
                ref={svgRef}
                aria-label="2x2 cube transition scene"
                data-testid="logo-transition-cube-scene"
                viewBox={`${scene.viewBox.minX} ${scene.viewBox.minY} ${scene.viewBox.width} ${scene.viewBox.height}`}
                className="block w-full max-w-[42rem] touch-none"
                onPointerCancel={endDrag}
                onPointerMove={updateDrag}
                onPointerUp={endDrag}
              >
                {scene.faces.map((face) => (
                  <polygon
                    key={face.key}
                    points={serializePoints(face.points)}
                    fill={face.color}
                    stroke="#111111"
                    strokeOpacity={0.24}
                    strokeWidth={CUBE_FACE_STROKE_WIDTH}
                    opacity={face.cubeKey === selectedCubeKey ? 0.2 : 1}
                    onClick={() => {
                      selectCube(face.cubeKey);
                    }}
                    style={{ cursor: "pointer" }}
                  />
                ))}

                {renderCubeOutline({
                  faces: selectedCubeFaces,
                  offset: startOffset,
                  stroke: "#111111",
                  strokeDasharray: "4 4",
                })}
                {renderCubeOutline({
                  faces: selectedCubeFaces,
                  offset: endOffset,
                  stroke: "#ff5a1f",
                  strokeDasharray: "4 4",
                })}
                {renderCubeOutline({
                  faces: selectedCubeFaces,
                  offset: previewOffset,
                  stroke: "#0ea5e9",
                })}

                {selectedCubeFaces.map((face) => (
                  <polygon
                    key={`${face.key}:active`}
                    points={serializePoints(offsetPoints(face.points, currentEditableOffset))}
                    fill={face.color}
                    fillOpacity={0.9}
                    stroke="#111111"
                    strokeOpacity={0.26}
                    strokeWidth={CUBE_FACE_STROKE_WIDTH}
                    onPointerDown={beginDrag}
                    style={{ cursor: "grab" }}
                  />
                ))}

                {selectedCubeCenter ? (
                  <circle
                    cx={selectedCubeCenter.x}
                    cy={selectedCubeCenter.y}
                    r={5}
                    fill={activeFrame === "start" ? "#111111" : "#ff5a1f"}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    onPointerDown={beginDrag}
                    style={{ cursor: "grab" }}
                  />
                ) : null}
                <circle
                  cx={addOffset(selectedCube.projectedCenter, startOffset).x}
                  cy={addOffset(selectedCube.projectedCenter, startOffset).y}
                  r={4}
                  fill="#111111"
                />
                <circle
                  cx={addOffset(selectedCube.projectedCenter, endOffset).x}
                  cy={addOffset(selectedCube.projectedCenter, endOffset).y}
                  r={4}
                  fill="#ff5a1f"
                />
                <circle
                  cx={addOffset(selectedCube.projectedCenter, previewOffset).x}
                  cy={addOffset(selectedCube.projectedCenter, previewOffset).y}
                  r={4}
                  fill="#0ea5e9"
                />
              </svg>
            ) : (
              <div className="text-sm text-black/50">No selectable cube.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
