import { Button } from "@/components/button";
import {
  LOGO_THREE_SVG_VIEWBOX_SIZE,
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_COORDINATES,
} from "@/components/logoStaticSvgContract";
import { DEFAULT_FACE_COLORS } from "@/components/logoTailwindColors";
import {
  collectLogoProjectedLatticePoints,
  collectLogoProjectedVoxelCornerPoints,
  createLogoThreeSvgMarkup,
  getLogoProjectedLatticeBasis,
  getLogoProjectedPointKey,
  type LogoProjectedPoint,
} from "@/components/logoThreeSvgRenderer";
import { createFilledVoxelSet } from "@/components/logoVoxelState";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

function addPoints(left: LogoProjectedPoint, right: LogoProjectedPoint) {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
  };
}

function getPointLength(point: LogoProjectedPoint) {
  return Math.hypot(point.x, point.y);
}

function formatPoint(point: LogoProjectedPoint) {
  return `${point.x.toFixed(2)}, ${point.y.toFixed(2)}`;
}

function getAngleBetween(left: LogoProjectedPoint, right: LogoProjectedPoint) {
  const leftLength = getPointLength(left);
  const rightLength = getPointLength(right);
  if (leftLength === 0 || rightLength === 0) {
    return 0;
  }

  const cosine =
    (left.x * right.x + left.y * right.y) / (leftLength * rightLength);
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
}

function BasisVector({
  color,
  end,
  label,
  origin,
}: {
  color: string;
  end: LogoProjectedPoint;
  label: string;
  origin: LogoProjectedPoint;
}) {
  return (
    <g>
      <line
        x1={origin.x}
        y1={origin.y}
        x2={end.x}
        y2={end.y}
        stroke={color}
        strokeWidth="1.6"
      />
      <circle cx={end.x} cy={end.y} r="3.1" fill={color} />
      <text
        x={end.x + 6}
        y={end.y - 6}
        fill={color}
        fontSize="11"
        fontWeight="600"
      >
        {label}
      </text>
    </g>
  );
}

export function LogoProjectedDotLatticeStudyPage() {
  const [rotationDegrees, setRotationDegrees] = useState(
    STATIC_LOGO_ROTATION_DEGREES,
  );
  const [elevationDegrees, setElevationDegrees] = useState(
    STATIC_LOGO_ELEVATION_DEGREES,
  );
  const [showBasis, setShowBasis] = useState(true);
  const [showCorners, setShowCorners] = useState(true);
  const [showLattice, setShowLattice] = useState(true);
  const [showLogo, setShowLogo] = useState(true);

  const filledVoxels = useMemo(
    () => createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES),
    [],
  );
  const logoMarkup = useMemo(
    () =>
      createLogoThreeSvgMarkup({
        backgroundColor: "transparent",
        elevationDegrees,
        faceColors: DEFAULT_FACE_COLORS,
        filledVoxels,
        rotationDegrees,
        viewBoxSize: LOGO_THREE_SVG_VIEWBOX_SIZE,
      }),
    [elevationDegrees, filledVoxels, rotationDegrees],
  );
  const logoSrc = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoMarkup)}`,
    [logoMarkup],
  );
  const basis = useMemo(
    () =>
      getLogoProjectedLatticeBasis({
        elevationDegrees,
        filledVoxels,
        rotationDegrees,
        viewBoxSize: LOGO_THREE_SVG_VIEWBOX_SIZE,
      }),
    [elevationDegrees, filledVoxels, rotationDegrees],
  );
  const latticePoints = useMemo(
    () =>
      collectLogoProjectedLatticePoints({
        elevationDegrees,
        filledVoxels,
        rotationDegrees,
        viewBoxSize: LOGO_THREE_SVG_VIEWBOX_SIZE,
      }),
    [elevationDegrees, filledVoxels, rotationDegrees],
  );
  const cornerPoints = useMemo(
    () =>
      collectLogoProjectedVoxelCornerPoints({
        elevationDegrees,
        filledVoxels,
        rotationDegrees,
        viewBoxSize: LOGO_THREE_SVG_VIEWBOX_SIZE,
      }),
    [elevationDegrees, filledVoxels, rotationDegrees],
  );
  const missingCornerKeys = useMemo(() => {
    const latticeKeys = new Set(
      latticePoints.map((point) => getLogoProjectedPointKey(point)),
    );
    return cornerPoints
      .filter((point) => !latticeKeys.has(getLogoProjectedPointKey(point)))
      .map((point) => getLogoProjectedPointKey(point));
  }, [cornerPoints, latticePoints]);

  const xVectorEnd = basis ? addPoints(basis.origin, basis.xEdge) : null;
  const yVectorEnd = basis ? addPoints(basis.origin, basis.yEdge) : null;
  const zVectorEnd = basis ? addPoints(basis.origin, basis.zEdge) : null;
  const xLength = basis ? getPointLength(basis.xEdge) : 0;
  const yLength = basis ? getPointLength(basis.yEdge) : 0;
  const zLength = basis ? getPointLength(basis.zEdge) : 0;
  const xyAngle = basis ? getAngleBetween(basis.xEdge, basis.yEdge) : 0;
  const yzAngle = basis ? getAngleBetween(basis.yEdge, basis.zEdge) : 0;
  const zxAngle = basis ? getAngleBetween(basis.zEdge, basis.xEdge) : 0;

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
            <Link to="/logo-iso-study">Single Cube Study</Link>
          </Button>
          <Button size="sm" className="rounded-none">
            Dot Lattice Study
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div className="grid content-start gap-4 border border-black/10 bg-white/88 p-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Projection Math
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Projected Corner Lattice Lab
              </h1>
              <p className="mt-2 text-sm leading-6 text-black/60">
                This page uses the same projection math as the landing page.
                Orange dots come from a real projected 3D corner grid around the
                logo. Black dots are the exact projected cube corners. The goal
                is zero missing corners.
              </p>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                <span>Rotation</span>
                <span>{rotationDegrees.toFixed(0)}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={rotationDegrees}
                onChange={(event) => {
                  setRotationDegrees(Number(event.target.value));
                }}
                className="h-2 w-full cursor-pointer accent-black"
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                <span>Elevation</span>
                <span>{elevationDegrees.toFixed(2)}°</span>
              </div>
              <input
                type="range"
                min="5"
                max="85"
                step="0.1"
                value={elevationDegrees}
                onChange={(event) => {
                  setElevationDegrees(Number(event.target.value));
                }}
                className="h-2 w-full cursor-pointer accent-black"
              />
            </div>

            <div className="grid gap-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Overlays
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={showLogo ? "default" : "outline"}
                  className="rounded-none"
                  onClick={() => {
                    setShowLogo((currentValue) => !currentValue);
                  }}
                >
                  {showLogo ? "Hide logo" : "Show logo"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={showLattice ? "default" : "outline"}
                  className="rounded-none"
                  onClick={() => {
                    setShowLattice((currentValue) => !currentValue);
                  }}
                >
                  {showLattice ? "Hide lattice" : "Show lattice"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={showCorners ? "default" : "outline"}
                  className="rounded-none"
                  onClick={() => {
                    setShowCorners((currentValue) => !currentValue);
                  }}
                >
                  {showCorners ? "Hide corners" : "Show corners"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={showBasis ? "default" : "outline"}
                  className="rounded-none"
                  onClick={() => {
                    setShowBasis((currentValue) => !currentValue);
                  }}
                >
                  {showBasis ? "Hide basis" : "Show basis"}
                </Button>
              </div>
            </div>

            <div className="grid gap-2 border border-black/10 bg-[#fbfaf6] p-3 text-sm leading-6 text-black/60">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Exactness Check
              </div>
              <div>
                Missing projected corners:{" "}
                <span className="font-mono text-black">
                  {missingCornerKeys.length}
                </span>
              </div>
              <div>
                Lattice points in frame:{" "}
                <span className="font-mono text-black">
                  {latticePoints.length}
                </span>
              </div>
              <div>
                Unique cube corners:{" "}
                <span className="font-mono text-black">
                  {cornerPoints.length}
                </span>
              </div>
            </div>

            {basis ? (
              <div className="grid gap-2 border border-black/10 bg-[#fbfaf6] p-3 text-sm leading-6 text-black/60">
                <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                  Basis Readout
                </div>
                <div>
                  Origin:{" "}
                  <span className="font-mono text-black">
                    {formatPoint(basis.origin)}
                  </span>
                </div>
                <div>
                  X edge:{" "}
                  <span className="font-mono text-black">
                    {formatPoint(basis.xEdge)}
                  </span>
                </div>
                <div>
                  Y edge:{" "}
                  <span className="font-mono text-black">
                    {formatPoint(basis.yEdge)}
                  </span>
                </div>
                <div>
                  Z edge:{" "}
                  <span className="font-mono text-black">
                    {formatPoint(basis.zEdge)}
                  </span>
                </div>
                <div>
                  Edge lengths:{" "}
                  <span className="font-mono text-black">
                    {xLength.toFixed(3)} / {yLength.toFixed(3)} /{" "}
                    {zLength.toFixed(3)}
                  </span>
                </div>
                <div>
                  Pair angles:{" "}
                  <span className="font-mono text-black">
                    {xyAngle.toFixed(2)}° / {yzAngle.toFixed(2)}° /{" "}
                    {zxAngle.toFixed(2)}°
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-6">
            <div className="grid gap-3 border border-black/10 bg-white/88 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                    Exact Overlay
                  </div>
                  <div className="mt-1 text-sm text-black/60">
                    Black corner points should sit exactly on top of orange
                    lattice points. The three colored vectors are the projected
                    unit cube edges, so you can inspect the hex/equilateral
                    basis of the default isometric view directly.
                  </div>
                </div>
                <div className="font-mono text-[11px] text-black/45">
                  {missingCornerKeys.length === 0 ? "exact" : "mismatch"}
                </div>
              </div>
              <div className="flex min-h-[44rem] items-center justify-center border border-black/10 bg-[#fcfbf7] p-4">
                <div className="relative h-[44rem] w-[44rem] max-w-full">
                  {showLogo ? (
                    <img
                      src={logoSrc}
                      alt="Projected logo lattice study"
                      className="absolute inset-0 h-full w-full"
                    />
                  ) : null}
                  <svg
                    viewBox={`0 0 ${LOGO_THREE_SVG_VIEWBOX_SIZE} ${LOGO_THREE_SVG_VIEWBOX_SIZE}`}
                    className="absolute inset-0 h-full w-full"
                  >
                    {showLattice
                      ? latticePoints.map((point) => (
                          <circle
                            key={`lattice-${getLogoProjectedPointKey(point)}`}
                            cx={point.x}
                            cy={point.y}
                            r="1.35"
                            fill="#e8a15e"
                          />
                        ))
                      : null}
                    {showBasis &&
                    basis &&
                    xVectorEnd &&
                    yVectorEnd &&
                    zVectorEnd ? (
                      <>
                        <BasisVector
                          color="#ef4444"
                          end={xVectorEnd}
                          label="x"
                          origin={basis.origin}
                        />
                        <BasisVector
                          color="#22c55e"
                          end={yVectorEnd}
                          label="y"
                          origin={basis.origin}
                        />
                        <BasisVector
                          color="#3b82f6"
                          end={zVectorEnd}
                          label="z"
                          origin={basis.origin}
                        />
                      </>
                    ) : null}
                    {showCorners
                      ? cornerPoints.map((point) => (
                          <circle
                            key={`corner-${getLogoProjectedPointKey(point)}`}
                            cx={point.x}
                            cy={point.y}
                            r="2.8"
                            fill="#111827"
                          />
                        ))
                      : null}
                  </svg>
                </div>
              </div>
            </div>

            <div className="grid gap-3 border border-black/10 bg-white/88 p-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                  Missing Keys
                </div>
                <div className="mt-1 text-sm text-black/60">
                  This should stay empty. If it does not, the lattice basis no
                  longer covers the exact projected cube-corner set.
                </div>
              </div>
              <pre className="min-h-[6rem] overflow-auto border border-black/10 bg-[#fcfbf7] p-3 font-mono text-xs leading-5 text-black/65">
                {missingCornerKeys.length === 0
                  ? "[]"
                  : JSON.stringify(missingCornerKeys, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
