import { isRecord } from "@noter-md/dependent";
import { normalizeRotationDegrees } from "@/components/logo/logoVoxelState";

export const PUBLIC_LANDING_LOGO_VIEW_STATE_KEY = "public-landing";
export const DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY = "dashboard-empty";

export type RotatedLogoViewStateKey =
  | typeof PUBLIC_LANDING_LOGO_VIEW_STATE_KEY
  | typeof DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY;

export type RotatedLogoViewState = {
  elevationDegrees: number;
  rotationDegrees: number;
};

export type RotatedLogoViewStatePersistence = "visit" | "device";

type ReadRotatedLogoViewStateArgs = {
  defaultView: RotatedLogoViewState;
  key: RotatedLogoViewStateKey;
  persistence: RotatedLogoViewStatePersistence;
};

type WriteRotatedLogoViewStateArgs = {
  key: RotatedLogoViewStateKey;
  persistence: RotatedLogoViewStatePersistence;
  view: RotatedLogoViewState;
};

const STORAGE_KEY_BY_ROTATED_LOGO_VIEW_STATE_KEY = {
  [PUBLIC_LANDING_LOGO_VIEW_STATE_KEY]: "samebase:logo-view:public-landing",
  [DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY]: "samebase:logo-view:dashboard-empty",
} as const satisfies Record<RotatedLogoViewStateKey, string>;

let cachedRotatedLogoViewStateByKey: Partial<
  Record<RotatedLogoViewStateKey, RotatedLogoViewState>
> = {};

function normalizeRotatedLogoViewState(view: RotatedLogoViewState): RotatedLogoViewState {
  return {
    elevationDegrees: normalizeRotationDegrees(view.elevationDegrees),
    rotationDegrees: normalizeRotationDegrees(view.rotationDegrees),
  };
}

function parseRotatedLogoViewState(value: string | null) {
  if (value === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !isRecord(parsed) ||
      typeof parsed.elevationDegrees !== "number" ||
      typeof parsed.rotationDegrees !== "number" ||
      !Number.isFinite(parsed.elevationDegrees) ||
      !Number.isFinite(parsed.rotationDegrees)
    ) {
      return null;
    }

    return normalizeRotatedLogoViewState({
      elevationDegrees: parsed.elevationDegrees,
      rotationDegrees: parsed.rotationDegrees,
    });
  } catch {
    return null;
  }
}

function readStoredRotatedLogoViewState(key: RotatedLogoViewStateKey) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return parseRotatedLogoViewState(
      window.localStorage.getItem(STORAGE_KEY_BY_ROTATED_LOGO_VIEW_STATE_KEY[key]),
    );
  } catch {
    return null;
  }
}

export function cacheRotatedLogoViewState(
  key: RotatedLogoViewStateKey,
  view: RotatedLogoViewState,
) {
  cachedRotatedLogoViewStateByKey[key] = normalizeRotatedLogoViewState(view);
}

export function persistRotatedLogoViewState(args: WriteRotatedLogoViewStateArgs) {
  const normalizedView = normalizeRotatedLogoViewState(args.view);
  cachedRotatedLogoViewStateByKey[args.key] = normalizedView;

  if (args.persistence === "visit" || typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      STORAGE_KEY_BY_ROTATED_LOGO_VIEW_STATE_KEY[args.key],
      JSON.stringify(normalizedView),
    );
  } catch {
    // Keep the in-memory cache authoritative when browser storage is blocked.
  }
}

export function readRotatedLogoViewState({
  defaultView,
  key,
  persistence,
}: ReadRotatedLogoViewStateArgs): RotatedLogoViewState {
  const cachedView = cachedRotatedLogoViewStateByKey[key];
  if (cachedView !== undefined) {
    return { ...cachedView };
  }

  const storedView = persistence === "device" ? readStoredRotatedLogoViewState(key) : null;
  if (storedView !== null) {
    cachedRotatedLogoViewStateByKey[key] = storedView;
    return { ...storedView };
  }

  return normalizeRotatedLogoViewState(defaultView);
}
