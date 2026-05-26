export const LANDING_DEV_MODE_QUERY_PARAM = "dev";
export const LANDING_DEV_MODE_LINK_LABEL = "?dev";
// Keep the enabled label as the prefix so hover preview toggles do not move the pointer target.
export const LANDING_DEV_MODE_DISABLE_LINK_LABEL = "?dev-";

export function isLandingDevModeEnabled(search: Readonly<Record<string, unknown>>): boolean {
  const value = search[LANDING_DEV_MODE_QUERY_PARAM];
  return (
    Object.prototype.hasOwnProperty.call(search, LANDING_DEV_MODE_QUERY_PARAM) &&
    value !== null &&
    typeof value !== "undefined"
  );
}
