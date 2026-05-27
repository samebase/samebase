import {
  formatRouteSearchPresenceFlagDisableLinkLabel,
  formatRouteSearchPresenceFlagLinkLabel,
} from "@/lib/routeSearchFlags";

export const LANDING_DEV_MODE_QUERY_PARAM = "dev";
export const LANDING_DEV_MODE_LINK_LABEL = formatRouteSearchPresenceFlagLinkLabel(
  LANDING_DEV_MODE_QUERY_PARAM,
);
export const LANDING_DEV_MODE_DISABLE_LINK_LABEL = formatRouteSearchPresenceFlagDisableLinkLabel(
  LANDING_DEV_MODE_QUERY_PARAM,
);

export function isLandingDevModeEnabled(search: Readonly<Record<string, unknown>>): boolean {
  const value = search[LANDING_DEV_MODE_QUERY_PARAM];
  return (
    Object.prototype.hasOwnProperty.call(search, LANDING_DEV_MODE_QUERY_PARAM) &&
    value !== null &&
    typeof value !== "undefined"
  );
}
