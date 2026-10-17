import { LOGO_IDENTITY_VIEWS, type LogoIdentityViewId } from "@samebase/logo-model/identity";
import { type LogoFaceTreatment } from "@samebase/logo-model/face-treatment";

export const LOGO_THREE_SVG_VIEWBOX_SIZE = 360;
export const LOGO_THREE_SVG_CAMERA_FRUSTUM_PADDING = 1.12;
export const STATIC_LOGO_BACKGROUND_COLOR = "transparent";
/** The version 3 history mark the `/logo` labs render. Spec 089 names the product logo file. */
export const DEFAULT_STATIC_LOGO_SVG_URL = "/logo-static.svg";
export const LOGO_BRAND_ASSET_ROOT = "/brand";
export const LOGO_IDENTITY_TREATMENT_ASSET_PATHS = {
  "side-primary": {
    duotone: `${LOGO_BRAND_ASSET_ROOT}/logo/v1-side-primary-duotone.svg`,
    striped: `${LOGO_BRAND_ASSET_ROOT}/logo/v1-side-primary-striped.svg`,
  },
  "side-diagonal": {
    duotone: `${LOGO_BRAND_ASSET_ROOT}/logo/v2-side-diagonal-duotone.svg`,
    striped: `${LOGO_BRAND_ASSET_ROOT}/logo/v2-side-diagonal-striped.svg`,
  },
  spatial: {
    duotone: `${LOGO_BRAND_ASSET_ROOT}/logo/v3-spatial-duotone.svg`,
    striped: `${LOGO_BRAND_ASSET_ROOT}/logo/v3-spatial-striped.svg`,
  },
} as const satisfies Record<string, Record<LogoFaceTreatment, string>>;
export const LOGO_IDENTITY_VIEW_CONTRACTS = [
  {
    ...LOGO_IDENTITY_VIEWS[0],
    assetPath: "/logo-v1-side-primary.svg",
    label: "Version 1 side-primary mark",
    treatmentAssetPaths: LOGO_IDENTITY_TREATMENT_ASSET_PATHS["side-primary"],
  },
  {
    ...LOGO_IDENTITY_VIEWS[1],
    assetPath: "/logo-v2-side-diagonal.svg",
    label: "Version 2 side-diagonal mark",
    treatmentAssetPaths: LOGO_IDENTITY_TREATMENT_ASSET_PATHS["side-diagonal"],
  },
  {
    ...LOGO_IDENTITY_VIEWS[2],
    assetPath: DEFAULT_STATIC_LOGO_SVG_URL,
    label: "Version 3 spatial mark",
    treatmentAssetPaths: LOGO_IDENTITY_TREATMENT_ASSET_PATHS.spatial,
  },
] as const;
export const LOGO_IDENTITY_EDIT_MARK_VIEW_ID = "side-diagonal" satisfies LogoIdentityViewId;
export const LOGO_IDENTITY_EDIT_MARK_SVG_URL = "/logo-v2-side-diagonal.svg";

export function getLogoIdentityAssetPath({
  treatment,
  viewId,
}: {
  treatment: LogoFaceTreatment;
  viewId: LogoIdentityViewId;
}): string {
  for (const view of LOGO_IDENTITY_VIEW_CONTRACTS) {
    if (view.id === viewId) {
      return view.treatmentAssetPaths[treatment];
    }
  }

  throw new Error(`Unknown logo identity view: ${viewId}`);
}

export const DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE = {
  height: LOGO_THREE_SVG_VIEWBOX_SIZE,
  width: LOGO_THREE_SVG_VIEWBOX_SIZE,
} as const;
