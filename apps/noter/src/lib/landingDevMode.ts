export const LANDING_DEV_MODE_QUERY_PARAM = "dev";

export function isLandingDevModeEnabled(
  searchParams: URLSearchParams,
): boolean {
  return searchParams.has(LANDING_DEV_MODE_QUERY_PARAM);
}
