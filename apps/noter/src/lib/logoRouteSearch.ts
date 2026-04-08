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

export type LogoRouteSearch = {
  axis?: LogoRotationAxisMode;
  elev?: number;
  freeView?: boolean;
  isoSide?: number;
  isoStyle?: LogoIsometricStyleId;
  leftColor?: string;
  rightColor?: string;
  rot?: number;
  topColor?: string;
  vox?: string;
};

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

function readOptionalFlag(value: unknown): boolean | undefined {
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

export function validateLogoRouteSearch(
  search: Record<string, unknown>,
): LogoRouteSearch {
  const voxelState = readOptionalString(search.vox);
  const parsedVoxelState =
    typeof voxelState === "string" ? parseVoxelState(voxelState) : null;
  const rawAxis = readOptionalString(search.axis);
  const rawIsoStyle = readOptionalString(search.isoStyle);
  const isoStyle =
    typeof rawIsoStyle === "string" && isLogoIsometricStyleId(rawIsoStyle)
      ? rawIsoStyle
      : undefined;
  const elevationDegrees = readOptionalNumber(search.elev);
  const freeView = readOptionalFlag(search.freeView);
  const isoCubeSidePixels = readOptionalNumber(search.isoSide);
  const rotationDegrees = readOptionalNumber(search.rot);
  const faceColors = {
    left: readOptionalString(search.leftColor),
    right: readOptionalString(search.rightColor),
    top: readOptionalString(search.topColor),
  } satisfies Record<FaceColorKey, string | undefined>;

  return {
    ...(isLogoRotationAxisMode(rawAxis) ? { axis: rawAxis } : {}),
    ...(typeof elevationDegrees === "number"
      ? { elev: normalizeElevationDegrees(elevationDegrees) }
      : {}),
    ...(freeView === true ? { freeView } : {}),
    ...(typeof isoCubeSidePixels === "number"
      ? { isoSide: normalizeLogoIsometricCubeSidePixels(isoCubeSidePixels) }
      : {}),
    ...(typeof isoStyle === "string" ? { isoStyle } : {}),
    ...(typeof faceColors.left === "string"
      ? { leftColor: faceColors.left }
      : {}),
    ...(typeof faceColors.right === "string"
      ? { rightColor: faceColors.right }
      : {}),
    ...(typeof rotationDegrees === "number"
      ? { rot: normalizeRotationDegrees(rotationDegrees) }
      : {}),
    ...(typeof faceColors.top === "string" ? { topColor: faceColors.top } : {}),
    ...(parsedVoxelState !== null
      ? { vox: serializeVoxelState(parsedVoxelState) }
      : {}),
  };
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
