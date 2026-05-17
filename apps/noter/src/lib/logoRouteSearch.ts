import { type LogoRotationAxisMode } from "@/components/logoRotationMath";
import {
  DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  isLogoIsometricStyleId,
  normalizeLogoIsometricCubeSidePixels,
  type LogoIsometricStyleId,
} from "@/components/logoIsometricRenderer";
import { type LogoThemeColors } from "@/components/logoTailwindColors";
import {
  appThemeColorSearchFieldSchema,
  buildLogoThemeColorSearch,
  readLogoThemeColorSearch,
} from "@/lib/appThemeColorSearch";
import {
  ROOT_THEME_MODE_SEARCH_KEYS,
  readRootThemeModeSearch,
  rootThemeModeSearchFieldSchema,
  type RootThemeModeSearch,
} from "@/lib/rootThemeModeSearch";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_LOGO_FRACTAL_DEPTH,
  DEFAULT_ROTATION_DEGREES,
  DEFAULT_VOXEL_STATE,
  normalizeLogoFractalDepth,
  normalizeElevationDegrees,
  normalizeRotationDegrees,
  parseVoxelState,
  serializeVoxelState,
} from "@/components/logoVoxelState";
import { LANDING_DEV_MODE_QUERY_PARAM } from "@/lib/landingDevMode";
import { normalizeRouteSearchPresenceFlags } from "@/lib/routeSearchFlags";
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

const LOGO_ROUTE_PRESENCE_SEARCH_KEYS = [
  LANDING_DEV_MODE_QUERY_PARAM,
  "freeView",
  ...ROOT_THEME_MODE_SEARCH_KEYS,
] as const;

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

const logoRouteSearchFieldSchema = z
  .object({
    axis: z.preprocess(
      readOptionalRotationAxisMode,
      z.enum(LOGO_ROTATION_AXIS_MODE_VALUES).optional(),
    ),
    [LANDING_DEV_MODE_QUERY_PARAM]: z.literal(true).optional(),
    depth: z.preprocess(readOptionalNumber, z.number().finite().optional()),
    elev: z.preprocess(readOptionalNumber, z.number().finite().optional()),
    freeView: z.literal(true).optional(),
    isoSide: z.preprocess(readOptionalNumber, z.number().finite().optional()),
    isoStyle: z.preprocess(
      readOptionalIsoStyleId,
      z.enum(LOGO_ISOMETRIC_STYLE_VALUES).optional(),
    ),
    rot: z.preprocess(readOptionalNumber, z.number().finite().optional()),
    vox: z.preprocess(readCanonicalVoxelState, z.string().optional()),
  })
  .merge(appThemeColorSearchFieldSchema)
  .merge(rootThemeModeSearchFieldSchema);

export const logoRouteSearchSchema = logoRouteSearchFieldSchema.transform(
  (search) => {
    const themeModeSearch = readRootThemeModeSearch(search);
    return {
      ...(themeModeSearch.dark ? { dark: true as const } : {}),
      ...(themeModeSearch.light ? { light: true as const } : {}),
      ...readLogoThemeColorSearch(search),
      ...(typeof search.axis === "string" ? { axis: search.axis } : {}),
      ...(search.dev ? { dev: true as const } : {}),
      ...(typeof search.depth === "number"
        ? { depth: normalizeLogoFractalDepth(search.depth) }
        : {}),
      ...(typeof search.elev === "number"
        ? { elev: normalizeElevationDegrees(search.elev) }
        : {}),
      ...(search.freeView ? { freeView: true } : {}),
      ...(typeof search.isoSide === "number"
        ? { isoSide: normalizeLogoIsometricCubeSidePixels(search.isoSide) }
        : {}),
      ...(typeof search.isoStyle === "string"
        ? { isoStyle: search.isoStyle }
        : {}),
      ...(typeof search.rot === "number"
        ? { rot: normalizeRotationDegrees(search.rot) }
        : {}),
      ...(typeof search.vox === "string" ? { vox: search.vox } : {}),
    };
  },
);

export type LogoRouteSearch = z.infer<typeof logoRouteSearchSchema>;

export function validateLogoRouteSearch(
  search: Record<string, unknown>,
): LogoRouteSearch {
  return logoRouteSearchSchema.parse(
    normalizeRouteSearchPresenceFlags(search, LOGO_ROUTE_PRESENCE_SEARCH_KEYS),
  );
}

export function buildLogoRouteSearch(args: {
  elevationDegrees: number;
  fractalDepth: number;
  isoCubeSidePixels: number;
  isoStyleId: LogoIsometricStyleId;
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
  themeModeSearch?: RootThemeModeSearch;
  themeColors: LogoThemeColors;
  viewSnapEnabled: boolean;
  voxelState: string;
}): LogoRouteSearch {
  const fractalDepth = normalizeLogoFractalDepth(args.fractalDepth);

  return {
    ...readRootThemeModeSearch(args.themeModeSearch ?? {}),
    ...buildLogoThemeColorSearch(args.themeColors),
    ...(args.rotationAxisMode !== "cube-y"
      ? { axis: args.rotationAxisMode }
      : {}),
    ...(args.elevationDegrees !== DEFAULT_ELEVATION_DEGREES
      ? { elev: Number(args.elevationDegrees.toFixed(1)) }
      : {}),
    // `depth` is retained by the root route, so default depth needs an own
    // undefined tombstone to clear a previous recursive preview value.
    depth:
      fractalDepth !== DEFAULT_LOGO_FRACTAL_DEPTH ? fractalDepth : undefined,
    ...(args.viewSnapEnabled ? {} : { freeView: true }),
    ...(args.isoCubeSidePixels !== DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX
      ? { isoSide: args.isoCubeSidePixels }
      : {}),
    ...(args.isoStyleId !== DEFAULT_LOGO_ISOMETRIC_STYLE_ID
      ? { isoStyle: args.isoStyleId }
      : {}),
    ...(args.rotationDegrees !== DEFAULT_ROTATION_DEGREES
      ? { rot: Number(args.rotationDegrees.toFixed(1)) }
      : {}),
    ...(args.voxelState !== DEFAULT_VOXEL_STATE
      ? { vox: args.voxelState }
      : {}),
  };
}

/**
 * Logo control updates rebuild route state; keep the public dev flag only while
 * the operator has that root shell mode enabled.
 */
export function preserveLogoRouteDevModeSearch(
  nextSearch: LogoRouteSearch,
  currentSearch: LogoRouteSearch,
): LogoRouteSearch {
  if (!currentSearch.dev) {
    return nextSearch;
  }

  return {
    ...nextSearch,
    dev: true as const,
  };
}
