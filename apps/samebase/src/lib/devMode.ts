export const DEV_MODE_QUERY_PARAM = "dev";

export function isDevModeEnabled(search: Readonly<Record<string, unknown>>): boolean {
  const value = search[DEV_MODE_QUERY_PARAM];
  return (
    Object.prototype.hasOwnProperty.call(search, DEV_MODE_QUERY_PARAM) &&
    value !== null &&
    typeof value !== "undefined"
  );
}
