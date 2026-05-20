import {
  INTERACTIVE_LOGO_SVG_URL,
  STATIC_LOGO_BACKGROUND_COLOR,
  STATIC_LOGO_ELEVATION_DEGREES,
  LOGO_IDENTITY_VIEW_CONTRACTS,
  LOGO_THREE_SVG_VIEWBOX_SIZE,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_COORDINATES,
  type LogoIdentityViewId,
} from "./logoStaticSvgContract";
import { DEFAULT_FACE_COLORS, type FaceColors } from "./logoTailwindColors";
import {
  createLogoThreeProjectedQuads,
  createLogoThreeSvgMarkup,
  type LogoProjectedPoint,
  type LogoProjectedQuad,
} from "./logoThreeSvgRenderer";
import { GRID_SIZE, createFilledVoxelSet } from "./logoVoxelState";

type StaticLogoSvgOptions = {
  depth?: number;
  faceColors?: FaceColors;
  filledVoxels?: ReadonlySet<string>;
  gridSize?: number;
  view?: {
    elevationDegrees: number;
    rotationDegrees: number;
  };
};

type InteractiveLogoSvgOptions = {
  faceColors?: FaceColors;
  filledVoxels?: ReadonlySet<string>;
  gridSize?: number;
};

const INTERACTIVE_LOGO_STATE_CONTRACTS = [
  {
    className: "noter-logo-state-v1",
    viewId: "side-primary",
  },
  {
    className: "noter-logo-state-v2",
    viewId: "side-diagonal",
  },
  {
    className: "noter-logo-state-v3",
    viewId: "spatial",
  },
] as const satisfies readonly {
  className: string;
  viewId: LogoIdentityViewId;
}[];

function escapeSvgAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function serializeLogoProjectedPoint(point: LogoProjectedPoint) {
  return `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
}

function serializeLogoProjectedPolygon(points: readonly LogoProjectedPoint[]) {
  return points.map(serializeLogoProjectedPoint).join(" ");
}

function createLogoProjectedQuadMarkup(quad: LogoProjectedQuad) {
  const fill = escapeSvgAttribute(quad.color);

  return `<polygon points="${escapeSvgAttribute(serializeLogoProjectedPolygon(quad.points))}" fill="${fill}" stroke="${fill}" stroke-width="${quad.strokeWidth}" stroke-linejoin="round" paint-order="stroke fill"/>`;
}

function createInteractiveLogoStyleMarkup() {
  return `<style>
.noter-logo-state {
  pointer-events: none;
  transition: opacity 120ms ease-out;
}
.noter-logo-state-v2,
.noter-logo-state-v3 {
  opacity: 0;
}
.noter-logo-interactive-svg:hover .noter-logo-state-v1,
.noter-logo-hitbox:hover ~ .noter-logo-state-v1 {
  opacity: 0;
}
.noter-logo-interactive-svg:hover .noter-logo-state-v2,
.noter-logo-hitbox:hover ~ .noter-logo-state-v2 {
  opacity: 1;
}
.noter-logo-interactive-svg:active .noter-logo-state-v1,
.noter-logo-interactive-svg:active .noter-logo-state-v2,
.noter-logo-hitbox:active ~ .noter-logo-state-v1,
.noter-logo-hitbox:active ~ .noter-logo-state-v2 {
  opacity: 0;
}
.noter-logo-interactive-svg:active .noter-logo-state-v3,
.noter-logo-hitbox:active ~ .noter-logo-state-v3 {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .noter-logo-state {
    transition: none;
  }
}
</style>`;
}

function createLogoIdentityViewGroupMarkup({
  className,
  options,
  viewId,
}: {
  className: string;
  options: InteractiveLogoSvgOptions;
  viewId: LogoIdentityViewId;
}) {
  const filledVoxels =
    options.filledVoxels ?? createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
  const view = getLogoIdentityViewContract(viewId);
  const quads = createLogoThreeProjectedQuads({
    elevationDegrees: view.elevationDegrees,
    faceColors: options.faceColors ?? DEFAULT_FACE_COLORS,
    filledVoxels,
    gridSize: options.gridSize ?? GRID_SIZE,
    rotationDegrees: view.rotationDegrees,
    viewBoxSize: LOGO_THREE_SVG_VIEWBOX_SIZE,
  });
  const polygons = quads.map(createLogoProjectedQuadMarkup).join("");

  return `<g class="noter-logo-state ${className}" data-logo-view="${escapeSvgAttribute(view.id)}" data-logo-version="${view.version}">${polygons}</g>`;
}

export function createStaticLogoSvgMarkup(options: StaticLogoSvgOptions = {}) {
  const filledVoxels =
    options.filledVoxels ?? createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
  const view = options.view ?? {
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
    rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
  };

  return createLogoThreeSvgMarkup({
    backgroundColor: STATIC_LOGO_BACKGROUND_COLOR,
    depth: options.depth,
    elevationDegrees: view.elevationDegrees,
    faceColors: options.faceColors ?? DEFAULT_FACE_COLORS,
    filledVoxels,
    gridSize: options.gridSize ?? GRID_SIZE,
    rotationDegrees: view.rotationDegrees,
  });
}

export function createLogoIdentityViewSvgMarkup(
  viewId: LogoIdentityViewId,
  options: StaticLogoSvgOptions = {},
) {
  const filledVoxels =
    options.filledVoxels ?? createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
  const view = getLogoIdentityViewContract(viewId);

  return createLogoThreeSvgMarkup({
    backgroundColor: STATIC_LOGO_BACKGROUND_COLOR,
    depth: options.depth,
    elevationDegrees: view.elevationDegrees,
    faceColors: options.faceColors ?? DEFAULT_FACE_COLORS,
    filledVoxels,
    gridSize: options.gridSize ?? GRID_SIZE,
    rotationDegrees: view.rotationDegrees,
  });
}

export function createStaticLogoSvgDataUrl(options: StaticLogoSvgOptions = {}) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createStaticLogoSvgMarkup(options))}`;
}

export function createLogoIdentitySvgAssets() {
  return LOGO_IDENTITY_VIEW_CONTRACTS.map((view) => ({
    assetPath: view.assetPath,
    markup: createLogoIdentityViewSvgMarkup(view.id),
    viewId: view.id,
  }));
}

/**
 * Builds the identity sequence as one inline SVG: version 1 by default,
 * version 2 on hover, and version 3 while the pointer press is active.
 */
export function createInteractiveLogoSvgMarkup(
  options: InteractiveLogoSvgOptions = {},
) {
  const viewGroups = INTERACTIVE_LOGO_STATE_CONTRACTS.map((state) =>
    createLogoIdentityViewGroupMarkup({
      className: state.className,
      options,
      viewId: state.viewId,
    }),
  ).join("");
  // The transparent hitbox keeps hover and active states live inside the
  // version 1 center cutout as well as over painted logo faces.
  const hitbox = `<rect class="noter-logo-hitbox" x="0" y="0" width="${LOGO_THREE_SVG_VIEWBOX_SIZE}" height="${LOGO_THREE_SVG_VIEWBOX_SIZE}" fill="${escapeSvgAttribute(STATIC_LOGO_BACKGROUND_COLOR)}" pointer-events="all"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_THREE_SVG_VIEWBOX_SIZE} ${LOGO_THREE_SVG_VIEWBOX_SIZE}" width="${LOGO_THREE_SVG_VIEWBOX_SIZE}" height="${LOGO_THREE_SVG_VIEWBOX_SIZE}" class="noter-logo-interactive-svg">${createInteractiveLogoStyleMarkup()}${hitbox}${viewGroups}</svg>`;
}

export function createInteractiveLogoSvgAsset() {
  return {
    assetPath: INTERACTIVE_LOGO_SVG_URL,
    markup: createInteractiveLogoSvgMarkup(),
  };
}

function getLogoIdentityViewContract(viewId: LogoIdentityViewId) {
  for (const view of LOGO_IDENTITY_VIEW_CONTRACTS) {
    if (view.id === viewId) {
      return view;
    }
  }

  throw new Error(`Unknown logo identity view: ${viewId}`);
}
