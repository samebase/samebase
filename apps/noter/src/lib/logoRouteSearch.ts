import { type LogoRotationAxisMode } from "@/components/logoRotationMath";
import {
  DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  isLogoIsometricStyleId,
  normalizeLogoIsometricCubeSidePixels,
  type LogoIsometricStyleId,
} from "@/components/logoIsometricRenderer";
import {
  DEFAULT_FACE_COLORS,
  type FaceColorKey,
  type FaceColors,
} from "@/components/logoTailwindColors";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_ROTATION_DEGREES,
  DEFAULT_VOXEL_STATE,
  normalizeElevationDegrees,
  normalizeRotationDegrees,
  parseVoxelState,
  serializeVoxelState,
} from "@/components/logoVoxelState";
import { LANDING_DEV_MODE_QUERY_PARAM } from "@/lib/landingDevMode";
import { z } from "zod";

const LOGO_ROTATION_AXIS_MODE_VALUES = [
  "cube-y",
  "screen-vertical",
] as const satisfies readonly LogoRotationAxisMode[];

const LOGO_ISOMETRIC_STYLE_VALUES = [
  "flat",
  "shaded-edge",
  "cap-3",
  "cap-4",
] as const satisfies readonly LogoIsometricStyleId[];

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return undefined;
  }

  const parsedValue = Number(trimmedValue);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function readOptionalFlag(value: unknown): true | undefined {
  if (value === true) {
    return true;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  return value.length === 0 || value === "true" ? true : undefined;
}

function isLogoRotationAxisMode(
  value: string | undefined,
): value is LogoRotationAxisMode {
  return value === "cube-y" || value === "screen-vertical";
}

function readOptionalRotationAxisMode(
  value: unknown,
): LogoRotationAxisMode | undefined {
  const rotationAxisMode = readOptionalString(value);
  return isLogoRotationAxisMode(rotationAxisMode)
    ? rotationAxisMode
    : undefined;
}

function readOptionalIsoStyleId(
  value: unknown,
): LogoIsometricStyleId | undefined {
  const isoStyleId = readOptionalString(value);
  return typeof isoStyleId === "string" && isLogoIsometricStyleId(isoStyleId)
    ? isoStyleId
    : undefined;
}

function readCanonicalVoxelState(value: unknown): string | undefined {
  const voxelState = readOptionalString(value);
  if (typeof voxelState !== "string") {
    return undefined;
  }

  const parsedVoxelState = parseVoxelState(voxelState);
  return parsedVoxelState === null
    ? undefined
    : serializeVoxelState(parsedVoxelState);
}

const logoRouteSearchFieldSchema = z.object({
  axis: z.preprocess(
    readOptionalRotationAxisMode,
    z.enum(LOGO_ROTATION_AXIS_MODE_VALUES).optional(),
  ),
  [LANDING_DEV_MODE_QUERY_PARAM]: z.preprocess(
    readOptionalFlag,
    z.literal(true).optional(),
  ),
  elev: z.preprocess(readOptionalNumber, z.number().finite().optional()),
  freeView: z.preprocess(readOptionalFlag, z.literal(true).optional()),
  isoSide: z.preprocess(readOptionalNumber, z.number().finite().optional()),
  isoStyle: z.preprocess(
    readOptionalIsoStyleId,
    z.enum(LOGO_ISOMETRIC_STYLE_VALUES).optional(),
  ),
  leftColor: z.preprocess(readOptionalString, z.string().optional()),
  rightColor: z.preprocess(readOptionalString, z.string().optional()),
  rot: z.preprocess(readOptionalNumber, z.number().finite().optional()),
  topColor: z.preprocess(readOptionalString, z.string().optional()),
  vox: z.preprocess(readCanonicalVoxelState, z.string().optional()),
});

export const logoRouteSearchSchema = logoRouteSearchFieldSchema.transform(
  (search) => {
    const faceColors = {
      left: search.leftColor,
      right: search.rightColor,
      top: search.topColor,
    } satisfies Record<FaceColorKey, string | undefined>;

    return {
      ...(typeof search.axis === "string" ? { axis: search.axis } : {}),
      ...(search.dev === true ? { dev: true as const } : {}),
      ...(typeof search.elev === "number"
        ? { elev: normalizeElevationDegrees(search.elev) }
        : {}),
      ...(search.freeView === true ? { freeView: true } : {}),
      ...(typeof search.isoSide === "number"
        ? { isoSide: normalizeLogoIsometricCubeSidePixels(search.isoSide) }
        : {}),
      ...(typeof search.isoStyle === "string"
        ? { isoStyle: search.isoStyle }
        : {}),
      ...(typeof faceColors.left === "string"
        ? { leftColor: faceColors.left }
        : {}),
      ...(typeof faceColors.right === "string"
        ? { rightColor: faceColors.right }
        : {}),
      ...(typeof search.rot === "number"
        ? { rot: normalizeRotationDegrees(search.rot) }
        : {}),
      ...(typeof faceColors.top === "string"
        ? { topColor: faceColors.top }
        : {}),
      ...(typeof search.vox === "string" ? { vox: search.vox } : {}),
    };
  },
);

export type LogoRouteSearch = z.infer<typeof logoRouteSearchSchema>;

export function validateLogoRouteSearch(
  search: Record<string, unknown>,
): LogoRouteSearch {
  return logoRouteSearchSchema.parse(search);
}

export function buildLogoRouteSearch(args: {
  elevationDegrees: number;
  faceColors: FaceColors;
  isoCubeSidePixels: number;
  isoStyleId: LogoIsometricStyleId;
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
  viewSnapEnabled: boolean;
  voxelState: string;
}): LogoRouteSearch {
  return {
    ...(args.rotationAxisMode !== "cube-y"
      ? { axis: args.rotationAxisMode }
      : {}),
    ...(args.elevationDegrees !== DEFAULT_ELEVATION_DEGREES
      ? { elev: Number(args.elevationDegrees.toFixed(1)) }
      : {}),
    ...(args.viewSnapEnabled ? {} : { freeView: true }),
    ...(args.isoCubeSidePixels !== DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX
      ? { isoSide: args.isoCubeSidePixels }
      : {}),
    ...(args.isoStyleId !== DEFAULT_LOGO_ISOMETRIC_STYLE_ID
      ? { isoStyle: args.isoStyleId }
      : {}),
    ...(args.faceColors.left !== DEFAULT_FACE_COLORS.left
      ? { leftColor: args.faceColors.left }
      : {}),
    ...(args.faceColors.right !== DEFAULT_FACE_COLORS.right
      ? { rightColor: args.faceColors.right }
      : {}),
    ...(args.rotationDegrees !== DEFAULT_ROTATION_DEGREES
      ? { rot: Number(args.rotationDegrees.toFixed(1)) }
      : {}),
    ...(args.faceColors.top !== DEFAULT_FACE_COLORS.top
      ? { topColor: args.faceColors.top }
      : {}),
    ...(args.voxelState !== DEFAULT_VOXEL_STATE
      ? { vox: args.voxelState }
      : {}),
  };
}

/**
 * Logo routes force the public dev shell on direct loads; query-state sync must
 * carry that route-shell flag forward instead of fighting the route redirect.
 */
export function preserveLogoRouteDevModeSearch(
  nextSearch: LogoRouteSearch,
  currentSearch: LogoRouteSearch,
): LogoRouteSearch {
  if (currentSearch.dev !== true) {
    return nextSearch;
  }

  return {
    ...nextSearch,
    dev: true as const,
  };
}
