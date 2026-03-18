export const FORCE_PROD_UI_QUERY_PARAM = "prod-ui";

export function isProdUiModeEnabled(searchParams: URLSearchParams): boolean {
  return searchParams.has(FORCE_PROD_UI_QUERY_PARAM);
}
