import { Button } from "@/components/button";
import {
  addOffset,
  formatOffset,
  getFaceCenter,
  mixOffset,
  type DragSession,
  type Point,
} from "@/components/logoTransitionLabUtils";
import {
  type TransformLabFace,
  TRANSFORM_LAB_VIEW_BOX,
  createLogoTransitionTransformFaces,
} from "@/components/logoTransitionTransformFaces";
import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

// Matches the literal lab's default demo displacement so both labs start aligned.
const DEFAULT_TRANSFORM_LAB_END_OFFSET: Point = { x: -30.104, y: 52.142 };

function getDefaultSelectedFaceIndex(
  faces: readonly TransformLabFace[],
): number {
  const accentColor = "#394447";
  let selectedIndex = 0;
  let selectedScore = Number.NEGATIVE_INFINITY;

  faces.forEach((face, index) => {
    if (face.color.toLowerCase() !== accentColor) {
      return;
    }

    const center = getFaceCenter(face.corners, { x: 0, y: 0 });
    const score = center.x - center.y;
    if (score > selectedScore) {
      selectedScore = score;
      selectedIndex = index;
    }
  });

  return selectedIndex;
}

export function LogoTransitionTransformsLabPage() {
  const [faces] = useState(() => createLogoTransitionTransformFaces());
  const [selectedFaceIndex, setSelectedFaceIndex] = useState<number>(0);
  const [activeFrame, setActiveFrame] = useState<"start" | "end">("end");
  const [startOffset, setStartOffset] = useState<Point>({ x: 0, y: 0 });
  const [endOffset, setEndOffset] = useState<Point>({ x: 0, y: 0 });
  const [previewProgress, setPreviewProgress] = useState(1);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);

  useEffect(() => {
    if (faces.length === 0) {
      return;
    }

    setSelectedFaceIndex(getDefaultSelectedFaceIndex(faces));
  }, [faces]);

  const selectedFace =
    selectedFaceIndex >= 0 && selectedFaceIndex < faces.length
      ? faces[selectedFaceIndex]
      : null;

  useEffect(() => {
    if (!selectedFace) {
      return;
    }

    setStartOffset({ x: 0, y: 0 });
    setEndOffset(DEFAULT_TRANSFORM_LAB_END_OFFSET);
    setActiveFrame("end");
    setPreviewProgress(1);
  }, [selectedFaceIndex, selectedFace]);

  const currentEditableOffset =
    activeFrame === "start" ? startOffset : endOffset;
  const previewOffset = mixOffset(startOffset, endOffset, previewProgress);

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
        TRANSFORM_LAB_VIEW_BOX.minX +
        ((clientX - bounds.left) / bounds.width) * TRANSFORM_LAB_VIEW_BOX.width,
      y:
        TRANSFORM_LAB_VIEW_BOX.minY +
        ((clientY - bounds.top) / bounds.height) *
          TRANSFORM_LAB_VIEW_BOX.height,
    };
  };

  const beginDrag = (
    event: React.PointerEvent<SVGCircleElement | SVGUseElement>,
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

  const selectedFaceCenter = useMemo(() => {
    if (!selectedFace) {
      return { x: 0, y: 0 };
    }

    return getFaceCenter(selectedFace.corners, currentEditableOffset);
  }, [currentEditableOffset, selectedFace]);

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
            <Link to="/logo-transition-lab">Literal Lab</Link>
          </Button>
          <div
            aria-current="page"
            className="inline-flex h-9 items-center border border-black bg-black px-3 text-sm font-medium text-white"
          >
            Transform Lab
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="grid content-start gap-4 border border-black/10 bg-white/88 p-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Setup
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Transform Transition Lab
              </h1>
              <p className="mt-2 text-sm leading-6 text-black/60">
                This variant derives the logo from voxel faces and unit-face
                transforms instead of literal polygon point lists. Click a face,
                then drag start and end offsets the same way as the literal lab.
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
                <label htmlFor="logo-transition-transform-progress-range">
                  Preview
                </label>
                <span>{Math.round(previewProgress * 100)}%</span>
              </div>
              <input
                id="logo-transition-transform-progress-range"
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
                Face {selectedFaceIndex >= 0 ? selectedFaceIndex + 1 : "?"}
              </div>
              <div>Start: {formatOffset(startOffset)}</div>
              <div>End: {formatOffset(endOffset)}</div>
            </div>

            <div className="grid gap-2 border border-black/10 bg-[#fbfaf6] p-3 font-mono text-xs leading-6 text-black/70">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Generated Transform
              </div>
              <div>{selectedFace ? selectedFace.transform : "matrix(?)"}</div>
              <div>{`from="${formatOffset(startOffset)}"`}</div>
              <div>{`to="${formatOffset(endOffset)}"`}</div>
            </div>

            <div className="border border-black/10 bg-[#fbfaf6] p-3 text-sm leading-6 text-black/60">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Notes
              </div>
              <p className="mt-2">
                This page keeps the transition editing workflow from the literal
                lab, but the base logo faces are generated from voxel-space
                transforms. That keeps the experiment aligned with the transform
                model instead of frozen polygon coordinates.
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
                  Click any face to select it. Drag the solid overlay to place
                  the active frame.
                </div>
              </div>
              <div className="font-mono text-[11px] text-black/45">
                /logo-transition-lab-transforms
              </div>
            </div>

            <div className="flex min-h-[38rem] items-center justify-center border border-black/10 bg-[#fcfbf7] p-4">
              {selectedFace ? (
                <svg
                  ref={svgRef}
                  viewBox={`${TRANSFORM_LAB_VIEW_BOX.minX} ${TRANSFORM_LAB_VIEW_BOX.minY} ${TRANSFORM_LAB_VIEW_BOX.width} ${TRANSFORM_LAB_VIEW_BOX.height}`}
                  className="block h-auto w-full max-w-[42rem] touch-none"
                  onPointerCancel={endDrag}
                  onPointerMove={updateDrag}
                  onPointerUp={endDrag}
                >
                  <defs>
                    <rect
                      id="transition-lab-face"
                      x="0"
                      y="0"
                      width="1"
                      height="1"
                    />
                  </defs>

                  {faces.map((face, index) => (
                    <use
                      key={face.key}
                      href="#transition-lab-face"
                      fill={face.color}
                      opacity={index === selectedFaceIndex ? 0.18 : 1}
                      stroke={face.stroke}
                      strokeWidth={face.strokeWidth}
                      transform={face.transform}
                      onClick={() => {
                        setSelectedFaceIndex(index);
                      }}
                      style={{ cursor: "pointer" }}
                    />
                  ))}

                  <use
                    href="#transition-lab-face"
                    fill="none"
                    stroke="#111111"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    transform={`translate(${startOffset.x} ${startOffset.y}) ${selectedFace.transform}`}
                  />

                  <use
                    href="#transition-lab-face"
                    fill="none"
                    stroke="#ff5a1f"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    transform={`translate(${endOffset.x} ${endOffset.y}) ${selectedFace.transform}`}
                  />

                  <use
                    href="#transition-lab-face"
                    fill="none"
                    stroke="#0ea5e9"
                    strokeWidth={1.5}
                    transform={`translate(${previewOffset.x} ${previewOffset.y}) ${selectedFace.transform}`}
                  />

                  <use
                    href="#transition-lab-face"
                    fill={selectedFace.color}
                    fillOpacity={0.88}
                    stroke={selectedFace.stroke}
                    strokeWidth={selectedFace.strokeWidth}
                    transform={`translate(${currentEditableOffset.x} ${currentEditableOffset.y}) ${selectedFace.transform}`}
                    onPointerDown={beginDrag}
                    style={{ cursor: "grab" }}
                  />

                  {selectedFace.corners.map((point, pointIndex) => {
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
                    cx={getFaceCenter(selectedFace.corners, startOffset).x}
                    cy={getFaceCenter(selectedFace.corners, startOffset).y}
                    r={4}
                    fill="#111111"
                  />
                  <circle
                    cx={getFaceCenter(selectedFace.corners, endOffset).x}
                    cy={getFaceCenter(selectedFace.corners, endOffset).y}
                    r={4}
                    fill="#ff5a1f"
                  />
                  <circle
                    cx={getFaceCenter(selectedFace.corners, previewOffset).x}
                    cy={getFaceCenter(selectedFace.corners, previewOffset).y}
                    r={4}
                    fill="#0ea5e9"
                  />
                  <circle
                    cx={selectedFaceCenter.x}
                    cy={selectedFaceCenter.y}
                    r={4}
                    fill={activeFrame === "start" ? "#111111" : "#ff5a1f"}
                  />
                </svg>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
