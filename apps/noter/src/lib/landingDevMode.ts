export const LANDING_DEV_MODE_QUERY_PARAM = "dev";

export function isLandingDevModeEnabled(search: Readonly<Record<string, unknown>>): boolean {
  const value = search[LANDING_DEV_MODE_QUERY_PARAM];
  return (
    Object.prototype.hasOwnProperty.call(search, LANDING_DEV_MODE_QUERY_PARAM) &&
    value !== null &&
    typeof value !== "undefined"
  );
}
