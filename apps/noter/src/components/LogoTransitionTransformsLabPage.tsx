import { Button } from "@/components/button";
import {
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_COORDINATES,
} from "@/components/logoStaticSvgContract";
import { DEFAULT_FACE_COLORS } from "@/components/logoTailwindColors";
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
import { projectLogoWorldPoints } from "@/components/logoThreeSvgRenderer";
import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";
import { createFilledVoxelSet } from "@/components/logoVoxelState";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

// Matches the literal lab's default demo displacement so both labs start aligned.
const DEFAULT_TRANSFORM_LAB_END_OFFSET: Point = { x: -30.104, y: 52.142 };
const DEFAULT_SELECTED_FACE_COLOR_KEY: TransformLabFace["colorKey"] = "right";
const KEYBOARD_NUDGE_STEP = 1;
const KEYBOARD_FAST_NUDGE_STEP = 10;
const AXIS_GUIDE_ORIGIN: Point = {
  x: 60,
  y: TRANSFORM_LAB_VIEW_BOX.height - 50,
};
const AXIS_GUIDE_PANEL = {
  x: 16,
  y: TRANSFORM_LAB_VIEW_BOX.height - 118,
  width: 126,
  height: 100,
} as const;
const AXIS_GUIDE_LENGTH = 0.75;
const AXIS_GUIDE_LABEL_DISTANCE = 11;
const AXIS_GUIDE_COLORS = {
  x: "#ef4444",
  y: "#16a34a",
  z: "#2563eb",
} as const;
const STATIC_LOGO_FILLED_VOXELS = createFilledVoxelSet(
  STATIC_LOGO_VOXEL_COORDINATES,
);

type AxisGuideLine = {
  color: string;
  end: Point;
  key: "x" | "y" | "z";
  label: string;
  labelPosition: Point;
};

function getAxisLabelPosition(end: Point): Point {
  const deltaX = end.x - AXIS_GUIDE_ORIGIN.x;
  const deltaY = end.y - AXIS_GUIDE_ORIGIN.y;
  const length = Math.hypot(deltaX, deltaY) || 1;

  return {
    x: end.x + (deltaX / length) * AXIS_GUIDE_LABEL_DISTANCE,
    y: end.y + (deltaY / length) * AXIS_GUIDE_LABEL_DISTANCE,
  };
}

function createAxisGuideLines(): AxisGuideLine[] {
  const [projectedOrigin, projectedX, projectedY, projectedZ] =
    projectLogoWorldPoints({
      elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
      faceColors: DEFAULT_FACE_COLORS,
      filledVoxels: STATIC_LOGO_FILLED_VOXELS,
      points: [
        { x: 0, y: 0, z: 0 },
        { x: AXIS_GUIDE_LENGTH, y: 0, z: 0 },
        { x: 0, y: AXIS_GUIDE_LENGTH, z: 0 },
        { x: 0, y: 0, z: AXIS_GUIDE_LENGTH },
      ],
      rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
      viewBoxSize: TRANSFORM_LAB_VIEW_BOX.width,
    });
  const guideOffset = {
    x: AXIS_GUIDE_ORIGIN.x - projectedOrigin.x,
    y: AXIS_GUIDE_ORIGIN.y - projectedOrigin.y,
  };

  return [
    {
      color: AXIS_GUIDE_COLORS.x,
      end: addOffset(projectedX, guideOffset),
      key: "x" as const,
      label: "X",
    },
    {
      color: AXIS_GUIDE_COLORS.y,
      end: addOffset(projectedY, guideOffset),
      key: "y" as const,
      label: "Y",
    },
    {
      color: AXIS_GUIDE_COLORS.z,
      end: addOffset(projectedZ, guideOffset),
      key: "z" as const,
      label: "Z",
    },
  ].map((line) => ({
    color: line.color,
    end: line.end,
    key: line.key,
    label: line.label,
    labelPosition: getAxisLabelPosition(line.end),
  }));
}

function getDefaultSelectedFaceIndex(
  faces: readonly TransformLabFace[],
): number {
  let selectedIndex = 0;
  let selectedScore = Number.NEGATIVE_INFINITY;

  faces.forEach((face, index) => {
    if (face.colorKey !== DEFAULT_SELECTED_FACE_COLOR_KEY) {
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
  const faces = useMemo(() => createLogoTransitionTransformFaces(), []);
  const axisGuideLines = useMemo(() => createAxisGuideLines(), []);
  const [selectedFaceIndex, setSelectedFaceIndex] = useState<number>(() =>
    getDefaultSelectedFaceIndex(faces),
  );
  const [activeFrame, setActiveFrame] = useState<"start" | "end">("end");
  const [startOffset, setStartOffset] = useState<Point>({ x: 0, y: 0 });
  const [endOffset, setEndOffset] = useState<Point>(
    DEFAULT_TRANSFORM_LAB_END_OFFSET,
  );
  const [previewProgress, setPreviewProgress] = useState(1);
  const [focusedFaceIndex, setFocusedFaceIndex] = useState<number | null>(null);
  const [isHandleFocused, setIsHandleFocused] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);

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
  const focusedFace =
    focusedFaceIndex !== null &&
    focusedFaceIndex >= 0 &&
    focusedFaceIndex < faces.length
      ? faces[focusedFaceIndex]
      : null;

  const updateActiveFrameOffset = (
    updater: (currentOffset: Point) => Point,
  ) => {
    if (activeFrame === "start") {
      setStartOffset((currentOffset) => updater(currentOffset));
      return;
    }

    setEndOffset((currentOffset) => updater(currentOffset));
  };

  const nudgeActiveFrameOffset = (deltaX: number, deltaY: number) => {
    updateActiveFrameOffset((currentOffset) => ({
      x: currentOffset.x + deltaX,
      y: currentOffset.y + deltaY,
    }));
  };

  const setCurrentCoordinate = (axis: "x" | "y", value: number) => {
    updateActiveFrameOffset((currentOffset) => ({
      ...currentOffset,
      [axis]: value,
    }));
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

  const handleFaceKeyDown = (
    event: React.KeyboardEvent<SVGUseElement>,
    index: number,
  ) => {
    const lastIndex = faces.length - 1;
    if (event.key === "Enter" || event.key === " ") {
      setSelectedFaceIndex(index);
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      setSelectedFaceIndex(index >= lastIndex ? 0 : index + 1);
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      setSelectedFaceIndex(index <= 0 ? lastIndex : index - 1);
      event.preventDefault();
    }
  };

  const handleActiveFaceKeyDown = (
    event: React.KeyboardEvent<SVGUseElement>,
  ) => {
    const step = event.shiftKey
      ? KEYBOARD_FAST_NUDGE_STEP
      : KEYBOARD_NUDGE_STEP;

    if (event.key === "ArrowLeft") {
      nudgeActiveFrameOffset(-step, 0);
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowRight") {
      nudgeActiveFrameOffset(step, 0);
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowUp") {
      nudgeActiveFrameOffset(0, -step);
      event.preventDefault();
      return;
    }

    if (event.key === "ArrowDown") {
      nudgeActiveFrameOffset(0, step);
      event.preventDefault();
    }
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
                This variant derives the logo from the same projected quad data
                as <code>/logo-static.svg</code>, then re-expresses each face as
                a unit-face transform instead of a literal polygon point list.
                Click a face, then drag start and end offsets the same way as
                the literal lab.
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

            <div className="grid gap-3 border border-black/10 bg-[#fbfaf6] p-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Keyboard
              </div>
              <div className="grid gap-2">
                <label
                  htmlFor="logo-transition-transform-face-select"
                  className="text-xs font-medium text-black/60"
                >
                  Face
                </label>
                <select
                  id="logo-transition-transform-face-select"
                  value={selectedFaceIndex}
                  onChange={(event) => {
                    setSelectedFaceIndex(Number(event.target.value));
                  }}
                  className="h-10 border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black"
                >
                  {faces.map((face, index) => (
                    <option key={face.key} value={index}>
                      {`Face ${index + 1} · ${face.colorKey}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-black/60">
                  X Offset
                  <input
                    type="number"
                    step="1"
                    value={currentEditableOffset.x}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      if (!Number.isFinite(nextValue)) {
                        return;
                      }

                      setCurrentCoordinate("x", nextValue);
                    }}
                    className="h-10 border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium text-black/60">
                  Y Offset
                  <input
                    type="number"
                    step="1"
                    value={currentEditableOffset.y}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      if (!Number.isFinite(nextValue)) {
                        return;
                      }

                      setCurrentCoordinate("y", nextValue);
                    }}
                    className="h-10 border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-black"
                  />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-none"
                  onClick={() => {
                    nudgeActiveFrameOffset(0, -KEYBOARD_NUDGE_STEP);
                  }}
                >
                  Up
                </Button>
                <div />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-none"
                  onClick={() => {
                    nudgeActiveFrameOffset(-KEYBOARD_NUDGE_STEP, 0);
                  }}
                >
                  Left
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-none"
                  onClick={() => {
                    nudgeActiveFrameOffset(0, KEYBOARD_NUDGE_STEP);
                  }}
                >
                  Down
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-none"
                  onClick={() => {
                    nudgeActiveFrameOffset(KEYBOARD_NUDGE_STEP, 0);
                  }}
                >
                  Right
                </Button>
              </div>
              <p className="text-xs leading-5 text-black/55">
                Select a face from the menu, then use the number inputs or focus
                the solid face in the SVG and press arrow keys. Hold Shift for
                10px nudges.
              </p>
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
                lab, but it now reuses the shared projection baseline from the
                static SVG renderer. The experiment is transform-based without
                drifting away from the snapped logo geometry in the merged
                static asset path.
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
                  the active frame. The lower-left triad shows the projected X,
                  Y, and Z directions.
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
                    <marker
                      id="transition-lab-axis-arrow-x"
                      markerWidth="6"
                      markerHeight="6"
                      refX="5"
                      refY="3"
                      orient="auto"
                      viewBox="0 0 6 6"
                    >
                      <path
                        d="M 0 0 L 6 3 L 0 6 z"
                        fill={AXIS_GUIDE_COLORS.x}
                      />
                    </marker>
                    <marker
                      id="transition-lab-axis-arrow-y"
                      markerWidth="6"
                      markerHeight="6"
                      refX="5"
                      refY="3"
                      orient="auto"
                      viewBox="0 0 6 6"
                    >
                      <path
                        d="M 0 0 L 6 3 L 0 6 z"
                        fill={AXIS_GUIDE_COLORS.y}
                      />
                    </marker>
                    <marker
                      id="transition-lab-axis-arrow-z"
                      markerWidth="6"
                      markerHeight="6"
                      refX="5"
                      refY="3"
                      orient="auto"
                      viewBox="0 0 6 6"
                    >
                      <path
                        d="M 0 0 L 6 3 L 0 6 z"
                        fill={AXIS_GUIDE_COLORS.z}
                      />
                    </marker>
                  </defs>

                  <g pointerEvents="none">
                    <rect
                      x={AXIS_GUIDE_PANEL.x}
                      y={AXIS_GUIDE_PANEL.y}
                      width={AXIS_GUIDE_PANEL.width}
                      height={AXIS_GUIDE_PANEL.height}
                      fill="rgba(255,255,255,0.88)"
                      stroke="rgba(17,17,17,0.12)"
                    />
                    <text
                      x={AXIS_GUIDE_PANEL.x + 10}
                      y={AXIS_GUIDE_PANEL.y + 18}
                      fill="#111111"
                      fontSize={10}
                      fontWeight={600}
                      letterSpacing="0.18em"
                    >
                      AXES
                    </text>
                    <circle
                      cx={AXIS_GUIDE_ORIGIN.x}
                      cy={AXIS_GUIDE_ORIGIN.y}
                      r={2.75}
                      fill="#111111"
                    />
                    {axisGuideLines.map((line) => (
                      <g key={line.key}>
                        <line
                          x1={AXIS_GUIDE_ORIGIN.x}
                          y1={AXIS_GUIDE_ORIGIN.y}
                          x2={line.end.x}
                          y2={line.end.y}
                          stroke={line.color}
                          strokeLinecap="round"
                          strokeWidth={2.25}
                          markerEnd={`url(#transition-lab-axis-arrow-${line.key})`}
                        />
                        <text
                          x={line.labelPosition.x}
                          y={line.labelPosition.y}
                          dominantBaseline="middle"
                          fill={line.color}
                          fontSize={11}
                          fontWeight={700}
                          textAnchor="middle"
                        >
                          {line.label}
                        </text>
                      </g>
                    ))}
                  </g>

                  {faces.map((face, index) => (
                    <use
                      key={face.key}
                      aria-label={`Select face ${index + 1}`}
                      href="#transition-lab-face"
                      fill={face.color}
                      opacity={index === selectedFaceIndex ? 0.18 : 1}
                      onBlur={() => {
                        setFocusedFaceIndex((currentIndex) =>
                          currentIndex === index ? null : currentIndex,
                        );
                      }}
                      onClick={() => {
                        setSelectedFaceIndex(index);
                      }}
                      onFocus={() => {
                        setFocusedFaceIndex(index);
                        setSelectedFaceIndex(index);
                      }}
                      onKeyDown={(event) => {
                        handleFaceKeyDown(event, index);
                      }}
                      role="button"
                      stroke={face.stroke}
                      strokeWidth={face.strokeWidth}
                      tabIndex={0}
                      transform={face.transform}
                      style={{ cursor: "pointer" }}
                    />
                  ))}

                  {focusedFace ? (
                    <use
                      aria-hidden="true"
                      href="#transition-lab-face"
                      fill="none"
                      pointerEvents="none"
                      stroke="#0ea5e9"
                      strokeDasharray="6 4"
                      strokeWidth={2}
                      transform={focusedFace.transform}
                    />
                  ) : null}

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
                    aria-label={`Move ${activeFrame} frame with arrow keys`}
                    href="#transition-lab-face"
                    fill={selectedFace.color}
                    fillOpacity={0.88}
                    onBlur={() => {
                      setIsHandleFocused(false);
                    }}
                    onFocus={() => {
                      setIsHandleFocused(true);
                    }}
                    onKeyDown={handleActiveFaceKeyDown}
                    onPointerDown={beginDrag}
                    role="button"
                    stroke={selectedFace.stroke}
                    strokeWidth={selectedFace.strokeWidth}
                    tabIndex={0}
                    transform={`translate(${currentEditableOffset.x} ${currentEditableOffset.y}) ${selectedFace.transform}`}
                    style={{ cursor: "grab" }}
                  />

                  {isHandleFocused ? (
                    <use
                      aria-hidden="true"
                      href="#transition-lab-face"
                      fill="none"
                      pointerEvents="none"
                      stroke="#0ea5e9"
                      strokeDasharray="6 4"
                      strokeWidth={2}
                      transform={`translate(${currentEditableOffset.x} ${currentEditableOffset.y}) ${selectedFace.transform}`}
                    />
                  ) : null}

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
