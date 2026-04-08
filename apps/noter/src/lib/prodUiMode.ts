export const FORCE_PROD_UI_QUERY_PARAM = "prod-ui";

type SearchFlagReader = URLSearchParams | Readonly<Record<string, unknown>>;

export function isProdUiModeEnabled(search: SearchFlagReader): boolean {
  if (search instanceof URLSearchParams) {
    return search.has(FORCE_PROD_UI_QUERY_PARAM);
  }

  const value = search[FORCE_PROD_UI_QUERY_PARAM];
  return value === true || value === "" || value === "true";
}
