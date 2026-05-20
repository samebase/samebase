import {
  LOGO_IDENTITY_VIEW_CONTRACTS,
  LOGO_THREE_SVG_VIEWBOX_SIZE,
  STATIC_LOGO_VOXEL_COORDINATES,
  type LogoIdentityViewId,
} from "@/components/logo/logoStaticSvgContract";
import {
  createLogoThreeProjectedSurfaceQuads,
  type LogoProjectedPoint,
} from "@/components/logo/logoThreeSvgRenderer";
import { LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE } from "@/components/logo/logoLeftFaceStyle";
import {
  type FaceColorKey,
  type FaceColors,
} from "@/components/logo/logoTailwindColors";
import { type LogoSurfaceUv } from "@/components/logo/logoSurfaceModel";
import {
  GRID_SIZE,
  createFilledVoxelSet,
} from "@/components/logo/logoVoxelState";
import { useEffect, useRef, useState } from "react";

export type NoterLinkIconState = "active" | "hover" | "idle";

type NoterLinkIconFace = {
  colorKey: FaceColorKey;
  key: string;
  points: readonly LogoProjectedPoint[];
  uvs: readonly LogoSurfaceUv[];
};

type NoterLinkIconProps = {
  state?: NoterLinkIconState;
};

type NoterLinkIconStripePoint = LogoProjectedPoint & {
  u: number;
  v: number;
};

const NOTER_LINK_ICON_STATE_VIEWS = {
  active: "spatial",
  hover: "side-diagonal",
  idle: "side-primary",
} as const satisfies Record<NoterLinkIconState, LogoIdentityViewId>;
const NOTER_LINK_ICON_FACE_COLORS: FaceColors = {
  left: "#000000",
  right: "#000000",
  top: "#000000",
};
const NOTER_LINK_ICON_FILLED_VOXELS = createFilledVoxelSet(
  STATIC_LOGO_VOXEL_COORDINATES,
);
const NOTER_LINK_ICON_ANIMATION_MS = 180;
const NOTER_LINK_ICON_FRAMES = {
  active: createNoterLinkIconFrame("active"),
  hover: createNoterLinkIconFrame("hover"),
  idle: createNoterLinkIconFrame("idle"),
} as const satisfies Record<NoterLinkIconState, readonly NoterLinkIconFace[]>;

function readLogoIdentityView(viewId: LogoIdentityViewId) {
  for (const view of LOGO_IDENTITY_VIEW_CONTRACTS) {
    if (view.id === viewId) {
      return view;
    }
  }

  throw new Error(`Unknown logo identity view: ${viewId}`);
}

function getFaceCenter(points: readonly LogoProjectedPoint[]) {
  const center = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x / points.length,
      y: sum.y + point.y / points.length,
    }),
    { x: 0, y: 0 },
  );

  return center;
}

function collapsePoints(points: readonly LogoProjectedPoint[]) {
  const center = getFaceCenter(points);
  return points.map(() => center);
}

function createNoterLinkIconFrame(
  state: NoterLinkIconState,
): readonly NoterLinkIconFace[] {
  const view = readLogoIdentityView(NOTER_LINK_ICON_STATE_VIEWS[state]);

  return createLogoThreeProjectedSurfaceQuads({
    elevationDegrees: view.elevationDegrees,
    faceColors: NOTER_LINK_ICON_FACE_COLORS,
    filledVoxels: NOTER_LINK_ICON_FILLED_VOXELS,
    gridSize: GRID_SIZE,
    rotationDegrees: view.rotationDegrees,
    viewBoxSize: LOGO_THREE_SVG_VIEWBOX_SIZE,
  })
    .map((face) => ({
      colorKey: face.colorKey,
      key: face.key,
      points: face.isVisible ? face.points : collapsePoints(face.points),
      uvs: face.uvs,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function easeOutCubic(progress: number) {
  return 1 - (1 - progress) ** 3;
}

function mixNumber(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function mixPoints(
  start: readonly LogoProjectedPoint[],
  end: readonly LogoProjectedPoint[],
  progress: number,
) {
  return start.map((point, index) => {
    const endPoint = end[index];

    return {
      x: mixNumber(point.x, endPoint.x, progress),
      y: mixNumber(point.y, endPoint.y, progress),
    };
  });
}

function mixFrames(
  start: readonly NoterLinkIconFace[],
  end: readonly NoterLinkIconFace[],
  progress: number,
): readonly NoterLinkIconFace[] {
  return start.map((face, index) => {
    const endFace = end[index];
    if (endFace.key !== face.key) {
      return face;
    }

    return {
      colorKey: face.colorKey,
      key: face.key,
      points: mixPoints(face.points, endFace.points, progress),
      uvs: face.uvs,
    };
  });
}

function useAnimatedNoterLinkIconFrame(state: NoterLinkIconState) {
  const renderedStateRef = useRef(state);
  const currentFrameRef = useRef(NOTER_LINK_ICON_FRAMES[state]);
  const [frame, setFrame] = useState(() => NOTER_LINK_ICON_FRAMES[state]);

  useEffect(() => {
    if (renderedStateRef.current === state) {
      return;
    }

    const targetFrame = NOTER_LINK_ICON_FRAMES[state];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      renderedStateRef.current = state;
      currentFrameRef.current = targetFrame;
      setFrame(targetFrame);
      return;
    }

    const startFrame = currentFrameRef.current;
    const startTime = window.performance.now();
    let animationFrameId = 0;

    const step = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / NOTER_LINK_ICON_ANIMATION_MS, 1);
      const nextFrame = mixFrames(
        startFrame,
        targetFrame,
        easeOutCubic(progress),
      );

      currentFrameRef.current = nextFrame;
      setFrame(nextFrame);

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(step);
        return;
      }

      renderedStateRef.current = state;
      currentFrameRef.current = targetFrame;
      setFrame(targetFrame);
    };

    animationFrameId = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [state]);

  return frame;
}

function formatCoordinate(value: number) {
  return value.toFixed(3);
}

function serializePoints(points: readonly LogoProjectedPoint[]) {
  return points
    .map((point) => `${formatCoordinate(point.x)},${formatCoordinate(point.y)}`)
    .join(" ");
}

function createStripePoints(
  points: readonly LogoProjectedPoint[],
  uvs: readonly LogoSurfaceUv[],
): readonly NoterLinkIconStripePoint[] {
  const stripePoints: NoterLinkIconStripePoint[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const uv = uvs[index];
    const [u, v] = uv;

    stripePoints.push({
      u,
      v,
      x: point.x,
      y: point.y,
    });
  }

  return stripePoints;
}

function mixStripePoint(
  start: NoterLinkIconStripePoint,
  end: NoterLinkIconStripePoint,
  progress: number,
): NoterLinkIconStripePoint {
  return {
    u: mixNumber(start.u, end.u, progress),
    v: mixNumber(start.v, end.v, progress),
    x: mixNumber(start.x, end.x, progress),
    y: mixNumber(start.y, end.y, progress),
  };
}

function readStripePosition(point: NoterLinkIconStripePoint) {
  return point.u + point.v;
}

function clipStripePolygon(
  polygon: readonly NoterLinkIconStripePoint[],
  threshold: number,
  keepGreater: boolean,
) {
  const clippedPolygon: NoterLinkIconStripePoint[] = [];

  for (let index = 0; index < polygon.length; index += 1) {
    const currentPoint = polygon[index];
    const previousPoint =
      polygon[(index + polygon.length - 1) % polygon.length];
    const currentValue = readStripePosition(currentPoint);
    const previousValue = readStripePosition(previousPoint);
    const currentInside = keepGreater
      ? currentValue >= threshold
      : currentValue <= threshold;
    const previousInside = keepGreater
      ? previousValue >= threshold
      : previousValue <= threshold;

    if (currentInside !== previousInside) {
      const denominator = currentValue - previousValue;
      const progress =
        denominator === 0 ? 0 : (threshold - previousValue) / denominator;
      clippedPolygon.push(
        mixStripePoint(previousPoint, currentPoint, progress),
      );
    }

    if (currentInside) {
      clippedPolygon.push(currentPoint);
    }
  }

  return clippedPolygon;
}

function createLeftFaceStripePolygons(face: NoterLinkIconFace) {
  const stripePoints = createStripePoints(face.points, face.uvs);
  const stripePositions = stripePoints.map(readStripePosition);
  const minStripePosition = Math.min(...stripePositions);
  const maxStripePosition = Math.max(...stripePositions);
  const stripeWidth = LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE.stripeWidth;
  const stripePeriod =
    stripeWidth + LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE.stripeGap;
  const firstStripeIndex = Math.floor(minStripePosition / stripePeriod) - 1;
  const lastStripeIndex = Math.ceil(maxStripePosition / stripePeriod) + 1;
  const mutableStripePolygons: LogoProjectedPoint[][] = [];

  for (
    let stripeIndex = firstStripeIndex;
    stripeIndex <= lastStripeIndex;
    stripeIndex += 1
  ) {
    const start = stripeIndex * stripePeriod;
    const end = start + stripeWidth;
    const clippedToStart = clipStripePolygon(stripePoints, start, true);
    const clippedToBand = clipStripePolygon(clippedToStart, end, false);

    if (clippedToBand.length >= 3) {
      mutableStripePolygons.push(
        clippedToBand.map((point) => ({ x: point.x, y: point.y })),
      );
    }
  }

  return mutableStripePolygons;
}

function getFaceBaseFill(face: NoterLinkIconFace) {
  switch (face.colorKey) {
    case "right":
      return "currentColor";
    case "left":
    case "top":
      return "hsl(var(--background))";
    default: {
      const unreachable = face.colorKey satisfies never;
      return unreachable;
    }
  }
}

export function NoterLinkIcon({ state = "idle" }: NoterLinkIconProps) {
  const frame = useAnimatedNoterLinkIconFrame(state);

  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0 overflow-visible text-foreground"
      data-logo-state={state}
      data-testid="noter-link-icon"
      focusable="false"
      height={20}
      viewBox={`0 0 ${LOGO_THREE_SVG_VIEWBOX_SIZE} ${LOGO_THREE_SVG_VIEWBOX_SIZE}`}
      width={20}
    >
      <g shapeRendering="geometricPrecision">
        {frame.map((face) => {
          const points = serializePoints(face.points);
          const stripePolygons =
            face.colorKey === "left" ? createLeftFaceStripePolygons(face) : [];

          return (
            <g key={face.key}>
              <polygon
                fill={getFaceBaseFill(face)}
                paintOrder="stroke fill"
                points={points}
                stroke={getFaceBaseFill(face)}
                strokeLinejoin="round"
                strokeWidth="0.7"
              />
              {stripePolygons.map((stripePolygon, stripeIndex) => (
                <polygon
                  fill="currentColor"
                  key={`${face.key}-stripe-${stripeIndex}`}
                  points={serializePoints(stripePolygon)}
                />
              ))}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
