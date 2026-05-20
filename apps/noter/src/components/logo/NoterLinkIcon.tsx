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
import {
  type FaceColorKey,
  type FaceColors,
} from "@/components/logo/logoTailwindColors";
import {
  GRID_SIZE,
  createFilledVoxelSet,
} from "@/components/logo/logoVoxelState";
import { useEffect, useId, useRef, useState } from "react";

export type NoterLinkIconState = "active" | "hover" | "idle";

type NoterLinkIconFace = {
  colorKey: FaceColorKey;
  key: string;
  opacity: number;
  points: readonly LogoProjectedPoint[];
};

type NoterLinkIconProps = {
  state?: NoterLinkIconState;
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
      opacity: face.isVisible ? 1 : 0,
      points: face.isVisible ? face.points : collapsePoints(face.points),
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
      opacity: mixNumber(face.opacity, endFace.opacity, progress),
      points: mixPoints(face.points, endFace.points, progress),
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

function formatOpacity(value: number) {
  return value.toFixed(3);
}

function sanitizeSvgId(id: string) {
  return id.replace(/:/g, "");
}

export function NoterLinkIcon({ state = "idle" }: NoterLinkIconProps) {
  const stripePatternId = `${sanitizeSvgId(useId())}-noter-link-icon-stripes`;
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
      <defs>
        <pattern
          height="18"
          id={stripePatternId}
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
          width="18"
        >
          <line
            stroke="hsl(var(--background))"
            strokeLinecap="round"
            strokeWidth="4"
            x1="0"
            x2="0"
            y1="-4"
            y2="22"
          />
        </pattern>
      </defs>
      <g shapeRendering="geometricPrecision">
        {frame.map((face) => {
          const points = serializePoints(face.points);
          const opacity = formatOpacity(face.opacity);

          return (
            <g key={face.key}>
              <polygon
                fill="currentColor"
                fillOpacity={opacity}
                paintOrder="stroke fill"
                points={points}
                stroke="hsl(var(--background))"
                strokeLinejoin="round"
                strokeOpacity={opacity}
                strokeWidth="2.2"
              />
              {face.colorKey === "left" ? (
                <polygon
                  fill={`url(#${stripePatternId})`}
                  fillOpacity={opacity}
                  points={points}
                />
              ) : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
